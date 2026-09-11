# Anna Piper runtime adaptation

The Anna build keeps the existing Piper inference and voice-model routing, but
packages the runtime files at the application origin and uses one WASM thread.
The ordinary website continues to use the unmodified upstream module.

`scripts/anna-piper-runtime.mjs` adapts only the resolved
`@diffusionstudio/vits-web@1.0.3` module during the Anna Vite build. It verifies
the package versions and exact source replacements, and fails for an unexpected
runtime instead of silently leaving an external WASM path active. It does not
edit `node_modules`, replace the prediction algorithm, alter model weights,
add a CDN grant, or disable CSP.

| Runtime | Packaged files | Upstream package license declaration |
| --- | --- | --- |
| `@diffusionstudio/vits-web@1.0.3` | Existing phonemizer glue and inference module | MIT |
| Its own `onnxruntime-web@1.18.0` | `ort-wasm-simd.wasm`, `ort-wasm.wasm` | MIT |
| `@diffusionstudio/piper-wasm@1.0.0` | `build/piper_phonemize.wasm`, `build/piper_phonemize.data` | MIT |

The npm package and lockfile pin the downloaded Piper runtime. The adapter also
checks the following SHA-256 hashes before emitting its resources:

- `piper_phonemize.wasm`: `b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6`
- `piper_phonemize.data`: `29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c`

Source repositories: [vits-web](https://github.com/diffusionstudio/vits-web),
[ONNX Runtime](https://github.com/microsoft/onnxruntime), and
[Piper WASM](https://github.com/diffusion-studio/piper-wasm).
The Piper package README identifies its build inputs as
`wide-video/piper-wasm`, `rhasspy/espeak-ng`, and `wide-video/piper-phonemize`,
with Emscripten 3.1.47, and documents the source modifications and build steps.
The npm archive supplies the README and MIT metadata but no standalone license
file. The Anna bundle retains that complete README and the three packages'
license/source metadata beside this notice under `licenses/anna-piper-runtime/`.
These package declarations do not replace the licenses of the source components
or voice models. Existing voice-model notices and source routing remain intact.

Runtime-path declarations and a successful build do not establish successful
inference in the Anna container. Verify an actual Piper synthesis after the
production WASM policy update, including phonemizer data loading and a usable
audio result.
