import { z } from "zod";
import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { assetRecord } from "./assets.ts";
import { snapshotRecord, validateSnapshot } from "./snapshots.ts";
import { tombstoneRecord } from "./trash.ts";
import { analysisReferences, verifyAnalysisObject } from "./analysis-closure.ts";
import { semanticReferences, verifySemanticObject } from "./semantic-closure.ts";
import { classificationRecord, scriptRecord, scriptDigest } from "./script-records.ts";
import { validateScriptSources } from "./scripts.ts";
import { planningTaskRecord } from "./planning-records.ts";
import { executionRecord, executionDigest, executionReferences, validateExecutionBasis } from "./execution-plans.ts";
import { encodeId, referenceKey, sha256, type Manifest, type ObjectRecord, type ObjectReference } from "./records.ts";

const resultRecord = z.strictObject({ schemaVersion: z.literal(1), projectId: z.string(), resultId: z.string(), revision: z.literal(1),
  taskId: z.string(), attemptId: z.string(), registration: z.literal("registered"),
  artifacts: z.array(z.strictObject({ artifactId: z.string(), mediaRef: assetRecord.shape.mediaRef })).min(1) });
const taskRecord = z.strictObject({ schemaVersion: z.literal(1), projectId: z.string(), taskId: z.string(), revision: z.literal(1),
  status: z.literal("succeeded"), steps: z.array(z.strictObject({ stepId: z.string(), attemptId: z.string(),
    status: z.literal("succeeded"), resultId: z.string() })).min(1) });

