import { z } from "zod";
import { analysisRef, sourceRange } from "./analysis-records.ts";
import { normalizedBytes, sha256 } from "./records.ts";
import { scriptHarnessProvider } from "./script-records.ts";
import { planningHarnessConfig } from "../planning-provider.ts";

const id = z.string().min(1).max(256);
const revision = z.number().int().positive().safe();
const index = z.number().int().nonnegative().safe();
const digest = z.string().length(64).refine(value => [...value].every(char => "0123456789abcdef".includes(char)));

export const semanticSourceUnit = z.strictObject({ unitIndex: index, range: sourceRange, text: z.string().min(1).max(16384) });
export const semanticSegmentContent = z.strictObject({ segmentId: id, unitStart: index, unitEnd: index,
  summary: z.string().max(16384), uncertainty: z.string().max(16384) });
export const semanticWindowContent = z.strictObject({ segments: z.array(semanticSegmentContent).min(1).max(10_000) });
export const semanticThemeContent = z.strictObject({ themeId: id, title: z.string().min(1).max(1024),
  summary: z.string().max(16384), evidenceSegmentIds: z.array(id).min(1).max(10_000) });
export const semanticCentralIdeaContent = z.strictObject({ summary: z.string().min(1).max(16384),
  evidenceSegmentIds: z.array(id).min(1).max(10_000) });
export const semanticContent = semanticWindowContent.extend({ themes: z.array(semanticThemeContent).max(1000),
  centralIdea: semanticCentralIdeaContent.nullable(), complete: z.boolean(), limitations: z.array(z.string().min(1).max(16384)).max(1000) });

export const semanticSegment = semanticSegmentContent.extend({ range: sourceRange, originalText: z.string().min(1).max(2_000_000) });
export const semanticOutput = semanticContent.omit({ segments: true }).extend({ segments: z.array(semanticSegment).min(1).max(10_000) });
export const semanticBasis = z.strictObject({ sourceAnalysisRef: analysisRef,
  assetRef: z.strictObject({ kind: z.literal("asset"), entityId: id, revision }),
  mediaRef: z.strictObject({ kind: z.literal("media"), entityId: id, blobId: id }),
  range: sourceRange, language: z.string().max(64), sourceKind: z.enum(["words", "intervals", "text"]),
  sourceDigest: digest, provider: scriptHarnessProvider });

export const rawSemanticRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("semantic-analysis"),
  projectId: id, analysisId: id, revision: z.literal(1), taskId: id, attemptId: id, resultId: id,
  basis: semanticBasis, units: z.array(semanticSourceUnit).min(1).max(100_000), output: semanticOutput, createdAt: z.iso.datetime() });
export const correctedSemanticRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("semantic-analysis-correction"),
  projectId: id, analysisId: id, revision, rawRef: analysisRef, previousRef: analysisRef,
  content: semanticContent, output: semanticOutput, createdAt: z.iso.datetime() });
export const semanticRecord = z.discriminatedUnion("format", [rawSemanticRecord, correctedSemanticRecord]);

const taskRef = z.strictObject({ kind: z.literal("task"), entityId: id, revision });
export const semanticTaskRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("semantic-analysis-task"),
  projectId: id, taskId: id, revision, attemptId: id, previousRef: taskRef.nullable(),
  status: z.enum(["prepared", "output_ready", "registered", "failed", "cancelled"]), provider: planningHarnessConfig,
  requestDigest: digest, basis: semanticBasis, units: z.array(semanticSourceUnit).min(1).max(100_000),
  groups: z.array(z.strictObject({ contextUnitStart: index, contextUnitEnd: index, ownedUnitStart: index, ownedUnitEnd: index,
    inputText: z.string().max(2_000_000), digest, output: semanticWindowContent.nullable(), remoteId: z.string().max(512).nullable() })).min(1).max(1000),
  content: semanticContent.nullable(), remoteId: z.string().max(512).nullable(), resultId: id.nullable(), analysisRef: analysisRef.nullable(),
  error: z.string().max(1024), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const semanticResultRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("semantic-analysis-result"),
  projectId: id, resultId: id, revision: z.literal(1), taskId: id, attemptId: id, registration: z.literal("registered"),
  analysisRef, taskRef });

export const agentSemanticOutput = z.strictObject({ groupIndex: index.nullable(), inputDigest: digest,
  content: z.union([semanticWindowContent, semanticContent]), remoteId: z.string().max(512).nullable() });
export const agentSemanticStep = z.strictObject({ taskId: id, status: semanticTaskRecord.shape.status,
  source: scriptHarnessProvider, analysisRef: analysisRef.nullable(), next: z.strictObject({ stage: z.enum(["window", "merge"]),
    groupIndex: index.nullable(), inputDigest: digest, inputText: z.string().max(2_000_000), instructions: z.string() }).nullable() });

export type SemanticSourceUnit = z.infer<typeof semanticSourceUnit>;
export type SemanticContent = z.infer<typeof semanticContent>;
export type SemanticOutput = z.infer<typeof semanticOutput>;
export type SemanticBasis = z.infer<typeof semanticBasis>;
export type SemanticTask = z.infer<typeof semanticTaskRecord>;

export function semanticSourceDigest(sourceAnalysisRef: z.infer<typeof analysisRef>, units: SemanticSourceUnit[]) {
  return sha256(normalizedBytes({ sourceAnalysisRef, units }));
}
function joinUnits(units: SemanticSourceUnit[], kind: SemanticBasis["sourceKind"]) {
  return units.map(unit => unit.text).join(kind === "words" ? "" : "\n");
}
export function buildSemanticOutput(units: SemanticSourceUnit[], kind: SemanticBasis["sourceKind"], value: SemanticContent,
  requiredStart = 0, requiredEnd = units.length): SemanticOutput {
  const content = semanticContent.parse(value), ids = new Set<string>();
  let cursor = requiredStart;
  const segments = content.segments.map(segment => {
    if (ids.has(segment.segmentId) || segment.unitStart !== cursor || segment.unitEnd <= segment.unitStart || segment.unitEnd > requiredEnd) {
      throw new Error("Semantic segments must uniquely and contiguously cover the required source units.");
    }
    ids.add(segment.segmentId); cursor = segment.unitEnd;
    const selected = units.slice(segment.unitStart, segment.unitEnd);
    if (selected.length !== segment.unitEnd - segment.unitStart) throw new Error("Semantic segment source units are unavailable.");
    return { ...segment, range: { sourceStartSeconds: selected[0].range.sourceStartSeconds,
      sourceEndSeconds: selected[selected.length - 1].range.sourceEndSeconds }, originalText: joinUnits(selected, kind) };
  });
  if (cursor !== requiredEnd) throw new Error("Semantic segments do not cover the complete required source span.");
  const validateEvidence = (values: string[]) => {
    if (new Set(values).size !== values.length || values.some(value => !ids.has(value))) throw new Error("Semantic theme evidence is invalid.");
  };
  for (const theme of content.themes) validateEvidence(theme.evidenceSegmentIds);
  if (content.centralIdea) validateEvidence(content.centralIdea.evidenceSegmentIds);
  if (!content.complete && !content.limitations.length) throw new Error("Incomplete semantic output must explain its limitations.");
  return semanticOutput.parse({ ...content, segments });
}
