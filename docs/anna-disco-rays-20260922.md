# Anna Disco rays — 2026-09-22

Replaces the drifting ring with rotating conical color gradients and smooth outward-moving light envelopes. The center stays fixed at the configured position; there is no travelling circle or clock-like outline. Preview and export share the same clip-local Canvas renderer and screen blend. Cached angular textures avoid rebuilding the conical gradient every frame.

The inspector exposes spread, expansion period, angular speed, horizontal and vertical source position, beam count, softness, intensity, and base color. Copy is localized in all 13 interface languages. Version 2 normalization migrates old ring geometry to the new defaults while retaining enabled state, vertical position, intensity, and color. The serialized effect property remains compatible with existing project snapshots.

Validation: Anna build and strict CLI validation passed; modified JavaScript passed targeted ESLint. Temporary browser fixture confirmed the conical appearance, parameter changes (9 beams, -60°/s), deterministic same-time drawing, changing frames over time, and visible output from the actual export-frame renderer. Old-parameter migration and 13-language keys passed. A full MP4 and production cloud restore have not been retested for this effect.

This update is for the working draft only. Review is not requested; the automatic review follow-up remains deleted.

Uploaded working draft r26: `0fd73454dff0abd9b5abf39c331dcda44df74cc4f654243751215d80d5ef51ff`, 170 files, 210447938 bytes, bundle ready.
