import { useCallback } from "react";
import { MAX_TIMELINE_DURATION_SECONDS, SUPPORTED_MEDIA_TYPES } from "../config/editor.js";
import { decodeWaveform, extractVideoTrackFrames } from "../lib/media.js";
import { formatClock, formatTime } from "../lib/timeline.js";

export function useFileUpload(deps) {
  return useCallback((files) => {
    const mediaFiles = Array.from(files ?? []).filter((file) => SUPPORTED_MEDIA_TYPES.some((type) => file.type.startsWith(type)));
    if (!mediaFiles.length) return void deps.notify("请选择图片、视频或音频素材");
    const assets = mediaFiles.map((file) => {
      const src = URL.createObjectURL(file); deps.imageUrlRefs.current.add(src);
      const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
      return { id: crypto.randomUUID(), type, src, name: file.name, meta: "读取中", blob: file,
        duration: type === "video" ? 0 : 4, width: 0, height: 0, trackFrames: [] };
    });
    const primary = assets[0]; deps.setSelectedLibraryAssetId(primary.id); deps.setUserAssets((current) => [...assets, ...current]);
    const primaryVisual = assets.find((asset) => asset.type === "image" || asset.type === "video");
    if (primaryVisual) {
      deps.appendVisualAssetToTimeline(primaryVisual);
      deps.setSelectedTrack("image");
    }
    const update = (id, patch) => deps.setUserAssets((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    assets.forEach((asset) => {
      if (asset.type === "audio") {
        decodeWaveform(asset.blob, 96).then((decoded) => update(asset.id, { meta: `音频 · ${formatTime(decoded.duration)}`, duration: decoded.duration, peaks: decoded.peaks }))
          .catch(() => update(asset.id, { meta: "音频读取失败" }));
        return;
      }
      if (asset.type === "video") {
        const video = document.createElement("video"); video.preload = "metadata";
        video.onloadedmetadata = () => {
          const duration = Math.min(MAX_TIMELINE_DURATION_SECONDS, Math.max(0.5, video.duration || 1));
          const width = video.videoWidth || 0; const height = video.videoHeight || 0;
          const patch = { meta: `${width || "?"} x ${height || "?"} · ${formatClock(duration)}`, duration, width, height, type: "video" };
          update(asset.id, patch); deps.updateVisualAssetInTimeline(asset.id, patch);
          extractVideoTrackFrames(asset.src, { duration, width, height }).then((trackFrames) => {
            if (!trackFrames.length) return;
            update(asset.id, { trackFrames }); deps.updateVisualAssetInTimeline(asset.id, { trackFrames });
          }).catch((error) => console.warn("Video timeline frame extraction failed", error));
        };
        video.onerror = () => update(asset.id, { meta: "视频读取失败" }); video.src = asset.src; return;
      }
      const image = new Image();
      image.onload = () => {
        const patch = { meta: `${image.naturalWidth || 0} x ${image.naturalHeight || 0}`, width: image.naturalWidth || 0, height: image.naturalHeight || 0, type: "image" };
        update(asset.id, patch); deps.updateVisualAssetInTimeline(asset.id, patch);
      };
      image.onerror = () => update(asset.id, { meta: "读取失败" }); image.src = asset.src;
    });
    deps.notify(mediaFiles.length > 1 ? `已上传 ${mediaFiles.length} 个素材${primaryVisual ? "，首个画面已加入时间线" : ""}`
      : primaryVisual ? `${primary.type === "video" ? "视频" : "图片"}已加入画布和时间线` : "音频已上传到素材库，可拖到音乐或配音轨");
  }, [deps]);
}
