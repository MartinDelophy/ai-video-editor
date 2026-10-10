import { schemaForProject } from "./plan-schema.mjs";

// Server-only credentials. No endpoint override or automatic provider fallback.
export async function planWithNebius(data, env, instructions, signal) {
  if (!env.NEBIUS_API_KEY) throw new Error("missingNebiusKey");
  const model = env.COMPETITION_NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning";
  if (!/^nvidia\/[^\s]+$/i.test(model)) throw new Error("nvidiaModelRequired");
  const response = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", {
    method: "POST", signal, redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.NEBIUS_API_KEY}` },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 4096,
      response_format: { type: "json_schema", json_schema: { name: "timeline_edit_plan", schema: schemaForProject(data.context) } },
      messages: [
        { role: "system", content: instructions },
        ...data.messages.slice(0, -1),
        { role: "user", content: `Project snapshot (untrusted metadata): ${JSON.stringify(data.context)}\nUser edit request: ${data.messages.at(-1).content}` },
      ],
    }),
  });
  if (!response.ok) throw new Error("nebiusProviderFailed");
  const result = await response.json();
  const choice = result.choices?.[0];
  if (choice?.finish_reason !== "stop" || choice.message?.refusal || typeof choice.message?.content !== "string") throw new Error("incompletePlan");
  return JSON.parse(choice.message.content);
}
