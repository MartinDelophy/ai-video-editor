let worker;
let nextRequestId = 0;
const requests = new Map();

function rejectRequests(error) {
  requests.forEach(({ reject }) => reject(error));
  requests.clear();
}

function resetWorker(error) {
  worker?.terminate();
  worker = null;
  if (error) rejectRequests(error);
}

function getWorker() {
  if (typeof Worker === "undefined") throw new Error("VOCAL_WORKER_UNAVAILABLE");
  if (worker) return worker;

  worker = new Worker(new URL("../workers/vocal-separation.worker.js", import.meta.url));
  worker.addEventListener("message", ({ data }) => {
    const request = requests.get(data?.requestId);
    if (!request) return;
    if (data.type === "progress") {
      request.onProgress(data.progress, data.phase);
      return;
    }
    requests.delete(data.requestId);
    if (data.type === "result") {
      request.resolve({
        vocals: new Blob([data.vocalsBuffer], { type: "audio/wav" }),
        accompaniment: new Blob([data.accompanimentBuffer], { type: "audio/wav" }),
        backend: data.backend,
      });
      return;
    }
    request.reject(new Error(data.error || "VOCAL_MODEL_FAILED"));
  });
  worker.addEventListener("error", (event) => {
    resetWorker(new Error(event.message || "VOCAL_WORKER_FAILED"));
  });
  return worker;
}

function runWorker(left, right, sampleRate, onProgress) {
  const requestId = `vocal-${++nextRequestId}`;
  const activeWorker = getWorker();
  return new Promise((resolve, reject) => {
    requests.set(requestId, { resolve, reject, onProgress });
    activeWorker.postMessage(
      { type: "separate", requestId, leftBuffer: left.buffer, rightBuffer: right.buffer, sampleRate },
      [left.buffer, right.buffer],
    );
  });
}

export async function separateVocals(blob, onProgress = () => {}) {
  const context = new AudioContext({ sampleRate: 44100 });
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const left = decoded.getChannelData(0).slice();
    const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice() : left.slice();
    return await runWorker(left, right, decoded.sampleRate, onProgress);
  } finally {
    await context.close().catch(() => {});
  }
}

export function disposeVocalSeparationWorker() {
  resetWorker(new Error("VOCAL_WORKER_DISPOSED"));
}
