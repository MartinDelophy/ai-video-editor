# Depth-video motion interpolation

Fast (8 samples/s) and Standard (16 samples/s) depth videos use real Practical-RIFE 4.17-lite ONNX inference to generate frames at the exact 24 fps output timestamps. Fine (24 samples/s) keeps the existing depth blending route. RIFE receives only grayscale depth maps, repeated into RGB channels, plus the fractional source-time position. Source audio keeps the existing trim/speed mapping and is muxed unchanged by this step.

Flowframes is a Windows GUI which can run RIFE; it is not embedded or launched by this browser implementation.

## Model provenance

- Upstream: https://github.com/hzwer/Practical-RIFE
- Upstream license: MIT; preserved in `model-licenses/practical-rife-MIT.txt`.
- Conversion: vs-mlrt external-models `rife_v4.17_lite.7z`, `rife_v2` graph.
- Owned Hugging Face mirror: `haixin/timeline-studio-onnx-models`, revision `64f590200ea7d6142a5e58cbf069025e44c84dbe`.
- Owned ModelScope mirror: `martindelophy/timeline-studio-onnx-models`, revision `7e4d08c6147638872679c6d2c2af71424599fd58`.
- Both mirrors preserve `rife-v4.17-lite/{rife_v4.17_lite_v2.onnx,LICENSE,README.md}`. Chinese sessions prefer ModelScope; the existing source preference overrides locale, and failed downloads fall back to the other owned mirror. The shared model service worker uses one provider-independent cache identity.
- Original conversion distribution: `notaneimu/onnx-image-models`, revision `f7bf1c91e94ef516900f68456528fa781e2e7174`. This is provenance only, not a runtime download source.
- SHA-256: `4192e1db7db7d8a110a667b8776b9fe3d92deb1cce04676d5d57a5fd52d7578a` (verified before session creation).
- Model source notes: https://huggingface.co/notaneimu/onnx-image-models/blob/f7bf1c91e94ef516900f68456528fa781e2e7174/README.md

The graph uses a float32 `[1,7,H,W]` input: two RGB frames followed by a full timestep plane. The worker replicates border pixels to pad dimensions to multiples of 32, then crops the result to the depth-map dimensions. WebGPU requests a high-performance, non-fallback adapter. No silent crossfade fallback is used when RIFE setup or inference fails: generation reports failure and retains completed depth analysis for retry.

Only the current pair and one output frame are kept by the interpolator. Cancellation terminates the worker and pending requests; completion releases the session with its worker. Native browser inference and output quality need to be considered independently: a monocular depth surface can still flicker, and synthesized depth is not ground-truth geometry.

Depth sampling and interpolation/encoding run as a bounded pipeline with at most three samples ahead of the consumer. Once neighboring maps exist, RIFE can encode their output timestamps while the next maps are analyzed. Backpressure bounds the queue; cancellation releases both stages. Completed analysis remains available if encoding fails. WebGPU remains the default; an internal WASM CPU provider is available for validation and integration. Shared GPU contention means overlap does not guarantee near-zero added latency.

## Scheduling and reuse

Uncapped clips sample on an exact 8/16/24 Hz clock rather than distributing a rounded sample count across the clip duration. This aligns real samples with 24 fps output even for fractional-second clips. The existing 720-sample budget keeps evenly distributed coverage for long clips. The signature version invalidates analyses produced with the previous clock.

At effectively exact endpoints (fraction tolerance 1e-9), use the existing depth frame directly. Adjacent pairs reuse the previous second-frame grayscale bytes; stable-size canvases, ImageData and the current pair input tensor are reused without changing model precision or resolution. Successful jobs retain at most one idle verified session per backend for 60 seconds, with pair tensors cleared; cancellation, failure and idle errors terminate the worker. Active jobs never share a session. Cold startup and inference still cost time; reuse primarily benefits consecutive jobs.
