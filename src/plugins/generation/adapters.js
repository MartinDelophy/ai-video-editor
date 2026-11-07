import { createComfyUIAdapter } from "./providers/comfyui/adapter.js";
import { createWebUIAdapter } from "./providers/webui/adapter.js";

const ADAPTERS = new Map([
  ["comfyui", createComfyUIAdapter()],
  ["webui", createWebUIAdapter()],
]);

let puterPreparation;

// Prepare before the sign-in button is enabled; connect itself must run
// synchronously inside the user's click to open the real Puter popup.
export function preparePuterAdapter() {
  puterPreparation ??= import("./providers/puter/adapter.js")
    .then(({ createPuterAdapter }) => {
      ADAPTERS.set("puter", createPuterAdapter());
    })
    .catch((error) => {
      puterPreparation = null;
      throw error;
    });
  return puterPreparation;
}

export function getGenerationAdapter(providerId) {
  const adapter = ADAPTERS.get(providerId);
  if (!adapter) throw new Error(`No generation adapter registered for ${providerId}`);
  return adapter;
}
