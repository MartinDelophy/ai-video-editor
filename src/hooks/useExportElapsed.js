import { useEffect, useState } from "react";
export function useExportElapsed(exporting, startRef) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!exporting) return undefined;
    const update = () => setElapsed((performance.now() - (startRef.current || performance.now())) / 1000);
    update(); const timer = setInterval(update, 250); return () => clearInterval(timer);
  }, [exporting, startRef]);
  return elapsed;
}
