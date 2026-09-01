export const GENERATION_PROVIDER_SCHEMA_VERSION = 1;

export const GENERATION_CAPABILITIES = new Set([
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "workflow-image",
  "workflow-video",
]);

const RUNTIMES = new Set(["browser-session", "loopback", "secure-backend"]);
const AUTH_MODES = new Set(["none", "provider-session", "user-credential", "backend"]);

export function defineGenerationProvider(definition) {
  if (definition?.schemaVersion !== GENERATION_PROVIDER_SCHEMA_VERSION) {
    throw new Error(`Unsupported generation provider schema: ${definition?.schemaVersion}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id || "")) {
    throw new Error(`Invalid generation provider id: ${definition?.id}`);
  }
  if (!RUNTIMES.has(definition.runtime)) throw new Error(`Invalid generation provider runtime: ${definition.runtime}`);
  if (!AUTH_MODES.has(definition.auth)) throw new Error(`Invalid generation provider auth mode: ${definition.auth}`);
  if (!Array.isArray(definition.capabilities) || definition.capabilities.some((item) => !GENERATION_CAPABILITIES.has(item))) {
    throw new Error(`Invalid generation provider capabilities: ${definition.id}`);
  }
  return Object.freeze({ ...definition, capabilities: Object.freeze([...definition.capabilities]) });
}

export function createInitialConnections(providers) {
  return Object.fromEntries(providers.map((provider) => [provider.id, {
    state: "disconnected",
    endpoint: provider.defaultEndpoint || "",
    user: null,
    error: "",
    errorCode: "",
  }]));
}

export function createIdleGenerationJob() {
  return { state: "idle", providerId: "", progress: null, message: "", assetId: "" };
}
