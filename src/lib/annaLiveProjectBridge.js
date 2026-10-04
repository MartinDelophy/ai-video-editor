import { inspectProject } from "./projectCommandEngine.js";

// Read-only host payload bridge. No archive, private-storage access or edit route.
export function attachAnnaLiveProjectBridge(runtime, getSnapshot) {
  const receipts = new Map();
  let disposed = false;
  const receive = async (payload) => {
    const request = payload?.timelineStudioRequest;
    if (!request || typeof request !== "object" || Array.isArray(request)) return;
    const { requestId, method, schemaVersion, issuedAt } = request;
    if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return;
    if (receipts.has(requestId) || disposed) return;
    receipts.set(requestId, true);
    console.info("[Timeline Studio bridge] request received", requestId);
    if (receipts.size > 128) receipts.delete(receipts.keys().next().value);
    let result;
    if (schemaVersion !== 1 || method !== "project.inspect") {
      result = { ok: false, code: "UNSUPPORTED_REQUEST", message: "Only schema 1 project.inspect is supported." };
    } else if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 120000) {
      result = { ok: false, code: "REQUEST_EXPIRED", message: "Send a fresh request with a new requestId and current issuedAt timestamp." };
    } else {
      try {
        const snapshot = getSnapshot();
        const { duration, ratio, tracks, markers, warnings } = inspectProject(snapshot);
        // Serialized command revision is not a live-editor conflict token.
        result = { ok: true, duration, ratio, tracks, markers, warnings, scope: "current-editor-summary", editable: false, capturedAt: new Date().toISOString() };
      } catch (error) {
        result = { ok: false, code: error.code || "INSPECTION_FAILED", message: error.message };
      }
    }
    if (disposed) return;
    try {
      const acknowledgement = await runtime.chat.append_artifact({ kind: "app_event", summary: `Timeline Studio · ${method === "project.inspect" ? "project.inspect" : "unsupported request"} · ${requestId}`, payload: { schemaVersion: 1, requestId, method: "project.inspect", result } });
      console.info("[Timeline Studio bridge] artifact acknowledged", requestId, acknowledgement?.artifact_id || "acknowledged");
    } catch (error) {
      console.warn("[Timeline Studio bridge] artifact delivery failed", requestId, error?.code || "RPC_FAILED");
      // Permit explicit same-ID retry when delivery failed; do not report success.
      receipts.delete(requestId);
    }
  };
  const unsubscribe = runtime.on("entry_payload", receive);
  void receive(runtime.entryPayload);
  return () => { disposed = true; unsubscribe(); };
}
