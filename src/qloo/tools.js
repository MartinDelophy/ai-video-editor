// Progressive enhancement only: no simulated agent connection.
let queue = Promise.resolve();
export function registerTasteTools(api) {
  const context = document.modelContext?.registerTool
    ? document.modelContext
    : navigator.modelContext;
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  let disposed = false;
  const names = [];
  const tools = [
    {
      name: "qloo_search_cultural_reference",
      description:
        "Resolve a cultural reference to Qloo entity candidates. Confirm the intended entity before planning.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", maxLength: 120 } },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (input) => ({
        content: [
          { type: "text", text: JSON.stringify(await api("search", input, controller.signal)) },
        ],
      }),
    },
    {
      name: "qloo_grounded_video_brief",
      description:
        "Retrieve real Qloo movie affinities and propose a reviewable video brief. Returns evidence and explicitly labeled model or rule suggestions; never edits a timeline.",
      inputSchema: {
        type: "object",
        properties: {
          entityIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
          type: { type: "string", enum: ["movie"] },
          brief: { type: "string", maxLength: 1600 },
          language: {
            type: "string",
            enum: ["zh", "en", "ja", "ko", "es", "fr", "de", "pt", "th", "vi", "ru", "it", "id"],
          },
        },
        required: ["entityIds", "type", "brief", "language"],
        additionalProperties: false,
      },
      execute: async (input) => ({
        content: [
          { type: "text", text: JSON.stringify(await api("direct", input, controller.signal)) },
        ],
      }),
    },
  ];
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (disposed) return;
      for (const tool of tools) {
        if (disposed) break;
        await context.registerTool(tool, { signal: controller.signal });
        names.push(tool.name);
      }
    })
    .catch(() => {});
  return () => {
    disposed = true;
    controller.abort();
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (context === navigator.modelContext && context.unregisterTool)
          for (const name of names) await context.unregisterTool(name);
      })
      .catch(() => {});
  };
}
