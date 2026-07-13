export interface EditorHistory<T> {
  past: T[];
  current: T;
  future: T[];
}

export interface HistoryTransition<T> {
  history: EditorHistory<T>;
  value: T;
  changed: boolean;
}

export function createEditorHistory<T>(initial: T): EditorHistory<T> {
  return { past: [], current: initial, future: [] };
}

export function pushEditorHistory<T>(
  history: EditorHistory<T>,
  next: T,
  limit = 50,
): EditorHistory<T> {
  const safeLimit = Math.max(1, Math.floor(limit));
  return {
    past: [...history.past, history.current].slice(-safeLimit),
    current: next,
    future: [],
  };
}

export function undoEditorHistory<T>(history: EditorHistory<T>): HistoryTransition<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return { history, value: history.current, changed: false };
  const nextHistory = {
    past: history.past.slice(0, -1),
    current: previous,
    future: [history.current, ...history.future],
  };
  return { history: nextHistory, value: previous, changed: true };
}

export function redoEditorHistory<T>(history: EditorHistory<T>): HistoryTransition<T> {
  const next = history.future[0];
  if (next === undefined) return { history, value: history.current, changed: false };
  const nextHistory = {
    past: [...history.past, history.current],
    current: next,
    future: history.future.slice(1),
  };
  return { history: nextHistory, value: next, changed: true };
}
