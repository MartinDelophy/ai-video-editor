import { materialText } from "../i18nMaterial.js";
import { useEffect, useRef, useState } from "react";
import { projectMediaUrl } from "../lib/projectSnapshot.js";
import { analyzeSourceSpeech } from "../lib/materialAudio.js";
import { analyzeSourceVisual } from "../lib/materialVisual.js";

export function useMaterialAnalysis({ hostSession, getContext, isEditorBusy, language }) {
  const latest = useRef({ getContext, isEditorBusy, language });
  latest.current = { getContext, isEditorBusy };
  const controller = useRef(null), pending = useRef(null), active = useRef(null);
  const [state, setState] = useState({ running: false, phase: "", error: "", tasks: [], pendingSave: null, pendingSaveKind: null });
  const trusted = event => { if (!event?.isTrusted) throw new Error("请从素材分析面板直接操作。"); };
  const context = async () => {
    if (!hostSession || hostSession.getSnapshot().connection === "draining") throw new Error("本地服务正在退出。");
    return latest.current.getContext();
  };
  const request = async (path, body, key, options) => {
    const current = await context();
    return hostSession.request(`/api/v1/projects/${encodeURIComponent(current.projectId)}/${path}`,
      body === undefined ? undefined : { ...body, editorSessionId: current.editorSessionId }, key, options);
  };
  const refresh = async () => {
    const result = await request("analysis-tasks");
    setState(old => ({ ...old, tasks: result.items,
      pendingSave: result.pendingSaves?.[0]?.saveId ?? (old.pendingSaveKind === "semantic" ? old.pendingSave : null),
      pendingSaveKind: result.pendingSaves?.[0]?.saveId ? "analysis" : old.pendingSaveKind === "semantic" ? "semantic" : null }));
    return result.items;
  };
  const saveOperation = async (taskId, operation) => {
    const current = await context(), key = crypto.randomUUID();
    const path = `analysis-tasks/${encodeURIComponent(taskId)}/actions`;
    pending.current = { projectId: current.projectId, path, body: { operation }, key };
    const result = await request(path, { operation }, key, { signal: AbortSignal.timeout(300_000) });
    pending.current = null;
    if (result.saveStatus !== "succeeded") {
      setState(old => ({ ...old, pendingSave: result.saveId, pendingSaveKind: "analysis" }));
      throw Object.assign(new Error(result.error?.message || "分析保存尚未确认，请补登记后继续。"), { code: "ANALYSIS_SAVE_PENDING" });
    }
    return result;
  };
  const run = async taskId => {
    if (controller.current) throw new Error("已有素材分析正在执行。");
    const initial = await context();
    const abort = new AbortController(); controller.current = abort;
    setState(old => ({ ...old, running: true, error: "", phase: "准备素材分析" }));
    let timer, heartbeatPending = false;
    try {
      let task = await request(`analysis-tasks/${encodeURIComponent(taskId)}`);
      for (const selected of task.steps) {
        if (selected.status !== "queued") continue;
        abort.signal.throwIfAborted();
        while (latest.current.isEditorBusy?.()) {
          setState(old => ({ ...old, phase: "等待当前编辑或播放完成" }));
          await new Promise(resolve => setTimeout(resolve, 500)); abort.signal.throwIfAborted();
        }
        if ((await context()).projectId !== initial.projectId) throw new Error("当前项目已切换，分析已停止。");
        task = await request(`analysis-tasks/${encodeURIComponent(taskId)}`);
        await saveOperation(taskId, { action: "claim", stepId: selected.stepId, expectedRevision: task.revision });
        task = await request(`analysis-tasks/${encodeURIComponent(taskId)}`);
        const step = task.steps.find(step => step.stepId === selected.stepId);
        active.current = { taskId, stepId: step.stepId };
        timer = setInterval(async () => {
          if (heartbeatPending || abort.signal.aborted) return;
          heartbeatPending = true;
          try {
            await request("analysis-heartbeats", { stepId: step.stepId, attemptId: step.attemptId });
            const current = await request(`analysis-tasks/${encodeURIComponent(taskId)}`);
            if (current.steps.find(item => item.stepId === step.stepId)?.status === "cancel_requested") abort.abort();
          } catch { abort.abort(); }
          finally { heartbeatPending = false; }
        }, 10_000);
        const onProgress = progress => setState(old => ({ ...old, phase: progress.phase || "分析中" }));
        const checkpoint = async (range, output) => {
          abort.signal.throwIfAborted();
          await saveOperation(taskId, { action: "checkpoint", stepId: step.stepId, attemptId: step.attemptId, range, output });
        };
        try {
          const asset = await request(`assets/${encodeURIComponent(step.basis.assetRef.entityId)}`);
          const src = projectMediaUrl(initial.projectId, step.basis.mediaRef);
          if (step.basis.capability === "scene") {
            await saveOperation(taskId, { action: "run-scene", stepId: step.stepId, attemptId: step.attemptId });
            await refresh();
            continue;
          }
          const output = step.basis.capability === "speech"
            ? await analyzeSourceSpeech(src, step, { signal: abort.signal, onProgress, checkpoint, localModelRoot: "/local-components/whisper/" })
            : await analyzeSourceVisual(src, asset, step, { signal: abort.signal, onProgress, checkpoint });
          abort.signal.throwIfAborted();
          await saveOperation(taskId, { action: "finish", stepId: step.stepId, attemptId: step.attemptId, output });
        } catch (error) {
          if (pending.current || error.code === "ANALYSIS_SAVE_PENDING") throw error;
          if (abort.signal.aborted) {
            await saveOperation(taskId, { action: "cancelled", stepId: step.stepId, attemptId: step.attemptId });
            throw error;
          }
          await saveOperation(taskId, { action: "fail", stepId: step.stepId, attemptId: step.attemptId,
            code: error.code || "ANALYSIS_FAILED", message: String(error.message || error).slice(0, 1024) });
        } finally {
          clearInterval(timer);
          if (active.current?.taskId === taskId && active.current.stepId === step.stepId) active.current = null;
        }
        await refresh();
      }
      setState(old => ({ ...old, phase: "本轮分析已结束，请查看各素材结果" }));
    } catch (error) {
      setState(old => ({ ...old, error: abort.signal.aborted && !pending.current ? "分析已停止；已保存的区间仍可继续使用。" : error.message }));
    } finally {
      clearInterval(timer); active.current = null; controller.current = null;
      setState(old => ({ ...old, running: false }));
      await refresh().catch(() => {});
    }
  };
  useEffect(() => () => { controller.current?.abort(); }, []);
  return {
    ...state,
    get unresolved() { return Boolean(pending.current); },
    refresh,
    list: async (assetId, cursor) => request(`analyses?assetId=${encodeURIComponent(assetId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    semanticList: async (assetId, cursor) => request(`semantic-analyses?assetId=${encodeURIComponent(assetId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    visualStatus: () => request("visual-search"),
    visualQuery: input => request("visual-search/queries", input, undefined, { signal: AbortSignal.timeout(300_000) }),
    async buildVisualIndex(event) {
      trusted(event);
      if (!window.confirm(materialText(language, "confirmIndex"))) return null;
      return request("visual-search/indexes", {}, crypto.randomUUID(), { signal: AbortSignal.timeout(30 * 60_000) });
    },
    async cancelVisualIndex(event) {
      trusted(event);
      return request("visual-search/cancel", {}, crypto.randomUUID(), { signal: AbortSignal.timeout(300_000) });
    },
    async source(asset) { const current = await context(); return projectMediaUrl(current.projectId, asset.mediaRef); },
    async start(event, selection) {
      trusted(event);
      if (controller.current || pending.current || state.pendingSave) throw new Error("请先完成或补登记当前分析。");
      if (!window.confirm(materialText(language, "confirmAnalyze"))) return;
      const approval = await request("analysis-confirmations", selection);
      const result = await request("analysis-runs", { ...selection, confirmationId: approval.confirmationId }, crypto.randomUUID());
      if (result.saveStatus !== "succeeded") { setState(old => ({ ...old, pendingSave: result.saveId, pendingSaveKind: "analysis" })); throw new Error("分析任务保存未完成。"); }
      await refresh(); void run(result.taskId).catch(error => setState(old => ({ ...old, error: error.message })));
    },
    async continueTask(event, taskId, stepId) {
      trusted(event); if (controller.current || pending.current || state.pendingSave) throw new Error("请先完成当前分析或补登记。");
      const task = await request(`analysis-tasks/${encodeURIComponent(taskId)}`);
      if (stepId) await saveOperation(taskId, { action: "retry", stepId, expectedRevision: task.revision });
      void run(taskId).catch(error => setState(old => ({ ...old, error: error.message })));
    },
    async cancel(event) {
      trusted(event); const current = active.current; controller.current?.abort();
      if (current) await request(`analysis-tasks/${encodeURIComponent(current.taskId)}/actions`,
        { operation: { action: "cancel", stepId: current.stepId } }, crypto.randomUUID(), { signal: AbortSignal.timeout(300_000) }).catch(() => {});
    },
    async correct(event, analysisId, expectedRevision, correction) {
      trusted(event);
      const result = await request(`analyses/${encodeURIComponent(analysisId)}/revisions`, { expectedRevision, correction }, crypto.randomUUID(),
        { signal: AbortSignal.timeout(300_000) });
      if (result.saveStatus !== "succeeded") { setState(old => ({ ...old, pendingSave: result.saveId, pendingSaveKind: "analysis" })); throw new Error("修订保存未完成，原结果仍保留。"); }
    },
    async correctSemantic(event, analysisId, expectedRevision, content) {
      trusted(event);
      const result = await request(`semantic-analyses/${encodeURIComponent(analysisId)}/revisions`, { expectedRevision, content }, crypto.randomUUID(),
        { signal: AbortSignal.timeout(300_000) });
      if (result.saveStatus !== "succeeded") { setState(old => ({ ...old, pendingSave: result.saveId, pendingSaveKind: "semantic" })); throw new Error("语义修订保存未完成，原结果仍保留。"); }
    },
    async retrySave(event) {
      trusted(event);
      const current = await context();
      let result;
      if (pending.current) {
        const operation = pending.current;
        if (operation.projectId !== current.projectId) throw new Error("请先打开待保存分析所属的项目。");
        result = await request(operation.path, operation.body, operation.key, { signal: AbortSignal.timeout(300_000) });
        pending.current = null;
      } else if (state.pendingSave) result = await request(`${state.pendingSaveKind === "semantic" ? "semantic" : "analysis"}-saves/${encodeURIComponent(state.pendingSave)}/retries`, {}, crypto.randomUUID(), { signal: AbortSignal.timeout(300_000) });
      if (result?.saveStatus !== "succeeded") {
        setState(old => ({ ...old, pendingSave: result?.saveId || old.pendingSave }));
        throw new Error(result?.error?.message || "保存尚未确认。");
      }
      setState(old => ({ ...old, pendingSave: null, pendingSaveKind: null, error: "", phase: "补登记完成，可继续剩余分析" })); await refresh();
    },
    async component(componentId = "whisper-small-q8") { return hostSession.request(`/api/v1/components/${componentId}`); },
    async prepareComponent(event, componentId = "whisper-small-q8") {
      trusted(event);
      const component = await hostSession.request(`/api/v1/components/${componentId}`);
      if (!window.confirm(materialText(language, "confirmDownload") + ` (${Math.ceil(component.totalBytes / 1024 / 1024)} MiB)`)) return;
      const approval = await hostSession.request(`/api/v1/components/${componentId}/confirmations`, { revision: component.revision });
      await hostSession.request(`/api/v1/components/${componentId}/prepare-runs`, { revision: component.revision, confirmationId: approval.confirmationId }, crypto.randomUUID());
    },
  };
}
