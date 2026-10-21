import { z } from "zod";
import { analysisRef, sourceRange } from "./storage/analysis-records.ts";
import { normalizedBytes, sha256 } from "./storage/records.ts";
import {
  VISUAL_SEARCH_COMPONENT_ID, VISUAL_SEARCH_COMPONENT_REVISION, VISUAL_SEARCH_EMBEDDING_DIMENSION,
  VISUAL_SEARCH_MODEL_ID, VISUAL_SEARCH_SAMPLES_PER_INTERVAL, VISUAL_SEARCH_TOOL_ID, VISUAL_SEARCH_TOOL_REVISION,
} from "../../src/config/visualSearch.js";

const id = z.string().min(1).max(256);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().positive().safe();
const seconds = z.number().finite().nonnegative();
const relativeFile = z.string().min(1).max(1024).refine(value => !value.includes("\\") && !value.includes("\0") &&
  value.split("/").every(part => part && part !== "." && part !== ".."));

export const visualSearchSource = z.strictObject({
  sourceId: id,
  assetRef: z.strictObject({ kind: z.literal("asset"), entityId: id, revision }),
  mediaRef: z.strictObject({ kind: z.literal("media"), entityId: id, blobId: id }),
  analysisRef,
  range: sourceRange.refine(value => value.sourceEndSeconds > value.sourceStartSeconds, "Visual search requires a positive source range."),
});

export const visualSearchComponentIdentity = z.strictObject({
  componentId: z.literal(VISUAL_SEARCH_COMPONENT_ID),
  componentRevision: z.literal(VISUAL_SEARCH_COMPONENT_REVISION),
  manifestDigest: digest,
  toolId: z.literal(VISUAL_SEARCH_TOOL_ID),
  toolRevision: z.literal(VISUAL_SEARCH_TOOL_REVISION),
  model: z.strictObject({
    id: z.literal(VISUAL_SEARCH_MODEL_ID),
    revision: z.string().regex(/^[0-9a-f]{40}$/),
    processorRevision: z.string().regex(/^[0-9a-f]{40}$/),
    filesDigest: digest,
    precision: z.literal("float32"),
    embeddingDimension: z.literal(VISUAL_SEARCH_EMBEDDING_DIMENSION),
  }),
});

export const visualSearchBasis = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: id,
  component: visualSearchComponentIdentity,
  settings: z.strictObject({
    samplesPerInterval: z.literal(VISUAL_SEARCH_SAMPLES_PER_INTERVAL),
    pooling: z.literal("mean-l2"),
    similarity: z.literal("cosine"),
  }),
  sources: z.array(visualSearchSource).min(1).max(100_000),
});

export const visualSearchCacheManifest = z.strictObject({
  schemaVersion: z.literal(1),
  format: z.literal("autocut-visual-search-cache"),
  basis: visualSearchBasis,
  basisDigest: digest,
  rows: z.array(z.strictObject({
    row: z.number().int().nonnegative().safe(),
    sourceId: id,
    sampleTimesSeconds: z.array(seconds).length(VISUAL_SEARCH_SAMPLES_PER_INTERVAL),
  })).min(1).max(100_000),
  vectors: z.strictObject({
    path: relativeFile,
    sizeBytes: z.number().int().positive().safe(),
    sha256: digest,
    rows: z.number().int().positive().safe(),
    dimensions: z.literal(VISUAL_SEARCH_EMBEDDING_DIMENSION),
    encoding: z.literal("float32-le"),
    normalized: z.literal(true),
  }),
  createdAt: z.iso.datetime(),
});

export const visualSearchQuery = z.strictObject({
  query: z.string().trim().min(1).max(2000),
  k: z.number().int().min(1).max(50).default(10),
  diversity: z.number().min(0).max(1).default(0),
});

export const visualSearchToolResults = z.array(z.strictObject({
  sourceId: id,
  score: z.number().finite(),
})).max(50);

export type VisualSearchBasis = z.infer<typeof visualSearchBasis>;
export type VisualSearchCacheManifest = z.infer<typeof visualSearchCacheManifest>;
export type VisualSearchSource = z.infer<typeof visualSearchSource>;

export function visualSearchBasisDigest(value: VisualSearchBasis) {
  return sha256(normalizedBytes(visualSearchBasis.parse(value)));
}

export function visualSearchModelFilesDigest(files: { path: string; sizeBytes: number; sha256: string }[]) {
  return sha256(normalizedBytes(files.map(file => ({ path: file.path, sizeBytes: file.sizeBytes, sha256: file.sha256 }))));
}
