const LIVE_PORTRAIT_REVISION = "e6c5d2407593a39f29c92ffd5ea3eaf5e59d52a1";
const TIMELINE_STUDIO_MODEL_REVISION = "a201b681c8f96672b5c3f624e32d4dc932f150af";

export const LIVE_PORTRAIT_WEB_MODEL = Object.freeze({
  id: "dyicnc/Live-Portrait-ONNX",
  upstream: "myn0908/Live-Portrait-ONNX",
  revision: LIVE_PORTRAIT_REVISION,
  license: "MIT",
  status: "research",
  files: Object.freeze({
    appearanceFeatureExtractor: "appearance_feature_extractor.onnx",
    motionExtractor: "motion_extractor.onnx",
    generator: "generator_fix_grid.onnx",
    landmark: "landmark.onnx",
    warping: "warping.onnx",
    spadeGenerator: "spade_generator.onnx",
    stitching: "stitching.onnx",
    stitchingLip: "stitching_lip.onnx",
    stitchingRetargeting: "stitching_retargeting.onnx",
    generatorPreviewFp16: Object.freeze([
      "liveportrait-generator-preview-fp16.onnx.part-aa?v=5fdb50d2",
      "liveportrait-generator-preview-fp16.onnx.part-ab?v=5fdb50d2",
      "liveportrait-generator-preview-fp16.onnx.part-ac?v=5fdb50d2",
      "liveportrait-generator-preview-fp16.onnx.part-ad?v=5fdb50d2",
      "liveportrait-generator-preview-fp16.onnx.part-ae?v=5fdb50d2",
    ]),
    generatorQualityFp16: Object.freeze([
      "liveportrait-generator-quality-fp16.onnx.part-aa?v=1b4630bf",
      "liveportrait-generator-quality-fp16.onnx.part-ab?v=1b4630bf",
      "liveportrait-generator-quality-fp16.onnx.part-ac?v=1b4630bf",
      "liveportrait-generator-quality-fp16.onnx.part-ad?v=1b4630bf",
      "liveportrait-generator-quality-fp16.onnx.part-ae?v=1b4630bf",
    ]),
    appearanceFeatureExtractorWebGpu: "liveportrait-appearance_feature_extractor.onnx",
    motionExtractorWebGpu: Object.freeze([
      "liveportrait-motion-extractor.onnx.part-aa",
      "liveportrait-motion-extractor.onnx.part-ab",
      "liveportrait-motion-extractor.onnx.part-ac",
    ]),
    stitchingWebGpu: "liveportrait-stitching.onnx",
  }),
  knownArtifacts: Object.freeze({
    appearanceFeatureExtractor: Object.freeze({
      bytes: 3_355_896,
      sha256: "e9cd2bd864a970f25bbe660e132778fc7f81a4f32945a97940a6225c8b2dafb0",
    }),
    motionExtractor: Object.freeze({
      bytes: 112_593_241,
      sha256: "6be4dcb59827a5c9af587c8d7eb07bc9f5128ea01856e9b78cf7db316787cf86",
    }),
    generator: Object.freeze({
      bytes: 421_238_874,
      sha256: "44effc5f2129c03353feb56bb8db7828346c36e81ffbacb4ab0622b3d91d2c77",
    }),
    landmark: Object.freeze({
      bytes: 114_666_491,
      sha256: "31d22a5041326c31f19b78886939a634a5aedcaa5ab8b9b951a1167595d147db",
    }),
    warping: Object.freeze({
      bytes: 182_274_422,
      sha256: "3dbdccbd99417da27d8280111f18990bbaaebf54d08435e25bb48ef6ecf0bbf7",
    }),
    spadeGenerator: Object.freeze({
      bytes: 221_924_849,
      sha256: "16c815413f4b56537af1eca6cf92b83221d6ee8f5f9f65212c533a4dc8ae155d",
    }),
    stitching: Object.freeze({
      bytes: 182_363,
      sha256: "28b5fd0b97f3cee29b37b24937f2fa294d1548799b8a16d3cfe70fab1f49c785",
    }),
    stitchingLip: Object.freeze({
      bytes: 150_609,
      sha256: "33489d795915b78a8e96787c42c367cac23a0d5d3d2bd3efbb4af5ee758d42bb",
    }),
    generatorPreviewFp16: Object.freeze({
      bytes: 210_713_705,
      sha256: "5fdb50d2fdaf1d52a65f39dddf7b79c968725eaae735418f5494831ba4d45706",
    }),
    generatorQualityFp16: Object.freeze({
      bytes: 210_713_678,
      sha256: "1b4630bfbe499dd1d28697fa1e479ab4b305c80421aa485bfd04d36698c6fe7f",
    }),
    appearanceFeatureExtractorWebGpu: Object.freeze({
      bytes: 3_355_896,
      sha256: "e9cd2bd864a970f25bbe660e132778fc7f81a4f32945a97940a6225c8b2dafb0",
    }),
    motionExtractorWebGpu: Object.freeze({
      bytes: 112_593_241,
      sha256: "6be4dcb59827a5c9af587c8d7eb07bc9f5128ea01856e9b78cf7db316787cf86",
    }),
    stitchingWebGpu: Object.freeze({
      bytes: 182_363,
      sha256: "28b5fd0b97f3cee29b37b24937f2fa294d1548799b8a16d3cfe70fab1f49c785",
    }),
  }),
});

export const LIVE_PORTRAIT_WEBGPU_PROJECT_MODEL_BASE_URL =
  `https://huggingface.co/haixin/timeline-studio-onnx-models/resolve/${TIMELINE_STUDIO_MODEL_REVISION}/liveportrait-webgpu/`;

export function getLivePortraitModelUrl(file) {
  return `https://huggingface.co/${LIVE_PORTRAIT_WEB_MODEL.id}/resolve/${LIVE_PORTRAIT_WEB_MODEL.revision}/${file}`;
}
