import { z } from "zod";
import { scriptContent, scriptDraft, scriptRef, scriptHarnessProvider } from "./script-records.ts";
import { planningExecutionConfig } from "../planning-provider.ts";
const id = z.string().min(1).max(256);
export const planningTaskRecord = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("script-planning-task"),
  projectId: id, taskId: id, revision: z.number().int().positive().safe(), attemptId: id,
  previousRef: z.strictObject({ kind: z.literal("task"), entityId: id, revision: z.number().int().positive().safe() }).nullable(),
  status: z.enum(["prepared", "dispatched", "remote_unknown", "output_ready", "registered", "failed"]),
  provider: planningExecutionConfig, requestDigest: z.string().length(64), inputDigest: z.string().length(64), inputText: z.string().max(2_000_000),
  groups: z.array(z.strictObject({ inputText: z.string().max(2_000_000), digest: z.string().length(64),
    output: scriptContent.nullable(), remoteId: z.string().max(512).nullable() })).max(1000),
  activeGroup: z.number().int().nonnegative().nullable(),
  basis: scriptDraft, output: scriptDraft.nullable(), remoteId: z.string().max(512).nullable(), scriptRef: scriptRef.nullable(),
  error: z.string().max(1024), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export type PlanningTask = z.infer<typeof planningTaskRecord>;

export const agentPlanningOutput = z.strictObject({ groupIndex: z.number().int().nonnegative().max(999).nullable(),
  inputDigest: z.string().length(64), content: scriptContent, remoteId: z.string().max(512).nullable() });
export const agentPlanningStep = z.strictObject({ taskId: id, status: planningTaskRecord.shape.status,
  source: scriptHarnessProvider, scriptRef: scriptRef.nullable(),
  next: z.strictObject({ groupIndex: z.number().int().nonnegative().nullable(), inputDigest: z.string().length(64),
    inputText: z.string().max(2_000_000), instructions: z.string() }).nullable() });