export async function verifyProjectClosure(files: ProjectFiles, manifest: Manifest) {
  const invalid = () => new HostError("PROJECT_INVALID", 409, "Project entity references do not form a complete save point.");
  const objects = new Map(manifest.objects.map(object => [referenceKey(object), object]));
  const rootKinds = { assets: "asset", analyses: "analysis", scripts: "script", plans: "plan", tasks: "task", results: "result",
    editorSnapshots: "editor-snapshot", trash: "trash", resources: "resource" } as const;
  for (const [collection, kind] of Object.entries(rootKinds)) {
    const ids = new Set<string>();
    for (const ref of manifest.roots[collection as keyof typeof rootKinds]) {
      if (ref.kind !== kind || ids.has(ref.entityId) || !objects.has(referenceKey(ref))) throw invalid();
      ids.add(ref.entityId);
    }
  }
  if (manifest.roots.editorSnapshots.length !== (manifest.editorSnapshotId === null ? 0 : 1)) throw invalid();
  const read = async (object: ObjectRecord): Promise<unknown> => {
    const bytes = await files.read(object.path);
    if (bytes.length !== object.sizeBytes || sha256(bytes) !== object.sha256) throw invalid();
    try { return JSON.parse(bytes.toString("utf8")); } catch { throw invalid(); }
  };
  const results = new Map<string, z.infer<typeof resultRecord>>();
  const tasks = new Map<string, z.infer<typeof taskRecord>>();
  const deletedAssets = new Set<string>();
  for (const object of manifest.objects) {
    if (object.kind === "plan") {
      const item = executionRecord.parse(await read(object));
      if (item.projectId !== manifest.projectId || item.planId !== object.entityId || item.revision !== object.revision ||
          object.blobId !== undefined || object.path !== `data/plans/${encodeId(item.planId)}/${item.revision}.json` ||
          item.digest !== executionDigest(item.content) || executionReferences(item).some(ref => !objects.has(referenceKey(ref)))) throw invalid();
      await validateExecutionBasis(files, manifest, item.content, false);
      continue;
    }
    if (object.kind === "analysis") {
      const parsed = classificationRecord.safeParse(await read(object));
      if (parsed.success) {
        const item = parsed.data;
        if (item.projectId !== manifest.projectId || item.analysisId !== object.entityId || item.revision !== object.revision ||
            object.path !== `data/analyses/${encodeId(item.analysisId)}/${item.revision}.json` || object.blobId !== undefined ||
            item.sources.some(source => ![source.assetRef, source.mediaRef, ...(source.analysisRef ? [source.analysisRef] : [])].every(ref => objects.has(referenceKey(ref))))) throw invalid();
        continue;
      }
    }
    if (object.kind === "task") {
      const parsed = planningTaskRecord.safeParse(await read(object));
      if (parsed.success) {
        const item = parsed.data;
        if (item.projectId !== manifest.projectId || item.taskId !== object.entityId || item.revision !== object.revision ||
            object.path !== `data/tasks/${encodeId(item.taskId)}/${item.revision}.json` || object.blobId !== undefined ||
            (item.previousRef && !objects.has(referenceKey(item.previousRef))) || (item.scriptRef && !objects.has(referenceKey(item.scriptRef)))) throw invalid();
        await validateScriptSources(files, manifest, item.basis);
        if (item.output) await validateScriptSources(files, manifest, item.output);
        continue;
      }
    }
    if (["analysis", "task", "result"].includes(object.kind) &&
        await verifySemanticObject(object, await read(object), manifest, read)) continue;
    if (["analysis", "task", "result"].includes(object.kind) &&
        await verifyAnalysisObject(object, await read(object), manifest, read)) continue;
    if (object.kind === "media") {
      const prefix = object.blobId ? `media/${encodeId(object.entityId)}/${encodeId(object.blobId)}.` : "";
      if (!object.blobId || object.revision !== undefined || !object.sizeBytes ||
          !object.path.startsWith(prefix) || !object.path.slice(prefix.length) || object.path.slice(prefix.length).includes("/") ||
          !manifest.objects.some(item => item.kind === "asset" && item.entityId === object.entityId)) throw invalid();
    } else if (object.kind === "asset") {
      const parsed = assetRecord.safeParse(await read(object));
      if (!parsed.success) throw invalid();
      const asset = parsed.data, media = objects.get(referenceKey(asset.mediaRef));
      if (asset.projectId !== manifest.projectId || asset.assetId !== object.entityId || asset.revision !== object.revision ||
          object.blobId !== undefined || object.path !== `data/assets/${encodeId(asset.assetId)}/${asset.revision}.json` ||
          asset.mediaRef.entityId !== asset.assetId || !media || media.sizeBytes !== asset.sizeBytes || media.sha256 !== asset.sha256) throw invalid();
    } else if (object.kind === "trash") {
      const parsed = tombstoneRecord.safeParse(await read(object));
      if (!parsed.success) throw invalid();
      const item = parsed.data;
      if (item.assetObject && (referenceKey(item.assetObject) !== referenceKey(item.assetRef) ||
          item.assetObject.path !== `data/assets/${encodeId(item.assetId)}/${item.assetRef.revision}.json`)) throw invalid();
      if (item.media && (item.media.kind !== "media" || item.media.entityId !== item.assetId || !item.media.blobId ||
          item.media.revision !== undefined || !item.media.path.startsWith(`media/${encodeId(item.assetId)}/${encodeId(item.media.blobId)}.`) ||
          item.media.path.slice(`media/${encodeId(item.assetId)}/`.length).includes("/"))) throw invalid();
      if (item.projectId !== manifest.projectId || item.tombstoneId !== object.entityId || item.revision !== object.revision ||
          object.blobId !== undefined || item.assetRef.entityId !== item.assetId || item.assetRef.blobId !== undefined ||
          object.path !== `data/trash/${encodeId(item.tombstoneId)}/${item.revision}.json` ||
          (!item.restoredAt && !item.purgeRequestedAt && !objects.has(referenceKey(item.assetRef)))) throw invalid();
      if (!item.restoredAt) {
        if (deletedAssets.has(item.assetId) || manifest.roots.assets.some(ref => ref.entityId === item.assetId)) throw invalid();
        deletedAssets.add(item.assetId);
      }
    } else if (object.kind === "editor-snapshot") {
      const parsed = snapshotRecord.safeParse(await read(object));
      if (!parsed.success) throw invalid();
      const snapshot = parsed.data;
      if (snapshot.projectId !== manifest.projectId || snapshot.editorSnapshotId !== object.entityId || object.revision !== undefined ||
          object.blobId !== undefined || object.path !== `data/editor-snapshots/${encodeId(object.entityId)}.json` ||
          (object.entityId === manifest.editorSnapshotId && snapshot.editorSequence !== manifest.editorSequence)) throw invalid();
      validateSnapshot(snapshot, manifest);
    } else if (object.kind === "script") {
      const item = scriptRecord.parse(await read(object));
      if (item.projectId !== manifest.projectId || item.scriptId !== object.entityId || item.revision !== object.revision ||
          object.blobId !== undefined || object.path !== `data/scripts/${encodeId(item.scriptId)}/${item.revision}.json` ||
          item.digest !== scriptDigest(item.draft) ||
          (item.confirmed && (item.confirmed.revision !== item.revision || item.confirmed.digest !== item.digest)) ||
          (item.revision === 1 ? item.previousRef !== null : !item.previousRef || item.previousRef.entityId !== item.scriptId ||
            item.previousRef.revision !== item.revision - 1 || !objects.has(referenceKey(item.previousRef)))) throw invalid();
      await validateScriptSources(files, manifest, item.draft);
      const classificationObject = objects.get(referenceKey(item.classificationRef));
      if (!classificationObject) throw invalid();
      const classification = classificationRecord.parse(await read(classificationObject));
      if (JSON.stringify(classification.items) !== JSON.stringify(item.draft.content.classifications) ||
          JSON.stringify(classification.sources) !== JSON.stringify(item.draft.sources)) throw invalid();
    } else if (object.kind === "result") {
      const parsed = resultRecord.safeParse(await read(object));
      if (!parsed.success) throw invalid();
      const result = parsed.data;
      if (result.projectId !== manifest.projectId || result.resultId !== object.entityId || result.revision !== object.revision ||
          object.blobId !== undefined || object.path !== `data/results/${encodeId(object.entityId)}/${result.revision}.json`) throw invalid();
      const artifacts = new Set<string>();
      for (const artifact of result.artifacts) {
        if (artifacts.has(artifact.artifactId) || !objects.has(referenceKey(artifact.mediaRef))) throw invalid();
        artifacts.add(artifact.artifactId);
      }
      results.set(result.resultId, result);
    } else if (object.kind === "task") {
      const parsed = taskRecord.safeParse(await read(object));
      if (!parsed.success) throw invalid();
      const task = parsed.data;
      if (task.projectId !== manifest.projectId || task.taskId !== object.entityId || task.revision !== object.revision ||
          object.blobId !== undefined || object.path !== `data/tasks/${encodeId(object.entityId)}/${task.revision}.json`) throw invalid();
      tasks.set(task.taskId, task);
    }
  }
  for (const task of tasks.values()) {
    const steps = new Set<string>();
    for (const step of task.steps) {
      const result = results.get(step.resultId);
      if (steps.has(step.stepId) || !result || result.taskId !== task.taskId || result.attemptId !== step.attemptId) throw invalid();
      steps.add(step.stepId);
    }
  }
  for (const result of results.values()) {
    if (!tasks.get(result.taskId)?.steps.some(step => step.resultId === result.resultId && step.attemptId === result.attemptId)) throw invalid();
  }
}

