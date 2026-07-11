const JOYVASA_REVISION = "b8f13fe9c23679c56f21b1baafb92ed00dc087c3";
const TIMELINE_STUDIO_MODEL_REVISION = "a201b681c8f96672b5c3f624e32d4dc932f150af";

export const JOYVASA_WEB_MODEL = Object.freeze({
  id: "jdh-algo/JoyVASA",
  sourceRevision: "916a90f8de490e8648fee460c1200bd5d9a795af",
  revision: JOYVASA_REVISION,
  license: "MIT",
  files: Object.freeze({
    audio: Object.freeze([
      "joyvasa-audio.onnx.part-aa",
      "joyvasa-audio.onnx.part-ab",
      "joyvasa-audio.onnx.part-ac",
      "joyvasa-audio.onnx.part-ad",
      "joyvasa-audio.onnx.part-ae",
      "joyvasa-audio.onnx.part-af",
      "joyvasa-audio.onnx.part-ag",
      "joyvasa-audio.onnx.part-ah",
    ]),
    denoiser: "joyvasa-denoiser.onnx",
    conditioning: "joyvasa-conditioning.bin",
    schedule: "joyvasa-schedule.bin",
    template: "joyvasa-motion-template.json",
  }),
  knownArtifacts: Object.freeze({
    audio: Object.freeze({ bytes: 378_452_736, sha256: "51629927a44e13b117c163f8466b7eaa6653ffba71b0d26b8091610497ebf7d8" }),
    denoiser: Object.freeze({ bytes: 33_558_033, sha256: "6e0ea70203df8db5cdd663c75c1764134b207b87f2897ff4e53d279aa3f54928" }),
    conditioning: Object.freeze({ bytes: 14_184, sha256: "89e571e6b1491a88eeedfa7f17ba3ff43e70800e1daa6f544c1366c195dbd6ba" }),
    schedule: Object.freeze({ bytes: 408, sha256: "8ef96b44a0673a6f699b0fa4c6259d89db183cd6d0f8b483203bd84ca8baa828" }),
    template: Object.freeze({ bytes: 9_014, sha256: "f321337873a5b646ca26f80e97edd0efdc9d3c0f63d3a9d09ad7fb72d7d7f828" }),
  }),
  runtime: Object.freeze({ sampleRate: 16_000, windowSamples: 64_000, paddedSamples: 64_080, fps: 25, frames: 100, diffusionSteps: 50 }),
});

export const JOYVASA_PROJECT_MODEL_BASE_URL =
  `https://huggingface.co/haixin/timeline-studio-onnx-models/resolve/${TIMELINE_STUDIO_MODEL_REVISION}/joyvasa/`;
