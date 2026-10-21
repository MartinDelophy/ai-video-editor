import { useRef, useState } from "react";

export function useScriptReview({ hostSession, getContext }) {
  const latest = useRef(getContext); latest.current = getContext;
  const pending = useRef(null);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const request = async (path, body, key) => {
    const context = await latest.current();
    return hostSession.request(`/api/v1/projects/${encodeURIComponent(context.projectId)}/${path}`,
      body === undefined ? undefined : { ...body, editorSessionId: context.editorSessionId }, key,
      { signal: AbortSignal.timeout(300_000) });
  };
  return {
    saving,
    list: () => request("scripts"),
    history: scriptId => request(`scripts/${encodeURIComponent(scriptId)}/history`),
    sources: () => request("script-sources"),
    provider: () => hostSession.request("/api/v1/planning-provider"),
    async inspectAgent(taskId) {
      if (taskId) return request(`agent-planning-runs/${encodeURIComponent(taskId)}/context`, {});
      const [scripts, tasks, sources] = await Promise.all([request("scripts"), request("planning-runs"), request("script-sources")]);
      return { scripts: scripts.items.map(record => ({ scriptId: record.scriptId, revision: record.revision,
        title: record.draft.content.title, confirmed: Boolean(record.confirmed), sourcesCurrent: record.sourcesCurrent })),
        sources: sources.items.map(({ sourceId, kind, capability, range, labels }) => ({ sourceId, kind, capability, range, labels })),
        tasks: tasks.items.filter(task => task.provider.kind === "harness").map(task => ({ taskId: task.taskId,
          status: task.status, scriptRef: task.scriptRef, source: task.provider })) };
    },
    prepareAgent: ({ requestId, source = { kind: "harness", harness: "unknown", providerId: "unknown", model: "unknown", authType: "unknown" }, maxInputBytes = 200000, ...input }) =>
      request("agent-planning-runs", { ...input, source, maxInputBytes }, requestId),
    submitAgent: ({ taskId, ...output }) => request(`agent-planning-runs/${encodeURIComponent(taskId)}/outputs`, output, output.inputDigest),
    async inspectSemantic(taskId) {
      if (taskId) return request(`agent-semantic-runs/${encodeURIComponent(taskId)}/context`, {});
      return request("semantic-catalog");
    },
    prepareSemantic: ({ requestId, source = { kind: "harness", harness: "unknown", providerId: "unknown", model: "unknown", authType: "unknown" }, maxInputBytes = 200000, ...input }) =>
      request("agent-semantic-runs", { ...input, source, maxInputBytes }, requestId),
    submitSemantic: ({ taskId, ...output }) => request(`agent-semantic-runs/${encodeURIComponent(taskId)}/outputs`, output, output.inputDigest),
    inspectVisualSearch: () => request("visual-search"),
    queryVisualSearch: input => request("visual-search/queries", input),
    saveProvider: (event, value) => {
      if (!event?.isTrusted) throw new Error("请从配置面板直接保存服务配置。");
      return hostSession.request("/api/v1/planning-provider", value);
    },
    preview: record => request("planning-previews", { scriptId: record.scriptId, revision: record.revision }),
    generate: (event, confirmationId, key) => {
      if (!event?.isTrusted) throw new Error("请直接确认外发范围。");
      return request("planning-runs", { confirmationId }, key);
    },
    runs: () => request("planning-runs"),
    taskAction: (taskId, action) => request(`planning-runs/${encodeURIComponent(taskId)}/${action}`, {}),
    async save(record, draft, event) {
      if (inFlight.current) throw new Error("正在保存上一修订，请稍候。");
      if (event && !event.isTrusted) throw new Error("请直接点击确认脚本。");
      inFlight.current = true;
      setSaving(true);
      try {
        const context = await latest.current();
        if (!pending.current) {
          let confirmationId = null;
          if (event) {
            const confirmed = await request(`scripts/${encodeURIComponent(record.scriptId)}/confirmations`, { revision: record.revision, digest: record.digest });
            confirmationId = confirmed.confirmationId;
          }
          pending.current = { projectId: context.projectId, key: crypto.randomUUID(), scriptId: record.scriptId,
            body: { scriptId: record.scriptId, expectedRevision: record.revision, draft, createdAt: new Date().toISOString(),
              confirmDigest: event ? record.digest : null, confirmationId } };
        }
        const operation = pending.current;
        if (operation.projectId !== context.projectId) throw new Error("上一项目仍有未确认的脚本保存；请返回该项目重试。");
        const saved = await request(operation.body.expectedRevision === 0 ? "scripts" : `scripts/${encodeURIComponent(operation.scriptId)}/revisions`, operation.body, operation.key);
        if (saved.status !== "succeeded") {
          if (saved.status === "failed") {
            operation.key = crypto.randomUUID();
            if (operation.body.confirmDigest !== null) {
              const confirmation = await request(`scripts/${encodeURIComponent(operation.scriptId)}/confirmations`,
                { revision: operation.body.expectedRevision, digest: operation.body.confirmDigest });
              operation.body.confirmationId = confirmation.confirmationId;
            }
          }
          throw new Error(saved.error?.message || "脚本保存尚未完成。");
        }
        pending.current = null;
        const list = await request("scripts");
        return { ...list.items.find(item => item.scriptId === operation.scriptId), savedCurrentInput: operation.body.draft === draft };
      } finally { inFlight.current = false; setSaving(false); }
    },
  };
}
