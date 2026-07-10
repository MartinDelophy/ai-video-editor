import { LIVE_PORTRAIT_WEB_MODEL } from "../config/livePortrait.js";

const REQUIRED_GENERATOR_BYTES = LIVE_PORTRAIT_WEB_MODEL.knownArtifacts.generator.bytes;

function makeCheck(id, state, detail) {
  return { id, state, detail };
}

export async function probeLivePortraitWebEnvironment() {
  const checks = [];
  const gpu = globalThis.navigator?.gpu;

  if (!gpu) {
    checks.push(makeCheck("webgpu", "failed", "WebGPU unavailable"));
    return { readyForPorting: false, checks };
  }

  let adapter;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch (error) {
    checks.push(makeCheck("webgpu", "failed", error instanceof Error ? error.message : String(error)));
    return { readyForPorting: false, checks };
  }

  if (!adapter) {
    checks.push(makeCheck("webgpu", "failed", "No WebGPU adapter"));
    return { readyForPorting: false, checks };
  }

  checks.push(makeCheck("webgpu", "passed", "WebGPU adapter ready"));
  checks.push(makeCheck(
    "buffer",
    adapter.limits.maxBufferSize >= REQUIRED_GENERATOR_BYTES ? "passed" : "warning",
    `${Math.round(adapter.limits.maxBufferSize / 1024 / 1024)} MB max GPU buffer`,
  ));

  if (globalThis.crossOriginIsolated) {
    checks.push(makeCheck("isolation", "passed", "Cross-origin isolated"));
  } else {
    checks.push(makeCheck("isolation", "warning", "Single-thread fallback; COOP/COEP not enabled"));
  }

  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    const available = Math.max(0, (estimate?.quota ?? 0) - (estimate?.usage ?? 0));
    checks.push(makeCheck(
      "storage",
      available >= 1_200_000_000 ? "passed" : "warning",
      estimate?.quota ? `${(available / 1024 / 1024 / 1024).toFixed(1)} GB cache available` : "Storage quota unavailable",
    ));
  } catch {
    checks.push(makeCheck("storage", "warning", "Storage quota unavailable"));
  }

  checks.push(makeCheck(
    "gridSample5d",
    "warning",
    "3D Conv / 5D GridSample use the verified WASM fallback; WebGPU acceleration pending",
  ));

  return {
    readyForPorting: checks.every((check) => check.state !== "failed"),
    checks,
  };
}
