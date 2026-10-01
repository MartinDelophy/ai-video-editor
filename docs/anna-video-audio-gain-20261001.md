# Anna video audio and timeline gain — 2026-10-01

Selectively ported the video/PiP waveform and timeline gain controls from main commit `14a63c6` into `codex/anna-validation`. No general main merge was performed. Anna navigation restrictions, cloud session flow, packaging and review state remain unchanged.

Video clips retain their source waveform in a compact footer. The shared gain control supports decibel adjustment, keyboard steps, double-click unity reset and mute; voice, music, source audio, main video and PiP use the existing linear gain model. Per-clip gain is carried into source extraction, track promotion, preview, video export and Anna project snapshots. Main's separate playhead-follow/scrubbing changes are outside this port. Feature labels are provided in all 13 interface languages.

Validation in a temporary browser fixture outside the repository passed source waveform decoding, overlay/main gain preservation, zero gain, extracted audio gain, export timeline mapping, Anna snapshot serialization/restoration, all language labels and actual offline audio amplitude (a 0.1-amplitude source at gain 2 renders approximately 0.2 despite a 0.25 global fallback). Keyboard interaction changed unity to +1 dB / 1.122 gain. Production Anna build and strict CLI validation passed; targeted ESLint has no errors (existing warnings remain).

This is a local integration, not a cloud deployment or review submission. Live Anna container playback and cloud end-to-end persistence have not been retested for this port.
