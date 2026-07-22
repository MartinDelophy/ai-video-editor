# How does GitHub Copilot edit video with Timeline Studio?

GitHub Copilot discovers Agent Skills from a repository `.github/skills`, `.claude/skills`, or `.agents/skills` directory, and personal skills from `~/.copilot/skills` or `~/.agents/skills`. Copy or link this complete skill directory so its `references/`, `docs/`, and validator script remain available alongside `SKILL.md`.

Prompt Copilot with explicit absolute media paths, editorial intent, aspect ratio, and editable output requirements:

```text
Use the edit-timeline-studio skill. Inspect /projects/demo.timeline, import
/assets/card.png to Visuals, add it after the current sequence, save
/projects/demo-v2.timeline, and verify the resulting revision and media inventory.
```

For registered operations, Copilot should run the versioned command workflow:

```bash
npm run agent -- project.inspect /projects/demo.timeline
node skills/edit-timeline-studio/scripts/validate_edit_plan.mjs /projects/demo-plan.json
npm run agent -- project.diff /projects/demo-plan.json
npm run agent -- project.run /projects/demo-plan.json
npm run agent -- project.inspect /projects/demo-v2.timeline
```

The structural validator is not sufficient approval by itself; `project.diff` is the authoritative semantic dry run. Use `project.render` for the documented portable Visuals + Voiceover + Music MP4 subset. Use the browser editor for AI generation, unsupported operations, preview, WebM, and richer compositions containing captions, stickers, overlays, transitions, effects, or separated source audio. Return the editable `.timeline` archive together with any requested render and verification evidence.
