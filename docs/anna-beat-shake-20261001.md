# Anna Beat shake — 2026-10-01

Effects order is Glitch, Rhythm click ripple, Beat shake, Disco beams. Beat shake offers enable/remove, four directions (zoom, horizontal, vertical, rotation), quarter-note BPM, strength, decay as a percentage of each beat and beat offset. Tempo is manual; the interface explicitly avoids claiming automatic audio analysis. New strings are localized in all 13 interface languages.

Preview and export share applyBeatShakeTransform and clip-local time. The motion adds to existing transforms/keyframes without overwriting their values. Each pulse decays before the next beat, with a restrained zoom for edge coverage. Settings use existing clip snapshots, undo and persistence. Both main visual and PiP transform paths are wired.

Validation: timing at 40/100/240 BPM, disabled and zero-strength states, offset, deterministic directions, transform preservation, JSON round-trip and 13-language coverage passed. Chrome full local Anna editor verified third-card order, application, right inspector and horizontal transform. A one-second 720p MP4 export reported “导出完成”. Anna build and CLI strict validation passed. Targeted ESLint: zero errors, 36 existing warnings. Temporary validation files are outside the repository. Production Anna playback remains user acceptance; no review is requested.

Working draft r40 uploaded and installed; console confirmed “Installed working draft (0.0.0-draft) — now available in chat”. Hash `637675c72377bb39d2dce41df4d2ecaa9aa32afd54996d9bb8b7a1a493ada3fb`, 173 files / 212,064,977 bytes. No version cut, public release or review request. Implementation commit `f1ce1dc`.
