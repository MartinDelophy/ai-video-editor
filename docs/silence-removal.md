# Remove pauses

Smart → Remove pauses analyzes the **selected main-track video’s original audio** locally. It detects speech activity rather than transcribing words or judging whether a quiet picture is useful. Videos with no detected speech are never automatically deleted.

1. Select a main-track video and open Smart → Remove pauses.
2. Set the minimum pause (default 0.8 seconds) and retained gap (default 0.3 seconds).
3. Analyze, inspect the candidate timeline ranges, and uncheck any intentional pauses. The preview button seeks just before a candidate so the main preview can be played normally.
4. Apply the selected cuts as one undoable edit. Original media is retained.

The original video’s embedded audio and linked source-audio segments follow the retained source ranges. The shared **Ripple editing** toggle controls other tracks. When enabled, unlocked timed media is cut at the same intervals and shifted left, captions are retimed, and active caption/audio associations are preserved. Locked tracks and actively linked pairs with a locked member stay in place. When disabled, other tracks retain their absolute timing. Markers remain annotations at their existing project times.

The first version supports ordinary main-track videos, existing source trims, static visual settings, and constant playback speed. Speed curves, reverse, animated/analysis-dependent effects, transitions at the edited clip’s edges, and offset linked source audio are rejected explicitly. Under ripple editing, overlapping complex timed clips or independent unsegmented music/source audio require segmenting or deselecting the affected range first. Candidates that would leave a main-track clip below the existing 0.5-second minimum are omitted rather than widening a cut into speech. Review is invalidated when the project or target changes; apply checks the complete project/media fingerprint again.

## Local model and inference

- Upstream: [onnx-community/silero-vad](https://huggingface.co/onnx-community/silero-vad), revision `e71cae966052b992a7eca6b17738916ce0eca4ec`, `onnx/model.onnx`.
- License: MIT; mirrored `silero-vad/LICENSE`, `SOURCE_NOTES.md`, and `manifest.json` accompany the unchanged model.
- Model size: 2,243,022 bytes.
- SHA-256: `a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808` (verified before inference).
- Owned Hugging Face mirror: `haixin/timeline-studio-voice-models`, revision `c76fc14496a26d75096072140627db3e4437f52b`.
- Owned ModelScope mirror: `martindelophy/timeline-studio-voice-models`, revision `5b210f4bce036b194e4142345bbdaf9b34363ef4`.
- Runtime: ONNX Runtime Web WASM in a dedicated worker; 16 kHz mono, 512 new samples plus 64 context samples, recurrent state `[2, 1, 128]`. State persists across bounded decode windows and resets for each analysis.
- Speech thresholds: 0.5 to enter speech and 0.35 to exit, with 0.16 seconds of quiet to close a speech region. User pause and gap controls use the clip’s timeline seconds.
- Audio decoding: bounded 16.384-second source windows through MediaBunny, browser resampling to 16 kHz. Only small probability arrays accumulate across long clips. The actual first/last audio-packet timestamps define required decode coverage; video before the audio starts or after it ends is analyzed as silence without changing the source clock. Overlapping decoded packets count only once, and missing coverage inside the audio range still fails rather than creating false pause candidates.
- Cancellation terminates inference and disposes the decoder. Model/decode failures are localized; no amplitude-only fallback silently substitutes for Silero.
- ModelScope is preferred for Chinese sessions, with Hugging Face fallback and the existing provider preference. The shared model service worker is the sole persistent model-cache writer and maps both pinned URLs to one identity.

All card, inspector, progress and error copy is directly localized in the 13 supported interface languages.
