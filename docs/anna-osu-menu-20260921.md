# Anna menu scope — 2026-09-21

Anna hides the Smart menu and its workspace/inspector while retaining implementation for a later return. Effects is available again, limited to Rhythm click ripple (osu-inspired). Both desktop and mobile effect inspectors resolve to the ripple controls; other effect cards stay hidden. Standalone menus are unchanged. Previously saved effects are not stripped from projects.

The ripple inspector no longer shows unrelated person-analysis status. This effect does not require Anna AI or local model inference.

Validation: Anna production build and strict CLI validation passed. Targeted lint has no errors (existing shared-file warnings remain). Browser component preview confirmed that only the ripple card is present, activating it enables the controls, and Remove disables it. This menu-only change does not revalidate render/export algorithms.
