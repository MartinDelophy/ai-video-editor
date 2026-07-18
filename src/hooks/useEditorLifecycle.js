import { useEffect } from "react";

import { RATIO_OPTIONS } from "../config/editor.js";
import { decodeWaveform } from "../lib/media.js";
import { disposeVisionWorker } from "../lib/vision.js";
import { disposeVocalSeparationWorker } from "../lib/vocalSeparation.js";
import {
  getNearestRatioIdForSize,
  revokeVisionObjectUrls,
} from "../lib/editorRuntime.js";

export function useEditorLifecycle(d) {
  useEffect(() => {
    document.documentElement.lang = d.activeLanguage === "zh" ? "zh-CN" : d.activeLanguage;
  }, [d.activeLanguage]);

  useEffect(() => () => {
    d.avatarMotionWorkerRef.current?.terminate();
    d.avatarRenderWorkerRef.current?.terminate();
  }, []);

  useEffect(() => {
    d.setFitMode("contain");
  }, [d.ratioId]);

  useEffect(() => {
    const testImageUrl = import.meta.env.DEV ? import.meta.env.VITE_AVATAR_TEST_IMAGE_URL : "";
    if (!testImageUrl || d.avatarTestImportedRef.current) return;
    d.avatarTestImportedRef.current = true;
    fetch(testImageUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        d.imageUrlRefs.current.add(url);
        const asset = {
          id: crypto.randomUUID(),
          type: "image",
          src: url,
          name: "老外戴眼镜中年人物肖像生成-modnet.png",
          meta: "819 x 1024 · E2E test",
          blob,
          duration: 4,
          width: 819,
          height: 1024,
          trackFrames: [],
        };
        d.setUserAssets((assets) => [asset, ...assets]);
        d.replaceVisualTimeline(asset, 4);
        d.notify("端到端测试肖像已载入画面轨");
      })
      .catch((error) => {
        d.avatarTestImportedRef.current = false;
        console.error("Avatar E2E test image import failed", error);
      });
  }, []);

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      !import.meta.env.VITE_AVATAR_TEST_IMAGE_URL ||
      d.avatarTestAudioImportedRef.current
    ) return;
    d.avatarTestAudioImportedRef.current = true;
    fetch("/assets/avatar-e2e-16k.wav")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(async (blob) => {
        const waveform = await decodeWaveform(blob);
        d.replaceAudio(blob, waveform.duration, waveform.peaks, "端到端测试配音已载入");
        d.notify("端到端测试配音已载入配音轨");
      })
      .catch((error) => {
        d.avatarTestAudioImportedRef.current = false;
        console.error("Avatar E2E test audio import failed", error);
      });
  }, []);

  useEffect(() => {
    const ratioSource = d.visualSegments.find((segment) => segment.width > 0 && segment.height > 0);
    if (!ratioSource) {
      d.autoRatioSourceKeyRef.current = "";
      return;
    }
    const sourceKey = `${ratioSource.assetId || ratioSource.id}:${ratioSource.width}x${ratioSource.height}`;
    if (d.autoRatioSourceKeyRef.current === sourceKey) return;
    d.autoRatioSourceKeyRef.current = sourceKey;
    const nextRatioId = getNearestRatioIdForSize(ratioSource.width, ratioSource.height);
    if (!nextRatioId || nextRatioId === d.ratioId) return;
    const nextRatio = RATIO_OPTIONS.find((option) => option.id === nextRatioId);
    d.setRatioId(nextRatioId);
    d.notify(`已根据素材自动切换为 ${nextRatio?.label ?? nextRatioId}`);
  }, [d.ratioId, d.visualSegments]);

  useEffect(() => {
    if (!d.captionSegments.length) {
      d.setSelectedSegmentId("");
      return;
    }
    if (!d.captionSegments.some((segment) => segment.id === d.selectedSegmentId)) {
      d.setSelectedSegmentId(d.captionSegments[0].id);
    }
  }, [d.captionSegments, d.selectedSegmentId]);

  useEffect(() => {
    if (!d.visualSegments.length) {
      d.setSelectedVisualSegmentId("");
      return;
    }
    if (!d.visualSegments.some((segment) => segment.id === d.selectedVisualSegmentId)) {
      d.setSelectedVisualSegmentId(d.visualSegments[0].id);
    }
  }, [d.selectedVisualSegmentId, d.visualSegments]);

  useEffect(() => {
    if (d.currentVisualSegment?.src) d.setCurrentVisualAsset(d.currentVisualSegment);
  }, [d.currentVisualSegment]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
      if (
        isTyping || event.metaKey || event.ctrlKey || event.altKey ||
        (event.key !== "Delete" && event.key !== "Backspace")
      ) return;
      const hasSelectedTimelineItem =
        (d.selectedTrack === "caption" && d.selectedSegmentId && d.captionSegments.some((segment) => segment.id === d.selectedSegmentId)) ||
        (d.selectedTrack === "sticker" && d.selectedStickerSegmentId && d.stickerSegments.some((segment) => segment.id === d.selectedStickerSegmentId)) ||
        (d.selectedTrack === "image" && d.selectedVisualSegmentId && d.visualSegments.some((segment) => segment.id === d.selectedVisualSegmentId)) ||
        (d.selectedTrack === "overlay" && d.selectedVisualOverlayId && d.visualOverlaySegments.some((segment) => segment.id === d.selectedVisualOverlayId)) ||
        (d.selectedTrack === "audio" && d.selectedAudioSegmentId && d.audioSegments.some((segment) => segment.id === d.selectedAudioSegmentId)) ||
        (d.selectedTrack === "source" && d.sourceAudioBlob) ||
        (d.selectedTrack === "music" && d.musicBlob);
      if (hasSelectedTimelineItem) {
        event.preventDefault();
        d.handleDeleteTrack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => () => {
    if (d.audioUrlRef.current) URL.revokeObjectURL(d.audioUrlRef.current);
    if (d.sourceAudioUrlRef.current) URL.revokeObjectURL(d.sourceAudioUrlRef.current);
    if (d.musicUrlRef.current) URL.revokeObjectURL(d.musicUrlRef.current);
    d.imageUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));
    d.imageUrlRefs.current.clear();
    d.visionAbortControllerRef.current?.abort();
    d.visionObjectUrlsRef.current.forEach((urls) => revokeVisionObjectUrls(urls));
    d.visionObjectUrlsRef.current.clear();
    disposeVisionWorker();
    disposeVocalSeparationWorker();
    d.voiceRecorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    window.clearInterval(d.voiceRecorderTimerRef.current);
  }, []);
}
