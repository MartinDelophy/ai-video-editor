import { HostError } from "../sessions.ts";
import type { Manifest, ObjectRecord, ObjectReference } from "./records.ts";
import { encodeId, referenceKey } from "./records.ts";
import { buildSemanticOutput, correctedSemanticRecord, rawSemanticRecord, semanticRecord, semanticResultRecord,
  semanticTaskRecord, semanticSourceDigest } from "./semantic-records.ts";

export function semanticReferences(object: ObjectReference, value: unknown): ObjectReference[] | null {
  if (!value || typeof value !== "object" || !("format" in value)) return null;
  if (object.kind === "analysis" && value.format === "semantic-analysis") {
    const item = rawSemanticRecord.parse(value);
    return [item.basis.sourceAnalysisRef, item.basis.assetRef, item.basis.mediaRef, { kind: "result", entityId: item.resultId, revision: 1 }];
  }
  if (object.kind === "analysis" && value.format === "semantic-analysis-correction") {
    const item = correctedSemanticRecord.parse(value); return [item.rawRef, item.previousRef];
  }
  if (object.kind === "task" && value.format === "semantic-analysis-task") {
    const item = semanticTaskRecord.parse(value);
    return [...(item.previousRef ? [item.previousRef] : []), item.basis.sourceAnalysisRef, item.basis.assetRef, item.basis.mediaRef,
      ...(item.analysisRef ? [item.analysisRef] : []), ...(item.resultId ? [{ kind: "result" as const, entityId: item.resultId, revision: 1 }] : [])];
  }
  if (object.kind === "result" && value.format === "semantic-analysis-result") {
    const item = semanticResultRecord.parse(value); return [item.analysisRef, item.taskRef];
  }
  return null;
}
export async function verifySemanticObject(object: ObjectRecord, value: unknown, manifest: Manifest,
  read: (object: ObjectRecord) => Promise<unknown>) {
  const refs = semanticReferences(object, value);
  if (!refs) return false;
  const invalid = () => new HostError("PROJECT_INVALID", 409, "Semantic analysis records do not form a complete source history.");
  const lookup = async (ref: ObjectReference) => {
    const target = manifest.objects.find(item => referenceKey(item) === referenceKey(ref));
    if (!target) throw invalid();
    return read(target);
  };
  for (const ref of refs) if (!manifest.objects.some(item => referenceKey(item) === referenceKey(ref))) throw invalid();
  if (object.blobId !== undefined) throw invalid();
  if (object.kind === "analysis") {
    const item = semanticRecord.parse(value);
    if (item.projectId !== manifest.projectId || item.analysisId !== object.entityId || item.revision !== object.revision ||
        object.path !== `data/analyses/${encodeId(item.analysisId)}/${item.revision}.json`) throw invalid();
    if (item.format === "semantic-analysis") {
      const result = semanticResultRecord.parse(await lookup({ kind: "result", entityId: item.resultId, revision: 1 }));
      if (item.basis.sourceDigest !== semanticSourceDigest(item.basis.sourceAnalysisRef, item.units) ||
          JSON.stringify(item.output) !== JSON.stringify(buildSemanticOutput(item.units, item.basis.sourceKind, {
            segments: item.output.segments.map(({ range: _range, originalText: _text, ...segment }) => segment), themes: item.output.themes,
            centralIdea: item.output.centralIdea, complete: item.output.complete, limitations: item.output.limitations })) ||
          result.taskId !== item.taskId || result.attemptId !== item.attemptId || referenceKey(result.analysisRef) !== referenceKey({ kind: "analysis", entityId: item.analysisId, revision: 1 })) throw invalid();
    } else {
      const raw = rawSemanticRecord.parse(await lookup(item.rawRef));
      if (item.rawRef.entityId !== item.analysisId || item.rawRef.revision !== 1 || item.previousRef.entityId !== item.analysisId ||
          item.previousRef.revision !== item.revision - 1 || JSON.stringify(item.output) !== JSON.stringify(buildSemanticOutput(raw.units, raw.basis.sourceKind, item.content))) throw invalid();
    }
  } else if (object.kind === "task") {
    const item = semanticTaskRecord.parse(value);
    if (item.projectId !== manifest.projectId || item.taskId !== object.entityId || item.revision !== object.revision ||
        object.path !== `data/tasks/${encodeId(item.taskId)}/${item.revision}.json` ||
        (item.revision === 1 ? item.previousRef !== null : !item.previousRef || item.previousRef.entityId !== item.taskId || item.previousRef.revision !== item.revision - 1) ||
        item.basis.sourceDigest !== semanticSourceDigest(item.basis.sourceAnalysisRef, item.units) ||
        (item.status === "registered") !== Boolean(item.resultId && item.analysisRef && item.content)) throw invalid();
    if (item.resultId) {
      const result = semanticResultRecord.parse(await lookup({ kind: "result", entityId: item.resultId, revision: 1 }));
      if (result.taskId !== item.taskId || result.attemptId !== item.attemptId || referenceKey(result.analysisRef) !== referenceKey(item.analysisRef!)) throw invalid();
    }
  } else {
    const item = semanticResultRecord.parse(value), task = semanticTaskRecord.parse(await lookup(item.taskRef));
    if (item.projectId !== manifest.projectId || item.resultId !== object.entityId || object.revision !== 1 ||
        object.path !== `data/results/${encodeId(item.resultId)}/1.json` || item.taskRef.entityId !== item.taskId ||
        task.resultId !== item.resultId || task.attemptId !== item.attemptId || referenceKey(task.analysisRef!) !== referenceKey(item.analysisRef)) throw invalid();
  }
  return true;
}
