// Release policy, not a browser support claim. File transfers stay unavailable
// until an actual Anna upload/download round trip is verified after the
// platform CORS fix. Metadata management does not transfer project media.
export const ANNA_CLOUD_TRANSFERS_VERIFIED = false;

export async function checkAnnaLocalCompute() {
  try {
    const module = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    await WebAssembly.instantiate(module);
    return { status: "passed", reason: "" };
  } catch {
    return { status: "blocked", reason: "localModelsUnavailable" };
  }
}

export function annaLocalComputeReason(compute) {
  if (compute?.status === "passed") return "";
  return compute?.status === "blocked" ? "localModelsUnavailable" : "localModelsChecking";
}
