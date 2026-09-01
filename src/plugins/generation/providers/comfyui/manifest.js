import { PlugsConnected } from "@phosphor-icons/react";
import { defineGenerationProvider } from "../../contract.js";

export const comfyuiManifest = defineGenerationProvider({
  schemaVersion: 1,
  id: "comfyui",
  displayName: "ComfyUI",
  version: "1.0.0",
  runtime: "loopback",
  auth: "none",
  capabilities: ["workflow-image", "workflow-video"],
  outputTypes: ["image", "video"],
  defaultEndpoint: "http://127.0.0.1:8188",
  connectingState: "connecting",
  Icon: PlugsConnected,
  tone: "mint",
  badges: ["API", "T2I", "T2V"],
  descriptionKey: "comfyDescription",
});
