const LIVE_PORTRAIT_REVISION = "e6c5d2407593a39f29c92ffd5ea3eaf5e59d52a1";

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
  }),
});

export function getLivePortraitModelUrl(file) {
  return `https://huggingface.co/${LIVE_PORTRAIT_WEB_MODEL.id}/resolve/${LIVE_PORTRAIT_WEB_MODEL.revision}/${file}`;
}
