#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { applyCommandPlan, inspectClip, inspectProject, inspectTrack, inspectTranscript } from "../src/lib/projectCommandEngine.js";
import { buildFfmpegRenderPlan } from "../src/lib/projectRenderPlan.js";

const PROJECT_FILE = "project.json";
const executeFile = promisify(execFile);

async function readArchive(path) {
  const files = unzipSync(new Uint8Array(await readFile(path)));
  if (!files[PROJECT_FILE]) throw new Error("Archive is missing project.json");
  const payload = JSON.parse(strFromU8(files[PROJECT_FILE]));
  if (payload?.format !== "timeline-studio-archive" || !payload.project) throw new Error("Invalid .timeline archive");
  return { files, payload };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const VISUAL_EXTENSIONS = Object.freeze({
  ".jpg": ["image", "image/jpeg"], ".jpeg": ["image", "image/jpeg"], ".png": ["image", "image/png"],
  ".webp": ["image", "image/webp"], ".gif": ["image", "image/gif"], ".mp4": ["video", "video/mp4"],
  ".webm": ["video", "video/webm"], ".mov": ["video", "video/quicktime"],
  ".mp3": ["audio", "audio/mpeg"], ".wav": ["audio", "audio/wav"], ".m4a": ["audio", "audio/mp4"],
  ".aac": ["audio", "audio/aac"], ".ogg": ["audio", "audio/ogg"], ".flac": ["audio", "audio/flac"],
});

function safeArchiveName(value) {
  return String(value || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96) || "asset";
}

async function prepareAssetImports(plan) {
  const imports = new Map();
  const operations = [];
  for (const operation of plan.operations || []) {
    if (operation.type !== "asset.import") { operations.push(operation); continue; }
    if (typeof operation.file !== "string" || !isAbsolute(operation.file)) {
      throw Object.assign(new Error("asset.import file must be an absolute path"), { code: "INVALID_ARGUMENT" });
    }
    const extension = extname(operation.file).toLowerCase();
    const inferred = VISUAL_EXTENSIONS[extension];
    if (!inferred) throw Object.assign(new Error(`Unsupported asset extension: ${extension || "none"}`), { code: "UNSUPPORTED_MEDIA_TYPE" });
    const bytes = new Uint8Array(await readFile(operation.file));
    if (!bytes.length) throw Object.assign(new Error("Imported asset is empty"), { code: "INVALID_ASSET" });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const needsProbe = inferred[0] === "audio" || (inferred[0] === "video" && (!operation.duration || !operation.width || !operation.height)) || (inferred[0] === "image" && (!operation.width || !operation.height));
    let probe = {};
    if (needsProbe) {
      try {
        const { stdout } = await executeFile("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,duration", "-of", "json", operation.file]);
        const metadata = JSON.parse(stdout);
        const video = metadata.streams?.find((stream) => stream.codec_type === "video") || {};
        probe = { duration: Number(metadata.format?.duration) || Number(video.duration) || 0, width: Number(video.width) || 0, height: Number(video.height) || 0 };
      } catch (error) {
        throw Object.assign(new Error(`Unable to probe imported asset: ${basename(operation.file)}`), { code: "MEDIA_PROBE_FAILED", cause: error });
      }
    }
    const folder = inferred[0] === "audio" ? "audio" : "visuals";
    const archivePath = `media/${folder}/import-${sha256.slice(0, 12)}-${safeArchiveName(operation.name || basename(operation.file))}`;
    const duration = Number(operation.duration) > 0 ? Number(operation.duration) : Number(probe.duration) > 0 ? Number(probe.duration) : inferred[0] === "image" ? 4 : undefined;
    const prepared = { ...operation, prepared: true, mediaType: inferred[0], mimeType: operation.mimeType || inferred[1], name: operation.name || basename(operation.file), size: bytes.length, sha256, archivePath, duration, width: operation.width ?? probe.width, height: operation.height ?? probe.height };
    delete prepared.file;
    operations.push(prepared);
    imports.set(operation.id, { bytes, track: operation.track, manifest: { id: operation.clipId, path: archivePath, name: prepared.name, type: prepared.mimeType, size: bytes.length, sha256 } });
  }
  return { plan: { ...plan, operations }, imports };
}

