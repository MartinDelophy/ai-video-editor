import { useCallback } from "react";
import { MAX_TIMELINE_DURATION_SECONDS, SUPPORTED_MEDIA_TYPES } from "../config/editor.js";
import { decodeWaveform, extractVideoTrackFrames, getVideoTrackImportFrameBudget, normalizeVideoForEditing } from "../lib/media.js";
import { getMediaFileKind, isSupportedMediaFile, MEDIA_BACKENDS, probeMediaCompatibility, selectMediaBackends, shouldProbeWithLibav } from "../lib/mediaCompatibility.js";
import { formatClock, formatTime } from "../lib/timeline.js";

export function shouldAutoAddImportedVisual(assets, visualSegments) {
  return Boolean(
    !visualSegments.length && assets.some((asset) => asset.type === "image" || asset.type === "video"),
  );
}

export function useFileUpload(deps) {
  return useCallback((files) => {
    const mediaFiles = Array.from(files ?? []).filter((file) =>
      SUPPORTED_MEDIA_TYPES.some((type) => file.type.startsWith(type)) || isSupportedMediaFile(file));
    if (!mediaFiles.length) return void deps.notify("请选择图片、视频或音频素材");
    const assets = mediaFiles.map((file) => {
      const src = URL.createObjectURL(file); deps.imageUrlRefs.current.add(src);
      const type = getMediaFileKind(file);
      return { id: crypto.randomUUID(), type, src, name: file.name, meta: "读取中", blob: file,
        duration: type === "video" ? 0 : 4, width: 0, height: 0, trackFrames: [],
        preparing: type === "video", prepareProgress: type === "video" ? 0.08 : 1 };
    });
    const primary = assets[0]; deps.setSelectedLibraryAssetId(primary.id); deps.setUserAssets((current) => [...assets, ...current]);
    const primaryVisual = assets.find((asset) => asset.type === "image" || asset.type === "video");
    const shouldAutoAddFirstVisual = shouldAutoAddImportedVisual(assets, deps.visualSegments);
    if (shouldAutoAddFirstVisual) {
      deps.appendVisualAssetToTimeline(primaryVisual);
      deps.setSelectedTrack("image");
      deps.onFirstVisualAutoAdded?.();
    }
    const update = (id, patch) => deps.setUserAssets((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    assets.forEach((asset) => {
      if (asset.type === "audio") {
        decodeWaveform(asset.blob, 96).then((decoded) => update(asset.id, { meta: `音频 · ${formatTime(decoded.duration)}`, duration: decoded.duration, peaks: decoded.peaks }))
          .catch(() => update(asset.id, { meta: "音频读取失败" }));
        return;
      }
      if (asset.type === "video") {
        const prepareCompatibleVideo = async () => {
          const compatibilityPatch = { meta: deps.t("mediaCompatibilityProcessing"), preparing: true, prepareProgress: 0.16 };
          update(asset.id, compatibilityPatch);
          deps.updateVisualAssetInTimeline(asset.id, compatibilityPatch);
          deps.notify(deps.t("mediaCompatibilityProcessing"));
          try {
            let probe = null;
            try {
              probe = await probeMediaCompatibility(asset.blob, { nativeMetadataError: true, decodeAudio: true });
            } catch (error) {
              console.warn("libav.js media probe failed; using FFmpeg.wasm", error);
            }
            const videoStream = probe?.streams?.find((stream) => stream.type === "video");
            const audioStream = probe?.streams?.find((stream) => stream.type === "audio");
            const compatibilityAudioBlob = probe?.decodedAudio?.blob ?? null;
            const backends = probe ? selectMediaBackends({
              nativeReadable: false, container: probe?.container, videoCodec: videoStream?.codec, audioCodec: audioStream?.codec,
              webCodecsVideoSupported: typeof VideoDecoder !== "undefined" && ["h264", "vp8", "vp9", "av1"].includes(videoStream?.codec),
              webCodecsAudioSupported: typeof AudioDecoder !== "undefined" && ["aac", "opus", "mp3", "flac"].includes(audioStream?.codec),
              libavAudioSupported: Boolean(compatibilityAudioBlob),
            }) : { probe: MEDIA_BACKENDS.FFMPEG, video: MEDIA_BACKENDS.FFMPEG,
              audio: MEDIA_BACKENDS.FFMPEG, needsNormalization: true };
            const normalizedBlob = await normalizeVideoForEditing(asset.blob, asset.name, { decodedAudioBlob: compatibilityAudioBlob });
            const normalizedSrc = URL.createObjectURL(normalizedBlob); deps.imageUrlRefs.current.add(normalizedSrc);
            applyVideoMetadata({ ...asset, src: normalizedSrc, blob: normalizedBlob, compatibilityAudioBlob }, { probe, backends, originalName: asset.name });
            deps.notify(deps.t("mediaCompatibilityReady"));
          } catch (error) {
            console.error("Media compatibility fallback failed", error);
            const failurePatch = { meta: deps.t("mediaCompatibilityFailed"), preparing: false, prepareProgress: 0 };
            update(asset.id, failurePatch);
            deps.updateVisualAssetInTimeline(asset.id, failurePatch);
            deps.notify(deps.t("mediaCompatibilityFailedHint"));
          }
        };
        const applyVideoMetadata = (sourceAsset, compatibility = null) => {
          if (!compatibility && shouldProbeWithLibav(sourceAsset.blob)) {
            void prepareCompatibleVideo();
            return;
          }
          const video = document.createElement("video"); video.preload = "metadata";
          video.onloadedmetadata = () => {
            const duration = Math.min(MAX_TIMELINE_DURATION_SECONDS, Math.max(0.5, video.duration || 1));
            const width = video.videoWidth || 0; const height = video.videoHeight || 0;
            const backendLabel = compatibility?.backends?.probe ? ` · ${compatibility.backends.probe}` : "";
            const patch = { meta: `${width || "?"} x ${height || "?"} · ${formatClock(duration)}${backendLabel}`,
              duration, width, height, type: "video", src: sourceAsset.src, blob: sourceAsset.blob,
              trackFrameDuration: duration,
              preparing: true, prepareProgress: 0.42,
              compatibilityAudioBlob: sourceAsset.compatibilityAudioBlob ?? null, mediaCompatibility: compatibility };
            update(asset.id, patch); deps.updateVisualAssetInTimeline(asset.id, patch);
            const extractingPatch = { preparing: true, prepareProgress: 0.68 };
            update(asset.id, extractingPatch); deps.updateVisualAssetInTimeline(asset.id, extractingPatch);
            const importFrameBudget = getVideoTrackImportFrameBudget(duration);
            let lastProgressBucket = -1;
            extractVideoTrackFrames(sourceAsset.blob || sourceAsset.src, {
              duration,
              width,
              height,
              maxFrames: importFrameBudget,
              onProgress: (progress) => {
                const progressBucket = Math.max(0, Math.min(20, Math.floor((Number(progress) || 0) * 20)));
                if (progressBucket === lastProgressBucket) return;
                lastProgressBucket = progressBucket;
                const progressPatch = { preparing: true, prepareProgress: 0.68 + progressBucket / 20 * 0.29 };
                update(asset.id, progressPatch); deps.updateVisualAssetInTimeline(asset.id, progressPatch);
              },
            }).then((trackFrames) => {
              if (!trackFrames.length) throw new Error("No timeline frames decoded");
              const framePatch = { trackFrames, trackFrameSampling: "exact-pts-hq-v5-seed", trackFrameImportBudget: importFrameBudget, preparing: false, prepareProgress: 1 };
              update(asset.id, framePatch); deps.updateVisualAssetInTimeline(asset.id, framePatch);
            }).catch((error) => {
              console.warn("Video timeline frame extraction failed", error);
              const failurePatch = { preparing: false, prepareProgress: 0, timelineFrameError: true };
              update(asset.id, failurePatch); deps.updateVisualAssetInTimeline(asset.id, failurePatch);
            });
          };
          video.onerror = async () => {
            if (compatibility || !shouldProbeWithLibav(asset.blob, { nativeMetadataError: true })) {
              const failurePatch = { meta: deps.t("mediaCompatibilityFailed"), preparing: false, prepareProgress: 0 };
              update(asset.id, failurePatch);
              deps.updateVisualAssetInTimeline(asset.id, failurePatch);
              return;
            }
            await prepareCompatibleVideo();
          };
          video.src = sourceAsset.src;
        };
        applyVideoMetadata(asset); return;
      }
      const image = new Image();
      image.onload = () => {
        const patch = { meta: `${image.naturalWidth || 0} x ${image.naturalHeight || 0}`, width: image.naturalWidth || 0, height: image.naturalHeight || 0, type: "image" };
        update(asset.id, patch); deps.updateVisualAssetInTimeline(asset.id, patch);
      };
      image.onerror = () => update(asset.id, { meta: "读取失败" }); image.src = asset.src;
    });
    deps.notify(mediaFiles.length > 1 ? `已上传 ${mediaFiles.length} 个素材${shouldAutoAddFirstVisual ? "，项目首个画面已加入时间线" : "，请拖到目标轨道使用"}`
      : primaryVisual ? shouldAutoAddFirstVisual
        ? `${primary.type === "video" ? "视频" : "图片"}已加入画布和时间线`
        : `${primary.type === "video" ? "视频" : "图片"}已加入素材库，请拖到 Visuals 或画中画轨道`
      : "音频已上传到素材库，可拖到音乐或配音轨");
  }, [deps]);
}
