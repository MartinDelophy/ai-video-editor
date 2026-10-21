import { z } from "zod";
import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { readAnalysisObject } from "./analyses.ts";
import { emptyRoots, encodeId, referenceKey, type Manifest, type Save } from "./records.ts";
import { writeObject } from "./objects.ts";
import { buildSemanticOutput, correctedSemanticRecord, rawSemanticRecord, semanticContent, semanticRecord,
  semanticResultRecord, semanticTaskRecord } from "./semantic-records.ts";
import { loadSemanticSource } from "./semantic-source.ts";

export const semanticSave = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("task"), operation: z.json(), task: semanticTaskRecord,
    analysis: rawSemanticRecord.nullable(), result: semanticResultRecord.nullable() }),
  z.strictObject({ action: z.literal("correct"), operation: z.json(), analysis: correctedSemanticRecord }),
]);
export type SemanticSave = z.infer<typeof semanticSave>;

export function prepareSemanticAnalysis(files: ProjectFiles, projectId: string) {
  return async (current: Manifest | null, save: Save) => {
    const input = semanticSave.parse(save.request), roots = structuredClone(current?.roots ?? emptyRoots());
    const objects = [...(current?.objects ?? [])];
    const append = async (kind: "analysis" | "task" | "result", entityId: string, revision: number, value: unknown) => {
      const collection = kind === "analysis" ? "analyses" : kind === "task" ? "tasks" : "results";
      const ref = { kind, entityId, revision };
      if (objects.some(item => referenceKey(item) === referenceKey(ref))) throw new HostError("REVISION_CONFLICT", 409, "This semantic analysis revision already exists.");
      objects.push(await writeObject(files, ref, `data/${collection}/${encodeId(entityId)}/${revision}.json`, value));
      roots[collection] = [...roots[collection].filter(item => item.entityId !== entityId), ref];
    };
    if (input.action === "correct") {
      const value = input.analysis, previous = roots.analyses.find(ref => ref.entityId === value.analysisId);
      if (value.projectId !== projectId || !previous || referenceKey(previous) !== referenceKey(value.previousRef) ||
          value.rawRef.entityId !== value.analysisId || value.rawRef.revision !== 1 || value.revision !== (previous.revision ?? 0) + 1) {
        throw new HostError("REVISION_CONFLICT", 409, "The semantic analysis revision changed before this correction was saved.");
      }
      const raw = rawSemanticRecord.parse(await readAnalysisObject(files, current, value.rawRef));
      const expected = buildSemanticOutput(raw.units, raw.basis.sourceKind, value.content);
      if (JSON.stringify(expected) !== JSON.stringify(value.output)) throw new HostError("REFERENCE_INVALID", 409, "The semantic correction evidence does not match its source.");
      await append("analysis", value.analysisId, value.revision, value);
    } else {
      const task = input.task, previous = roots.tasks.find(ref => ref.entityId === task.taskId);
      if (task.projectId !== projectId || task.revision !== (previous?.revision ?? 0) + 1 ||
          (previous ? !task.previousRef || referenceKey(previous) !== referenceKey(task.previousRef) : task.previousRef !== null)) {
        throw new HostError("REVISION_CONFLICT", 409, "The semantic task revision changed.");
      }
      const source = await loadSemanticSource(files, current, task.basis.sourceAnalysisRef);
      if (source.sourceDigest !== task.basis.sourceDigest || source.sourceKind !== task.basis.sourceKind ||
          JSON.stringify(source.units) !== JSON.stringify(task.units) || referenceKey(source.raw.basis.assetRef) !== referenceKey(task.basis.assetRef) ||
          referenceKey(source.raw.basis.mediaRef) !== referenceKey(task.basis.mediaRef)) {
        throw new HostError("REFERENCE_INVALID", 409, "The semantic task does not match its speech evidence.");
      }
      if (input.analysis || input.result) {
        const value = input.analysis, result = input.result;
        if (!value || !result || !task.content || task.status !== "registered" || value.projectId !== projectId || result.projectId !== projectId ||
            value.taskId !== task.taskId || value.attemptId !== task.attemptId || result.taskId !== task.taskId || result.attemptId !== task.attemptId ||
            result.taskRef.revision !== task.revision || result.resultId !== value.resultId || referenceKey(result.analysisRef) !== referenceKey(task.analysisRef!) ||
            result.resultId !== task.resultId || JSON.stringify(value.output) !== JSON.stringify(buildSemanticOutput(task.units, task.basis.sourceKind, task.content))) {
          throw new HostError("REFERENCE_INVALID", 409, "The completed semantic analysis does not match its task and source.");
        }
        await append("analysis", value.analysisId, 1, value);
        await append("result", result.resultId, 1, result);
      }
      await append("task", task.taskId, task.revision, task);
    }
    return { roots, objects, editorSnapshotId: current?.editorSnapshotId ?? null, editorSequence: current?.editorSequence ?? null };
  };
}

export async function listSemanticAnalyses(files: ProjectFiles, current: Manifest | null, assetId?: string, after?: string) {
  const refs = [...(current?.roots.analyses ?? [])].sort((a, b) => a.entityId.localeCompare(b.entityId));
  const semanticRefs = [];
  for (const ref of refs) if (semanticRecord.safeParse(await readAnalysisObject(files, current, ref)).success) semanticRefs.push(ref);
  const index = after ? semanticRefs.findIndex(ref => ref.entityId === after) : -1;
  if (after && index < 0) throw new HostError("INVALID_CURSOR", 400, "The semantic analysis cursor is no longer available.");
  const items = []; let cursor: string | null = null;
  for (let position = index + 1; position < semanticRefs.length; position++) {
    const value = semanticRecord.parse(await readAnalysisObject(files, current, semanticRefs[position]));
    const raw = value.format === "semantic-analysis" ? value : rawSemanticRecord.parse(await readAnalysisObject(files, current, value.rawRef));
    if (!assetId || raw.basis.assetRef.entityId === assetId) items.push({ raw,
      correction: value.format === "semantic-analysis-correction" ? value : null,
      sourceCurrent: Boolean(current?.roots.analyses.some(ref => referenceKey(ref) === referenceKey(raw.basis.sourceAnalysisRef))) });
    if (items.length === 100) { cursor = position + 1 < semanticRefs.length ? semanticRefs[position].entityId : null; break; }
  }
  return { items, cursor };
}

export const semanticCorrectionInput = z.strictObject({ expectedRevision: z.number().int().positive().safe(), content: semanticContent });
