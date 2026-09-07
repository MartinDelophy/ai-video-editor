// Release policy, not a browser probe. On 2026-09-07, the production Anna
// container uploaded a complete synthetic project, then restored and played
// its media after refresh. This does not certify every file lifecycle action
// or that a browser download has been saved to the user's filesystem.
export const ANNA_CLOUD_TRANSFERS_VERIFIED = true;

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
