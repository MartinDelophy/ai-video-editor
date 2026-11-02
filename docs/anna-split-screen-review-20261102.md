# Anna split-screen release review — 2026-11-02

Synced main commits `bd382c6` and `6943520` into `codex/anna-validation`, preserving Anna-specific effects, translations and workflow behavior. Integration commits: `4932456`, `baf5cc0`, `1d48bd9`.

Preview context menus now show alignment icons and split-screen layouts including the current main picture plus visible overlays. Two pictures support horizontal/vertical arrangements; three also support a two-above/one-below grid; four support a 2×2 grid. Cells crop proportionally, preserve clip timing and support one-step undo. All 13 interface languages have direct copy. The existing fill behavior remains; no new mixed-aspect fitting modes were added.

Validation: targeted ESLint had zero errors and nine existing warnings; typecheck, Anna build, standard and strict CLI 0.1.61/schema 0.30.0 validation passed. The local Anna editor verified a main picture plus two overlays, grid composition and undo/redo. Local standalone Anna has no authenticated host session, so its storage warning is not production cloud-save evidence. No new production model or cloud-storage validation is claimed.

Working draft `r178` uploaded ready: 282 files, 291,411,164 bytes. Frozen version `0.1.2-beta.5`, version ID `1891`, bundle ID `1732`, manifest SHA-256 `9b7424e4bb9fe73498e4f638000b9988b0e73cb134c71df4b316dfc5808bb274`. Every frozen file's SHA-256 and byte count was independently compared against the validated local bundle.

Because the app was already published, the first-release `apps submit-review` route returned HTTP 400. The official CLI `apps release 0.1.2-beta.5` submitted the existing frozen version for release review. Independent status and versions queries confirmed `review_candidate_version: 0.1.2-beta.5`, `release_review_state: pending`, `is_latest: false`, and `published_at: null`. Public Anna remains `0.1.2-beta.4`; this record confirms submission, not approval or publication.

Main was pushed as `6943520` and deployed to Netlify deployment `6ae7fbeb860b0da4c8550565`. The production page references `/assets/editor-BqGDCbrR.js`, whose SHA-256 matched the release build.
