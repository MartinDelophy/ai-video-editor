import { createFlowWorkerClient, createFrameCaptionSession, probeBuiltInAI } from "./autoEdit.js";
import { openAnalysisSource } from "./materialAudio.js";

function createSourceDetector(signal, onProgress) {
  const worker = new Worker(new URL("../workers/vision.worker.js", import.meta.url), { type: "module" });
  let pending;
  const abort = () => { worker.terminate(); pending?.reject(new DOMException("Cancelled", "AbortError")); pending = null; };
  signal.addEventListener("abort", abort, { once: true });
  worker.onmessage = ({ data }) => {
    if (data.requestId !== pending?.requestId) return;
    if (data.type === "progress") { onProgress?.(data); return; }
    const current = pending; pending = null;
    if (data.type === "error") current.reject(new Error(data.error)); else current.resolve(data.result.detections);
  };
  worker.onerror = () => { pending?.reject(new Error("主体检测 Worker 运行失败。")); pending = null; };
  return {
    analyze(blob) {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID(); pending = { requestId, resolve, reject };
        worker.postMessage({ type: "analyze", requestId, imageBlob: blob, removeBackground: false, threshold: 0.35,
          preferredLabels: [], localModelRoot: "/local-components/yolos/" });
      });
    },
    close() { signal.removeEventListener("abort", abort); abort(); },
  };
}

export async function analyzeSourceVisual(src, asset, step, { signal, onProgress, checkpoint }) {
  const { sourceStartSeconds: start, sourceEndSeconds: end } = step.basis.range;
  const outputs = step.checkpoints.map(item => item.output);
  const capability = step.basis.capability;
  let source, image, sink, session, detector, flow;
  const stop = () => { flow?.terminate(); session?.destroy?.(); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    if (capability === "description") {
      const support = await probeBuiltInAI("en");
      if (support.availability !== "available") return { text: "", language: "en", words: [], samples: [], scenes: [], coverage: [],
        complete: false, missingCapabilities: ["browser-image-description"] };
      session = await createFrameCaptionSession({ language: "en", signal });
    } else if (capability === "detection") detector = createSourceDetector(signal, onProgress);
    else flow = createFlowWorkerClient();
    if (asset.kind === "image") {
      const response = await fetch(src, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("无法读取项目图片。");
      image = await createImageBitmap(await response.blob());
    } else {
      source = await openAnalysisSource(src, signal);
      const track = await source.input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error("当前浏览器无法解码此视频。");
      if (end > await source.input.computeDuration() + 0.001) throw new Error("分析区间超出源视频时长。");
      const { CanvasSink } = await import("mediabunny"); sink = new CanvasSink(track, { width: 224, height: 224, fit: "contain", poolSize: 1 });
    }
    const canvas = document.createElement("canvas"); canvas.width = 224; canvas.height = 224;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建分析画布。");
    let from = step.checkpoints.at(-1)?.range.sourceEndSeconds ?? start;
    do {
      const to = image ? 0 : Math.min(end, from + 60), samples = [];
      for (let time = from; image ? samples.length === 0 : time < to; time += step.basis.settings.sampleIntervalSeconds) {
        signal.throwIfAborted();
        onProgress?.({ phase: `分析源画面 ${time.toFixed(1)} 秒` });
        const frame = image || (await sink.getCanvas(time))?.canvas;
        if (!frame) throw new Error("源画面解码未完成。");
        context.clearRect(0, 0, 224, 224); context.drawImage(frame, 0, 0, 224, 224);
        const sample = { sourceTimeSeconds: time, sceneScore: null, motionScore: null, qualityScore: null,
          detections: [], description: "", sources: [] };
        if (flow) {
          const metrics = await flow.analyze(context.getImageData(0, 0, 224, 224).data, 224, 224, asset.assetId);
          sample.sceneScore = metrics.sceneChange; sample.motionScore = metrics.motion; sample.qualityScore = metrics.quality;
          sample.sources.push("auto-edit-frame-metrics");
        } else {
          const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("抽帧编码失败。")), "image/jpeg", 0.9));
          if (detector) { sample.detections = await detector.analyze(blob); sample.sources.push(step.basis.model.id); }
          else {
            sample.description = String(await session.prompt([{ role: "user", content: [
              { type: "text", value: "Describe only the visible scene and action in this image in one concise English sentence. Do not infer names, identity or events outside the image." },
              { type: "image", value: blob },
            ] }], { signal })).trim();
            if (!sample.description) throw new Error("浏览器未返回画面描述。");
            sample.sources.push("browser-language-model-unknown-version");
          }
        }
        samples.push(sample);
      }
      const range = { sourceStartSeconds: from, sourceEndSeconds: to };
      const output = { text: samples.map(sample => sample.description).filter(Boolean).join("\n"), language: capability === "description" ? "en" : "",
        words: [], samples, scenes: [], coverage: [range], complete: true, missingCapabilities: [] };
      signal.throwIfAborted();
      if (!image) await checkpoint(range, output);
      outputs.push(output); from = to;
      if (image) break;
    } while (from < end);
    return { text: outputs.map(output => output.text).filter(Boolean).join("\n"), language: capability === "description" ? "en" : "",
      words: [], samples: outputs.flatMap(output => output.samples), scenes: [], coverage: outputs.flatMap(output => output.coverage), complete: true, missingCapabilities: [] };
  } finally { signal.removeEventListener("abort", stop); source?.close(); image?.close(); detector?.close(); stop(); }
}
