# LivePortrait browser ONNX port

## Pinned baseline

- Repository: `dyicnc/Live-Portrait-ONNX` (third-party mirror, not an official LivePortrait certification)
- Revision: `e6c5d2407593a39f29c92ffd5ea3eaf5e59d52a1`
- Runtime: `onnxruntime-web@1.27.0`
- Minimum split pipeline: appearance extractor, motion extractor, lip retargeter, stitching, warping, and SPADE generator
- Original combined generator SHA-256: `44effc5f2129c03353feb56bb8db7828346c36e81ffbacb4ab0622b3d91d2c77`
- WebGPU rewritten generator SHA-256: `03defe3d3a391a897ae4ed4059d19ff12c9a3f46f9c605471c365775388bc551`
- Audio driver: JoyVASA Chinese HuBERT checkpoint SHA-256 `9dd869329725caedf5f0c13dd383abec1e385f566d8afe2047b141f604844e80`

## Graph audit

The opset-20 combined generator has 277 nodes, including 13 rank-5 Conv nodes and 2 rank-5 GridSample nodes. The repository's Linux `.so` plugin cannot run in a browser. Both 5D GridSample nodes are now equivalently rewritten as batched 4D GridSample plus linear depth interpolation. The sparse-motion grid additionally uses its verified shared-XY structure to remove redundant depth sampling. The rewritten graph has 316 nodes and runs with ONNX Runtime Web's WebGPU execution provider.

The full 512×512 output was compared against the original graph with fixed inputs: maximum absolute error `7.8976e-6`, mean absolute error `1.3853e-7`, and 99.9th-percentile error `1.7881e-6`.

## Acceptance result

- Test portrait: `老外戴眼镜中年人物肖像生成-modnet.png`, 819×1024 RGBA.
- Node smoke test: appearance, motion, stitching, rewritten 3D warping, and 512×512 SPADE rendering passed.
- JoyVASA HuBERT and diffusion denoiser ONNX exports match PyTorch numerically (`7.75e-6` and `6.44e-6` maximum absolute error respectively).
- In-app browser test: project-local 50MB model chunks, Asyncify WebGPU runtime, JoyVASA 50-step motion generation, LivePortrait frame rendering, WebM encoding, playback, media insertion, and visual-track replacement passed.
- Browser output: a playable 3.56-second WebM; inspected frames showed open and closed mouth states plus head/eye motion.
- Browser console errors after completion: 0.

The WebGPU workers must use the matching `ort-wasm-simd-threaded.asyncify.mjs` and `.wasm` pair. Loading the plain or JSEP glue produces `webgpuInit is not a function`. WebGPU sessions must also be created serially because ORT rejects concurrent EP session creation.

## Remaining optimization work

- Current 512×512 neural rendering takes roughly 25–60 seconds per frame on the tested browser/GPU, despite full WebGPU execution.
- Evaluate FP16 conversion, a lower-resolution preview tier, and motion-aware frame interpolation before describing the feature as real-time.
- Preserve the validated model path; do not substitute handcrafted visemes or simulated mouth motion.
