# Anna drifting halo — 2026-09-21

Anna keeps Smart hidden and exposes Rhythm click ripple plus Drifting halo in Effects. The halo is a clip effect with size, travel duration, angular speed (negative reverses rotation), vertical position, tilt, glow, and color controls. Existing project effects remain intact.

Main visuals and picture-in-picture use the same deterministic Canvas renderer in preview and export. Animation uses clip-local time, not wall-clock time. The effect data travels through the existing project snapshot and undo records; no new storage or model permissions are needed. Labels are provided in all 13 interface languages.

Validation: temporary browser fixture exercised card activation, Canvas pixel output, size and reverse-speed controls, and removal. Renderer command traces were deterministic at identical timestamps and changed across timestamps. Normalization and JSON round-trip passed. Targeted lint has no errors; shared-file warnings remain. The actual export frame renderer produced 14,756 changed pixels when the halo was enabled. Anna production build and strict validation passed. Full MP4 export and Anna cloud restoration with this new effect have not been re-tested.
