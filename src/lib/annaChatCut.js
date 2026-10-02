import { requestAnnaChatCompletion } from "./annaRuntime.js";

// Only inspections and a validated preview are callable by the model. Applying
// remains an explicit editor action; never execute model-supplied JavaScript.
export const CHATCUT_TOOLS = new Set([
  "timeline_project_inspect", "timeline_track_inspect", "timeline_clip_inspect",
  "timeline_transcript_inspect", "timeline_assets_inspect", "timeline_markers_inspect", "timeline_edit_preview",
]);
export async function runAnnaChatCut({ instruction, history = [], tools, execute, image, language, signal, onStage, complete = requestAnnaChatCompletion }) {
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  check();
  const initial = await execute("timeline_project_inspect", {}, { signal });
  if (!initial?.ok) throw new Error(initial?.error?.message || "Editor unavailable");
  const catalog = tools.filter(tool => CHATCUT_TOOLS.has(tool.name)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  const messages = [{ role: "user", content: [{ type: "text", text: JSON.stringify({ instruction, language, history: history.slice(-8), project: initial, image: image ? "One current source-media frame at the reported playhead; excludes editor effects, captions and overlays. Not the whole video." : "No images or audio supplied." }) }, ...(image ? [{ type: "image", data: image, mimeType: "image/jpeg" }] : [])] }];
  for (let step = 0; step < 8; step += 1) {
    check();
    onStage?.("thinking");
    const reply = await complete({ messages, catalog, language, signal });
    check();
    if (reply.type === "message" && typeof reply.text === "string" && reply.text.length <= 6000) return { text: reply.text };
    if (reply.type !== "tool" || !CHATCUT_TOOLS.has(reply.name) || !reply.arguments || typeof reply.arguments !== "object" || Array.isArray(reply.arguments)) throw new Error("Invalid model response");
    onStage?.(reply.name === "timeline_edit_preview" ? "validating" : "inspecting");
    // Reject edits computed from an older project, even if the model re-reads it.
    const args = reply.name === "timeline_edit_preview" ? { ...reply.arguments, stateToken: initial.stateToken } : reply.arguments;
    const result = await execute(reply.name, args, { signal });
    check();
    if (reply.name === "timeline_edit_preview" && result.ok) return { preview: true, text: args.summary || "" };
    if (result.error?.code === "STALE_STATE") throw new Error(result.error.message);
    messages.push({ role: "assistant", content: { type: "text", text: JSON.stringify(reply) } }, { role: "user", content: { type: "text", text: JSON.stringify({ toolResult: result }) } });
  }
  throw new Error("Tool step limit reached");
}
