# Project recovery loading — 2026-09-22

The My projects dialog now displays a spinner, an indeterminate animated rail, and the actual session phase during cloud reads, current-work protection, recovery, and the final save. The clicked recovery/open/create action also shows a spinner, with duplicate submissions and dismissal disabled while the operation runs. Reduced-motion preferences disable animations. Existing directly localized session labels cover all 13 languages; no fabricated percentage is shown.

A temporary external browser fixture exercised the real dialog with delayed project operations and verified the visible loading state, disabled controls, and completion dismissal. No user project was recovered or overwritten for this UI check.

Anna build, targeted lint, and strict validation passed. Uploaded working draft r28: `05181ac32759be6cba974162ae24b4e8c8a34fa894e550e723fd64ee0587ee73`, 170 files / 210452656 bytes. No new review requested.
