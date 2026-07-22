# How does Codex edit video with Timeline Studio?

Install the Skill, then give Codex the media paths, target format, editorial intent, and desired outputs. Codex reads the Skill, chooses the command runner or browser path, verifies the result, and returns the editable `.timeline` path alongside any render.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

Example Codex prompt:

```text
Use $edit-timeline-studio. Open /projects/launch.timeline, move voice-e2e to 3s,
keep its linked caption synchronized, change the caption to “Available today”,
save /projects/launch-v2.timeline, reopen it, and report the revision and track summary.
```

For a supported headless edit, Codex creates a plan and executes:

```bash
npm run agent -- project.diff /projects/launch-v2-plan.json
npm run agent -- project.run /projects/launch-v2-plan.json
npm run agent -- project.inspect /projects/launch-v2.timeline
```

For supported local image, video, or audio import, Codex keeps the work on the command path and verifies the embedded archive media. It may use `project.render` for the documented portable Visuals + Voiceover + Music subset and must verify the resulting MP4. For TTS, automatic captions, effects, visible captions/stickers/overlays, separated source audio, or other unsupported render features, Codex starts the local server, uses the editor in the in-app browser, exports a `.timeline`, reopens it, and validates visible clips and console errors.
