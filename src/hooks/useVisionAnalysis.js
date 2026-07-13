import { useCallback } from "react";
import { DEFAULT_VISION_OPTIONS, revokeVisionObjectUrls } from "../lib/editorRuntime.js";
import { analyzeVideoVisualTrack, analyzeVisualSubject, captureVisualFrame } from "../lib/vision.js";

export function useVisionAnalysis(deps) {
  return useCallback(async () => {
    if (!deps.previewVisualSrc || !deps.previewVisionKey) return void deps.notify("请先把图片或视频放到图片轨");
    if (deps.visionJob.running && deps.visionJob.key === deps.previewVisionKey) {
      deps.visionJobGenerationRef.current += 1;
      deps.visionAbortControllerRef.current?.abort(); deps.visionAbortControllerRef.current = null;
      deps.setVisionJob({ running: false, key: deps.previewVisionKey, progress: 0, phase: "分析已取消" });
      return void deps.notify("已取消当前视觉分析");
    }
    deps.visionAbortControllerRef.current?.abort();
    const controller = new AbortController(); deps.visionAbortControllerRef.current = controller;
    const generation = deps.visionJobGenerationRef.current + 1;
    deps.visionJobGenerationRef.current = generation;
    const key = deps.previewVisionKey; const type = deps.previewVisualType;
    deps.setVisionJob({ running: true, key, progress: 1, phase: type === "video" ? "准备分析整段视频" : "截取当前视觉画面" });
    try {
      const onProgress = ({ progress, phase }) => deps.setVisionJob((job) => job.key === key
        ? { ...job, progress: Math.max(job.progress, progress), phase: phase || job.phase } : job);
      const source = deps.previewVisualSegment?.blob || deps.previewVisualSrc;
      let analysis; let objectUrls = [];
      if (type === "video") {
        const duration = Math.max(0.05, Number(deps.previewVideoRef.current?.duration) || Number(deps.previewVisualSegment?.duration) || 0.05);
        const result = await analyzeVideoVisualTrack({
          src: source, duration, includeMatting: true, fps: 2, maxSamples: 180,
          maxDimension: 512, threshold: 0.32,
          preferredLabels: ["person", "cat", "dog", "car", "bottle", "chair"],
          signal: controller.signal, onProgress,
        });
        const samples = result.samples.map(({ cutoutBlob, ...sample }) => {
          const cutoutUrl = cutoutBlob ? URL.createObjectURL(cutoutBlob) : "";
          if (cutoutUrl) objectUrls.push(cutoutUrl);
          return { ...sample, cutoutUrl };
        });
        analysis = { ...result, samples, analyzedAt: Date.now(), visualType: type };
      } else {
        const blob = await captureVisualFrame({ src: source, type, maxDimension: 1024, outputType: "image/png", quality: 0.92, signal: controller.signal });
        const result = await analyzeVisualSubject({
          blob, includeMatting: true, threshold: 0.32,
          preferredLabels: ["person", "cat", "dog", "car", "bottle", "chair"],
          signal: controller.signal, onProgress,
        });
        const cutoutUrl = result.cutoutBlob ? URL.createObjectURL(result.cutoutBlob) : "";
        if (cutoutUrl) objectUrls = [cutoutUrl];
        analysis = { ...result, cutoutUrl, analyzedAt: Date.now(), visualType: type };
      }
      if (controller.signal.aborted || generation !== deps.visionJobGenerationRef.current) return;
      revokeVisionObjectUrls(deps.visionObjectUrlsRef.current.get(key));
      deps.visionObjectUrlsRef.current.set(key, objectUrls);
      deps.setVisionRecords((records) => ({
        ...records,
        [key]: { analysis, options: records[key]?.options ?? { ...DEFAULT_VISION_OPTIONS, removeBackground: false } },
      }));
      deps.setVisionJob({ running: false, key, progress: 100, phase: "视觉主体分析完成" });
      deps.notify(type === "image" ? "YOLOS tiny 主体识别与 MODNet 抠图已就绪" : `全视频分析完成：YOLOS + MODNet 已覆盖 ${analysis.samples.length} 个时序帧`);
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error(error);
      deps.setVisionJob({ running: false, key, progress: 0, phase: "视觉分析失败" });
      deps.notify(error?.message || "视觉主体分析失败，请重试");
    } finally {
      if (deps.visionAbortControllerRef.current === controller) {
        deps.visionAbortControllerRef.current = null;
        deps.setVisionJob((job) => job.running && job.key === key ? { ...job, running: false } : job);
      }
    }
  }, [deps]);
}
