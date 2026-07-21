import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("timeline command CLI", () => {
  it("dry-runs and writes a new archive while preserving media entries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeline-command-"));
    const input = join(directory, "input.timeline");
    const output = join(directory, "output.timeline");
    const planPath = join(directory, "plan.json");
    const payload = {
      format: "timeline-studio-archive",
      version: 2,
      project: {
        audioSegments: [{ id: "voice", start: 0, duration: 2 }],
        captionSegments: [{ id: "caption", text: "Old", start: 0, end: 2, audioSegmentId: "voice" }],
      },
      media: {},
    };
    await writeFile(input, zipSync({ "project.json": strToU8(JSON.stringify(payload)), "media/audio/voice.wav": new Uint8Array([1, 2, 3]) }));
    const basePlan = {
      schemaVersion: 1,
      project: input,
      baseRevision: 0,
      operations: [{ id: "edit-caption", type: "caption.update", clipId: "caption", text: "New" }],
      output: { project: output },
    };
    await writeFile(planPath, JSON.stringify({ ...basePlan, dryRun: true }));
    const dryRun = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "run", planPath], { cwd: process.cwd() })).stdout);
    expect(dryRun).toMatchObject({ ok: true, revision: 1, artifacts: {} });
    await expect(readFile(output)).rejects.toThrow();

    await writeFile(planPath, JSON.stringify({ ...basePlan, dryRun: false }));
    const run = JSON.parse((await execute(process.execPath, ["scripts/timeline-command.mjs", "run", planPath], { cwd: process.cwd() })).stdout);
    expect(run.artifacts.project).toBe(output);
    const files = unzipSync(new Uint8Array(await readFile(output)));
    expect([...files["media/audio/voice.wav"]]).toEqual([1, 2, 3]);
    expect(JSON.parse(strFromU8(files["project.json"])).project).toMatchObject({
      captionSegments: [{ id: "caption", text: "New" }],
      commandState: { revision: 1, appliedOperationIds: ["edit-caption"] },
    });
  });
});
