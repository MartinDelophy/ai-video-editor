import { useEffect, useRef, useState } from "react";
import { isAnnaEdition } from "../lib/annaRuntime.js";
import { openAnnaDictation } from "../lib/annaAudio.js";
export function useAnnaDictation({ language, input, setInput }) {
  const [status, setStatus] = useState(""),
    [interim, setInterim] = useState("");
  const current = useRef(null),
    draft = useRef(input);
  draft.current = input;
  const supported =
    isAnnaEdition &&
    Boolean(globalThis.isSecureContext && globalThis.navigator?.mediaDevices?.getUserMedia);
  const cancel = () => {
    const run = current.current;
    current.current = null;
    if (run) {
      clearTimeout(run.timer);
      run.abort.abort();
      run.control?.close();
    }
  };
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        cancel();
        setStatus("");
        setInterim("");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [language]);
  useEffect(() => {
    setStatus("");
    setInterim("");
  }, [language]);
  const stop = () => {
    const run = current.current;
    if (!run) return;
    setStatus("stopping");
    clearTimeout(run.timer);
    if (run.control) run.control.stop();
    else {
      cancel();
      setStatus("");
    }
  };
  const start = async () => {
    if (current.current || !supported) return;
    const run = {
      abort: new AbortController(),
      base: draft.current,
      text: "",
      timer: null,
      control: null,
    };
    current.current = run;
    const valid = () => current.current === run;
    const finish = (error) => {
      if (!valid()) return;
      cancel();
      setInterim("");
      setStatus(
        error
          ? /denied|grant|permission|allowed/i.test(
              `${error.code || ""} ${error.name || ""} ${error.message || ""}`,
            )
            ? "denied"
            : "error"
          : run.text.trim()
            ? ""
            : "empty",
      );
    };
    setStatus("starting");
    setInterim("");
    run.timer = setTimeout(() => {
      if (valid()) {
        cancel();
        setStatus("error");
      }
    }, 35000);
    try {
      run.control = await openAnnaDictation({
        signal: run.abort.signal,
        language,
        onPartial: (text) => {
          if (valid()) setInterim(text.slice(0, 300));
        },
        onFinal: (text) => {
          if (!valid() || !text.trim()) return;
          run.text += (run.text ? " " : "") + text.trim();
          setInput(
            (run.base + (run.base && !/\s$/.test(run.base) ? " " : "") + run.text).slice(0, 4000),
          );
          setInterim("");
        },
        onError: finish,
        onEnded: () => finish(),
      });
      if (!valid()) {
        run.control.close();
        return;
      }
      clearTimeout(run.timer);
      setStatus("listening");
      run.timer = setTimeout(stop, 60000);
    } catch (error) {
      if (valid()) finish(error);
    }
  };
  return {
    supported,
    status,
    interim,
    active: ["starting", "listening", "stopping"].includes(status),
    start,
    stop,
  };
}
