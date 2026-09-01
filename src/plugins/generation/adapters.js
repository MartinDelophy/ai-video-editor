import { createComfyUIAdapter } from "./providers/comfyui/adapter.js";
import { createPuterAdapter } from "./providers/puter/adapter.js";
import { createWebUIAdapter } from "./providers/webui/adapter.js";

const ADAPTERS = new Map([
  ["puter", createPuterAdapter()],
  ["comfyui", createComfyUIAdapter()],
  ["webui", createWebUIAdapter()],
]);

export function getGenerationAdapter(providerId) {
  const adapter = ADAPTERS.get(providerId);
  if (!adapter) throw new Error(`No generation adapter registered for ${providerId}`);
  return adapter;
}
