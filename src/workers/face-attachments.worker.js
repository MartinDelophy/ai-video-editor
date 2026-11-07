import { FaceLandmarker } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_module_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url";
let runtime;
async function detector() {
  runtime ??= FaceLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: {
        modelAssetPath: "/assets/effects/models/face-attachments/face_landmarker-v1.task",
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      numFaces: 5,
      minFaceDetectionConfidence: 0.7,
      minFacePresenceConfidence: 0.7,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    },
  ).catch((error) => {
    runtime = null;
    throw error;
  });
  return runtime;
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        const model = await detector();
        const result = model.detect(data.image);
        self.postMessage({
          id: data.id,
          faces: result.faceLandmarks.map((points) => ({
            score: 1,
            five: [points[33], points[263], points[1], points[61], points[291]].map(
              ({ x, y, z }) => ({
                x,
                y,
                z,
              }),
            ),
            support: [
              10, 67, 297, 109, 338, 168, 6, 4, 98, 327, 205, 425, 50, 280, 101, 330, 118, 347, 36,
              266,
            ].map((index) => ({ x: points[index].x, y: points[index].y })),
            forehead: { x: points[10].x, y: points[10].y, z: points[10].z },
          })),
        });
      } catch (error) {
        self.postMessage({ id: data.id, error: String(error?.message || error) });
      } finally {
        data.image?.close();
      }
    });
};
