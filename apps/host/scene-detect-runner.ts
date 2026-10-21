// Adapted from Jason-zzr/Auto-cut (MIT), commits b5d7e81 and b7c27d6; component integration at 3090593.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { normalizedBytes, sha256 } from "./storage/records.ts";
import { HostError } from "./sessions.ts";
import { inspectSceneComponent, verifySceneComponentRuntime } from "./scene-component.ts";
import { SCENE_DETECT_TOOL_ID, SCENE_DETECT_TOOL_REVISION } from "../../src/config/sceneDetect.js";

export const sceneDetectToolId = SCENE_DETECT_TOOL_ID;
export const sceneDetectToolRevision = SCENE_DETECT_TOOL_REVISION;

const protocol = "autocut-tool-jsonl";
const adapterSource = String.raw`import json
import sys
import time
from pathlib import Path

try:
    from scenedetect import SceneManager, open_video
    from scenedetect.detectors import ContentDetector
    import_error = None
except Exception as exc:
    SceneManager = None
    import_error = str(exc)

def emit(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()

emit({"protocol": "autocut-tool-jsonl", "protocolVersion": 1, "type": "ready", "sequence": 0, "tool": "autocut.scene_detect"})
started = False
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        message = json.loads(line)
    except Exception:
        emit({"protocol": "autocut-tool-jsonl", "protocolVersion": 1, "type": "error", "sequence": 1, "code": "TOOL_PROTOCOL_BROKEN", "message": "Invalid JSONL input."})
        break
    if message.get("type") == "cancel":
        break
    if message.get("type") != "start" or started:
        emit({"protocol": "autocut-tool-jsonl", "protocolVersion": 1, "type": "error", "attemptId": message.get("attemptId"), "sequence": 1, "code": "TOOL_PROTOCOL_BROKEN", "message": "Exactly one start message is required."})
        break
    started = True
    attempt_id = message.get("attemptId")
    try:
        inputs = message.get("input") or {}
        if inputs.get("method") != "content" or float(inputs.get("threshold")) != 27.0 or float(inputs.get("min_scene_length_seconds")) != 1.0:
            raise RuntimeError("SceneDetect parameters are not the fixed content configuration.")
        if SceneManager is None or import_error:
            raise RuntimeError("PySceneDetect is unavailable in the configured Timeline Studio component.")
        input_path = Path(inputs["input_path"])
        output_path = Path(inputs["output_path"])
        if not input_path.is_file():
            raise RuntimeError("SceneDetect input is unavailable.")
        emit({"protocol": "autocut-tool-jsonl", "protocolVersion": 1, "type": "progress", "attemptId": attempt_id, "sequence": 1, "phase": "scene-detect", "progress": 0})
        started_at = time.time()
        video = open_video(str(input_path))
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector(threshold=27.0, min_scene_len=max(1, round(video.frame_rate))))
        # Bound decoding to the declared video duration; OpenCV may report NaN position after EOF.
        scene_manager.detect_scenes(video=video, end_time=video.duration)
        scenes = []
        for index, (scene_start, scene_end) in enumerate(scene_manager.get_scene_list(start_in_scene=True)):
            start_seconds = scene_start.get_seconds()
            end_seconds = scene_end.get_seconds()
            scenes.append({"index": index, "start_seconds": start_seconds, "end_seconds": end_seconds, "duration_seconds": end_seconds - start_seconds})
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps({"scenes": scenes}, ensure_ascii=False, indent=2), encoding="utf-8")
        data = {"scene_count": len(scenes), "scenes": scenes, "method": "pyscenedetect", "output": str(output_path)}
        emit({"protocol": "autocut-tool-jsonl", "protocolVersion": 1, "type": "result", "attemptId": attempt_id, "sequence": 2, "data": data, "artifacts": [str(output_path)], "provider": "pyscenedetect", "toolRevision": "0.2.0", "durationSeconds": round(time.time() - started_at, 2)})
    except Exception as exc:
        emit({"protocol": "autocut-tool-jsonl", "protocolVersion": 1, "type": "error", "attemptId": attempt_id, "sequence": 2, "code": "TOOL_EXECUTION_FAILED", "message": str(exc)[:1024]})
    break
`;

type SceneDetectRun = {
  taskId: string;
  stepId: string;
  attemptId: string;
  inputPath: string;
  outputDir: string;
  outputPath: string;
  deadline: number;
  signal: AbortSignal;
  readOutput: () => Promise<Buffer>;
  onProgress?: (progress: { phase: string; progress?: number }) => void;
};

function within(root: string, target: string) {
  const relativePath = relative(resolve(root), resolve(target));
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes("\0"));
}

