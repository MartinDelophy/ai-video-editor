---
name: edit-timeline-studio
description: Operate, evaluate, and improve editable video workflows in Timeline Studio at https://video-editor.ai-creator.top/, its local repository, or a .timeline archive. Use when Codex must import, assemble, trim, reorder, caption, voice, overlay, restyle, save, export, or repeatedly end-to-end test Timeline Studio; also use when real editing experience should be converted into updates to this skill.
---

# Edit Timeline Studio

Turn the user's exact editorial request and media into reversible Timeline Studio edits. Keep the editable timeline as the source of truth; never replace it with an opaque one-shot render.

## Choose the execution path

1. Treat `https://video-editor.ai-creator.top/` as the canonical hosted editor. When the user asks to use the website, provides no repository, or expects Browser Use, proactively open this URL and inspect the live editor before planning the edit.
2. When this repository is available and the task concerns local development, unpublished changes, or evaluation, start the local editor and use it instead of the hosted release. Read the actual server URL from the process output; never assume port 5173.
3. Inspect `package.json` for an Agent command script. Do not use `npm run ... --if-present` as capability detection because it can succeed silently.
4. If the command runner exists, read [references/command-contract.md](references/command-contract.md), build and validate a versioned plan, dry-run it, then apply it.
5. Otherwise, read [references/browser-workflow.md](references/browser-workflow.md) and use the editor UI. Use a concise edit checklist rather than inventing stable IDs, revisions, transactions, or a JSON plan that the UI cannot honor.
6. Do not claim deterministic or idempotent execution when only UI automation was available. State the limitation and preserve an editable project archive when the UI supports it.

## Workflow

### 1. Inspect before editing

- Preserve the user's prompt verbatim as the creative brief.
- Resolve every referenced asset to an explicit path or URL. Never sweep a directory without approval.
- Inspect duration, dimensions, audio presence, and media type.
- Read the current project summary before changing an existing project.
- Ask only when an unresolved choice materially changes the edit, such as the desired output duration or aspect ratio.

### 2. Plan at the supported fidelity

- With the command runner, express edits as declarative operations with stable IDs, seconds, revisions, operation IDs, and preconditions. Validate them with `scripts/validate_edit_plan.mjs <plan.json>`.
- With browser UI only, write a short ordered checklist of visible user intents and expected UI outcomes. Prefer named controls and clip labels; use coordinates only as a last-resort fallback grounded in a current screenshot.
- Keep main Visuals contiguous. Treat captions, stickers, source audio, voiceover, music, and overlays as timed clips.
- Preserve media identity and source-time mapping when moving or trimming clips.

### 3. Apply safely

- Save a project version or export a `.timeline` archive before a destructive batch.
- Apply one transaction per user-visible intent. Fail the whole transaction when a precondition fails.
- Never silently substitute missing media, voices, models, fonts, or effects.
- Keep every result undoable and editable in the normal UI.
- Do not start a paid or remote generation job without a clear user request.

### 4. Verify the result

- Re-read the timeline summary and compare it with the requested duration, ordering, track placement, and enabled states.
- Preview the opening, every cut or transition, caption boundaries, overlays, and the final frame.
- Check audible behavior, not just visible tracks. Distinguish embedded video audio from explicitly separated source-audio clips and verify mute/link state.
- For final export, verify container, dimensions, duration, decoded frames, visible overlays/captions, and a real audio track.
- Return the editable project path and final render path when created.

## Interpret underspecified requests conservatively

- For “try it,” “open it,” or “let me edit” requests without an editorial brief, start the editor, import only the explicitly named assets, verify automatic placement, and hand off the live editable workspace.
- Do not invent trims, captions, aspect-ratio changes, AI generation, or exports.
- Treat persistent onboarding completion, model downloads, remote generation, and destructive reset as separate user decisions.

## Learn from every real run

For editor evaluation, regression work, or any run that exposes friction, read [references/e2e-evaluation.md](references/e2e-evaluation.md). Capture the attempted action, observed result, evidence, fallback, and verification. Classify the finding as product, browser-control, environment, or skill guidance. Update the smallest relevant skill instruction or reference, validate the skill, reinstall the local copy, and rerun the affected scenario plus adjacent smoke tests. Never weaken an assertion merely to make a test pass.

## Capability boundaries

Read [references/current-capabilities.md](references/current-capabilities.md) when deciding whether a request can be executed now. Read [references/command-contract.md](references/command-contract.md) only when implementing or invoking the Agent command layer. Read [references/browser-workflow.md](references/browser-workflow.md) for UI execution and [references/e2e-evaluation.md](references/e2e-evaluation.md) for repeated experience-driven testing.

If a requested operation is unsupported, keep the valid partial timeline unchanged and state the exact missing command or runtime capability.
