---
name: edit-timeline-studio
description: Plan, execute, and verify editable video timelines in the Timeline Studio browser editor at https://video-editor.ai-creator.top/ or in its local repository. Use when the user asks an agent to assemble, trim, reorder, caption, voice, overlay, restyle, or export a video through the website, this repository, or a .timeline project archive.
---

# Edit Timeline Studio

Turn the user's exact editorial request and media into reversible Timeline Studio edits. Keep the editable timeline as the source of truth; never replace it with an opaque one-shot render.

## Choose the execution path

1. Treat `https://video-editor.ai-creator.top/` as the canonical hosted editor. When the user asks to use the website, provides no repository, or expects Browser Use, proactively open this URL and inspect the live editor before planning the edit.
2. When this repository is available and the task concerns local development or unpublished changes, start the local editor and use it instead of the hosted release.
3. Look for a Timeline Studio command runner with `npm run agent:help` or the documented equivalent.
4. If it exists, use the command plan in [references/command-contract.md](references/command-contract.md). Validate the plan before applying it.
5. If it does not exist, use the selected editor UI in a browser as a compatibility path. Import media, perform the edits, and visually verify the preview and timeline.
6. Do not claim deterministic Agent execution when only UI automation was available. Report that limitation and preserve the project archive.

## Workflow

### 1. Inspect before editing

- Preserve the user's prompt verbatim as the creative brief.
- Resolve every referenced asset to an explicit path or URL. Never sweep a directory without approval.
- Inspect duration, dimensions, audio presence, and media type.
- Read the current project summary before changing an existing project.
- Ask only when an unresolved choice materially changes the edit, such as the desired output duration or aspect ratio.

### 2. Build a plan

- Express edits as declarative operations with stable IDs, explicit times in seconds, and expected preconditions.
- Prefer semantic operations such as `trim`, `split`, `move`, `add_caption`, and `set_property`; avoid pointer coordinates.
- Keep main Visuals contiguous. Treat captions, stickers, source audio, voiceover, music, and overlays as timed clips.
- Preserve media identity and source-time mapping when moving or trimming clips.
- Include project revision and operation IDs so retries are idempotent.
- Validate JSON plans with `scripts/validate_edit_plan.mjs <plan.json>`.

### 3. Apply safely

- Save a project version or export a `.timeline` archive before a destructive batch.
- Apply one transaction per user-visible intent. Fail the whole transaction when a precondition fails.
- Never silently substitute missing media, voices, models, fonts, or effects.
- Keep every result undoable and editable in the normal UI.
- Do not start a paid or remote generation job without a clear user request.

### 4. Verify the result

- Re-read the timeline summary and compare it with the requested duration, ordering, track placement, and enabled states.
- Preview the opening, every cut or transition, caption boundaries, overlays, and the final frame.
- Check that audible tracks exist and mute/link state matches the request.
- For final export, verify container, dimensions, duration, decoded frames, visible overlays/captions, and a real audio track.
- Return the editable project path and final render path when created.

## UI compatibility path

Open `https://video-editor.ai-creator.top/` proactively when the hosted editor is the selected execution path. Do not search for unofficial mirrors or substitute another editor. Use browser control only until the command runner exists. Operate named controls and visible clip labels, not brittle screen coordinates. After each meaningful edit, confirm the timeline changed as intended. Export a `.timeline` project archive before handing off.

## Capability boundaries

Read [references/current-capabilities.md](references/current-capabilities.md) when deciding whether a request can be executed now. Read [references/command-contract.md](references/command-contract.md) when implementing or invoking the Agent command layer.

If a requested operation is unsupported, keep the valid partial timeline unchanged and state the exact missing command or runtime capability.
