import { useEffect, useRef, useState } from "react";
import { scriptEditOperations } from "../lib/scriptEditPlan.js";
import { loadProjectMediaBlob } from "../lib/projectSnapshot.js";
import { loadImage, loadVideo, decodeWaveform } from "../lib/media.js";

const sleep = () => new Promise(resolve => setTimeout(resolve, 500));
const trusted = event => { if (!event?.isTrusted) throw new Error("请直接点击当前计划的确认按钮。"); };
async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function useExecutionPlan(getEditor, getSession) {
  const [record, setRecord] = useState(null), [items, setItems] = useState([]), [scripts, setScripts] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [phase, setPhase] = useState("");
  const current = useRef(null), active = useRef(false), pending = useRef(null), cancelled = useRef(false);
  const mounted = useRef(true), preview = useRef(null);
  const pendingOutput = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelled.current = true; }; }, []);
  const api = () => {
    const service = getEditor().completeProject?.execution;
    if (!service) throw new Error("请先打开完整项目。");
    return service;
  };
  const show = value => { current.current = value; if (mounted.current) {
    setRecord(value);
    if (value) setItems(items => [...items.filter(item => item.planId !== value.planId), value]);
  } return value; };
  const invoke = async (name, input) => {
    const result = await getSession().run(name, input);
    if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result;
  };
  const projectDigest = () => digest(getSession().executionBasis());
  const assertBasis = async plan => {
    const context = await api().context();
    if (context.projectId !== plan.projectId || await projectDigest() !== plan.content.editorDigest) throw new Error("时间线或项目已变化，请重新准备并审阅计划。");
    if (await digest(getSession().executionModels(plan.content.steps)) !== await digest(plan.content.modelBasis)) throw new Error("处理模型或组件身份已变化，请重新准备并授权计划。");
  };
  const write = async (action, body, plan = current.current) => {
    const context = await api().context();
    const path = action === "create" ? "plans" : `plans/${encodeURIComponent(plan.planId)}/${action}`;
    if (!pending.current) pending.current = { projectId: context.projectId, path, body: { expectedRevision: plan?.revision ?? 0, ...body }, key: crypto.randomUUID() };
    const operation = pending.current;
    if (operation.projectId !== context.projectId) throw new Error("上一项目的计划保存尚未完成，请返回该项目重试。");
    const saved = await api().request(operation.path, operation.body, operation.key);
    if (saved.saveStatus !== "succeeded") {
      if (saved.saveStatus === "failed") { pending.current = null; throw new Error("计划保存失败，原保存点保留。请重试当前操作。"); }
      throw new Error("计划保存结果尚未确定，请重试保存，不要重新执行处理。");
    }
    pending.current = null;
    return show(saved.record);
  };
  const perform = async (action, resume = false) => {
    if (active.current) throw new Error("正在执行当前计划操作。");
    active.current = true; setBusy(true); setError("");
    try {
      if (pending.current && !resume) throw new Error("请先重试计划记录保存，再执行其他操作。");
      return await action();
    }
    catch (error) { if (mounted.current) setError(error.message); throw error; }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  };
  const refresh = () => perform(async () => {
    const [plans, savedScripts] = await Promise.all([api().request("plans"), api().request("scripts")]);
    setItems(plans.items); setScripts(savedScripts.items.filter(script => script.confirmed && script.sourcesCurrent));
    if (current.current) show(plans.items.find(plan => plan.planId === current.current.planId) ?? null);
  });
  const prepare = async input => {
    if (pending.current) throw new Error("请先完成上一计划记录的保存。");
    const context = await api().context();
    const state = await invoke("timeline_project_inspect", {});
    if (input.stateToken !== state.stateToken) throw new Error("编辑状态已变化，请重新读取时间线。");
    const content = { intent: input.intent, stateToken: input.stateToken, editorDigest: await projectDigest(),
      scriptRef: input.scriptRef ?? null, inputRefs: input.inputRefs ?? [], sourceMappings: input.sourceMappings ?? [],
      steps: structuredClone(input.steps), modelBasis: getSession().executionModels(input.steps), allowModelDownload: input.allowModelDownload === true };
    // Validation calls existing pure command compilation and AI prepare; neither
    // method dispatches inference or applies an edit.
    getSession().validateExecution(content);
    const assetIds = new Set(content.steps.flatMap(step => [...step.operations.map(operation => operation.assetId), step.request?.assetId]).filter(Boolean));
    for (const assetId of assetIds) {
      const asset = getEditor().assets.find(asset => (asset.assetId || asset.id) === assetId);
      if (!asset) throw new Error("计划素材不存在。");
      const mediaRef = await api().registerMedia(asset);
      const metadata = await api().request(`assets/${encodeURIComponent(mediaRef.entityId)}`);
      getEditor().bindExecutionAsset(asset.id, mediaRef, context.projectId);
      for (const step of content.steps) {
        for (const operation of step.operations) if (operation.assetId === assetId) operation.assetId = mediaRef.entityId;
        if (step.request?.assetId === assetId) step.request.assetId = mediaRef.entityId;
      }
      content.inputRefs.push(mediaRef, { kind: "asset", entityId: metadata.assetId, revision: metadata.revision });
    }
    getSession().validateExecution(content);
    if (await projectDigest() !== content.editorDigest) throw new Error("准备计划期间编辑状态发生变化，请重新准备。");
    const created = await write("create", { planId: input.planId ?? crypto.randomUUID(), content }, null);
    if (created.projectId !== context.projectId) throw new Error("计划项目不一致。");
    setPhase("等待处理授权"); preview.current = null;
    return created;
  };
  const ensureAssets = async assetIds => {
    const context = await api().context();
    const loaded = [];
    for (const assetId of assetIds) {
      if (getEditor().assets.some(asset => (asset.assetId || asset.id) === assetId) || loaded.some(asset => asset.assetId === assetId)) continue;
      const asset = await api().request(`assets/${encodeURIComponent(assetId)}`);
      const blob = await loadProjectMediaBlob({ projectMedia: { projectId: context.projectId, bindings: { blob: asset.mediaRef } } });
      const src = URL.createObjectURL(blob);
      try {
        const metadata = asset.kind === "audio" ? await decodeWaveform(blob) : asset.kind === "video" ? await loadVideo(src) : await loadImage(src);
        loaded.push({ id: assetId, assetId, type: asset.kind, name: asset.name, blob,
          duration: asset.kind === "image" ? 4 : metadata.duration, width: metadata.videoWidth || metadata.naturalWidth || 0,
          height: metadata.videoHeight || metadata.naturalHeight || 0, peaks: metadata.peaks,
          projectMedia: { projectId: context.projectId, bindings: { blob: asset.mediaRef } } });
        if (asset.kind === "video") { metadata.removeAttribute("src"); metadata.load(); }
      } finally { URL.revokeObjectURL(src); }
    }
    if ((await api().context()).projectId !== context.projectId) throw new Error("当前项目已切换。");
    if (loaded.length) getEditor().addExecutionAssets(loaded);
  };
  const fromScript = script => perform(async () => {
    await ensureAssets(new Set(script.draft.sources.map(source => source.assetRef.entityId)));
    const editor = getEditor(), state = await invoke("timeline_project_inspect", {});
    const mapped = scriptEditOperations(script, editor.assets, editor.visualSegments.length,
      editor.visualSegments.reduce((total, clip) => total + Number(clip.duration), 0));
    return prepare({ intent: `追加脚本：${script.draft.content.title}`, stateToken: state.stateToken,
      scriptRef: { kind: "script", entityId: script.scriptId, revision: script.revision },
      inputRefs: script.draft.sources.flatMap(source => [source.assetRef, source.mediaRef, ...(source.analysisRef ? [source.analysisRef] : [])]),
      sourceMappings: mapped.mappings, steps: [{ stepId: "script-edit", kind: "edit", dependsOn: [], operations: mapped.operations, request: null }], allowModelDownload: false });
  });
  const registerResult = async job => {
    const resultRefs = [], operations = [...(job.result.operations ?? [])];
    const context = await api().context();
    for (const placement of job.result.placements ?? []) {
      const asset = getEditor().assets.find(asset => asset.id === placement.assetId);
      if (!asset) throw new Error("完整产物不在当前页面，请恢复已保存素材，不能重跑此步骤。");
      const mediaRef = await api().registerMedia(asset);
      resultRefs.push(mediaRef);
      getEditor().bindExecutionAsset(asset.id, mediaRef, context.projectId);
      const clipId = crypto.randomUUID();
      operations.push({ type: "asset.insert", assetId: mediaRef.entityId, clipId, track: "audio", start: placement.start, duration: placement.duration });
      operations.push({ type: "caption.add", clipId: crypto.randomUUID(), text: placement.text, start: placement.start, end: placement.start + placement.duration, audioClipId: clipId });
    }
    return { status: "succeeded", operations, resultRefs, error: null };
  };
  const run = async () => {
    cancelled.current = false;
    let plan = current.current;
    await assertBasis(plan);
    const attempted = new Set();
    while (!cancelled.current && mounted.current) {
      const latest = id => plan.attempts.findLast(attempt => attempt.stepId === id);
      const step = plan.content.steps.find(step => !attempted.has(step.stepId) && latest(step.stepId)?.status !== "succeeded" &&
        !["remote_status_unknown", "registration_pending"].includes(latest(step.stepId)?.status) && step.dependsOn.every(id => latest(id)?.status === "succeeded"));
      if (!step) break;
      attempted.add(step.stepId);
      if (getEditor().isBusy?.() || getSession().isAiRunning()) { setPhase("等待编辑器空闲"); await sleep(); attempted.delete(step.stepId); continue; }
      await assertBasis(plan);
      plan = await write("claims", { stepId: step.stepId }, plan);
      if (plan.attempts.at(-1)?.status !== "running") throw new Error("该次执行已中断，请刷新计划后重试未完成步骤。");
      const attemptId = plan.attempts.at(-1).attemptId;
      setPhase(`处理中：${step.stepId}`);
      let jobId, heartbeatAt = Date.now(), outcome;
      try {
        if (step.kind === "edit") {
          getSession().validateExecution(plan.content);
          outcome = { status: "succeeded", operations: step.operations, resultRefs: [], error: null };
        } else {
          if (!plan.content.allowModelDownload) throw new Error("本计划未授权现有模型组件按需下载，请修订处理范围后重新授权。");
          const state = await invoke("timeline_project_inspect", {});
          const prepared = await invoke("timeline_ai_prepare", { stateToken: state.stateToken, request: step.request });
          const started = await invoke("timeline_ai_start", { aiId: prepared.aiId, requestId: attemptId, allowModelDownload: true });
          jobId = started.jobId;
          let job = started;
          while (!["succeeded", "failed", "cancelled"].includes(job.status)) {
            if (cancelled.current && !job.cancelRequested) {
              plan = await write("cancel-requests", { attemptId }, plan);
              await invoke("timeline_ai_cancel", { jobId });
            }
            if (Date.now() - heartbeatAt > 10_000) {
              await api().request(`plans/${encodeURIComponent(plan.planId)}/heartbeats`, { expectedRevision: plan.revision, attemptId }, crypto.randomUUID());
              heartbeatAt = Date.now();
            }
            await sleep(); job = await invoke("timeline_ai_inspect", { jobId });
          }
          if (job.status !== "succeeded") outcome = { status: job.status, operations: [], resultRefs: [], error: job.error?.code ?? null };
          else {
            pendingOutput.current = { planId: plan.planId, attemptId, job };
            outcome = await registerResult(job);
          }
        }
      } catch (error) {
        // A completed local job must not be dispatched again just because its
        // output registration failed. Preserve its result in the current page.
        if (jobId) {
          const job = await invoke("timeline_ai_inspect", { jobId });
          if (job.status === "succeeded") {
            pendingOutput.current = { planId: plan.planId, attemptId, job };
            await write("completions", { attemptId, status: "registration_pending", operations: [], resultRefs: [], error: error.message }, plan);
            setPhase("处理已完成，结果登记待恢复"); throw error;
          }
        }
        outcome = { status: "failed", operations: [], resultRefs: [], error: error.message };
      }
      plan = await write("completions", { attemptId, ...outcome }, plan);
      pendingOutput.current = null;
    }
    const completed = plan.content.steps.filter(step => plan.attempts.findLast(attempt => attempt.stepId === step.stepId)?.status === "succeeded").length;
    setPhase(cancelled.current ? "已停止调度" : completed === plan.content.steps.length ? "处理完成，等待结果预览" : `部分完成：${completed}/${plan.content.steps.length}`);
  };
  const authorize = event => perform(async () => {
    trusted(event); await assertBasis(current.current);
    const plan = current.current;
    const confirmation = await api().request(`plans/${encodeURIComponent(plan.planId)}/confirmations`, { expectedRevision: plan.revision, digest: plan.digest });
    await write("authorizations", { confirmationId: confirmation.confirmationId }, plan);
    await run();
  });
  const previewResults = event => perform(async () => {
    trusted(event); const plan = current.current; await assertBasis(plan);
    const { record: latest } = await api().request(`plans/${encodeURIComponent(plan.planId)}/validations`, { expectedRevision: plan.revision }, crypto.randomUUID());
    if (latest.revision !== plan.revision) throw new Error("计划已变化，请刷新。");
    const selected = [], visited = new Set();
    const collect = step => {
      if (visited.has(step.stepId)) return;
      visited.add(step.stepId);
      for (const dependency of step.dependsOn) collect(plan.content.steps.find(item => item.stepId === dependency));
      const attempt = plan.attempts.findLast(attempt => attempt.stepId === step.stepId);
      if (attempt?.status === "succeeded") selected.push(attempt);
    };
    plan.content.steps.forEach(collect);
    const operations = selected.flatMap(attempt => attempt.operations);
    if (!operations.length) throw new Error("尚无可应用的处理结果。");
    await ensureAssets(new Set(operations.map(operation => operation.assetId).filter(Boolean)));
    await assertBasis(plan);
    const state = await invoke("timeline_project_inspect", {});
    const result = await invoke("timeline_edit_preview", { stateToken: state.stateToken, summary: plan.content.intent, operations });
    getSession().requireExecutionConfirmation(result.previewId);
    const stepIds = selected.map(attempt => attempt.stepId), previewDigest = await digest(result);
    const saved = await write("preview-receipts", { proposalId: crypto.randomUUID(), previewId: result.previewId,
      previewDigest, stateToken: state.stateToken, stepIds, at: new Date().toISOString() }, plan);
    preview.current = { previewId: result.previewId, previewDigest, planId: plan.planId, revision: saved.revision, stepIds };
    setPhase("等待确认应用到时间线");
  });
  return { record, items, scripts, busy, error, phase, refresh, fromScript, authorize, previewResults, hasPending: Boolean(pending.current),
    prepare: input => perform(() => prepare(input)),
    inspect: async () => ({ items: (await api().request("plans")).items }),
    select: plan => { if (active.current || pending.current) return; show(plan); setError(""); setPhase(""); preview.current = null; },
    cancel: event => { trusted(event); cancelled.current = true; },
    retry: event => perform(async () => {
      trusted(event);
      if (pending.current) {
        const saved = await write("resume", {});
        if (pendingOutput.current && saved.attempts.some(attempt => attempt.attemptId === pendingOutput.current.attemptId && attempt.status === "succeeded")) pendingOutput.current = null;
        return;
      }
      if (pendingOutput.current) {
        const output = pendingOutput.current;
        if (output.planId !== current.current?.planId) throw new Error("请返回等待登记的原计划。");
        await write("completions", { attemptId: output.attemptId, ...await registerResult(output.job) });
        pendingOutput.current = null;
      }
      await run();
    }, true),
    async beforeApply(event, previewId) {
      if (preview.current?.previewId !== previewId) return;
      trusted(event); await assertBasis(current.current);
      const { record: fresh } = await api().request(`plans/${encodeURIComponent(current.current.planId)}/validations`, { expectedRevision: current.current.revision }, crypto.randomUUID());
      if (fresh.revision !== preview.current.revision) throw new Error("计划已变化，请重新预览。");
      const confirmation = await api().request(`plans/${encodeURIComponent(current.current.planId)}/application-confirmations`,
        { expectedRevision: current.current.revision, digest: preview.current.previewDigest });
      preview.current.confirmationId = confirmation.confirmationId;
      getSession().confirmExecutionPreview(previewId, event);
    },
    async afterApply(previewId, result) {
      if (preview.current?.previewId !== previewId) return;
      setPhase("已应用，完整项目自动保存中");
      await write("application-receipts", { previewId, transactionId: result.transactionId, stateToken: result.stateToken,
        stepIds: preview.current.stepIds, at: new Date().toISOString(), confirmationId: preview.current.confirmationId });
    },
  };
}
