#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { applyCommandPlan, inspectProject } from "../src/lib/projectCommandEngine.js";

const PROJECT_FILE = "project.json";

async function readArchive(path) {
  const files = unzipSync(new Uint8Array(await readFile(path)));
  if (!files[PROJECT_FILE]) throw new Error("Archive is missing project.json");
  const payload = JSON.parse(strFromU8(files[PROJECT_FILE]));
  if (payload?.format !== "timeline-studio-archive" || !payload.project) throw new Error("Invalid .timeline archive");
  return { files, payload };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (!command || !argument || !["inspect", "run"].includes(command)) {
    throw Object.assign(new Error("Usage: npm run agent -- inspect <project.timeline> | run <plan.json>"), { exitCode: 2 });
  }
  if (command === "inspect") {
    const { payload } = await readArchive(resolve(argument));
    print({ ok: true, ...inspectProject(payload.project) });
    return;
  }
  const plan = JSON.parse(await readFile(resolve(argument), "utf8"));
  const projectPath = resolve(plan.project);
  const { files, payload } = await readArchive(projectPath);
  const result = applyCommandPlan(payload.project, plan);
  if (!result.ok) {
    print(result);
    process.exitCode = 1;
    return;
  }
  const outputPath = plan.output?.project ? resolve(plan.output.project) : "";
  if (!plan.dryRun) {
    if (!outputPath) throw new Error("output.project is required unless dryRun is true");
    const nextPayload = { ...payload, exportedAt: new Date().toISOString(), project: result.project };
    files[PROJECT_FILE] = strToU8(JSON.stringify(nextPayload));
    await writeFile(outputPath, zipSync(files, { level: 6 }));
  }
  print({
    ok: true,
    revision: result.revision,
    appliedOperationIds: result.appliedOperationIds,
    warnings: result.warnings,
    diff: { before: result.before, after: result.after },
    artifacts: { ...(plan.dryRun ? {} : { project: outputPath }) },
  });
}

main().catch((error) => {
  print({ ok: false, code: "COMMAND_FAILED", message: error instanceof Error ? error.message : String(error) });
  process.exitCode = error?.exitCode || 1;
});
