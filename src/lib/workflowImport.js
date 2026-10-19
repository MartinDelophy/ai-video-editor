/** Retry only this app's failed workspace module, bypassing the browser's rejected module-map entry. */
export function workflowRetryUrl(error, kind, attempt, base, development = false) {
  if (!attempt || !["canvas", "storyboard", "blockout"].includes(kind)) return null;
  const match = String(error?.message || "").match(/https?:\/\/[^\s'"<>]+/);
  if (!match) return null;
  let url;
  try { url = new URL(match[0]); } catch { return null; }
  const owner = new URL(base);
  const stem = { canvas: "CanvasWorkspace", storyboard: "StoryboardWorkspace", blockout: "BlockoutWorkspace" }[kind];
  const productionPath = url.pathname.startsWith(new URL("assets/", owner).pathname) && new RegExp(`/${stem}-[\\w-]+\\.js$`).test(url.pathname);
  const developmentPath = development && url.pathname.endsWith(`/src/components/${stem}.jsx`);
  if (url.origin !== owner.origin || !(productionPath || developmentPath)) return null;
  url.searchParams.set("workflow-retry", String(attempt));
  return url.href;
}

export async function loadWorkflowModule(loader, kind, attempt) {
  try { return await loader(); } catch (error) {
    const retry = workflowRetryUrl(error, kind, attempt, document.baseURI, import.meta.env?.DEV);
    if (!retry) throw error;
    const module = await import(/* @vite-ignore */ retry);
    const name = { canvas: "CanvasWorkspace", storyboard: "StoryboardWorkspace", blockout: "BlockoutWorkspace" }[kind];
    if (typeof module[name] !== "function") throw error;
    return { default: module[name] };
  }
}
