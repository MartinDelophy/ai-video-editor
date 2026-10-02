/** Bound background CPU work so input and rendering can run between slices. */
export function createCooperativeCheckpoint(budgetMs = 8) {
  let deadline = performance.now() + budgetMs;
  return async () => {
    if (performance.now() < deadline) return;
    if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
    else await new Promise(resolve => setTimeout(resolve, 0));
    deadline = performance.now() + budgetMs;
  };
}
