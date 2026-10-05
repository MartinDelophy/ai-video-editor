import { resolveDepthAnalysisAtTime } from "./depthOfField.js";

// Bound the producer's lead while keeping completed samples for reuse/retry.
export function createDepthSampleStream(analysis, signal, maxLead = 3) {
  let consumedIndex = -1;
  let finished = false;
  let stopped = false;
  let failure = null;
  const waiters = new Set();
  const wake = () => { waiters.forEach((resolve) => resolve()); waiters.clear(); };
  const check = () => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
    if (failure) throw failure;
  };
  const wait = () => new Promise((resolve) => waiters.add(resolve));
  signal?.addEventListener("abort", wake);
  const timeOf = (sample) => Number(sample.sourceTime ?? sample.time) || 0;
  return {
    async append(sample) {
      check();
      analysis.samples.push(sample);
      wake();
      while (!stopped && analysis.samples.length - 1 > consumedIndex + maxLead) {
        await wait();
        check();
      }
    },
    async atTime(time) {
      check();
      while (!finished && (!analysis.samples.length || timeOf(analysis.samples.at(-1)) < time)) {
        await wait();
        check();
      }
      if (!analysis.samples.length) throw new Error("No depth frames available");
      while (consumedIndex + 1 < analysis.samples.length && timeOf(analysis.samples[consumedIndex + 1]) <= time) consumedIndex += 1;
      wake();
      return resolveDepthAnalysisAtTime(analysis, time);
    },
    finish() { finished = true; wake(); },
    fail(error) { failure = error; finished = true; stopped = true; wake(); },
    releaseConsumer() { stopped = true; wake(); },
    dispose() { signal?.removeEventListener("abort", wake); stopped = true; wake(); },
  };
}
