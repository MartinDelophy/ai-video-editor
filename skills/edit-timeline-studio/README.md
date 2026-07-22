# AI Video Editing Skill for Codex, Claude Code, Copilot and Gemini CLI

Timeline Studio is a local-first browser video editor plus an Agent Skill for creating editable, multi-track `.timeline` projects. It combines visual assembly, timed captions, multilingual AI voiceover, overlays, audio tools, and deterministic browser rendering without turning the project into an opaque one-off script.

Use it when a user asks an Agent to make a vertical short from images, synchronize captions with narration, prepare localized versions, modify an existing editable project, or verify a browser video-editing workflow.

## What it can automate

- Inspect, dry-run, and transactionally modify a portable `.timeline` archive through a versioned JSON command plan.
- Move voiceover clips; update caption text and timing; unlink or relink caption/audio pairs.
- Import local visual or audio assets through the command runner with probing, SHA-256 integrity metadata, and portable archive embedding; use archived media for Visuals assembly and overlays.
- Use the browser compatibility path for AI speech, automatic captions, effects, unsupported editor operations, and final video export while more commands move into the shared registry.
- Preserve the editable project as the source of truth and verify the reopened result.

The command runner reads and writes `.timeline` projects, supports deterministic local media import, and can render its documented portable Visuals + Voiceover + Music subset to verified MP4. AI generation and richer composition rendering remain available through the local or hosted browser editor.

## Install

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

Claude Code and Codex can also install through GitHub CLI:

```bash
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

For repository development:

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run agent -- project.inspect /absolute/path/project.timeline
npm run dev
```

## Public guides

- [What Timeline Studio is and what it automates](docs/agent-video-editing.md)
- [Use it from Codex](docs/codex-video-editing.md)
- [Use it from Claude Code](docs/claude-code-video-editing.md)
- [Use it from GitHub Copilot](docs/github-copilot-video-editing.md)
- [Use it from Gemini CLI](docs/gemini-cli-video-editing.md)
- [Five reproducible workflows](docs/examples.md)
- [Command reference](docs/command-reference.md)
- [Comparison with FFmpeg, CapCut, and Remotion](docs/comparison.md)

The exact execution boundary is documented in [current capabilities](references/current-capabilities.md); the transport-neutral schema lives in the [command contract](references/command-contract.md).
