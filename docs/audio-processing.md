# Browser-local audio processing

Select an independent audio-lane clip or separated video-source-audio segment, then open **Processing**. The five sections share one processing chain: denoise → equalizer → compressor → loudness gain → limiter. Generate a preview, listen, and explicitly apply it. Applying retains the clip identity, timeline position, duration, speed, gain, fades, and caption associations. Restore original returns to the retained source. Processing settings and the retained source are included in portable project archives and browser project storage.

Embedded video audio must first be separated. Separated source segments can be previewed directly on the source track; only explicit Apply routes that exact segment into a new unlocked ordinary audio lane through the existing source-audio move action. Its trim, timeline start, duration, speed curve, gain, spatial effect, source-video identity and original backup remain intact. Existing audio lanes are not repacked. The matching visual source mapping is disabled to prevent doubled embedded audio; untouched split siblings remain on the source track. Active and remembered caption/audio associations are remapped to the new audio ID. The inspector explains this route before applying. Locked source, audio or visual tracks block the operation. The current route accepts mono or stereo audio and processes up to 30 minutes of selected source audio. Browser decoding loads the source file into memory, so available memory may impose a lower practical limit. It is a render-and-apply workflow, not a realtime denoising insert. Loudness currently means manual dB gain, not measured LUFS normalization. BGM ducking is separate from these effects.

## Runtime and models

- RNNoise: `@shiguredo/rnnoise-wasm@2025.1.5`, embedded WASM and default weights, Apache-2.0 wrapper / BSD-3-Clause upstream.
- DeepFilterNet3: `@lofcz/deepfilternet-web@0.1.0`, WASM with default model weights embedded, MIT / Apache-2.0.
- Both run at 48 kHz in a dedicated module worker. Select one denoiser; they are not applied sequentially. Strength is an aligned dry/wet mix.
- Owned repositories: `haixin/timeline-studio-voice-models` and `martindelophy/timeline-studio-voice-models`, folder `audio-denoise-v1`. Source notes, manifests, and licenses are retained alongside the artifacts.
- Immutable Hugging Face revision: `259f586f3fd594a29071a6f3c6024956d2ac47c5`.
- Immutable ModelScope revision: `e5907c932772584333dd8c9c0fb7282912958ca2`.
- Every downloaded runtime is verified against a pinned SHA-256 before execution. Chinese sessions prefer ModelScope; the shared model service worker canonicalizes mirror URLs to one persistent cache identity. The inference worker never creates a separate persistent model copy.

## Signal and editing semantics

The selected source range is processed at its source speed and stored as a 48 kHz PCM16 WAV. Existing clip speed and fades remain applied by the editor. Model lookahead is flushed and compensated (RNNoise 960 samples, DeepFilterNet3 1440 samples) without changing output length. EQ uses low/high shelves and a mid peaking filter; compression and limiting use linked-channel detection. The offline limiter uses 5 ms lookahead without delaying the output and enforces its sample-peak ceiling; it is not a true-peak meter. Enable it when gain would clip.

The preview result and committed file come from the same PCM pipeline; timeline playback, clip download, and full export consume that committed file. Reprocessing starts from the retained original instead of stacking denoising artifacts. Changing the selected clip, source trim, source file, or track lock invalidates a pending result. Cancellation terminates the worker. Audio remains in the browser; no Anna CU or remote inference is used.
