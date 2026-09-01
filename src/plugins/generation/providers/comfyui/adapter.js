import { inspectImageBlob, inspectVideoBlob } from "../../host.js";
import { fetchLocalJson, normalizeLoopbackEndpoint, sleep } from "../shared/loopback.js";

const JOB_TIMEOUT_MS = 15 * 60_000;

function applyWorkflowVariables(value, variables) {
  if (Array.isArray(value)) return value.map((item) => applyWorkflowVariables(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, applyWorkflowVariables(item, variables)]));
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{(prompt|negative_prompt|seed)\}\}$/);
  if (exact) return variables[exact[1]];
  return value.replace(/\{\{(prompt|negative_prompt|seed)\}\}/g, (_, key) => String(variables[key]));
}

function parseWorkflow(template, variables) {
  let parsed;
  try { parsed = JSON.parse(template); } catch { throw new Error("工作流 JSON 无法解析。请从 ComfyUI 导出 API Format 工作流后再粘贴。"); }
  const workflow = parsed?.prompt && typeof parsed.prompt === "object" ? parsed.prompt : parsed;
  if (!workflow || Array.isArray(workflow) || typeof workflow !== "object") throw new Error("工作流必须是 ComfyUI API Format 的对象。");
  return applyWorkflowVariables(workflow, variables);
}

function collectOutputs(historyItem) {
  const descriptors = [];
  Object.values(historyItem?.outputs || {}).forEach((node) => {
    ["images", "gifs", "videos"].forEach((key) => {
      (node?.[key] || []).forEach((file) => {
        if (file?.filename) descriptors.push({ ...file, outputType: key === "images" ? "image" : "video" });
      });
    });
  });
  return descriptors;
}

export function createComfyUIAdapter() {
  return {
    async connect({ config }) {
      const endpoint = normalizeLoopbackEndpoint(config.endpoint, 8188);
      await fetchLocalJson(`${endpoint}/system_stats`);
      return { state: "connected", endpoint };
    },

    async cancel({ connection }) {
      if (connection?.endpoint) await fetch(`${connection.endpoint}/interrupt`, { method: "POST" }).catch(() => {});
    },

    async generate({ request, connection, signal, onState }) {
      const endpoint = connection.endpoint;
      const prompt = String(request.prompt || "").trim();
      const resolvedSeed = Number(request.seed) === -1 ? Math.floor(Math.random() * 2_147_483_647) : Number(request.seed);
      const workflow = parseWorkflow(request.workflowTemplate, {
        prompt,
        negative_prompt: String(request.negativePrompt || "").trim(),
        seed: Number.isFinite(resolvedSeed) ? resolvedSeed : 0,
      });
      onState?.("queued");
      const queued = await fetchLocalJson(`${endpoint}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
        signal,
      });
      if (!queued?.prompt_id) throw new Error("ComfyUI 没有返回 prompt_id。");
      const startedAt = Date.now();
      let historyItem;
      onState?.("running");
      while (!historyItem) {
        if (Date.now() - startedAt > JOB_TIMEOUT_MS) throw new Error("ComfyUI 任务等待超过 15 分钟。");
        await sleep(900, signal);
        const history = await fetchLocalJson(`${endpoint}/history/${encodeURIComponent(queued.prompt_id)}`, { signal });
        historyItem = history?.[queued.prompt_id];
        const status = historyItem?.status;
        if (status?.status_str === "error" || status?.completed === false && status?.messages?.some?.((item) => item?.[0] === "execution_error")) {
          throw new Error("ComfyUI 工作流执行失败，请在 ComfyUI 控制台查看出错节点。");
        }
      }
      const files = collectOutputs(historyItem);
      if (!files.length) throw new Error("工作流已完成，但没有找到可导入的图片或视频输出。");
      const outputs = [];
      for (const file of files) {
        const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output" });
        const response = await fetch(`${endpoint}/view?${query}`, { signal });
        if (!response.ok) throw new Error(`无法读取 ComfyUI 输出：HTTP ${response.status}`);
        const blob = await response.blob();
        const isVideo = file.outputType === "video" || ["mp4", "webm", "mov", "mkv"].includes(file.filename.split(".").pop()?.toLowerCase());
        const info = isVideo ? await inspectVideoBlob(blob) : await inspectImageBlob(blob);
        outputs.push({
          type: isVideo ? "video" : "image",
          blob,
          mimeType: blob.type,
          fileName: file.filename,
          ...info,
          prompt,
          providerLabel: "ComfyUI",
          provenance: { provider: "ComfyUI", seed: resolvedSeed, generatedAt: new Date().toISOString() },
        });
      }
      return { jobId: queued.prompt_id, outputs };
    },
  };
}
