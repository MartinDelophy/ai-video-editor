import { HostError } from "../sessions.ts";
import type { Manifest, ObjectRecord, ObjectReference } from "./records.ts";
import { encodeId, referenceKey } from "./records.ts";
import { analysisRecord, analysisTaskRecord, analysisResultRecord, rawAnalysisRecord, analysisBasisDigest, validAnalysisOutput, validSceneCorrection } from "./analysis-records.ts";
import { assetRecord } from "./assets.ts";

export function analysisReferences(object: ObjectReference, value: unknown): ObjectReference[] | null {
  if (!value || typeof value !== "object" || !("format" in value)) return null;
  if (object.kind === "analysis" && value.format === "material-analysis") {
    const item = rawAnalysisRecord.parse(value);
    return [item.basis.assetRef, item.basis.mediaRef, { kind: "result", entityId: item.resultId, revision: 1 }];
  }
  if (object.kind === "analysis" && value.format === "material-analysis-correction") {
    const item = analysisRecord.parse(value);
    return item.format === "material-analysis-correction" ? [item.rawRef, item.previousRef] : [];
  }
  if (object.kind === "task" && value.format === "material-analysis-task") {
    const item = analysisTaskRecord.parse(value);
    return [...(item.previousRef ? [item.previousRef] : []), ...item.steps.flatMap(step =>
      [step.basis.assetRef, step.basis.mediaRef, ...(step.analysisRef ? [step.analysisRef] : []),
        ...(step.resultId ? [{ kind: "result" as const, entityId: step.resultId, revision: 1 }] : [])])];
  }
  if (object.kind === "result" && value.format === "material-analysis-result") {
    const item = analysisResultRecord.parse(value);
    return [item.analysisRef, item.taskRef];
  }
  return null;
}

export async function verifyAnalysisObject(object: ObjectRecord, value: unknown, manifest: Manifest,
  read: (object: ObjectRecord) => Promise<unknown>) {
  const refs = analysisReferences(object, value);
  if (!refs) return false;
  const invalid = () => new HostError("PROJECT_INVALID", 409, "Analysis records do not form a complete source history.");
  const lookup = async (ref: ObjectReference) => {
    const target = manifest.objects.find(item => referenceKey(item) === referenceKey(ref));
    if (!target) throw invalid();
    return read(target);
  };
  for (const ref of refs) if (!manifest.objects.some(item => referenceKey(item) === referenceKey(ref))) throw invalid();
  if (object.blobId !== undefined) throw invalid();
  if (object.kind === "analysis") {
    const item = analysisRecord.parse(value);
    if (item.projectId !== manifest.projectId || item.analysisId !== object.entityId || item.revision !== object.revision ||
        object.path !== `data/analyses/${encodeId(item.analysisId)}/${item.revision}.json`) throw invalid();
    if (item.format === "material-analysis") {
      const asset = assetRecord.parse(await lookup(item.basis.assetRef));
      const result = analysisResultRecord.parse(await lookup({ kind: "result", entityId: item.resultId, revision: 1 }));
      if (item.basisDigest !== analysisBasisDigest(item.basis) || !validAnalysisOutput(item.basis, item.output) ||
          asset.sha256 !== item.basis.contentSha256 || referenceKey(asset.mediaRef) !== referenceKey(item.basis.mediaRef) ||
          result.analysisRef.entityId !== item.analysisId || result.taskId !== item.taskId || result.attemptId !== item.attemptId) throw invalid();
    } else {
      const raw = rawAnalysisRecord.parse(await lookup(item.rawRef));
      if (!validSceneCorrection(raw.basis, item.correction)) throw invalid();
      if (item.rawRef.entityId !== item.analysisId || item.rawRef.revision !== 1 || item.previousRef.entityId !== item.analysisId ||
          item.previousRef.revision !== item.revision - 1 || item.correction.intervals.some(interval =>
            interval.range.sourceStartSeconds < raw.basis.range.sourceStartSeconds || interval.range.sourceEndSeconds > raw.basis.range.sourceEndSeconds)) throw invalid();
    }
  } else if (object.kind === "task") {
    const item = analysisTaskRecord.parse(value);
    if (item.projectId !== manifest.projectId || item.taskId !== object.entityId || item.revision !== object.revision ||
        object.path !== `data/tasks/${encodeId(item.taskId)}/${item.revision}.json` ||
        (item.revision === 1 ? item.previousRef !== null : !item.previousRef || item.previousRef.entityId !== item.taskId || item.previousRef.revision !== item.revision - 1) ||
        new Set(item.steps.map(step => step.stepId)).size !== item.steps.length) throw invalid();
    for (const step of item.steps) {
      const asset = assetRecord.parse(await lookup(step.basis.assetRef));
      if (asset.sha256 !== step.basis.contentSha256 || referenceKey(asset.mediaRef) !== referenceKey(step.basis.mediaRef) ||
          (step.status === "succeeded") !== Boolean(step.resultId && step.analysisRef)) throw invalid();
      let end = step.basis.range.sourceStartSeconds;
      for (const checkpoint of step.checkpoints) {
        if (checkpoint.range.sourceStartSeconds !== end || checkpoint.range.sourceEndSeconds > step.basis.range.sourceEndSeconds ||
            !checkpoint.output.complete || !validAnalysisOutput({ ...step.basis, range: checkpoint.range }, checkpoint.output)) throw invalid();
        end = checkpoint.range.sourceEndSeconds;
      }
      if (step.resultId) {
        const result = analysisResultRecord.parse(await lookup({ kind: "result", entityId: step.resultId, revision: 1 }));
        if (result.taskId !== item.taskId || result.attemptId !== step.attemptId ||
            referenceKey(result.analysisRef) !== referenceKey(step.analysisRef!)) throw invalid();
      }
    }
  } else {
    const item = analysisResultRecord.parse(value);
    const task = analysisTaskRecord.parse(await lookup(item.taskRef));
    if (item.projectId !== manifest.projectId || item.resultId !== object.entityId || object.revision !== 1 ||
        object.path !== `data/results/${encodeId(item.resultId)}/1.json` || item.taskRef.entityId !== item.taskId ||
        !task.steps.some(step => step.resultId === item.resultId && step.attemptId === item.attemptId &&
          step.analysisRef && referenceKey(step.analysisRef) === referenceKey(item.analysisRef))) throw invalid();
  }
  return true;
}
