import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const executeFile = promisify(execFile);
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_RELATIVE_PATH = "scripts/timeline-command.mjs";
const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024 * 1024;
export function requireAbsolutePath(value, name) {
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

export async function runTimelineCommand(command, args) {
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

export async function withTemporaryJson(prefix, payload, callback) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  const path = join(folder, "request.json");
  try {
    await writeFile(path, JSON.stringify(payload), "utf8");
    return await callback(path);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function requireNewOutput(inputPath, outputPath, outputName) {
  if (resolve(inputPath) === resolve(outputPath)) {
    throw Object.assign(new Error(`${outputName} must differ from the input project path`), { code: "OUTPUT_OVERWRITE_BLOCKED" });
  }
  if (await fileExists(outputPath)) {
    throw Object.assign(new Error(`${outputName} already exists: ${outputPath}`), { code: "OUTPUT_EXISTS" });
  }
  await mkdir(dirname(outputPath), { recursive: true });
}

export function commandPlan({ project, baseRevision, operations, outputProject, dryRun }) {
  return {
    schemaVersion: 1,
    project,
    baseRevision,
    dryRun,
    operations,
    ...(outputProject ? { output: { project: outputProject } } : {}),
  };
}

