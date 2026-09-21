# Anna menu scope — 2026-09-21

Anna hides the Smart menu and its workspace/inspector while retaining implementation for a later return. Effects is available again, limited to Rhythm click ripple (osu-inspired). Both desktop and mobile effect inspectors resolve to the ripple controls; other effect cards stay hidden. Standalone menus are unchanged. Previously saved effects are not stripped from projects.

The ripple inspector no longer shows unrelated person-analysis status. This effect does not require Anna AI or local model inference.

Validation: Anna production build and strict CLI validation passed. Targeted lint has no errors (existing shared-file warnings remain). Browser component preview confirmed that only the ripple card is present, activating it enables the controls, and Remove disables it. This menu-only change does not revalidate render/export algorithms.

Uploaded as working draft r24: content hash `c0d5ad49866f1e70b384f9447dfd38878353bba825663a3d341c49c03f3d7b5c`, 170 files / 210387065 bytes, bundle ready. Frozen alpha.8 remains the pending review candidate; no new version was cut.