function safeArchivePath(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw Object.assign(new Error(`Unsafe media path in archive: ${path}`), { code: "INVALID_ARCHIVE_PATH" });
  }
  return normalized;
}

async function renderProject(renderPath) {
  const request = JSON.parse(await readFile(resolve(renderPath), "utf8"));
  if (request?.schemaVersion !== 1) throw Object.assign(new Error("project.render schemaVersion must be 1"), { code: "UNSUPPORTED_SCHEMA_VERSION" });
  if (typeof request.project !== "string" || !request.project) throw Object.assign(new Error("project is required"), { code: "INVALID_ARGUMENT" });
  if (typeof request.output?.video !== "string" || !request.output.video) throw Object.assign(new Error("output.video is required"), { code: "INVALID_ARGUMENT" });
  const projectPath = resolve(request.project);
  const outputPath = resolve(request.output.video);
  if (extname(outputPath).toLowerCase() !== ".mp4") throw Object.assign(new Error("project.render currently outputs MP4 only"), { code: "UNSUPPORTED_OUTPUT_FORMAT" });
  const { files, payload } = await readArchive(projectPath);
  const extractionRoot = await mkdtemp(join(tmpdir(), "timeline-render-"));
  const extractedFiles = new Map();
  const temporaryOutput = join(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.tmp.mp4`);
  const abortController = new AbortController();
  const cancel = () => abortController.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    for (const [archivePath, bytes] of Object.entries(files)) {
      if (archivePath === PROJECT_FILE) continue;
      const safePath = safeArchivePath(archivePath);
      const extractedPath = resolve(extractionRoot, ...safePath.split("/"));
      if (!extractedPath.startsWith(`${extractionRoot}${sep}`)) throw Object.assign(new Error(`Unsafe media path in archive: ${archivePath}`), { code: "INVALID_ARCHIVE_PATH" });
      await mkdir(dirname(extractedPath), { recursive: true });
      await writeFile(extractedPath, bytes);
      extractedFiles.set(archivePath, extractedPath);
    }
    const renderPlan = buildFfmpegRenderPlan({ project: payload.project, media: payload.media, extractedFiles, settings: request.render });
    await mkdir(dirname(outputPath), { recursive: true });
    await executeFile("ffmpeg", [...renderPlan.args, temporaryOutput], { signal: abortController.signal, maxBuffer: 10 * 1024 * 1024 });
    await rename(temporaryOutput, outputPath);
    const { stdout } = await executeFile("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", outputPath]);
    const verification = JSON.parse(stdout);
    const video = verification.streams?.find((stream) => stream.codec_type === "video");
    const audio = verification.streams?.find((stream) => stream.codec_type === "audio");
    if (!video || video.width !== renderPlan.width || video.height !== renderPlan.height) {
      throw Object.assign(new Error("Rendered video verification failed"), { code: "RENDER_VERIFICATION_FAILED" });
    }
    return {
      ok: true,
      revision: inspectProject(payload.project).revision,
      artifacts: { project: projectPath, video: outputPath },
      render: { ...renderPlan, args: undefined, codec: "h264", container: "mp4" },
      verification: { duration: Number(verification.format?.duration) || 0, width: video.width, height: video.height, hasAudio: Boolean(audio) },
    };
  } catch (error) {
    await rm(temporaryOutput, { force: true }).catch(() => {});
    if (error?.name === "AbortError") throw Object.assign(new Error("Render canceled"), { code: "RENDER_CANCELED" });
    throw error;
  } finally {
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

async function main() {
  const [rawCommand, argument, selector] = process.argv.slice(2);
  const command = rawCommand === "inspect" ? "project.inspect" : rawCommand === "run" ? "project.run" : rawCommand;
  const supported = ["project.inspect", "track.inspect", "clip.inspect", "transcript.inspect", "project.diff", "project.run", "project.render"];
  if (!command || !argument || !supported.includes(command)) {
    throw Object.assign(new Error("Usage: npm run agent -- project.inspect <project.timeline> | track.inspect <project.timeline> <track> | clip.inspect <project.timeline> <clipId> | transcript.inspect <project.timeline> [audioClipId] | project.diff <plan.json> | project.run <plan.json> | project.render <render.json>"), { exitCode: 2, code: "INVALID_COMMAND" });
  }
  if (command === "project.render") { print(await renderProject(argument)); return; }
  if (["project.inspect", "track.inspect", "clip.inspect", "transcript.inspect"].includes(command)) {
    const { files, payload } = await readArchive(resolve(argument));
    if (command === "track.inspect" && !selector) throw Object.assign(new Error("track is required"), { code: "INVALID_ARGUMENT" });
    if (command === "clip.inspect" && !selector) throw Object.assign(new Error("clipId is required"), { code: "INVALID_ARGUMENT" });
    if (command === "track.inspect") print({ ok: true, ...inspectTrack(payload.project, selector) });
    else if (command === "clip.inspect") print({ ok: true, ...inspectClip(payload.project, selector) });
    else if (command === "transcript.inspect") print({ ok: true, ...inspectTranscript(payload.project, selector || "") });
    else {
      const mediaPaths = Object.keys(files).filter((path) => path !== PROJECT_FILE).sort();
      print({ ok: true, archiveVersion: payload.version || 1, ...inspectProject(payload.project), mediaInventory: { count: mediaPaths.length, paths: mediaPaths } });
    }
    return;
  }
  const rawPlan = JSON.parse(await readFile(resolve(argument), "utf8"));
  const prepared = await prepareAssetImports(rawPlan);
  const plan = prepared.plan;
  const projectPath = resolve(plan.project);
  const { files, payload } = await readArchive(projectPath);
  const result = applyCommandPlan(payload.project, plan);
  if (!result.ok) {
    print(result);
    process.exitCode = 1;
    return;
  }
  const isDiff = command === "project.diff";
  const outputPath = plan.output?.project ? resolve(plan.output.project) : "";
  if (!isDiff && !plan.dryRun) {
    if (!outputPath) throw new Error("output.project is required unless dryRun is true");
    const appliedImports = result.appliedOperationIds.flatMap((id) => prepared.imports.has(id) ? [prepared.imports.get(id)] : []);
    for (const imported of appliedImports) files[imported.manifest.path] = imported.bytes;
    const previousVisualMedia = Array.isArray(payload.media?.visuals) ? payload.media.visuals : [];
    const visualImports = appliedImports.filter((item) => item.track === "visuals");
    const voiceImport = appliedImports.find((item) => item.track === "audio");
    const musicImport = appliedImports.find((item) => item.track === "music");
    const nextPayload = {
      ...payload,
      exportedAt: new Date().toISOString(),
      project: result.project,
      media: {
        ...(payload.media || {}),
        visuals: [...previousVisualMedia, ...visualImports.map((item) => item.manifest)],
        ...(voiceImport ? { audio: voiceImport.manifest } : {}),
        ...(musicImport ? { music: musicImport.manifest } : {}),
      },
    };
    files[PROJECT_FILE] = strToU8(JSON.stringify(nextPayload));
    await writeFile(outputPath, zipSync(files, { level: 6 }));
  }
  print({
    ok: true,
    revision: result.revision,
    appliedOperationIds: result.appliedOperationIds,
    warnings: result.warnings,
    diff: { before: result.before, after: result.after, changes: result.changes },
    artifacts: { ...(isDiff || plan.dryRun ? {} : { project: outputPath }) },
  });
}

main().catch((error) => {
  print({ ok: false, code: error?.code || "COMMAND_FAILED", message: error instanceof Error ? error.message : String(error) });
  process.exitCode = error?.exitCode || 1;
});
