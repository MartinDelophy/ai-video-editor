import {
  connectAnna,
  storeAnnaFile,
  validateAnnaFileDescriptor,
  readAnnaFile,
} from "./annaRuntime.js";
const PREFIX = "timeline-studio/sessions/";
export async function storeWorkflowBackup(blob, kind, { signal } = {}) {
  if (!["canvas", "storyboard"].includes(kind)) throw new Error("INVALID_WORKFLOW");
  return storeAnnaFile({
    blob,
    name: `workflow-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.workflow`,
    kind: "sessions",
    signal,
  });
}
export async function listWorkflowBackups(kind, { cursor, signal } = {}) {
  if (
    !["canvas", "storyboard"].includes(kind) ||
    (cursor != null &&
      (typeof cursor !== "string" ||
        !cursor ||
        cursor.length > 4096 ||
        /[\u0000-\u001f\u007f]/.test(cursor)))
  )
    throw new Error("INVALID_WORKFLOW");
  const runtime = await connectAnna({ signal });
  const page = await runtime.files.list({
    prefix: PREFIX,
    limit: 100,
    ...(cursor ? { cursor } : {}),
  });
  if (
    !Array.isArray(page?.items) ||
    page.items.length > 100 ||
    (page.next_cursor != null &&
      (typeof page.next_cursor !== "string" ||
        !page.next_cursor ||
        page.next_cursor.length > 4096 ||
        /[\u0000-\u001f\u007f]/.test(page.next_cursor)))
  )
    throw new Error("INVALID_RESPONSE");
  const files = [];
  for (const item of page.items) {
    if (typeof item?.path !== "string" || !item.path.startsWith(PREFIX)) continue;
    const name = item.path.split("/").at(-1);
    if (!name.startsWith(`workflow-${kind}-`) || !name.endsWith(".workflow")) continue;
    files.push(
      validateAnnaFileDescriptor(
        {
          path: item.path,
          size: item.size_bytes,
          type: item.content_type,
          etag: item.etag,
          savedAt: item.updated_at,
        },
        { kind: "sessions" },
      ),
    );
  }
  return { files, nextCursor: page.next_cursor || null };
}
export function readWorkflowBackup(file, { signal } = {}) {
  const safe = validateAnnaFileDescriptor(file, { kind: "sessions" });
  if (
    !safe.name.startsWith("workflow-") ||
    !safe.name.endsWith(".workflow") ||
    safe.size > 512 * 1024 * 1024
  )
    throw new Error("INVALID_WORKFLOW");
  return readAnnaFile({ path: safe.path, expectedFile: safe, signal });
}
