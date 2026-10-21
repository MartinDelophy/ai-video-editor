import { z } from "zod";
import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { emptyRoots, encodeId, normalizedBytes, objectReference, referenceKey, sha256, type Manifest, type Save } from "./records.ts";
import { writeObject } from "./objects.ts";
import { readScriptObject, validateScriptSources } from "./scripts.ts";
import { scriptRecord, scriptRef } from "./script-records.ts";

const id = z.string().min(1).max(256), revision = z.number().int().positive().safe();
const operation = z.record(z.string(), z.json());
export const executionStep = z.strictObject({ stepId: id, dependsOn: z.array(id).max(100),
  kind: z.enum(["edit", "voiceover", "transcription"]),
  operations: z.array(operation).max(500), request: operation.nullable() });
export const executionContent = z.strictObject({ intent: z.string().min(1).max(2000), stateToken: id, editorDigest: z.string().length(64),
  scriptRef: scriptRef.nullable(), inputRefs: z.array(objectReference).max(2000),
  sourceMappings: z.array(z.strictObject({ segmentId: id, sourceId: id, clipId: id,
    sourceStartSeconds: z.number().nonnegative(), sourceEndSeconds: z.number().nonnegative(),
    timelineStartSeconds: z.number().nonnegative(), timelineEndSeconds: z.number().nonnegative() })).max(1000),
  steps: z.array(executionStep).min(1).max(100), modelBasis: z.array(operation).max(100), allowModelDownload: z.boolean() });
const attempt = z.strictObject({ attemptId: id, stepId: id,
  status: z.enum(["running", "succeeded", "failed", "cancel_requested", "cancelled", "interrupted", "remote_status_unknown", "registration_pending"]),
  startedAt: z.iso.datetime(), finishedAt: z.iso.datetime().nullable(),
  operations: z.array(operation).max(500), resultRefs: z.array(objectReference).max(1000), error: z.string().max(2000).nullable() });
const planRef = z.strictObject({ kind: z.literal("plan"), entityId: id, revision });
export const executionRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("execution-plan"),
  projectId: id, planId: id, revision, previousRef: planRef.nullable(), content: executionContent,
  digest: z.string().length(64), commandDigest: z.string().length(64), createdAt: z.iso.datetime(),
  authorization: z.strictObject({ authorizationId: id, digest: z.string().length(64), at: z.iso.datetime(), expiresAt: z.iso.datetime() }).nullable(),
  attempts: z.array(attempt).max(1000),
  proposal: z.strictObject({ proposalId: id, previewId: id, previewDigest: z.string().length(64),
    stateToken: id, stepIds: z.array(id).min(1).max(100), at: z.iso.datetime() }).nullable(),
  application: z.strictObject({ previewId: id, transactionId: id, stateToken: id, stepIds: z.array(id).min(1), at: z.iso.datetime() }).nullable() });
export type ExecutionRecord = z.infer<typeof executionRecord>;
export type ExecutionContent = z.infer<typeof executionContent>;
export function executionDigest(content: ExecutionContent) { return sha256(normalizedBytes(content)); }

export function validateExecutionContent(content: ExecutionContent) {
  if (content.sourceMappings.some(mapping => mapping.sourceEndSeconds <= mapping.sourceStartSeconds || mapping.timelineEndSeconds <= mapping.timelineStartSeconds)) {
    throw new HostError("INVALID_ARGUMENT", 400, "Source mappings must use nonempty half-open ranges.");
  }
  const steps = new Map(content.steps.map(step => [step.stepId, step]));
  if (steps.size !== content.steps.length) throw new HostError("INVALID_ARGUMENT", 400, "Duplicate execution step.");
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (stepId: string) => {
    if (visited.has(stepId)) return;
    const step = steps.get(stepId);
    if (!step || visiting.has(stepId) || new Set(step.dependsOn).size !== step.dependsOn.length) {
      throw new HostError("INVALID_ARGUMENT", 400, "Invalid or cyclic plan dependency.");
    }
    visiting.add(stepId);
    for (const dependency of step.dependsOn) visit(dependency);
    visiting.delete(stepId); visited.add(stepId);
    if (step.kind === "edit" ? !step.operations.length || step.request !== null :
      step.operations.length !== 0 || step.request?.kind !== step.kind) {
      throw new HostError("INVALID_ARGUMENT", 400, "Step parameters do not match its capability.");
    }
  };
  content.steps.forEach(step => visit(step.stepId));
}

export async function validateExecutionBasis(files: ProjectFiles, current: Manifest | null, content: ExecutionContent, latest = true) {
  validateExecutionContent(content);
  for (const ref of content.inputRefs) {
    if (!current?.objects.some(object => referenceKey(object) === referenceKey(ref))) throw new HostError("REFERENCE_INVALID", 409, "A plan input is missing.");
    if (latest && ref.kind === "asset" && !current.roots.assets.some(item => referenceKey(item) === referenceKey(ref))) {
      throw new HostError("REFERENCE_STALE", 409, "A plan input was removed or changed.");
    }
  }
  if (content.scriptRef) {
    const script = scriptRecord.parse(await readScriptObject(files, current, content.scriptRef));
    if (!script.confirmed || (latest && !current?.roots.scripts.some(ref => referenceKey(ref) === referenceKey(content.scriptRef!)))) {
      throw new HostError("REFERENCE_STALE", 409, "Confirm the current script before preparing this plan.");
    }
    await validateScriptSources(files, current, script.draft, latest);
  }
}

export const executionReferences = (record: ExecutionRecord) => [
  ...(record.previousRef ? [record.previousRef] : []), ...(record.content.scriptRef ? [record.content.scriptRef] : []),
  ...record.content.inputRefs, ...record.attempts.flatMap(item => item.resultRefs),
];

export function prepareExecutionPlan(files: ProjectFiles, projectId: string) {
  return async (current: Manifest | null, save: Save) => {
    const record = executionRecord.parse(save.request), previous = current?.roots.plans.find(ref => ref.entityId === record.planId);
    if (record.projectId !== projectId || record.revision !== (previous?.revision ?? 0) + 1 ||
      (previous ? !record.previousRef || referenceKey(record.previousRef) !== referenceKey(previous) : record.previousRef !== null) ||
      record.digest !== executionDigest(record.content)) throw new HostError("REVISION_CONFLICT", 409, "Execution plan revision changed.");
    await validateExecutionBasis(files, current, record.content, false);
    for (const ref of executionReferences(record)) if (!current?.objects.some(item => referenceKey(item) === referenceKey(ref))) {
      throw new HostError("REFERENCE_INVALID", 409, "Execution result is not registered.");
    }
    const ref = { kind: "plan" as const, entityId: record.planId, revision: record.revision };
    const object = await writeObject(files, ref, `data/plans/${encodeId(record.planId)}/${record.revision}.json`, record);
    const roots = structuredClone(current?.roots ?? emptyRoots());
    roots.plans = [...roots.plans.filter(item => item.entityId !== record.planId), ref];
    return { roots, objects: [...(current?.objects ?? []), object], editorSnapshotId: current?.editorSnapshotId ?? null,
      editorSequence: current?.editorSequence ?? null };
  };
}