// Historical records do not keep every older snapshot and media revision alive.
// Unknown domain records remain protected until their own reference rules exist.
export async function retainProjectClosure(files: ProjectFiles, manifest: Manifest) {
  const objects = new Map(manifest.objects.map(item => [referenceKey(item), item]));
  if (objects.size !== manifest.objects.length) throw new HostError("PROJECT_INVALID", 409, "Duplicate project object identities.");
  const retained = new Set<string>(), pending: ObjectReference[] = Object.values(manifest.roots).flat();
  while (pending.length) {
    const ref = pending.pop()!, key = referenceKey(ref);
    if (retained.has(key)) continue;
    const object = objects.get(key);
    if (!object) throw new HostError("REFERENCE_INVALID", 409, "A retained project reference is missing.");
    retained.add(key);
    if (object.kind === "media") {
      const asset = manifest.objects.filter(item => item.kind === "asset" && item.entityId === object.entityId)
        .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0];
      if (!asset) throw new HostError("REFERENCE_INVALID", 409, "Retained media has no asset metadata.");
      pending.push(asset);
      continue;
    }
    if (!["asset", "analysis", "script", "plan", "editor-snapshot", "trash", "result", "task"].includes(object.kind)) {
      pending.push(...manifest.objects);
      continue;
    }
    const bytes = await files.read(object.path);
    if (bytes.length !== object.sizeBytes || sha256(bytes) !== object.sha256) throw new HostError("PROJECT_INVALID", 409, "Project metadata is damaged.");
    const value = JSON.parse(bytes.toString("utf8"));
    if (object.kind === "plan") { pending.push(...executionReferences(executionRecord.parse(value))); continue; }
    if (object.kind === "analysis" && value.format === "script-classification") {
      for (const source of classificationRecord.parse(value).sources) pending.push(source.assetRef, source.mediaRef, ...(source.analysisRef ? [source.analysisRef] : []));
      continue;
    }
    if (object.kind === "task" && value.format === "script-planning-task") {
      const item = planningTaskRecord.parse(value);
      if (item.previousRef) pending.push(item.previousRef);
      if (item.scriptRef) pending.push(item.scriptRef);
      for (const source of [...item.basis.sources, ...(item.output?.sources ?? [])]) pending.push(source.assetRef, source.mediaRef, ...(source.analysisRef ? [source.analysisRef] : []));
      continue;
    }
    if (object.kind === "script") {
      const item = scriptRecord.parse(value);
      pending.push(item.classificationRef);
      if (item.previousRef) pending.push(item.previousRef);
      for (const source of item.draft.sources) pending.push(source.assetRef, source.mediaRef, ...(source.analysisRef ? [source.analysisRef] : []));
      continue;
    }
    const semanticRefs = semanticReferences(object, value);
    if (semanticRefs) { pending.push(...semanticRefs); continue; }
    const analysisRefs = analysisReferences(object, value);
    if (analysisRefs) { pending.push(...analysisRefs); continue; }
    if (object.kind === "analysis") { pending.push(...manifest.objects); continue; }
    if (object.kind === "asset") pending.push(assetRecord.parse(value).mediaRef);
    else if (object.kind === "editor-snapshot") pending.push(...snapshotRecord.parse(value).refs);
    else if (object.kind === "trash") {
      const item = tombstoneRecord.parse(value);
      if (!item.restoredAt && !item.purgeRequestedAt) pending.push(item.assetRef);
    } else if (object.kind === "result") pending.push(...resultRecord.parse(value).artifacts.map(item => item.mediaRef));
    else if (object.kind === "task") pending.push(...taskRecord.parse(value).steps.map(item => ({ kind: "result" as const, entityId: item.resultId, revision: 1 })));
  }
  return manifest.objects.filter(item => retained.has(referenceKey(item)));
}
