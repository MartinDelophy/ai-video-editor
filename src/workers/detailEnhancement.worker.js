import { createDetailEnhancementGpu } from "../lib/detailEnhancementGpu.js";
import { enhanceDetailPixels } from "../lib/detailEnhancement.js";

let canvas = null;
let context = null;
const workspace = {};
let gpuPromise = null;
let gpuDisabled = false;

async function renderFrame(bitmap, settings) {
  if (!gpuDisabled) {
    let gpu;
    try {
      gpuPromise ||= createDetailEnhancementGpu();
      gpu = await gpuPromise;
      if (gpu) return { canvas: await gpu.render(bitmap, settings), backend: "webgpu" };
    } catch {
      gpu?.dispose();
      // Device loss, unsupported limits or shader failures use the same CPU filter.
    }
    gpuDisabled = true;
  }
  if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    context = canvas.getContext("2d", { willReadFrequently: true });
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  context.putImageData(enhanceDetailPixels(context.getImageData(0, 0, canvas.width, canvas.height), settings, workspace), 0, 0);
  return { canvas, backend: "cpu" };
}

self.addEventListener("message", async ({ data: { requestId, bitmap, settings, outputType } }) => {
  try {
    const rendered = await renderFrame(bitmap, settings);
    bitmap.close();
    const output = rendered.canvas;
    const meta = { width: output.width, height: output.height, backend: rendered.backend };
    if (outputType === "bitmap") {
      // Transfer pixels directly to the video encoder path; PNG is only for files.
      const frame = output.transferToImageBitmap();
      self.postMessage({ requestId, result: { ...meta, bitmap: frame } }, [frame]);
    } else {
      self.postMessage({ requestId, result: { ...meta, blob: await output.convertToBlob({ type: "image/png" }) } });
    }
  } catch (error) {
    bitmap.close();
    self.postMessage({ requestId, error: error instanceof Error ? error.message : String(error) });
  }
});
