import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { planningTaskRecord } from "./planning-records.ts";
import { emptyRoots, encodeId, type Manifest, type Save } from "./records.ts";
import { writeObject } from "./objects.ts";
import { validateScriptSources } from "./scripts.ts";

export function preparePlanningTask(files: ProjectFiles, projectId: string) {
  return async (current: Manifest | null, save: Save) => {
    const task = planningTaskRecord.parse(save.request);
    const previous = current?.roots.tasks.find(ref => ref.entityId === task.taskId);
    if (task.projectId !== projectId || task.revision !== (previous?.revision ?? 0) + 1 ||
        (previous ? task.previousRef?.entityId !== previous.entityId || task.previousRef?.revision !== previous.revision : task.previousRef !== null)) {
      throw new HostError("REVISION_CONFLICT", 409, "The planning task revision changed.");
    }
    await validateScriptSources(files, current, task.basis);
    if (task.output) await validateScriptSources(files, current, task.output);
    const ref = { kind: "task" as const, entityId: task.taskId, revision: task.revision };
    const object = await writeObject(files, ref, `data/tasks/${encodeId(task.taskId)}/${task.revision}.json`, task);
    const roots = structuredClone(current?.roots ?? emptyRoots());
    roots.tasks = [...roots.tasks.filter(ref => ref.entityId !== task.taskId), ref];
    return { roots, objects: [...(current?.objects ?? []), object], editorSnapshotId: current?.editorSnapshotId ?? null,
      editorSequence: current?.editorSequence ?? null };
  };
}
