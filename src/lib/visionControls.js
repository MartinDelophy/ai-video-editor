import { downloadBlob } from "./media.js";
import { revokeVisionObjectUrls } from "./editorRuntime.js";

export function createVisionControls(deps) {
  function toggleVisionOption(optionId) {
    if (!deps.previewVisionKey || !deps.previewVisionRecord) return;
    const hasMatting = Boolean(deps.previewVisionAnalysis?.cutoutUrl) ||
      Boolean(deps.previewVisionBaseAnalysis?.samples?.some((sample) => sample.cutoutUrl));
    if (optionId === "removeBackground" && !hasMatting) return void deps.notify("请先完成当前图片或整段视频的 MODNet 分析");
    const enabled = !deps.previewVisionOptions[optionId];
    deps.setVisionRecords((records) => {
      const record = records[deps.previewVisionKey];
      return record ? { ...records, [deps.previewVisionKey]: { ...record, options: { ...record.options, [optionId]: enabled } } } : records;
    });
    const labels = { showDetections: "主体识别框", removeBackground: "MODNet 抠图", avoidCaptions: "字幕智能避让", smartCrop: "主体智能裁切" };
    deps.notify(`${labels[optionId] ?? "智能画面"}已${enabled ? "开启" : "关闭"}`);
  }

  function setFitModeFromUser(nextModeOrUpdater) {
    deps.setFitMode(nextModeOrUpdater);
    if (!deps.previewVisionKey || !deps.previewVisionRecord?.options?.smartCrop) return;
    deps.setVisionRecords((records) => {
      const record = records[deps.previewVisionKey];
      return record ? { ...records, [deps.previewVisionKey]: { ...record, options: { ...record.options, smartCrop: false } } } : records;
    });
  }

  function clearVisionAnalysis() {
    if (!deps.previewVisionKey) return;
    if (deps.visionJob.running && deps.visionJob.key === deps.previewVisionKey) {
      deps.visionJobGenerationRef.current += 1; deps.visionAbortControllerRef.current?.abort();
      deps.visionAbortControllerRef.current = null;
    }
    const urls = deps.visionObjectUrlsRef.current.get(deps.previewVisionKey);
    if (urls) { revokeVisionObjectUrls(urls); deps.visionObjectUrlsRef.current.delete(deps.previewVisionKey); }
    deps.setVisionRecords((records) => { const next = { ...records }; delete next[deps.previewVisionKey]; return next; });
    deps.setVisionJob({ running: false, key: "", progress: 0, phase: "" });
    deps.notify("当前素材的视觉分析已清除");
  }

  function downloadVisionCutout() {
    if (deps.previewVisualType === "video") return void deps.notify("视频 MODNet 遮罩会随时间变化，并随视频一起预览和导出");
    const blob = deps.previewVisionAnalysis?.cutoutBlob;
    if (!blob) return void deps.notify("当前素材还没有透明抠图");
    const baseName = (deps.previewVisualSegment?.name || deps.imageName || "subject").replace(/\.[^.]+$/, "").replace(/[^\w\u3400-\u9fff-]+/g, "-");
    downloadBlob(blob, `${baseName || "subject"}-modnet.png`); deps.notify("透明 PNG 已下载");
  }

  function removeVisionRecordsForAsset(asset) {
    if (!asset?.id && !asset?.src) return;
    const belongs = (key) => Boolean((asset.id && key.startsWith(`${asset.id}::`)) || (asset.src && key.includes(`::${asset.src}`)));
    if (deps.visionJob.running && belongs(deps.visionJob.key)) {
      deps.visionJobGenerationRef.current += 1; deps.visionAbortControllerRef.current?.abort();
      deps.visionAbortControllerRef.current = null; deps.setVisionJob({ running: false, key: "", progress: 0, phase: "" });
    }
    deps.setVisionRecords((records) => {
      const next = { ...records };
      Object.keys(records).forEach((key) => {
        if (!belongs(key)) return;
        const urls = deps.visionObjectUrlsRef.current.get(key);
        if (urls) { revokeVisionObjectUrls(urls); deps.visionObjectUrlsRef.current.delete(key); }
        delete next[key];
      });
      return next;
    });
  }
  return { clearVisionAnalysis, downloadVisionCutout, removeVisionRecordsForAsset, setFitModeFromUser, toggleVisionOption };
}
