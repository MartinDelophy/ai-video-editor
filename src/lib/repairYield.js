// Yield to input/cancellation without background-tab timer clamping.
export async function yieldRepairTask(signal) {
  if (signal?.aborted) throw new DOMException("Repair canceled", "AbortError");
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  if (signal?.aborted) throw new DOMException("Repair canceled", "AbortError");
}
