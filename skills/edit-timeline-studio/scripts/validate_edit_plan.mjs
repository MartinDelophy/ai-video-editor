#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) {
  console.error("Usage: validate_edit_plan.mjs <plan.json>");
  process.exit(2);
}

const fail = (message) => {
  console.error(`Invalid edit plan: ${message}`);
  process.exit(1);
};

let plan;
try {
  plan = JSON.parse(await readFile(path, "utf8"));
} catch (error) {
  fail(error instanceof Error ? error.message : "cannot read JSON");
}

if (plan?.schemaVersion !== 1) fail("schemaVersion must be 1");
if (typeof plan.project !== "string" || !plan.project.trim()) fail("project must be a non-empty path");
if (!Number.isInteger(plan.baseRevision) || plan.baseRevision < 0) fail("baseRevision must be a non-negative integer");
if (!Array.isArray(plan.operations) || plan.operations.length === 0) fail("operations must be a non-empty array");

const ids = new Set();
for (const [index, operation] of plan.operations.entries()) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) fail(`operations[${index}] must be an object`);
  if (typeof operation.id !== "string" || !operation.id.trim()) fail(`operations[${index}].id is required`);
  if (ids.has(operation.id)) fail(`duplicate operation id: ${operation.id}`);
  ids.add(operation.id);
  if (typeof operation.type !== "string" || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(operation.type)) {
    fail(`operations[${index}].type must use namespace.action format`);
  }
  for (const [key, value] of Object.entries(operation)) {
    if (/(?:time|start|end|duration|sourceIn|sourceOut)$/i.test(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      fail(`operations[${index}].${key} must be a finite non-negative number`);
    }
  }
}

console.log(`Valid edit plan: ${plan.operations.length} operation(s), base revision ${plan.baseRevision}`);
