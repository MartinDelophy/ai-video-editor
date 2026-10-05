import { mirroredModelFileUrls } from "./modelSources";

export const RIFE_HUGGING_FACE_REVISION = "64f590200ea7d6142a5e58cbf069025e44c84dbe";
export const RIFE_MODELSCOPE_REVISION = "7e4d08c6147638872679c6d2c2af71424599fd58";
export const RIFE_MODEL_SHA256 = "4192e1db7db7d8a110a667b8776b9fe3d92deb1cce04676d5d57a5fd52d7578a";

export function getRifeModelUrls(preference) {
  return mirroredModelFileUrls({
    repository: "timeline-studio-onnx-models",
    huggingFaceRevision: RIFE_HUGGING_FACE_REVISION,
    modelScopeRevision: RIFE_MODELSCOPE_REVISION,
    path: "rife-v4.17-lite/rife_v4.17_lite_v2.onnx",
    preference,
  });
}
