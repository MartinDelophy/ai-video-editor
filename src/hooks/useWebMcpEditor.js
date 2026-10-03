import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createWebMcpTranslator } from "../i18nWebMcp.js";
import { createWebMcpEditorSession, createWebMcpTools, registerEditorWebMcpTools } from "../lib/webMcpEditor.js";

export function useWebMcpEditor(editor) {
  const t = useMemo(() => createWebMcpTranslator(editor.language), [editor.language]);
  // Observe every editor render, including asset-only changes and edits that are
  // later reversed. An old receipt must never undo a newer history entry.
  const history = useRef({ signature: editor.historySignature, version: 0 });
  if (history.current.signature !== editor.historySignature) {
    history.current = { signature: editor.historySignature, version: history.current.version + 1 };
  }
  const latest = useRef(editor);
  latest.current = { ...editor, historyVersion: history.current.version, t };
  const sessionRef = useRef(null);
  const [view, setView] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState(null);
  const [aiJob, setAiJob] = useState(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const session = createWebMcpEditorSession(() => latest.current, {
      publish: (value) => { setView(value); setError(""); setReviewSnapshot(null); setReviewOpen(Boolean(value) && !latest.current.deferReview); },
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

  const run = async (name, input) => {
    if (!sessionRef.current || working) return;
    setWorking(true);
    setError("");
    try {
      const result = await sessionRef.current.run(name, input);
      if (!result.ok) setError(result.error.message);
      if (result.ok && name === "timeline_edit_undo" && view) { setView({ ...view, status: "undone" }); setReviewOpen(false); }
      return result;
    } finally { setWorking(false); }
  };
  const currentReview = !reviewSnapshot || reviewSnapshot.preview?.previewId === view?.preview?.previewId;
  const shownView = currentReview ? view : reviewSnapshot;
  const actions = {
    apply: () => run("timeline_edit_apply", { previewId: view?.preview?.previewId }),
    undo: () => run("timeline_edit_undo", { transactionId: view?.transactionId }),
  };
  return {
    hideReview: () => { setReviewOpen(false); setReviewSnapshot(null); },
    showReview: snapshot => { setReviewSnapshot(snapshot || null); setReviewOpen(true); },
    reviewAgent: {
      t, view: reviewOpen ? shownView : null, working, error: currentReview ? error : "", readOnly: !currentReview || shownView?.status === "undone",
      stale: Boolean(currentReview && view?.status === "pending" && sessionRef.current && !sessionRef.current.isCurrentPreview()),
      canUndo: Boolean(currentReview && view?.status === "applied" && sessionRef.current?.canUndo()),
      ...actions, dismiss: () => { setReviewOpen(false); setReviewSnapshot(null); },
      cancel: () => { sessionRef.current?.dismiss(); setError(""); setReviewOpen(false); setReviewSnapshot(null); },
    },
    t, view, error, working, aiJob,
    commitAiAssets: editor.commitAiAssets,
    prepareAi: editor.prepareAi,
    releaseAi: editor.releaseAi,
    resetAi: () => sessionRef.current?.resetAi(),
    aiAssets: () => sessionRef.current?.aiAssets() || [],
    tools: () => createWebMcpTools(sessionRef.current, t),
    execute: (name, input, options) => sessionRef.current?.run(name, input, options),
    stale: Boolean(view?.status === "pending" && sessionRef.current && !sessionRef.current.isCurrentPreview()),
    canUndo: Boolean(view?.status === "applied" && sessionRef.current?.canUndo()),
    apply: () => run("timeline_edit_apply", { previewId: view?.preview?.previewId }),
    undo: () => run("timeline_edit_undo", { transactionId: view?.transactionId }),
    dismiss: () => { sessionRef.current?.dismiss(); setError(""); },
  };
}
