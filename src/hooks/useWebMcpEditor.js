import { materialText } from "../i18nMaterial.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createWebMcpTranslator } from "../i18nWebMcp.js";
import { createWebMcpEditorSession, createWebMcpTools, registerEditorWebMcpTools } from "../lib/webMcpEditor.js";
import { useExecutionPlan } from "./useExecutionPlan.js";

export function useWebMcpEditor(editor) {
  const t = useMemo(() => createWebMcpTranslator(editor.language), [editor.language]);
  // Observe every editor render, including asset-only changes and edits that are
  // later reversed. An old receipt must never undo a newer history entry.
  const history = useRef({ signature: editor.historySignature, version: 0 });
  if (history.current.signature !== editor.historySignature) {
    history.current = { signature: editor.historySignature, version: history.current.version + 1 };
  }
  const latest = useRef(editor);
  latest.current = { ...editor, historyVersion: history.current.version, t,
    addExecutionAssets: items => flushSync(() => editor.addExecutionAssets(items)),
    bindExecutionAsset: (...args) => flushSync(() => editor.bindExecutionAsset(...args)) };
  const sessionRef = useRef(null);
  const [view, setView] = useState(null);
  const [aiJob, setAiJob] = useState(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const execution = useExecutionPlan(() => latest.current, () => sessionRef.current);
  latest.current.execution = execution;

  useEffect(() => {
    const session = createWebMcpEditorSession(() => latest.current, {
      publish: (value) => { setView(value); setError(""); },
      publishAi: setAiJob,
      commit: (action) => flushSync(action),
    });
    sessionRef.current = session;
    // A browser tool must never interrupt an active drag, trim or scrub gesture.
    const pointers = new Set();
    const down = (event) => {
      if (!event.target?.closest?.(".app-shell") || event.target?.closest?.(".webmcp-review")) return;
      pointers.add(event.pointerId);
      session.setPointerActive(true);
    };
    const up = (event) => { pointers.delete(event.pointerId); session.setPointerActive(pointers.size > 0); };
    const clear = () => { pointers.clear(); session.setPointerActive(false); };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", clear);
    return () => {
      session.close();
      sessionRef.current = null;
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useEffect(() => {
    const registration = registerEditorWebMcpTools(document, navigator, createWebMcpTools(sessionRef.current, t));
    return () => registration.dispose();
  }, [t]);

  const run = async (name, input, event) => {
    if (!sessionRef.current || working) return;
    setWorking(true);
    setError("");
    try {
      if (name === "timeline_edit_apply") await execution.beforeApply(event, input.previewId);
      const result = await sessionRef.current.run(name, input);
      if (!result.ok) setError(result.error.message);
      else if (name === "timeline_edit_apply") await execution.afterApply(input.previewId, result);
    } catch (error) { setError(execution.record ? materialText(editor.language, "error") : error.message);
    } finally { setWorking(false); }
  };
  return {
    t, view, aiJob, error, working, execution,
    isAiRunning: () => sessionRef.current?.isAiRunning() === true,
    cancelAi: () => run("timeline_ai_cancel", { jobId: aiJob?.jobId }),
    dismissAi: () => setAiJob(null),
    stale: Boolean(view?.status === "pending" && sessionRef.current && !sessionRef.current.isCurrentPreview()),
    canUndo: Boolean(view?.status === "applied" && sessionRef.current?.canUndo()),
    apply: event => run("timeline_edit_apply", { previewId: view?.preview?.previewId }, event),
    undo: () => run("timeline_edit_undo", { transactionId: view?.transactionId }),
    dismiss: () => { sessionRef.current?.dismiss(); setError(""); },
  };
}
