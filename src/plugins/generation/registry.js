import { annaManifest } from "./providers/anna/manifest.js";
import { isAnnaEdition } from "../../lib/annaRuntime.js";
import { comfyuiManifest } from "./providers/comfyui/manifest.js";
import { puterManifest } from "./providers/puter/manifest.js";
import { webuiManifest } from "./providers/webui/manifest.js";

export const GENERATION_PROVIDERS = Object.freeze([...(isAnnaEdition ? [annaManifest] : [puterManifest]), comfyuiManifest, webuiManifest]);

const PROVIDERS_BY_ID = new Map(GENERATION_PROVIDERS.map((provider) => [provider.id, provider]));

export function getGenerationProvider(providerId) {
  const provider = PROVIDERS_BY_ID.get(providerId);
  if (!provider) throw new Error(`Unknown generation provider: ${providerId}`);
  return provider;
}
