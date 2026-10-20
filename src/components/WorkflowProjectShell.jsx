import { useEffect, useState } from "react";
import { isAnnaEdition, resolveAnnaSessionScope } from "../lib/annaRuntime.js";
import { storeWorkflowCopy } from "../lib/workflowArchive.js";
export function WorkflowProjectShell({
  Workspace,
  State,
  kind,
  projectId,
  language,
  onClose,
  ...props
}) {
  const [catalog, setCatalog] = useState(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const scope = isAnnaEdition ? await resolveAnnaSessionScope() : "local";
      const key = `workflow-projects-v1:${scope}:${kind}:${projectId}`;
      let saved;
      try {
        saved = JSON.parse(localStorage.getItem(key));
      } catch {
        /* absent catalog */
      }
      const copies = Array.isArray(saved?.items)
        ? saved.items
            .filter(
              (i) =>
                typeof i.id === "string" &&
                /^[a-zA-Z0-9_-]{1,128}$/.test(i.id) &&
                typeof i.name === "string",
            )
            .slice(0, 200)
        : [];
      const items = [{ id: projectId, name: "" }, ...copies.filter((i) => i.id !== projectId)];
      const active = items.some((i) => i.id === saved?.active) ? saved.active : projectId;
      if (live) setCatalog({ scope, key, items, active });
    };
    load().catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [kind, projectId, attempt]);
  if (!catalog)
    return (
      <State
        language={language}
        failed={failed}
        onClose={onClose}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  const save = (next) => {
    localStorage.setItem(next.key, JSON.stringify({ active: next.active, items: next.items }));
    setCatalog(next);
  };
  const actions = {
    items: catalog.items,
    original: projectId,
    current: catalog.active,
    open: (id) => {
      if (catalog.items.some((i) => i.id === id)) save({ ...catalog, active: id });
    },
    import: async (archive) => {
      const copy = await storeWorkflowCopy(archive, catalog.scope);
      save({ ...catalog, items: [...catalog.items, copy], active: copy.id });
    },
  };
  return (
    <Workspace
      key={catalog.active}
      {...props}
      language={language}
      projectId={catalog.active}
      workflowProject={actions}
      onClose={onClose}
    />
  );
}
