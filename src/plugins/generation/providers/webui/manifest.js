import { ImageSquare } from "@phosphor-icons/react";
import { defineGenerationProvider } from "../../contract.js";

export const webuiManifest = defineGenerationProvider({
  schemaVersion: 1,
  id: "webui",
  displayName: "Stable Diffusion WebUI",
  version: "1.0.0",
  runtime: "loopback",
  auth: "none",
  capabilities: ["text-to-image", "image-to-image"],
  outputTypes: ["image"],
  defaultEndpoint: "http://127.0.0.1:7860",
  connectingState: "connecting",
  Icon: ImageSquare,
  tone: "blue",
  badges: ["T2I", "I2I", "LOCAL"],
  descriptionKey: "webuiDescription",
});