export function createSceneDetectRunner(componentRoot = process.env.TIMELINE_STUDIO_SCENE_COMPONENT) {
  let verified: Promise<{ root: string; pythonExecutable: string; componentDigest: string }> | undefined;
  const verify = async () => {
    if (!componentRoot) throw new Error("A verified offline SceneDetect component is required.");
    const component = await inspectSceneComponent(componentRoot);
    await verifySceneComponentRuntime(component.pythonExecutable, component.manifest);
    return { root: component.root, pythonExecutable: component.pythonExecutable, componentDigest: sha256(normalizedBytes(component.manifest)) };
  };
  const requireFiles = async () => {
    try {
      verified ??= verify();
      return await verified;
    } catch {
      verified = undefined;
      throw new HostError("COMPONENT_NOT_READY", 503, "The configured Timeline Studio SceneDetect component is unavailable or failed verification.");
    }
  };
  return {
    async status() {
      try {
        await requireFiles();
        return { state: "verified" as const, toolId: sceneDetectToolId, revision: sceneDetectToolRevision };
      } catch {
        return { state: "missing" as const, toolId: sceneDetectToolId, revision: sceneDetectToolRevision };
      }
    },
    requireFiles,
    async run(request: SceneDetectRun) {
      const runtime = await requireFiles();
      if (!within(request.outputDir, request.outputPath) || !isAbsolute(request.inputPath)) {
        throw new HostError("PATH_OUTSIDE_PROJECT", 400, "SceneDetect input or output path is outside its assigned boundary.");
      }
      if (request.signal.aborted) throw new HostError("TASK_CANCELLED", 409, "SceneDetect was cancelled.");
      const child = spawn(runtime.pythonExecutable, ["-I", "-u", "-c", adapterSource], {
        cwd: runtime.root,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: { PATH: dirname(runtime.pythonExecutable), PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", LC_ALL: "C", LANG: "C" },
      });
      let diagnostics = "";
      child.stderr.on("data", chunk => { if (diagnostics.length < 2048) diagnostics += chunk.toString("utf8"); });
      const lines = createInterface({ input: child.stdout });
      let sequence = 0;
      let terminal = false;
      let ready = false;
      let settled = false;
      let resolveResult: (value: { scenes: unknown[] }) => void = () => {};
      let rejectResult: (error: Error) => void = () => {};
      let closed = false;
      let resolveClosed: () => void = () => {};
      const closedPromise = new Promise<void>(resolveClosed_ => { resolveClosed = resolveClosed_; });
      const result = new Promise<{ scenes: unknown[] }>((resolveResult_, rejectResult_) => {
        resolveResult = resolveResult_; rejectResult = rejectResult_;
      });
      const fail = (error: Error) => {
        if (settled) return;
        settled = true; rejectResult(error);
      };
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        if (closed || killTimer) return;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, 2000);
        killTimer.unref();
      };
      const abort = () => { fail(new HostError("TASK_CANCELLED", 409, "SceneDetect was cancelled.")); stop(); };
      request.signal.addEventListener("abort", abort, { once: true });
      child.stdin.on("error", () => fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "SceneDetect input closed.")));
      if (request.signal.aborted) abort();
      const timeout = setTimeout(() => fail(new HostError("TOOL_TIMEOUT", 504, "SceneDetect exceeded its execution deadline.")),
        Math.max(0, request.deadline - Date.now()));
      lines.on("line", line => {
        if (settled) return;
        let message: any;
        try { message = JSON.parse(line); }
        catch { return fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "SceneDetect emitted invalid JSONL.")); }
        if (message.protocol !== protocol || message.protocolVersion !== 1 || typeof message.sequence !== "number" || (!ready ? message.sequence !== 0 : message.sequence <= sequence)) {
          return fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "SceneDetect violated the tool process protocol."));
        }
        sequence = message.sequence;
        if (message.type === "ready") {
          if (ready || message.tool !== sceneDetectToolId) return fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "SceneDetect emitted duplicate ready messages."));
          ready = true;
          child.stdin.write(JSON.stringify({ protocol, protocolVersion: 1, type: "start", messageId: randomUUID(),
            taskId: request.taskId, stepId: request.stepId, attemptId: request.attemptId,
            toolRef: { name: sceneDetectToolId, revision: sceneDetectToolRevision },
            input: { input_path: request.inputPath, method: "content", threshold: 27.0, min_scene_length_seconds: 1.0, output_path: request.outputPath },
            inputFiles: [request.inputPath], outputDir: request.outputDir, authorizationRef: null,
            deadline: new Date(request.deadline).toISOString(), capabilitySnapshotRevision: sceneDetectToolRevision }) + "\n");
        } else if (!ready || message.attemptId !== request.attemptId) {
          fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "SceneDetect returned a mismatched attempt ID."));
        } else if (message.type === "progress") {
          request.onProgress?.({ phase: String(message.phase || "SceneDetect"), progress: typeof message.progress === "number" ? message.progress : undefined });
        } else if (message.type === "result") {
          if (terminal || message.data?.method !== "pyscenedetect" || message.data?.output !== request.outputPath || !Array.isArray(message.data?.scenes)) {
            return fail(new HostError("OUTPUT_VALIDATION_FAILED", 422, "SceneDetect returned an invalid result artifact."));
          }
          terminal = true;
          request.readOutput().then(bytes => {
            const saved = JSON.parse(bytes.toString("utf8"));
            if (!Array.isArray(saved?.scenes) || JSON.stringify(saved.scenes) !== JSON.stringify(message.data.scenes)) {
              throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "The SceneDetect output artifact differs from its result envelope.");
            }
            if (!settled) { settled = true; resolveResult({ scenes: saved.scenes }); }
          }).catch(fail);
        } else if (message.type === "error") {
          terminal = true;
          fail(new HostError(String(message.code || "TOOL_EXECUTION_FAILED"), 422, String(message.message || "SceneDetect failed.").slice(0, 1024)));
        } else {
          fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, "SceneDetect emitted an unknown protocol message."));
        }
      });
      child.once("error", error => fail(new HostError("COMPONENT_NOT_READY", 503, `SceneDetect process could not start: ${error.message}`)));
      child.once("close", code => {
        closed = true; clearTimeout(killTimer); resolveClosed();
        if (!settled && !terminal) fail(new HostError("TOOL_PROTOCOL_BROKEN", 502, diagnostics ? `SceneDetect stopped: ${diagnostics.slice(-512)}` : `SceneDetect stopped with code ${code ?? "unknown"}.`));
      });
      try { return await result; }
      finally {
        clearTimeout(timeout); request.signal.removeEventListener("abort", abort); lines.close(); stop();
        if (!closed) await closedPromise;
      }
    },
  };
}

export type SceneDetectRunner = ReturnType<typeof createSceneDetectRunner>;
