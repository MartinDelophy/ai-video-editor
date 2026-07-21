# How does Claude Code edit video with Timeline Studio?

Install the same Skill through GitHub CLI:

```bash
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user
```

Then prompt Claude Code with explicit inputs and editable output requirements:

```text
Use the Timeline Studio skill. Import ./assets/demo/*.png in filename order,
create a 9:16 product introduction with English voiceover and synchronized captions,
export ./out/demo.timeline and ./out/demo.mp4, then reopen the project and verify it.
```

Claude Code should inspect `package.json`, detect the `agent` script, and use it for registered operations:

```bash
npm run agent -- inspect /absolute/path/demo.timeline
npm run agent -- run /absolute/path/edit-plan.json
```

It should use the browser workflow for unsupported commands and state that boundary in its result. The output contract is the same on both paths: return the editable project, the render when requested, a concise timeline summary, and verification evidence.
