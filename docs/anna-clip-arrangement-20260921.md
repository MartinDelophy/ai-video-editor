# Anna clip arrangement — 2026-09-21

The Anna planner receives only current main-track clip IDs, names, types, durations and trim eligibility. It does not inspect frames, audio or transcripts. Each input clip must occur exactly once, so locating an export scene inside one video and moving it to the start is outside the current planning contract.

The Anna-only entry and inspector now say AI clip arrangement. The panel shows the numbered input clips and durations before the request, explains that content is not analyzed, and offers explicit clip-number examples. With a single clip it explains how to locate and split the scene manually first. Unchanged plans use an application-owned “No changes to apply” heading rather than the model's potentially misleading title. Existing apply/change detection and undo safeguards remain in place.

The system prompt explicitly forbids invented scene timestamps and asks for manual location/splitting when content understanding is required. This is guidance, not a new scene-analysis capability. Additional saving/export/diagnostic utilities remain accessible in a collapsed section. All new copy is localized in 13 languages; standalone editor labels are unchanged.

Validation: Anna production build, strict CLI validation, targeted ESLint (zero errors; existing shared-panel warnings), translation precedence in all 13 languages, and a narrow browser UI fixture matching the reported single-clip/no-change scenario. The fixture did not call Anna AI or alter cloud projects. No new production AI inference or deployment was performed.
