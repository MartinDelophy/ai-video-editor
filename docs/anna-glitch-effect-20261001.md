# Anna glitch animation — 2026-10-01

Effects order: Glitch animation, Rhythm click ripple, Disco beams. Glitch has a dedicated inspector using the ripple inspector's compact controls: enable/remove, tearing strength, RGB separation, frequency, burst duration and signal noise. All new labels have direct translations in 13 interface languages. Effect settings live on the clip and use existing project snapshots and undo.

Preview and canvas export use the same SVG filter graph and deterministic clip-time seed. The burst duration is capped below the trigger interval. Disabled effects and intervals between bursts preserve the original frame. The exporter copies the rendered visual layer before filtering; captions are rendered afterward. No models or permissions were added.

Validation:
- Chrome full Anna local editor: imported a synthetic video, checked the three-card order, applied Glitch and inspected the right-side configuration.
- Production renderer fixture: active frame changed pixels; repeated rendering at the same time produced identical pixels; an inactive interval changed zero channels.
- Timing, duration cap, disabled state, JSON snapshot round-trip and all 13 translations checked.
- Complete 1-second 720p MP4 export in the local Anna editor reported Export complete.
- Targeted ESLint reported 0 errors (existing warnings remain).
- Temporary fixtures and test media are outside the repository.

Production Anna container rendering remains a user acceptance check; local editor cloud warnings are expected because this local page is outside the Anna host.

Anna build and strict validation passed. Uploaded working draft r39, ready, hash `94df623119dec2cf3276b223817b359b7259bdb25371624f7f5209e785bc2020`, 173 files / 212,057,142 bytes. Developer console confirmed: “Installed working draft (0.0.0-draft) — now available in chat”. No version cut or review submission. Code commit: `321dbbc`.
