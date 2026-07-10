# LivePortrait browser ONNX port

## Pinned baseline

- Repository: `dyicnc/Live-Portrait-ONNX` (third-party mirror, not an official LivePortrait certification)
- Revision: `e6c5d2407593a39f29c92ffd5ea3eaf5e59d52a1`
- Runtime: `onnxruntime-web@1.27.0`
- Minimum split pipeline: appearance extractor, motion extractor, lip retargeter, stitching, warping, and SPADE generator
- Combined generator SHA-256: `44effc5f2129c03353feb56bb8db7828346c36e81ffbacb4ab0622b3d91d2c77`

## Graph audit

The opset-20 combined generator has 277 nodes, including 13 rank-5 Conv nodes and 2 rank-5 GridSample nodes. The repository's Linux `.so` plugin cannot run in a browser. The browser correctness path therefore uses the split models and ONNX Runtime Web WASM for the 3D warping stage.

## Acceptance result

- Test portrait: `老外戴眼镜中年人物肖像生成-modnet.png`, 819×1024 RGBA.
- Node smoke test: appearance, motion, lip retargeting, stitching, 3D warping, and 512×512 SPADE rendering passed.
- In-app browser test: model loading, real progress reporting, WASM inference, PNG creation, reusable media insertion, and visual-track replacement passed.
- Browser output: `liveportrait-browser-acceptance.png`, 512×512.
- Browser console errors after completion: 0.

The explicit bundled `ort-wasm-simd-threaded.wasm` path is required. Without it, Vite's HTML fallback produces the `expected magic word ... found 3c 21 64 6f` error.

## Remaining gates

- Replace or accelerate the slow 3D WASM path with WebGPU.
- Select and validate a real audio-to-motion ONNX model.
- Generate temporally consistent frames from audio, then encode and replace the visual track with a video.
- Keep full talking-video generation/export locked until these gates pass; do not substitute handcrafted visemes or simulated mouth motion.
