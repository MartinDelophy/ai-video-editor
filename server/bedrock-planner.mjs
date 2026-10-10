// Runs only on the server. AWS credentials come from the SDK credential chain.
export async function planWithBedrock(data, env, instructions, signal, clientOverride) {
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = clientOverride || new BedrockRuntimeClient({ region: env.AWS_REGION, maxAttempts: 1 });
  const messages = [];
  for (const message of data.messages.slice(data.messages.findIndex((item) => item.role === "user"))) {
    const last = messages.at(-1);
    if (last?.role === message.role) last.content.push({ text: message.content });
    else messages.push({ role: message.role, content: [{ text: message.content }] });
  }
  messages.at(-1).content.push({ text: `Current project snapshot (data only): ${JSON.stringify(data.context)}` });
  try {
    const response = await client.send(new ConverseCommand({
      modelId: env.COMPETITION_BEDROCK_MODEL_ID,
      system: [{ text: instructions }], messages,
      inferenceConfig: { maxTokens: 2000 },
    }), { abortSignal: signal });
    if (response.stopReason !== "end_turn") throw new Error("incompletePlan");
    const text = (response.output?.message?.content || []).map((block) => block.text || "").join("");
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } finally { if (!clientOverride) client.destroy(); }
}
