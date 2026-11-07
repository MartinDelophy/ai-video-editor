import { resolveFaceAttachmentPose, facePoseImageRatios } from "./faceAttachments.js";
// Share the production forward/backward PyrLK worker; per-analysis sessions
// isolate concurrent clips without loading another OpenCV runtime for each one.
let worker,
  ready,
  sequence = 0;
const pending = new Map();
function getWorker() {
  if (worker) return { worker, ready };
  worker = new Worker(new URL("../workers/face-flow.worker.js", import.meta.url));
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("FACE_FLOW_TIMEOUT")), 45000);
    worker.onmessage = ({ data }) => {
      if (data.type === "ready") {
        clearTimeout(timer);
        resolve();
        return;
      }
      if (data.type === "fatal") {
        clearTimeout(timer);
        reject(new Error(data.message));
        return;
      }
      const request = pending.get(data.requestId);
      if (!request) return;
      pending.delete(data.requestId);
      request.cleanup();
      if (data.type === "error") request.reject(new Error(data.message));
      else request.resolve(data);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(event.message));
      for (const request of pending.values()) {
        request.cleanup();
        request.reject(new Error("FACE_FLOW_FAILED"));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
      ready = null;
    };
  });
  return { worker, ready };
}
async function request(sessionId, type, payload, signal) {
  const runtime = getWorker();
  await runtime.ready;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
    const requestId = ++sequence;
    const cancel = () => {
      pending.delete(requestId);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      pending.delete(requestId);
      cleanup();
      reject(new Error("FACE_FLOW_TIMEOUT"));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    pending.set(requestId, { resolve, reject, cleanup });
    signal?.addEventListener("abort", cancel, { once: true });
    const transfer = Object.values(payload).filter((value) => value instanceof ArrayBuffer);
    runtime.worker.postMessage({ sessionId, requestId, type, ...payload }, transfer);
  });
}
export function createFaceAttachmentFlow(width, height) {
  const session = crypto.randomUUID();
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 480 / Math.max(width, height));
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  let pixels, previousSignature, face;
  return {
    capture(source) {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const signature = new Float32Array(256);
      let difference = 0;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const index =
            (Math.min(canvas.height - 1, Math.floor(((y + 0.5) / 16) * canvas.height)) *
              canvas.width +
              Math.min(canvas.width - 1, Math.floor(((x + 0.5) / 16) * canvas.width))) *
            4;
          const value =
            (pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 255;
          signature[y * 16 + x] = value;
          if (previousSignature) difference += Math.abs(value - previousSignature[y * 16 + x]);
        }
      const cut = previousSignature && difference / 256 > 0.23;
      previousSignature = signature;
      return Boolean(cut);
    },
    async anchor(next, signal) {
      const pose = resolveFaceAttachmentPose(next, width, height);
      face = {
        ...next,
        poseReference: {
          yaw: pose.yawRadians,
          pitch: pose.pitchRadians,
          ...facePoseImageRatios(next, width, height),
        },
      };
      const points = new Float32Array(
        [...next.five, ...(next.support || []), next.forehead || next.five[2]].flatMap((point) => [
          point.x * canvas.width,
          point.y * canvas.height,
        ]),
      );
      await request(
        session,
        "init",
        {
          width: canvas.width,
          height: canvas.height,
          rgba: pixels.slice().buffer,
          points: points.buffer,
        },
        signal,
      );
    },
    async step(signal) {
      if (!face) return null;
      const result = await request(session, "step", { rgba: pixels.slice().buffer }, signal);
      const points = new Float32Array(result.points),
        valid = new Uint8Array(result.valid || []);
      if (
        result.accepted < Math.max(8, Math.ceil((points.length / 2) * 0.65)) ||
        result.forwardBackwardError > 1.6 ||
        result.meanError > 18 ||
        !valid[0] ||
        !valid[1] ||
        !valid[2]
      )
        return null;
      const point = (index) => ({
        x: points[index * 2] / canvas.width,
        y: points[index * 2 + 1] / canvas.height,
      });
      const old = face;
      const oldDistance = Math.hypot(old.five[1].x - old.five[0].x, old.five[1].y - old.five[0].y);
      const newDistance = Math.hypot(point(1).x - point(0).x, point(1).y - point(0).y);
      const trackedPoint = (index, previous) => ({
        ...point(index),
        z: ((previous?.z || 0) * newDistance) / Math.max(1e-6, oldDistance),
      });
      face = {
        ...face,
        five: Array.from({ length: 5 }, (_, i) => trackedPoint(i, old.five[i])),
        support: Array.from({ length: Math.max(0, points.length / 2 - 6) }, (_, i) => point(i + 5)),
        forehead: trackedPoint(points.length / 2 - 1, old.forehead),
      };
      return face;
    },
    dispose() {
      face = null;
      pixels = null;
      canvas.width = 0;
      canvas.height = 0;
      if (worker) void request(session, "dispose", {}, null).catch(() => {});
    },
  };
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    worker?.terminate();
    worker = null;
    for (const item of pending.values()) {
      item.cleanup();
      item.reject(new Error("FACE_FLOW_DISPOSED"));
    }
    pending.clear();
  });
