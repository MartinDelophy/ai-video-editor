# Audio processing loaders

Vendored without modification from `@lofcz/deepfilternet-web@0.1.0` and `@shiguredo/rnnoise-wasm@2025.1.5`. Upstream licenses are preserved beside each loader. These are byte-identical to the owned audio-denoise-v1 mirror at Hugging Face revision `259f586f3fd594a29071a6f3c6024956d2ac47c5` and ModelScope revision `e5907c932772584333dd8c9c0fb7282912958ca2`.

DeepFilter runtime SHA-256: `23a28763f4ff796672fb7f83493f118966873857dfefd82256f63f0acb35b3b6`.
RNNoise runtime SHA-256: `e6958293a0118bf9860cb2753332f7562531cc987c914552c426cd7d7180a63e`.

Bundle executable loaders as same-origin worker chunks so strict CSP does not require blob script execution. DeepFilter weights/WASM continue to use the checksum-verified pinned owned mirrors; RNNoise embeds its WASM in its loader. Keep imports lazy so each engine loads only its own runtime.
