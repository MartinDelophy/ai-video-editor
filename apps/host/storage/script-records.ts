import { z } from "zod";
import { analysisBasis, analysisRef, sourceRange } from "./analysis-records.ts";
import { normalizedBytes, sha256 } from "./records.ts";

const id = z.string().min(1).max(256);
const revision = z.number().int().positive().safe();
const text = z.string().max(16384);
export const scriptRef = z.strictObject({ kind: z.literal("script"), entityId: id, revision });
export const scriptSource = z.strictObject({ sourceId: id, assetRef: analysisBasis.shape.assetRef,
  mediaRef: analysisBasis.shape.mediaRef, analysisRef: analysisRef.nullable(), range: sourceRange,
  kind: z.enum(["image", "video", "audio"]), capability: z.enum(["speech", "visual", "detection", "description", "scene", "unanalysed"]),
  originalText: text, visualNotes: text, labels: z.array(id).max(100) });
export const scriptGoals = z.strictObject({ theme: text, style: text,
  durationSeconds: z.number().positive().max(86400).nullable() });
export const scriptApiProvider = z.strictObject({ providerId: id, revision, protocol: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().url().max(2048), model: id });
export const scriptHarnessProvider = z.strictObject({ kind: z.literal("harness"), harness: id,
  providerId: id, model: id, authType: id });
export const scriptProvider = z.union([scriptApiProvider, scriptHarnessProvider]);
export const scriptClassification = z.strictObject({ sourceId: id, themes: z.array(id).max(30),
  tags: z.array(id).max(100), included: z.boolean(), note: text });
export const classificationRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("script-classification"),
  projectId: id, analysisId: id, revision, sources: z.array(scriptSource).min(1).max(10000),
  items: z.array(scriptClassification).max(10000), createdAt: z.iso.datetime() });
export const scriptSegment = z.strictObject({ segmentId: id, kind: z.enum(["sourceSpeech", "narration", "visual"]),
  sourceIds: z.array(id).max(100), originalText: text, editedText: text, visualSuggestion: text,
  estimatedDurationSeconds: z.number().nonnegative().max(86400), included: z.boolean() });
export const scriptContent = z.strictObject({ title: text, theme: text, rationale: text, suggestions: z.array(text).max(100),
  candidates: z.array(z.strictObject({ title: text, rationale: text })).max(30),
  classifications: z.array(scriptClassification).max(10000), segments: z.array(scriptSegment).min(1).max(10000),
  gaps: z.array(text).max(100) });
export const scriptDraft = z.strictObject({ goals: scriptGoals, sources: z.array(scriptSource).min(1).max(10000),
  content: scriptContent, feedback: text, provider: scriptProvider.nullable() });
export const scriptRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("review-script"),
  projectId: id, scriptId: id, revision, previousRef: scriptRef.nullable(), classificationRef: analysisRef, draft: scriptDraft,
  digest: z.string().length(64), confirmed: z.strictObject({ revision, digest: z.string().length(64), at: z.iso.datetime() }).nullable(),
  createdAt: z.iso.datetime() });
export const scriptWrite = z.strictObject({ scriptId: id, expectedRevision: z.number().int().nonnegative().safe(),
  draft: scriptDraft, createdAt: z.iso.datetime(), confirmDigest: z.string().length(64).nullable() });
export type ScriptDraft = z.infer<typeof scriptDraft>;
export type ScriptSource = z.infer<typeof scriptSource>;
export type ScriptRecord = z.infer<typeof scriptRecord>;
export function scriptDigest(draft: ScriptDraft) { return sha256(normalizedBytes(draft)); }

export function validScriptContent(draft: ScriptDraft) {
  const sources = new Map(draft.sources.map(source => [source.sourceId, source]));
  if (sources.size !== draft.sources.length || new Set(draft.content.segments.map(segment => segment.segmentId)).size !== draft.content.segments.length ||
      new Set(draft.content.classifications.map(item => item.sourceId)).size !== draft.content.classifications.length ||
      draft.content.classifications.length !== sources.size || draft.content.classifications.some(item => !sources.has(item.sourceId))) return false;
  return draft.content.segments.every(segment => {
    if (new Set(segment.sourceIds).size !== segment.sourceIds.length || segment.sourceIds.some(id => !sources.has(id))) return false;
    if (segment.kind === "sourceSpeech") return segment.sourceIds.length > 0 && segment.sourceIds.every(id => sources.get(id)!.capability === "speech") &&
      segment.originalText === segment.sourceIds.map(id => sources.get(id)!.originalText).join("\n");
    return segment.originalText === "" && (segment.kind === "narration" || segment.sourceIds.length > 0);
  });
}
