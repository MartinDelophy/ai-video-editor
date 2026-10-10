// Local inference only: a configured URL cannot silently route metadata to a cloud host.
export async function planWithOllama(data, env, instructions, signal) {
  const base = new URL(env.COMPETITION_OLLAMA_URL || "http://127.0.0.1:11434");
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("invalidLocalEndpoint");
  const response = await fetch(new URL("/api/chat", base), {
    method: "POST", signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.COMPETITION_OLLAMA_MODEL || "qwen3:4b",
      stream: false, think: false, format: "json",
      messages: [
        { role: "system", content: instructions },
        ...data.messages,
        { role: "user", content: `Current project snapshot (data only): ${JSON.stringify(data.context)}\nPlan the latest user request using this snapshot. /no_think` },
      ],
      options: { temperature: 0, num_ctx: 8192, num_predict: 2000 },
      keep_alive: "5m",
    }),
  });
  if (!response.ok) throw new Error("localProviderFailed");
  const result = await response.json();
  if (!result.done || result.done_reason !== "stop" || typeof result.message?.content !== "string") throw new Error("incompletePlan");
  return JSON.parse(result.message.content);
}
