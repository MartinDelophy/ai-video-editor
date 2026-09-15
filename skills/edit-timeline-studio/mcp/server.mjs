#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const executeFile = promisify(execFile);
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_RELATIVE_PATH = "scripts/timeline-command.mjs";
const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024 * 1024;

const absolutePath = z.string().min(1).describe("Absolute filesystem path");
const operation = z.record(z.string(), z.unknown());
const resultSchema = z.object({ ok: z.boolean() }).passthrough();

function commandFailure(error) {
  return {
    ok: false,
    code: error?.code || "MCP_COMMAND_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}

function toolResult(result) {
  return {
    structuredContent: result,
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    ...(result.ok ? {} : { isError: true }),
  };
}

function safeHandler(handler) {
  return async (input) => {
    try {
      return toolResult(await handler(input));
    } catch (error) {
      return toolResult(commandFailure(error));
    }
  };
}

function requireAbsolutePath(value, name) {
  if (!isAbsolute(value)) {
    throw Object.assign(new Error(`${name} must be an absolute path`), { code: "INVALID_ARGUMENT" });
  }
  return resolve(value);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isTimelineStudioRoot(path) {
  return (await fileExists(join(path, "package.json"))) && (await fileExists(join(path, CLI_RELATIVE_PATH)));
}

async function resolveTimelineStudioRoot() {
  const configuredRoot = process.env.TIMELINE_STUDIO_ROOT?.trim();
  const candidates = [configuredRoot, process.cwd(), resolve(SERVER_DIR, "../../..")].filter(Boolean);
  for (const candidate of [...new Set(candidates.map((path) => resolve(path)))]) {
    if (await isTimelineStudioRoot(candidate)) return candidate;
  }
  throw Object.assign(
    new Error("Timeline Studio command runner was not found. Start this server from the repository root or set TIMELINE_STUDIO_ROOT."),
    { code: "TIMELINE_STUDIO_ROOT_NOT_FOUND" },
  );
}

function parseCommandOutput(stdout, stderr = "") {
  const text = String(stdout || "").trim();
  if (!text) {
    throw Object.assign(new Error(String(stderr || "Timeline Studio command returned no JSON output").trim()), {
      code: "INVALID_COMMAND_OUTPUT",
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw Object.assign(new Error("Timeline Studio command returned invalid JSON"), {
      code: "INVALID_COMMAND_OUTPUT",
      cause: error,
    });
  }
}

async function runTimelineCommand(command, args) {
  const root = await resolveTimelineStudioRoot();
  const cliPath = join(root, CLI_RELATIVE_PATH);
  try {
    const { stdout, stderr } = await executeFile(process.execPath, [cliPath, command, ...args], {
      cwd: root,
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    });
    return parseCommandOutput(stdout, stderr);
  } catch (error) {
    if (error?.stdout) return parseCommandOutput(error.stdout, error.stderr);
    throw error;
  }
}

async function withTemporaryJson(prefix, payload, callback) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  const path = join(folder, "request.json");
  try {
    await writeFile(path, JSON.stringify(payload), "utf8");
    return await callback(path);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function requireNewOutput(inputPath, outputPath, outputName) {
  if (resolve(inputPath) === resolve(outputPath)) {
    throw Object.assign(new Error(`${outputName} must differ from the input project path`), { code: "OUTPUT_OVERWRITE_BLOCKED" });
  }
  if (await fileExists(outputPath)) {
    throw Object.assign(new Error(`${outputName} already exists: ${outputPath}`), { code: "OUTPUT_EXISTS" });
  }
  await mkdir(dirname(outputPath), { recursive: true });
}

function commandPlan({ project, baseRevision, operations, outputProject, dryRun }) {
  return {
    schemaVersion: 1,
    project,
    baseRevision,
    dryRun,
    operations,
    ...(outputProject ? { output: { project: outputProject } } : {}),
  };
}

export function createTimelineStudioMcpServer() {
  const server = new McpServer(
    { name: "timeline-studio", version: "1.0.0" },
    {
      instructions:
        "Use the edit-timeline-studio Skill for editorial planning. Inspect a .timeline project before editing, then call timeline_project_diff before timeline_project_apply with the same revision and operations. Inspect timeline markers to review beats, chapters, ranges, and notes; edit them with marker.add, marker.update, and marker.delete in the same diff/apply workflow. Annotations do not extend rendered media duration. Writes always create a new archive; never replace the input. Use stable operation IDs. Render only the supported headless subset and keep unsupported effects in the editor workflow.",
    },
  );

  server.registerTool(
    "timeline_project_inspect",
    {
      title: "Inspect Timeline Studio project",
      description: "Read a portable .timeline archive's revision, duration, ratio, tracks, marker summary, warnings, and media inventory before planning edits.",
      inputSchema: { project: absolutePath },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ project }) => runTimelineCommand("project.inspect", [requireAbsolutePath(project, "project")])),
  );

  server.registerTool(
    "timeline_track_inspect",
    {
      title: "Inspect Timeline Studio track",
      description: "Read ordered or timed clip summaries for one track in a portable .timeline archive.",
      inputSchema: {
        project: absolutePath,
        track: z.string().min(1).describe("Timeline Studio track identifier"),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ project, track }) =>
      runTimelineCommand("track.inspect", [requireAbsolutePath(project, "project"), track]),
    ),
  );

  server.registerTool(
    "timeline_clip_inspect",
    {
      title: "Inspect Timeline Studio clip",
      description: "Read source mapping, timing, properties, links, and analysis records for one stable clip ID.",
      inputSchema: {
        project: absolutePath,
        clipId: z.string().min(1).describe("Stable Timeline Studio clip ID"),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ project, clipId }) =>
      runTimelineCommand("clip.inspect", [requireAbsolutePath(project, "project"), clipId]),
    ),
  );

  server.registerTool(
    "timeline_transcript_inspect",
    {
      title: "Inspect Timeline Studio transcript",
      description: "Read timestamped transcript segments, optionally limited to one speech clip.",
      inputSchema: {
        project: absolutePath,
        audioClipId: z.string().min(1).optional().describe("Optional stable speech clip ID"),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ project, audioClipId }) =>
      runTimelineCommand("transcript.inspect", [
        requireAbsolutePath(project, "project"),
        ...(audioClipId ? [audioClipId] : []),
      ]),
    ),
  );

  server.registerTool(
    "timeline_marker_inspect",
    {
      title: "Inspect Timeline Studio markers",
      description: "Read time-ordered point markers, chapters, ranges, and review notes from a portable .timeline archive, optionally limited to one stable marker ID. Returns annotation timing, titles, notes, and colors without changing media duration.",
      inputSchema: {
        project: absolutePath,
        markerId: z.string().min(1).optional().describe("Optional stable Timeline Studio marker ID"),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ project, markerId }) =>
      runTimelineCommand("marker.inspect", [
        requireAbsolutePath(project, "project"),
        ...(markerId ? [markerId] : []),
      ]),
    ),
  );

  server.registerTool(
    "timeline_project_diff",
    {
      title: "Preview Timeline Studio edits",
      description: "Validate a versioned operation plan against the project and return its field-level dry-run diff without writing files. Supports marker.add, marker.update, and marker.delete alongside the shared editing command registry.",
      inputSchema: {
        project: absolutePath,
        baseRevision: z.number().int().nonnegative(),
        operations: z.array(operation).min(1),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ project, baseRevision, operations }) => {
      const projectPath = requireAbsolutePath(project, "project");
      return withTemporaryJson("timeline-mcp-diff-", commandPlan({ project: projectPath, baseRevision, operations, dryRun: true }),
        (planPath) => runTimelineCommand("project.diff", [planPath]));
    }),
  );

  server.registerTool(
    "timeline_project_apply",
    {
      title: "Apply Timeline Studio edits",
      description: "Apply a previously previewed, revision-checked operation plan transactionally and write a new portable .timeline archive. Marker annotations use marker.add, marker.update, and marker.delete in the same guarded workflow.",
      inputSchema: {
        project: absolutePath,
        outputProject: absolutePath.describe("New .timeline archive path; existing files are never overwritten"),
        baseRevision: z.number().int().nonnegative(),
        operations: z.array(operation).min(1),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    safeHandler(async ({ project, outputProject, baseRevision, operations }) => {
      const projectPath = requireAbsolutePath(project, "project");
      const outputPath = requireAbsolutePath(outputProject, "outputProject");
      await requireNewOutput(projectPath, outputPath, "outputProject");
      return withTemporaryJson(
        "timeline-mcp-apply-",
        commandPlan({ project: projectPath, outputProject: outputPath, baseRevision, operations, dryRun: false }),
        (planPath) => runTimelineCommand("project.run", [planPath]),
      );
    }),
  );

  server.registerTool(
    "timeline_project_render",
    {
      title: "Render Timeline Studio project",
      description: "Render the supported deterministic headless subset of a portable .timeline archive to a new MP4 and return ffprobe verification.",
      inputSchema: {
        project: absolutePath,
        outputVideo: absolutePath.describe("New MP4 path; existing files are never overwritten"),
        render: z.record(z.string(), z.unknown()).optional().describe("Optional documented project.render settings"),
      },
      outputSchema: resultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    safeHandler(async ({ project, outputVideo, render }) => {
      const projectPath = requireAbsolutePath(project, "project");
      const outputPath = requireAbsolutePath(outputVideo, "outputVideo");
      await requireNewOutput(projectPath, outputPath, "outputVideo");
      return withTemporaryJson(
        "timeline-mcp-render-",
        {
          schemaVersion: 1,
          project: projectPath,
          output: { video: outputPath },
          ...(render ? { render } : {}),
        },
        (requestPath) => runTimelineCommand("project.render", [requestPath]),
      );
    }),
  );

  return server;
}

export async function startTimelineStudioMcpServer() {
  const server = createTimelineStudioMcpServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  startTimelineStudioMcpServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
