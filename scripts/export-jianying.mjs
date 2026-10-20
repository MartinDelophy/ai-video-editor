#!/usr/bin/env node
import { parseArgs } from "node:util";

const help = `Export the latest committed Timeline Studio editor snapshot to a domestic Jianying Pro draft (macOS).

Usage:
  TIMELINE_STUDIO_PAGE_BEARER=<existing-page-bearer> node scripts/export-jianying.mjs \\
    --host http://127.0.0.1:<port> --project <projectId> --request-id <stable-id> \\
    [--name <new-draft-name>] [--output-dir <existing-absolute-parent>]

The project must already be open in that authenticated page. This CLI does not
bootstrap sessions or save the editor. Supply the bearer locally via environment,
never via command arguments, URLs, logs, or agent messages. No automatic retries.
Reuse request-id only for the identical request. Existing output is never replaced.
Quit Jianying Pro 11.6.0 before exporting. Referenced media is packaged into the new draft.
`;

try {
  const { values } = parseArgs({ options: {
    help: { type: "boolean", short: "h" }, host: { type: "string" }, project: { type: "string" },
    "request-id": { type: "string" }, name: { type: "string" }, "output-dir": { type: "string" },
  } });
  if (values.help) {
    process.stdout.write(help);
  } else {
    const host = new URL(values.host || "");
    if (host.protocol !== "http:" || host.hostname !== "127.0.0.1" || !host.port || host.username || host.password ||
        host.pathname !== "/" || host.search || host.hash) throw new Error("--host must be an exact http://127.0.0.1:<port> origin.");
    if (!values.project || !values["request-id"] || values["request-id"].length > 128) throw new Error("--project and --request-id (1–128 characters) are required.");
    const bearer = process.env.TIMELINE_STUDIO_PAGE_BEARER;
    if (!bearer) throw new Error("Set TIMELINE_STUDIO_PAGE_BEARER locally for an existing authenticated page.");
    const response = await fetch(`${host.origin}/api/v1/projects/${encodeURIComponent(values.project)}/jianying-export`, {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", "X-Timeline-Studio-Protocol-Version": "1",
        Origin: host.origin, "Sec-Fetch-Site": "same-origin", Authorization: `Bearer ${bearer}`,
        "Idempotency-Key": values["request-id"] },
      body: JSON.stringify({ ...(values.name === undefined ? {} : { draftName: values.name }),
        ...(values["output-dir"] === undefined ? {} : { outputDir: values["output-dir"] }) }),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new Error(`Export failed (HTTP ${response.status}, ${result.error?.code || "UNKNOWN"}). Inspect the host/project state before retrying.`);
    }
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  }
} catch (error) {
  // Do not print fetch request/cause objects: they can contain the Authorization header.
  process.stderr.write(`${error instanceof TypeError ? "Invalid host URL or loopback request failed." : error.message}\n`);
  process.exitCode = 1;
}
