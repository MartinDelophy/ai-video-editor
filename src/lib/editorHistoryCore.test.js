import { describe, expect, it } from "vitest";

import {
  createEditorHistory,
  pushEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "./editorHistoryCore.ts";

describe("editor history core", () => {
  it("undoes and redoes complete values", () => {
    let history = createEditorHistory({ clips: ["a"] });
    history = pushEditorHistory(history, { clips: ["a", "b"] });
    const undone = undoEditorHistory(history);
    expect(undone.changed).toBe(true);
    expect(undone.value.clips).toEqual(["a"]);
    const redone = redoEditorHistory(undone.history);
    expect(redone.value.clips).toEqual(["a", "b"]);
  });

  it("clears redo entries after a new edit", () => {
    let history = createEditorHistory("a");
    history = pushEditorHistory(history, "b");
    history = undoEditorHistory(history).history;
    history = pushEditorHistory(history, "c");
    expect(history.future).toEqual([]);
    expect(redoEditorHistory(history).changed).toBe(false);
  });

  it("bounds retained history", () => {
    let history = createEditorHistory(0);
    for (let value = 1; value <= 8; value += 1) {
      history = pushEditorHistory(history, value, 3);
    }
    expect(history.past).toEqual([5, 6, 7]);
  });
});
