import { useCallback, useEffect, useRef, useState } from "react";
export function useToast(timeout = 2600) {
  const [toast, setToast] = useState("");
  const timerRef = useRef(0);
  const notify = useCallback((message) => {
    setToast(message); clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(""), timeout);
  }, [timeout]);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { notify, toast };
}
