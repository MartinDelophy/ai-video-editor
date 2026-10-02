import { CHATCUT_FRAME_TOOL } from "./chatCutMedia.js";
import { requestAnnaChatCompletion } from "./annaRuntime.js";

// Only inspections and a validated preview are callable by the model. Applying
// remains an explicit editor action; never execute model-supplied JavaScript.
export const CHATCUT_TOOLS = new Set([
  "timeline_ai_process", "timeline_ai_preview", "timeline_ai_result_frames",
  "timeline_project_inspect", "timeline_track_inspect", "timeline_clip_inspect",
  "timeline_transcript_inspect", "timeline_assets_inspect", "timeline_markers_inspect", "timeline_edit_preview",
]);
export async function runAnnaChatCut({ instruction, history = [], tools, execute, image, captureFrame, inspectMedia, language, signal, onStage, autoApply = false, complete = requestAnnaChatCompletion }) {
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  check();
  const initial = await execute("timeline_project_inspect", {}, { signal });
  if (!initial?.ok) throw new Error(initial?.error?.message || "Editor unavailable");
  const catalog = tools.filter(tool => CHATCUT_TOOLS.has(tool.name)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  if (inspectMedia) catalog.push(CHATCUT_FRAME_TOOL);
  const currentFrameTool = { name: "timeline_current_frame", description: "Read the current source-media frame at the playhead when visual evidence is needed. Excludes effects, captions and overlays.", inputSchema: { type: "object", properties: {}, additionalProperties: false } };
  if (captureFrame) catalog.push(currentFrameTool);
  let sampledFrames = 0;
  const messages = [{ role: "user", content: [{ type: "text", text: JSON.stringify({ instruction, language, history: history.slice(-8).map(({ role, text }) => ({ role, text })), project: initial, image: image ? "One current source-media frame at the reported playhead; excludes editor effects, captions and overlays. Not the whole video." : "No images or audio supplied." }) }, ...(image ? [{ type: "image", data: image, mimeType: "image/jpeg" }] : [])] }];
  for (let step = 0; step < 16; step += 1) {
    check();
    onStage?.("thinking");
    const reply = await complete({ messages, catalog, language, signal });
    check();
    if (reply.type === "message" && typeof reply.text === "string" && reply.text.length <= 6000) return { text: reply.text };
    if (reply.type !== "tool" || !(CHATCUT_TOOLS.has(reply.name) || (inspectMedia && reply.name === CHATCUT_FRAME_TOOL.name) || (captureFrame && reply.name === currentFrameTool.name)) || !reply.arguments || typeof reply.arguments !== "object" || Array.isArray(reply.arguments)) throw new Error("Invalid model response");
    onStage?.(reply.name === "timeline_ai_process" ? "processing" : ["timeline_edit_preview", "timeline_ai_preview"].includes(reply.name) ? "validating" : "inspecting");
    if (reply.name === currentFrameTool.name) {
      if (Object.keys(reply.arguments).length || sampledFrames >= 18) throw new Error("Invalid current frame request");
      sampledFrames += 1;
      const frame = captureFrame();
      check();
      messages.push({ role: "assistant", content: { type: "text", text: JSON.stringify(reply) } }, { role: "user", content: frame ? [{ type: "text", text: "Current source frame; excludes effects, captions and overlays." }, { type: "image", data: frame, mimeType: "image/jpeg" }] : [{ type: "text", text: "Current frame unavailable. Inspect imported media instead." }] });
      continue;
    }
    if (reply.name === CHATCUT_FRAME_TOOL.name) {
      let content;
      try {
        const requested = reply.arguments.times?.length || 0;
        if (!requested || sampledFrames + requested > 18) throw new Error("Visual sample budget exceeded; ask the user to narrow the request");
        sampledFrames += requested;
        const result = await inspectMedia(reply.arguments, { signal });
        check();
        content = [{ type: "text", text: JSON.stringify({ assetId: result.assetId, sourceTimes: result.frames.map(frame => frame.sourceTime), note: "Sparse source frames in this order; no audio, effects or overlays." }) }, ...result.frames.map(frame => ({ type: "image", data: frame.data, mimeType: "image/jpeg" }))];
      } catch (error) {
        check();
        content = [{ type: "text", text: JSON.stringify({ error: error.message }) }];
      }
      messages.push({ role: "assistant", content: { type: "text", text: JSON.stringify(reply) } }, { role: "user", content });
      continue;
    }
    // Reject edits computed from an older project, even if the model re-reads it.
    const args = ["timeline_edit_preview", "timeline_ai_preview", "timeline_ai_process"].includes(reply.name) ? { ...reply.arguments, stateToken: initial.stateToken } : reply.arguments;
    if (reply.name === "timeline_ai_result_frames") {
      const count = args.times?.length || 0;
      if (!count || sampledFrames + count > 18) throw new Error("Visual sample budget exceeded");
      sampledFrames += count;
    }
    const result = await execute(reply.name, args, { signal });
    check();
    if (["timeline_edit_preview", "timeline_ai_preview"].includes(reply.name) && result.ok) {
      const review = { status: "pending", preview: result, summary: args.summary || "" };
      if (autoApply) {
        check();
        const applied = await execute("timeline_edit_apply", { previewId: result.previewId }, { signal });
        if (!applied?.ok) throw new Error(applied?.error?.message || "Could not apply changes");
        review.status = "applied";
        review.transactionId = applied.transactionId;
      }
      return { preview: true, review, text: args.summary || "" };
    }
    if (result.error?.code === "STALE_STATE") throw new Error(result.error.message);
    const content = reply.name === "timeline_ai_result_frames" && result.ok
      ? [{ type: "text", text: JSON.stringify({ resultId: args.resultId, sourceTimes: result.frames.map(frame => frame.sourceTime), note: "Processed video source frames; inspect repair quality before proposing replacement." }) }, ...result.frames.map(frame => ({ type: "image", data: frame.data, mimeType: "image/jpeg" }))]
      : { type: "text", text: JSON.stringify({ toolResult: result }) };
    messages.push({ role: "assistant", content: { type: "text", text: JSON.stringify(reply) } }, { role: "user", content });
  }
  throw new Error("Tool step limit reached");
}
