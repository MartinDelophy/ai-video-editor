import { describe, expect, it, vi } from "vitest";
import {
  isExportAbortError,
  throwIfExportAborted,
  waitForExportTimeout,
} from "./exportCancellation.js";

describe("export cancellation", () => {
  it("uses a stable AbortError identity", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfExportAborted(controller.signal)).toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  it("interrupts an active export delay and clears its timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = waitForExportTimeout(60_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(isExportAbortError);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
