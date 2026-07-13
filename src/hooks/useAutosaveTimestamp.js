import { useEffect, useState } from "react";
import { formatSavedTime } from "../lib/timeline.js";

export function useAutosaveTimestamp(values, delay = 450) {
  const [lastSaved, setLastSaved] = useState(formatSavedTime);
  useEffect(() => {
    const timer = window.setTimeout(() => setLastSaved(formatSavedTime()), delay);
    return () => window.clearTimeout(timer);
  }, [...values, delay]);
  return lastSaved;
}
