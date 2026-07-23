import { useCallback, useEffect, useRef, useState } from "react";
import { localizeUiMessage } from "../i18nMessageRuntime.js";

export function useToast(timeout = 2600, language = "zh") {
  const [toast, setToast] = useState("");
  const timerRef = useRef(0);
  const notify = useCallback((message) => {
    setToast(localizeUiMessage(message, language)); clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(""), timeout);
  }, [language, timeout]);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { notify, toast };
}
