import { MagicWand } from "@phosphor-icons/react";
import { defineGenerationProvider } from "../../contract.js";
export const annaManifest = defineGenerationProvider({ schemaVersion: 1, id: "anna", displayName: "Anna", version: "1.0.0", runtime: "secure-backend", auth: "backend", capabilities: ["text-to-music", "text-to-image", "image-to-image", "text-to-video", "image-to-video"], outputTypes: ["audio", "image", "video"], defaultEndpoint: null, connectingState: "connecting", Icon: MagicWand, tone: "cyan", badges: ["T2I"] });
