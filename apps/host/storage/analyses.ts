import { z } from "zod";
import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { assetRecord } from "./assets.ts";
import { analysisRecord, analysisTaskRecord, analysisResultRecord, correctedAnalysisRecord, rawAnalysisRecord,
  analysisBasisDigest, validAnalysisOutput, validSceneCorrection, type AnalysisBasis } from "./analysis-records.ts";
import { emptyRoots, encodeId, referenceKey, sha256, type Manifest, type ObjectReference, type Save } from "./records.ts";
import { writeObject } from "./objects.ts";

export const analysisSave = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("task"), operation: z.json(), task: analysisTaskRecord,
    analysis: rawAnalysisRecord.nullable(), result: analysisResultRecord.nullable() }),
  z.strictObject({ action: z.literal("correct"), operation: z.json(), analysis: correctedAnalysisRecord }),
]);
export type AnalysisSave = z.infer<typeof analysisSave>;

export async function readAnalysisObject(files: ProjectFiles, current: Manifest | null, ref: ObjectReference) {
  const object = current?.objects.find(item => referenceKey(item) === referenceKey(ref));
  if (!object) throw new HostError("REFERENCE_INVALID", 409, "The analysis reference is not registered.");
  const bytes = await files.read(object.path);
  if (bytes.length !== object.sizeBytes || sha256(bytes) !== object.sha256) throw new HostError("PROJECT_INVALID", 409, "Analysis metadata is damaged.");
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

export async function validateAnalysisBasis(files: ProjectFiles, current: Manifest | null, basis: AnalysisBasis, visible = true) {
  if (visible && !current?.roots.assets.some(ref => referenceKey(ref) === referenceKey(basis.assetRef))) {
    throw new HostError("SOURCE_REFERENCE_STALE", 409, "The selected asset revision changed.");
  }
  const asset = assetRecord.parse(await readAnalysisObject(files, current, basis.assetRef));
  if (asset.sha256 !== basis.contentSha256 || referenceKey(asset.mediaRef) !== referenceKey(basis.mediaRef) ||
      asset.assetId !== basis.mediaRef.entityId || (asset.kind === "image" &&
      (basis.range.sourceStartSeconds !== 0 || basis.range.sourceEndSeconds !== 0 || basis.capability === "speech" || basis.capability === "scene")) ||
      (asset.kind !== "image" && basis.range.sourceEndSeconds <= basis.range.sourceStartSeconds) ||
      (asset.kind === "audio" && basis.capability !== "speech")) {
    throw new HostError("REFERENCE_INVALID", 409, "Analysis input does not match the source asset.");
  }
}

export function prepareAnalysis(files: ProjectFiles, projectId: string) {
  return async (current: Manifest | null, save: Save) => {
    const input = analysisSave.parse(save.request);
    const roots = structuredClone(current?.roots ?? emptyRoots());
    const objects = [...(current?.objects ?? [])];
    const append = async (kind: "analysis" | "task" | "result", entityId: string, revision: number, value: unknown) => {
      const collection = kind === "analysis" ? "analyses" : kind === "task" ? "tasks" : "results";
      const ref = { kind, entityId, revision };
      if (objects.some(item => referenceKey(item) === referenceKey(ref))) throw new HostError("REVISION_CONFLICT", 409, "This analysis revision already exists.");
      objects.push(await writeObject(files, ref, `data/${collection}/${encodeId(entityId)}/${revision}.json`, value));
      roots[collection] = [...roots[collection].filter(item => item.entityId !== entityId), ref];
    };
    if (input.action === "correct") {
      const value = input.analysis, previous = roots.analyses.find(ref => ref.entityId === value.analysisId);
      if (value.projectId !== projectId || !previous || referenceKey(previous) !== referenceKey(value.previousRef) ||
          value.rawRef.entityId !== value.analysisId || value.rawRef.revision !== 1 || value.revision !== (previous.revision ?? 0) + 1) {
        throw new HostError("REVISION_CONFLICT", 409, "The analysis revision changed before this correction was saved.");
      }
      const raw = rawAnalysisRecord.parse(await readAnalysisObject(files, current, value.rawRef));
      if (!validSceneCorrection(raw.basis, value.correction)) throw new HostError("INVALID_ARGUMENT", 400, "Scene corrections must cover the source without gaps or overlaps.");
      if (value.correction.intervals.some(item => item.range.sourceStartSeconds < raw.basis.range.sourceStartSeconds ||
          item.range.sourceEndSeconds > raw.basis.range.sourceEndSeconds)) throw new HostError("INVALID_ARGUMENT", 400, "Correction ranges must remain within the analyzed source range.");
      await append("analysis", value.analysisId, value.revision, value);
    } else {
      const task = input.task, previous = roots.tasks.find(ref => ref.entityId === task.taskId);
      if (task.projectId !== projectId || (previous ? !task.previousRef || referenceKey(previous) !== referenceKey(task.previousRef) ||
          task.revision !== (previous.revision ?? 0) + 1 : task.previousRef !== null || task.revision !== 1)) {
        throw new HostError("REVISION_CONFLICT", 409, "The analysis task revision changed.");
      }
      for (const step of task.steps) await validateAnalysisBasis(files, current, step.basis, !previous);
      if (input.analysis || input.result) {
        const value = input.analysis, result = input.result;
        if (!value || !result || value.projectId !== projectId || result.projectId !== projectId ||
            value.taskId !== task.taskId || result.taskId !== task.taskId || result.taskRef.entityId !== task.taskId ||
            result.taskRef.revision !== task.revision || result.resultId !== value.resultId ||
            result.attemptId !== value.attemptId || result.analysisRef.entityId !== value.analysisId || result.analysisRef.revision !== 1 ||
            value.basisDigest !== analysisBasisDigest(value.basis) || !validAnalysisOutput(value.basis, value.output) ||
            !task.steps.some(step => step.status === "succeeded" && step.attemptId === value.attemptId &&
              step.resultId === value.resultId && step.analysisRef?.entityId === value.analysisId &&
              analysisBasisDigest(step.basis) === value.basisDigest)) {
          throw new HostError("REFERENCE_INVALID", 409, "The completed analysis does not match its task and source.");
        }
        await append("analysis", value.analysisId, 1, value);
        await append("result", result.resultId, 1, result);
      }
      await append("task", task.taskId, task.revision, task);
    }
    return { roots, objects, editorSnapshotId: current?.editorSnapshotId ?? null, editorSequence: current?.editorSequence ?? null };
  };
}

export async function listAnalyses(files: ProjectFiles, current: Manifest | null, assetId?: string, after?: string) {
  const refs = [...(current?.roots.analyses ?? [])].sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);
  const index = after ? refs.findIndex(ref => ref.entityId === after) : -1;
  if (after && index < 0) throw new HostError("INVALID_CURSOR", 400, "The analysis cursor is no longer available.");
  const items = [];
  let cursor: string | null = null;
  for (let position = index + 1; position < refs.length; position++) {
    const stored = await readAnalysisObject(files, current, refs[position]);
    if (stored && typeof stored === "object" && "format" in stored &&
        ["semantic-analysis", "semantic-analysis-correction", "script-classification"].includes(String(stored.format))) continue;
    const value = analysisRecord.parse(stored);
    const raw = value.format === "material-analysis" ? value : rawAnalysisRecord.parse(await readAnalysisObject(files, current, value.rawRef));
    if (!assetId || raw.basis.assetRef.entityId === assetId) items.push({ raw, correction: value.format === "material-analysis-correction" ? value : null });
    if (items.length === 100) { cursor = position + 1 < refs.length ? refs[position].entityId : null; break; }
  }
  return { items, cursor };
}
