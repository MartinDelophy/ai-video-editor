import { mirroredModelFileUrls } from "../lib/modelSources.js";
export const AUDIO_PROCESSING_HF_REVISION = "259f586f3fd594a29071a6f3c6024956d2ac47c5";
export const AUDIO_PROCESSING_MS_REVISION = "e5907c932772584333dd8c9c0fb7282912958ca2";
export const AUDIO_PROCESSING_MODELS = {
  rnnoise: {
    delay: 960,
    files: [
      {
        path: "rnnoise/runtime.js",
        sha256: "e6958293a0118bf9860cb2753332f7562531cc987c914552c426cd7d7180a63e",
        size: 4827304,
      },
    ],
  },
  deepfilter: {
    delay: 1440,
    files: [
      {
        path: "deepfilter/runtime.js",
        sha256: "23a28763f4ff796672fb7f83493f118966873857dfefd82256f63f0acb35b3b6",
        size: 9453,
      },
      {
        path: "deepfilter/df_bg.wasm",
        sha256: "596034b83a03b546f33daa14b791bcdb59655cb3a07053ac39ddb0ba42c52fa4",
        size: 34135648,
      },
    ],
  },
};
export const audioProcessingModelUrls = (path, language) =>
  mirroredModelFileUrls({
    repository: "timeline-studio-voice-models",
    huggingFaceRevision: AUDIO_PROCESSING_HF_REVISION,
    modelScopeRevision: AUDIO_PROCESSING_MS_REVISION,
    path: `audio-denoise-v1/${path}`,
    preference: language,
  });
