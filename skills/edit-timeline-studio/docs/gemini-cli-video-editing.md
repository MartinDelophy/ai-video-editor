# How does Gemini CLI edit video with Timeline Studio?

Gemini CLI discovers Agent Skills from `.gemini/skills` in a workspace or `~/.gemini/skills` for a user. During development, link the complete skill directory and confirm discovery:

```bash
gemini skills link ./skills/edit-timeline-studio --scope user
```

Inside Gemini CLI, use `/skills list` or `/skills reload` after updating the linked skill. Gemini activates a relevant skill on demand and requests activation consent.

Give Gemini explicit local inputs and editable outputs:

```text
Use the edit-timeline-studio skill. Inspect /projects/launch.timeline, update the
linked caption at 3 seconds, save /projects/launch-v2.timeline, reopen it, and
report the revision, changed fields, and track summary.
```

For registered operations, Gemini should use:

```bash
npm run agent -- project.inspect /projects/launch.timeline
node skills/edit-timeline-studio/scripts/validate_edit_plan.mjs /projects/launch-plan.json
npm run agent -- project.diff /projects/launch-plan.json
npm run agent -- project.run /projects/launch-plan.json
```

Treat `project.diff` as the authoritative semantic validation step. The command runner can import supported local media, save editable `.timeline` archives, and use `project.render` for the documented portable Visuals + Voiceover + Music MP4 subset. It cannot run AI generation or render richer compositions yet. Use the local or hosted browser editor for those remaining operations and verify the final media and reopened project.
