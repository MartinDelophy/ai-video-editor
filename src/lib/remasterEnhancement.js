import { REMASTER_DRUNET_MODEL, REMASTER_DRUNET_MODEL_URL } from "../config/models.js";

export const REMASTER_DRUNET_MODEL_LABEL = REMASTER_DRUNET_MODEL.label;
export { REMASTER_DRUNET_MODEL_URL };

let worker = null;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/remaster.worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event) => {
    const message = event.data ?? {};
    const request = pending.get(message.requestId);
    if (!request) return;
    if (message.type === "progress") { request.onProgress?.(message); return; }
    pending.delete(message.requestId);
    request.signal?.removeEventListener("abort", request.abort);
    if (message.type === "result") request.resolve(message.result);
    else request.reject(new Error(message.error || "视频增强失败"));
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "视频增强 Worker 运行失败");
    pending.forEach((request) => request.reject(error)); pending.clear();
    worker?.terminate(); worker = null;
  });
  return worker;
}

export function enhanceRemasterFrame({ bitmap, maxLongEdge = 960, onProgress, signal }) {
  if (!bitmap) return Promise.reject(new Error("没有可增强的画面"));
  const requestId = `remaster-${crypto.randomUUID?.() ?? Date.now()}`;
  return new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    const abort = () => {
      pending.delete(requestId);
      bitmap.close?.();
      if (worker === activeWorker) {
        activeWorker.terminate();
        worker = null;
        pending.clear();
      }
      const error = new Error("视频增强已取消"); error.name = "AbortError"; reject(error);
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    pending.set(requestId, { resolve, reject, onProgress, signal, abort });
    activeWorker.postMessage({ type: "enhance", requestId, bitmap, maxLongEdge }, [bitmap]);
  });
}

export async function captureRemasterSource({ type, src, video }) {
  if (type === "video") {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      throw new Error("当前视频帧尚未准备好，请稍后重试");
    }
    return createImageBitmap(video);
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error(`读取画面失败（HTTP ${response.status}）`);
  return createImageBitmap(await response.blob());
}

export function disposeRemasterWorker() {
  worker?.terminate(); worker = null;
  pending.forEach((request) => request.reject(new Error("视频增强 Worker 已关闭")));
  pending.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(disposeRemasterWorker);
}
