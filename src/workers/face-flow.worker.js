/* global cv */

importScripts("/vendor/opencv.js");

let runtime = null;
let width = 0;
let height = 0;
let previousGray = null;
let trackedPoints = null;
const sessions = new Map();

function dispose() {
  previousGray?.delete();
  previousGray = null;
  trackedPoints = null;
  width = 0;
  height = 0;
}

function rgbaToGray(buffer) {
  const rgba = new runtime.Mat(height, width, runtime.CV_8UC4);
  const gray = new runtime.Mat();
  rgba.data.set(new Uint8ClampedArray(buffer));
  runtime.cvtColor(rgba, gray, runtime.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

function pointsMat(points) {
  return runtime.matFromArray(points.length / 2, 1, runtime.CV_32FC2, points);
}

function runPyrLk(previous, current, points) {
  const previousPoints = pointsMat(points);
  const nextPoints = new runtime.Mat();
  const status = new runtime.Mat();
  const errors = new runtime.Mat();
  try {
    runtime.calcOpticalFlowPyrLK(
      previous,
      current,
      previousPoints,
      nextPoints,
      status,
      errors,
      new runtime.Size(21, 21),
      3,
      new runtime.TermCriteria(runtime.TERM_CRITERIA_EPS | runtime.TERM_CRITERIA_COUNT, 30, 0.01),
    );
    const output = new Float32Array(points.length);
    const validPoints = new Uint8Array(points.length / 2);
    let accepted = 0;
    let errorTotal = 0;
    for (let index = 0; index < points.length / 2; index += 1) {
      const valid = Boolean(status.data[index]);
      const x = nextPoints.data32F[index * 2];
      const y = nextPoints.data32F[index * 2 + 1];
      const inside =
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < width && y >= 0 && y < height;
      if (valid && inside) {
        output[index * 2] = x;
        output[index * 2 + 1] = y;
        validPoints[index] = 1;
        accepted += 1;
        errorTotal += Number(errors.data32F[index]) || 0;
      } else {
        output[index * 2] = points[index * 2];
        output[index * 2 + 1] = points[index * 2 + 1];
      }
    }
    return {
      points: output,
      valid: validPoints,
      accepted,
      meanError: accepted ? errorTotal / accepted : Number.POSITIVE_INFINITY,
    };
  } finally {
    previousPoints.delete();
    nextPoints.delete();
    status.delete();
    errors.delete();
  }
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (!runtime || !message.requestId) return;
  const session = message.sessionId || "default";
  const state = sessions.get(session);
  width = state?.width || 0;
  height = state?.height || 0;
  previousGray = state?.previousGray || null;
  trackedPoints = state?.trackedPoints || null;
  try {
    if (message.type === "init") {
      dispose();
      width = Math.max(2, Number(message.width) || 0);
      height = Math.max(2, Number(message.height) || 0);
      trackedPoints = new Float32Array(message.points);
      previousGray = rgbaToGray(message.rgba);
      self.postMessage({
        type: "result",
        requestId: message.requestId,
        accepted: trackedPoints.length / 2,
      });
      return;
    }
    if (message.type === "step") {
      if (!previousGray || !trackedPoints) throw new Error("FACE_FLOW_NOT_INITIALIZED");
      const currentGray = rgbaToGray(message.rgba);
      const forward = runPyrLk(previousGray, currentGray, trackedPoints);
      const backward = runPyrLk(currentGray, previousGray, forward.points);
      const valid = new Uint8Array(trackedPoints.length / 2);
      let fbTotal = 0;
      let stable = 0;
      for (let index = 0; index < trackedPoints.length / 2; index += 1) {
        const distance = Math.hypot(
          backward.points[index * 2] - trackedPoints[index * 2],
          backward.points[index * 2 + 1] - trackedPoints[index * 2 + 1],
        );
        fbTotal += distance;
        if (forward.valid[index] && backward.valid[index] && distance <= 1.8) {
          stable += 1;
          valid[index] = 1;
        }
      }
      previousGray.delete();
      previousGray = currentGray;
      trackedPoints = forward.points;
      const transferable = trackedPoints.slice();
      self.postMessage(
        {
          type: "result",
          requestId: message.requestId,
          points: transferable.buffer,
          valid: valid.buffer,
          accepted: Math.min(forward.accepted, stable),
          meanError: forward.meanError,
          forwardBackwardError: fbTotal / Math.max(1, trackedPoints.length / 2),
        },
        [transferable.buffer, valid.buffer],
      );
      return;
    }
    if (message.type === "reset") {
      trackedPoints = new Float32Array(message.points);
      self.postMessage({
        type: "result",
        requestId: message.requestId,
        accepted: trackedPoints.length / 2,
      });
      return;
    }
    if (message.type === "dispose") {
      dispose();
      self.postMessage({ type: "result", requestId: message.requestId });
      return;
    }
    throw new Error(`FACE_FLOW_UNKNOWN_MESSAGE:${message.type}`);
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      message: error?.message || String(error),
    });
  } finally {
    if (previousGray) sessions.set(session, { width, height, previousGray, trackedPoints });
    else sessions.delete(session);
  }
});

(async () => {
  try {
    runtime = cv;
    if (!runtime?.Mat) {
      await new Promise((resolve) => {
        const previous = runtime.onRuntimeInitialized;
        runtime.onRuntimeInitialized = () => {
          previous?.();
          resolve();
        };
      });
    }
    if (!runtime?.calcOpticalFlowPyrLK) throw new Error("OpenCV.js build does not include PyrLK");
    self.postMessage({ type: "ready" });
  } catch (error) {
    self.postMessage({ type: "fatal", message: error?.message || String(error) });
  }
})();
