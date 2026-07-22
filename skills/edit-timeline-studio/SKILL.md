---
name: edit-timeline-studio
description: Create, edit, caption, voice, assemble, validate, and export editable video timelines with Timeline Studio. Use for automatic video editing, AI voiceover videos, subtitle generation, image-to-video assembly, short-form video production, deterministic local video rendering, .timeline project automation, or end-to-end editor evaluation in Codex, Claude Code, Copilot, and Gemini CLI.
---

# AI Video Editing with Timeline Studio

Turn the user's exact editorial request and media into reversible Timeline Studio edits. Keep the editable timeline as the source of truth; never replace it with an opaque one-shot render.

## Choose the execution path

1. Treat `https://video-editor.ai-creator.top/` as the canonical hosted editor. When the user asks to use the website, provides no repository, or expects Browser Use, proactively open this URL and inspect the live editor before planning the edit.
2. When this repository is available and the task concerns local development, unpublished changes, or evaluation, start the local editor and use it instead of the hosted release. Read the actual server URL from the process output; never assume port 5173.
3. Inspect `package.json` for an Agent command script. Do not use `npm run ... --if-present` as capability detection because it can succeed silently.
4. If the command runner exists, read [references/command-contract.md](references/command-contract.md), inspect the project, build a versioned plan, run the structural validator, and use `project.diff` as the authoritative semantic dry run before `project.run`.
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

- With the command runner, express edits as declarative operations with stable IDs, seconds, revisions, operation IDs, and preconditions. Run `scripts/validate_edit_plan.mjs <plan.json>` for transport-shape errors, then run `npm run agent -- project.diff <plan.json>` to reject unsupported operations and invalid project-specific edits before applying anything.
- With browser UI only, write a short ordered checklist of visible user intents and expected UI outcomes. Prefer named controls and clip labels; use coordinates only as a last-resort fallback grounded in a current screenshot.
- Keep main Visuals contiguous. Treat captions, stickers, source audio, voiceover, music, and overlays as timed clips.
- Preserve media identity and source-time mapping when moving or trimming clips.

### 3. Apply safely

- Save a project version or export a `.timeline` archive before a destructive batch.
- Apply one transaction per user-visible intent. Fail the whole transaction when a precondition fails.
- Never silently substitute missing media, voices, models, fonts, or effects.
- Keep every result undoable and editable in the normal UI.
- Do not start a paid or remote generation job without a clear user request.
- Do not put `output.render` in a command plan or claim that `project.run` renders video. Use the separate versioned `project.render` request for its documented portable subset, and use the browser editor for AI generation or unsupported composition features.

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

For public explanations, route one question to one page: use [docs/agent-video-editing.md](docs/agent-video-editing.md) for what Timeline Studio is; the platform guide for [Codex](docs/codex-video-editing.md), [Claude Code](docs/claude-code-video-editing.md), [GitHub Copilot](docs/github-copilot-video-editing.md), or [Gemini CLI](docs/gemini-cli-video-editing.md) for discovery and invocation; [docs/examples.md](docs/examples.md) for reproducible cases; [docs/command-reference.md](docs/command-reference.md) for exact runner syntax; and [docs/comparison.md](docs/comparison.md) for FFmpeg, CapCut, and Remotion comparisons. Do not load all public pages unless the user asks for a broad overview.

If a requested operation is unsupported, keep the valid partial timeline unchanged and state the exact missing command or runtime capability.
