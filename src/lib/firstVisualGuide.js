export const FIRST_VISUAL_GUIDE_STORAGE_KEY = "timeline-studio-first-visual-guide-seen-v1";
export const FIRST_VISUAL_GUIDE_MOBILE_QUERY = "(max-width: 760px)";

export function canShowFirstVisualGuide({ isMobile = false, hasSeen = false, shownThisSession = false } = {}) {
  return !isMobile && !hasSeen && !shownThisSession;
}

export function hasSeenFirstVisualGuide() {
  try { return window.localStorage.getItem(FIRST_VISUAL_GUIDE_STORAGE_KEY) === "1"; } catch { return false; }
}

export function markFirstVisualGuideSeen() {
  try { window.localStorage.setItem(FIRST_VISUAL_GUIDE_STORAGE_KEY, "1"); } catch { /* Keep the guide non-blocking when storage is unavailable. */ }
}
