export const HANDOFF_KEY = "timeline-qloo-handoff-v1";
export function readHandoff() {
  if (new URLSearchParams(window.location.search).get("qloo") !== "1") return null;
  try {
    const x = JSON.parse(sessionStorage.getItem(HANDOFF_KEY));
    if (
      x?.version !== 1 ||
      !["gentle", "balanced", "punchy"].includes(x.pace) ||
      typeof x.seed !== "string" ||
      x.seed.length > 300 ||
      !Number.isFinite(x.at) ||
      Date.now() - x.at > 3600000 ||
      x.at > Date.now() + 60000
    )
      return null;
    return x;
  } catch {
    return null;
  }
}
