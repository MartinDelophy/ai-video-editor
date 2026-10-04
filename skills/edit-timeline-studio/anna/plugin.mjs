#!/usr/bin/env node
import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { requireAbsolutePath, runTimelineCommand, withTemporaryJson, requireNewOutput, commandPlan } from "../mcp/commandClient.mjs";

const path = z.string().min(1).refine(value => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value), "Absolute path required");
const inspectSchema = z.object({ project: path }).strict();
const editSchema = inspectSchema.extend({ baseRevision: z.number().int().nonnegative(), operations: z.array(z.record(z.string(), z.unknown())).min(1).max(500) });
const schemas = {
  timeline_project_inspect: inspectSchema,
  timeline_track_inspect: inspectSchema.extend({ track: z.string().min(1) }),
  timeline_clip_inspect: inspectSchema.extend({ clipId: z.string().min(1) }),
  timeline_marker_inspect: inspectSchema.extend({ markerId: z.string().min(1).optional() }),
  timeline_transcript_inspect: inspectSchema.extend({ audioClipId: z.string().min(1).optional() }),
  timeline_project_diff: editSchema,
  timeline_project_apply: editSchema.extend({ outputProject: path, previewId: z.string().uuid() }),
  timeline_project_render: inspectSchema.extend({ outputVideo: path, render: z.record(z.string(), z.unknown()).optional() }),
};
const descriptions = {
  timeline_project_inspect: "Inspect a user-provided local .timeline archive before editing; returns revision, tracks, duration and media inventory. Does not access the open Anna window or its private cloud storage.",
  timeline_track_inspect: "Inspect clips on one track in the supplied .timeline archive.",
  timeline_clip_inspect: "Inspect one clip by stable ID in the supplied archive.",
  timeline_marker_inspect: "Inspect annotations without changing rendered duration.",
  timeline_transcript_inspect: "Read existing transcript/caption associations; does not transcribe audio.",
  timeline_project_diff: "After project inspection, validate operations and return semantic changes plus a short-lived previewId. No files written. Use stable operation IDs and review the returned changes before apply.",
  timeline_project_apply: "Apply the exact inspected and previewed operations to a NEW archive. Requires previewId from this running session and matching source bytes and revision; never overwrites inputs or existing outputs.",
  timeline_project_render: "After inspection, render only the documented headless subset to a NEW MP4 using installed FFmpeg/ffprobe. Unsupported composition fails explicitly. No browser AI or live-window rendering.",
};
const parameterDescriptions = {
  project: "Absolute path to a user-provided .timeline archive on this Agent host",
  track: "Track ID returned by project inspection; inspect before choosing a track",
  clipId: "Stable clip ID returned by track/project inspection, never a display name",
  markerId: "Optional stable marker ID; omit to inspect all annotations",
  audioClipId: "Optional audio clip ID; omit to inspect all existing transcripts",
  baseRevision: "Exact nonnegative revision returned by the latest project inspection",
  operations: "Ordered shared-registry operations, each with a unique stable id and supported type; preview before applying",
  outputProject: "Absolute path for a NEW .timeline archive; existing files are rejected",
  previewId: "Single-use receipt from project_diff in this process, valid for 15 minutes",
  outputVideo: "Absolute path for a NEW .mp4 artifact; existing files are rejected",
  render: "Optional headless render settings; rich browser composition is unsupported",
};
const parameter = (name,type,required=true) => ({name,type,required,description:parameterDescriptions[name]});
export const manifest = {
  name: "timeline-project-tools", display_name: "Timeline Studio Project Tools", version: "0.1.3",
  description: "Inspect, preview, edit and render supplied portable Timeline Studio projects. Runs on the user's Anna Agent host; no live browser bridge, cloud project access or AI generation.",
  license: "MIT", category: "productivity", host_capabilities: [],
  tools: Object.keys(schemas).map(name => ({ name, description: descriptions[name], timeout: name.endsWith("render") ? 180 : 60, parameters: [parameter("project","string"),
    ...(name.includes("track_inspect") ? [parameter("track","string")] : []),
    ...(name.includes("clip_inspect") ? [parameter("clipId","string")] : []),
    ...(name.includes("marker_inspect") ? [parameter("markerId","string",false)] : []),
    ...(name.includes("transcript_inspect") ? [parameter("audioClipId","string",false)] : []),
    ...(/_(diff|apply)$/.test(name) ? [parameter("baseRevision","integer"),{...parameter("operations","array"),items:{type:"object"}}] : []),
    ...(name.endsWith("apply") ? [parameter("outputProject","string"),parameter("previewId","string")] : []),
    ...(name.endsWith("render") ? [parameter("outputVideo","string"),parameter("render","object",false)] : []),
  ] })),
};
const recovery = {
  INVALID_ARGUMENT: "Correct the named argument and retry; use IDs from inspection.",
  INSPECTION_REQUIRED: "Call timeline_project_inspect with the current archive, then preview again.",
  REVISION_CONFLICT: "Inspect the current archive and rebuild the plan using its returned revision.",
  PREVIEW_REQUIRED: "Call timeline_project_diff with these operations and use its new previewId.",
  OUTPUT_EXISTS: "Choose a new output filename; existing artifacts are never overwritten.",
  OUTPUT_OVERWRITE_BLOCKED: "Choose an output path different from the source archive.",
  ENOENT: "Provide an existing absolute project path accessible on this Agent host.",
  UNSUPPORTED_OPERATION: "Use the editor/CLI for media import, then inspect the resulting archive.",
};
const failure = (code,message,details) => ({ok:false,code,message,...(recovery[code]?{nextAction:recovery[code]}:{}),...(details?{details}:{})});
// Object property order is not an edit. Array/operation order remains significant.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const ttl = 15 * 60 * 1000;
export function createExecutaSession() {
  const inspected = new Map(); const previews = new Map();
  return async (tool,args) => {
    const schema = schemas[tool]; if (!schema) return failure("UNKNOWN_TOOL","Unknown Timeline Studio tool");
    const parsed = schema.safeParse(args); if (!parsed.success) return failure("INVALID_ARGUMENT","Tool arguments failed validation",parsed.error.issues.map(issue=>({path:issue.path.join("."),message:issue.message})));
    const input = parsed.data; const project = requireAbsolutePath(input.project,"project");
    const sourceBytes = await readFile(project);
    const fingerprint = hash(sourceBytes);
    const folder = await mkdtemp(join(tmpdir(), "timeline-anna-source-"));
    const commandProject = join(folder, "source.timeline");
    try {
    await writeFile(commandProject, sourceBytes);
    for (const [key,value] of inspected) if (Date.now()-value.at>ttl) inspected.delete(key);
    for (const [key,value] of previews) if (Date.now()-value.at>ttl) previews.delete(key);
    if (tool === "timeline_project_inspect") {
      const result = await runTimelineCommand("project.inspect",[commandProject]);
      if (result.ok) { if(inspected.size>=64) inspected.delete(inspected.keys().next().value); inspected.set(project,{fingerprint,revision:result.revision,at:Date.now()}); }
      return result;
    }
    const previous = inspected.get(project);
    if (!previous || previous.fingerprint !== fingerprint) return failure("INSPECTION_REQUIRED","Inspect the current source archive first; it is new, changed, or the session expired.");
    if (tool.endsWith("_inspect")) {
      const commands = { timeline_track_inspect:["track.inspect",input.track],timeline_clip_inspect:["clip.inspect",input.clipId],timeline_marker_inspect:["marker.inspect",input.markerId],timeline_transcript_inspect:["transcript.inspect",input.audioClipId] };
      const [command,selector] = commands[tool]; return await runTimelineCommand(command,[commandProject,...(selector?[selector]:[])]);
    }
    if (tool.endsWith("render")) {
      const outputVideo = requireAbsolutePath(input.outputVideo,"outputVideo"); await requireNewOutput(project,outputVideo,"outputVideo");
      return await withTemporaryJson("timeline-anna-render-",{schemaVersion:1,project:commandProject,output:{video:outputVideo},...(input.render?{render:input.render}:{})},request => runTimelineCommand("project.render",[request]));
    }
    if (previous.revision !== input.baseRevision) return failure("REVISION_CONFLICT","The plan revision does not match the inspected source.");
    // Imported filesystem media can change between preview and apply. Until a
    // content-addressed import receipt exists, keep imports on the established CLI path.
    if (input.operations.some(op=>op.type === "asset.import")) return failure("UNSUPPORTED_OPERATION","Import assets through the existing CLI/editor before inspecting this archive.");
    const planKey = hash(JSON.stringify(canonical({project,fingerprint,baseRevision:input.baseRevision,operations:input.operations})));
    if (tool.endsWith("diff")) {
      const result = await withTemporaryJson("timeline-anna-diff-",commandPlan({...input,project:commandProject,dryRun:true}),request => runTimelineCommand("project.diff",[request]));
      if (!result.ok) return result;
      const previewId=randomUUID(); if(previews.size>=64) previews.delete(previews.keys().next().value);
      previews.set(previewId,{planKey,at:Date.now()}); return {...result,previewId,expiresInSeconds:ttl/1000};
    }
    const preview=previews.get(input.previewId);
    if (!preview || preview.planKey!==planKey) return failure("PREVIEW_REQUIRED","Preview these exact operations against this source before applying.");
    const outputProject=requireAbsolutePath(input.outputProject,"outputProject"); await requireNewOutput(project,outputProject,"outputProject");
    const result=await withTemporaryJson("timeline-anna-apply-",commandPlan({...input,project:commandProject,outputProject,dryRun:false}),request => runTimelineCommand("project.run",[request]));
    if(result.ok) {
      previews.delete(input.previewId);
      return {...result,outputProject,nextAction:"Inspect outputProject to verify the requested edits; import this copy into the editor to continue there."};
    }
    return result;
    } finally { await rm(folder,{recursive:true,force:true}); }
  };
}
const invoke = createExecutaSession();
const send = (id,body) => process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,...body})+"\n");
let queue=Promise.resolve();
createInterface({input:process.stdin, crlfDelay:Infinity}).on("line",line => {
  if (!line.trim()) return;
  queue=queue.then(async () => {
    let request; try {request=JSON.parse(line);} catch {send(null,{error:{code:-32700,message:"Parse error"}});return;}
    if(request.jsonrpc!=="2.0" || typeof request.method!=="string") {send(request.id??null,{error:{code:-32600,message:"Invalid request"}});return;}
    const notification=request.id===undefined;
    try {
      let result;
      if(request.method==="initialize") result={protocolVersion:"2.0",capabilities:{}};
      else if(request.method==="describe") result=manifest;
      else if(request.method==="health") result={status:"ready"};
      else if(request.method==="invoke") result=await invoke(request.params?.tool,request.params?.arguments??{});
      else if(notification) return;
      else {send(request.id,{error:{code:-32601,message:"Method not found"}});return;}
      if(!notification) send(request.id,{result});
    } catch(error) {if(!notification) send(request.id,{result:failure(error.code||"COMMAND_FAILED",error.message)});}
  });
});
