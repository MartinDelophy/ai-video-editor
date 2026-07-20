export const FIRST_VISUAL_GUIDE_STORAGE_KEY = "timeline-studio-first-visual-guide-seen-v1";

export function hasSeenFirstVisualGuide() {
  try { return window.localStorage.getItem(FIRST_VISUAL_GUIDE_STORAGE_KEY) === "1"; } catch { return false; }
}

export function markFirstVisualGuideSeen() {
  try { window.localStorage.setItem(FIRST_VISUAL_GUIDE_STORAGE_KEY, "1"); } catch { /* Keep the guide non-blocking when storage is unavailable. */ }
}
