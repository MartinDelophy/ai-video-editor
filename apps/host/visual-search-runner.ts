import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { HostError } from "./sessions.ts";
import { inspectVisualSearchComponent } from "./visual-search-component.ts";
import { visualSearchToolResults, type VisualSearchBasis, type VisualSearchSource } from "./visual-search-records.ts";
import { VISUAL_SEARCH_TOOL_ID, VISUAL_SEARCH_TOOL_REVISION } from "../../src/config/visualSearch.js";

const protocol = "autocut-tool-jsonl";
type Runtime = Awaited<ReturnType<typeof inspectVisualSearchComponent>>;
type CommonRun = { attemptId: string; deadline: number; signal: AbortSignal; onProgress?: (value: { phase: string; progress?: number }) => void };
type IndexRun = CommonRun & { operation: "index"; outputDir: string; basis: VisualSearchBasis; basisDigest: string; items: (VisualSearchSource & { inputPath: string })[] };
type QueryRun = CommonRun & { operation: "query"; indexDir: string; query: string; k: number; diversity: number };

function within(root: string, target: string) {
  const path = relative(resolve(root), resolve(target));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path) && !path.includes("\0"));
}

export function createVisualSearchRunner(componentRoot?: string) {
  let verified: Promise<Runtime> | undefined;
  const requireFiles = async () => {
    if (!componentRoot || !isAbsolute(componentRoot)) throw new HostError("COMPONENT_NOT_READY", 503, "A packaged visual-search component is required.");
    try {
      verified ??= inspectVisualSearchComponent(componentRoot);
      return await verified;
    } catch {
      verified = undefined;
      throw new HostError("COMPONENT_NOT_READY", 503, "The configured visual-search component is unavailable or failed verification.");
    }
  };
  const run = async (request: IndexRun | QueryRun) => {
    const runtime = await requireFiles();
    if (request.operation === "index") {
      if (!isAbsolute(request.outputDir) || request.items.some(item => !isAbsolute(item.inputPath))) {
        throw new HostError("PATH_OUTSIDE_PROJECT", 400, "Visual-search input or output paths are outside their assigned boundaries.");
      }
    } else if (!isAbsolute(request.indexDir)) throw new HostError("PATH_OUTSIDE_PROJECT", 400, "Visual-search cache path must be absolute.");
    if (request.signal.aborted) throw new HostError("TASK_CANCELLED", 409, "Visual search was cancelled.");
    const child = spawn(runtime.pythonExecutable, ["-I", "-u", runtime.entrypoint], {
      cwd: runtime.root,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: dirname(runtime.pythonExecutable), PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1",
        HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", LC_ALL: "C", LANG: "C" },
    });
    let diagnostics = "", sequence = -1, terminal = false, ready = false, settled = false, closed = false;
    child.stderr.on("data", chunk => { if (diagnostics.length < 2048) diagnostics += chunk.toString("utf8"); });
    const lines = createInterface({ input: child.stdout });
    let resolveResult: (value: unknown) => void = () => {}, rejectResult: (error: Error) => void = () => {}, resolveClosed: () => void = () => {};
    const result = new Promise<unknown>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    const closedPromise = new Promise<void>(resolve => { resolveClosed = resolve; });
    const fail = (error: Error) => { if (!settled) { settled = true; rejectResult(error); } };
    const stop = () => { if (!child.killed) child.kill("SIGTERM"); };
    const abort = () => {
      if (ready && !child.stdin.destroyed) child.stdin.write(JSON.stringify({ protocol, protocolVersion: 1, type: "cancel", attemptId: request.attemptId }) + "\n");
      fail(new HostError("TASK_CANCELLED", 409, "Visual search was cancelled."));
      stop();
    };
    request.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => { fail(new HostError("TOOL_TIMEOUT", 504, "Visual search exceeded its execution deadline.")); stop(); },
      Math.max(0, request.deadline - Date.now()));
    lines.on("line", line => {
      if (settled) return;
      let message: any;
      try { message = JSON.parse(line); }
      catch { return fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "Visual search emitted invalid JSONL.")); }
      if (message.protocol !== protocol || message.protocolVersion !== 1 || !Number.isSafeInteger(message.sequence) || message.sequence <= sequence) {
        return fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "Visual search violated the tool process protocol."));
      }
      sequence = message.sequence;
      if (message.type === "ready") {
        if (ready || message.tool !== VISUAL_SEARCH_TOOL_ID) return fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "Visual search emitted an invalid ready message."));
        ready = true;
        const input = request.operation === "index" ? {
          operation: "index", output_dir: request.outputDir, basis: request.basis, basisDigest: request.basisDigest,
          items: request.items.map(item => ({ source_id: item.sourceId, input_path: item.inputPath,
            source_start_seconds: item.range.sourceStartSeconds, source_end_seconds: item.range.sourceEndSeconds })),
        } : { operation: "query", index_dir: request.indexDir, query_text: request.query, k: request.k, diversity: request.diversity };
        child.stdin.write(JSON.stringify({ protocol, protocolVersion: 1, type: "start", messageId: randomUUID(),
          taskId: `visual-search:${request.attemptId}`, stepId: request.operation, attemptId: request.attemptId,
          toolRef: { name: VISUAL_SEARCH_TOOL_ID, revision: VISUAL_SEARCH_TOOL_REVISION }, input,
          inputFiles: request.operation === "index" ? request.items.map(item => item.inputPath) : [request.indexDir],
          outputDir: request.operation === "index" ? request.outputDir : null, authorizationRef: null,
          deadline: new Date(request.deadline).toISOString(), capabilitySnapshotRevision: VISUAL_SEARCH_TOOL_REVISION }) + "\n");
      } else if (!ready || message.attemptId !== request.attemptId) {
        fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "Visual search returned a mismatched attempt ID or emitted before ready."));
      } else if (message.type === "progress") {
        request.onProgress?.({ phase: String(message.phase || "visual-search"), progress: typeof message.progress === "number" ? message.progress : undefined });
      } else if (message.type === "result") {
        if (terminal || message.data?.operation !== request.operation) return fail(new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual search returned an invalid result."));
        terminal = true;
        try {
          const value = request.operation === "index"
            ? (() => { if (message.data.manifest !== "index.json") throw new Error(); return { manifest: "index.json" as const }; })()
            : { results: visualSearchToolResults.parse(message.data.results) };
          settled = true; resolveResult(value);
        } catch { fail(new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual search returned invalid candidates or cache metadata.")); }
      } else if (message.type === "error") {
        terminal = true;
        fail(new HostError(String(message.code || "TOOL_EXECUTION_FAILED"), 422, String(message.message || "Visual search failed.").slice(0, 1024)));
      } else fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "Visual search emitted an unknown protocol message."));
    });
    child.once("error", error => fail(new HostError("COMPONENT_NOT_READY", 503, `Visual-search process could not start: ${error.message}`)));
    child.once("close", code => {
      closed = true; resolveClosed();
      if (!settled && !terminal) fail(new HostError("TOOL_PROTOCOL_BROKEN", 502,
        diagnostics ? `Visual search stopped: ${diagnostics.slice(-512)}` : `Visual search stopped with code ${code ?? "unknown"}.`));
    });
    try { return await result; }
    finally {
      clearTimeout(timeout); request.signal.removeEventListener("abort", abort); lines.close(); stop();
      if (!closed) {
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([closedPromise, new Promise<never>((_, reject) => {
            killTimer = setTimeout(() => {
              if (!closed) child.kill("SIGKILL");
              closeTimer = setTimeout(() => reject(new HostError("TOOL_TIMEOUT", 504,
                "Visual-search process did not close after forced termination.")), 2_000);
            }, 2_000);
          })]);
        } finally {
          clearTimeout(killTimer); clearTimeout(closeTimer);
          if (!closed) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
        }
      }
    }
  };
  return {
    requireFiles,
    async status() {
      try {
        const runtime = await requireFiles();
        const model = runtime.manifest.model;
        return { state: "verified" as const, component: { componentId: runtime.manifest.componentId,
          componentRevision: runtime.manifest.componentRevision, manifestDigest: runtime.manifestDigest,
          toolId: runtime.manifest.toolId, toolRevision: runtime.manifest.toolRevision,
          model: { id: model.id, revision: model.revision, processorRevision: model.processorRevision,
            filesDigest: model.filesDigest, precision: model.precision, embeddingDimension: model.embeddingDimension } } };
      } catch { return { state: "missing" as const, component: null }; }
    },
    index: async (request: Omit<IndexRun, "operation">) => run({ ...request, operation: "index" }) as Promise<{ manifest: "index.json" }>,
    query: async (request: Omit<QueryRun, "operation">) => run({ ...request, operation: "query" }) as Promise<{ results: { sourceId: string; score: number }[] }>,
  };
}

export type VisualSearchRunner = ReturnType<typeof createVisualSearchRunner>;
