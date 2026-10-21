import { mirroredModelFileUrls } from "../lib/modelSources.js";

export const SILERO_HF_REVISION = "c76fc14496a26d75096072140627db3e4437f52b";
export const SILERO_MS_REVISION = "5b210f4bce036b194e4142345bbdaf9b34363ef4";
export const SILERO_MODEL_SHA256 = "a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808";
export const SILERO_SPEECH_SEGMENTATION = Object.freeze({ modelSha256: SILERO_MODEL_SHA256,
  threshold: 0.5, negativeThreshold: 0.35, minimumSilenceSeconds: 0.16, paddingSeconds: 0.25 });

export function sileroModelUrls(language) {
  return mirroredModelFileUrls({
    repository: "timeline-studio-voice-models",
    huggingFaceRevision: SILERO_HF_REVISION,
    modelScopeRevision: SILERO_MS_REVISION,
    path: "silero-vad/model.onnx",
    preference: language,
  });
}
