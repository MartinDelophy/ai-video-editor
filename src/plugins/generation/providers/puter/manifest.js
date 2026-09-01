import { MagicWand } from "@phosphor-icons/react";
import { defineGenerationProvider } from "../../contract.js";

export const puterManifest = defineGenerationProvider({
  schemaVersion: 1,
  id: "puter",
  displayName: "Puter.js",
  version: "1.0.0",
  runtime: "browser-session",
  auth: "provider-session",
  capabilities: ["text-to-image", "text-to-video"],
  outputTypes: ["image", "video"],
  defaultEndpoint: null,
  connectingState: "authorizing",
  Icon: MagicWand,
  tone: "violet",
  badges: ["T2V", "T2I"],
});
