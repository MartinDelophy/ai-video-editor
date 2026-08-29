# AI Video Editing Skill for Codex, Claude Code, Copilot and Gemini CLI

<a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a> <a href="https://linux.do"><img src="https://shorturl.at/ggSqS" alt="LINUX DO" /></a>

## Responsible use of deep synthesis

This tool uses deep-synthesis technology and is intended solely for technical research and learning.

Users must ensure that they:

- use only facial images or videos of themselves or people who have provided lawful authorization;
- do not create or distribute any illegal, infringing, false, or misleading content;
- do not present generated content as authentic footage or impersonate another person without their consent.

Users are solely responsible for any legal liability arising from violations of these requirements.

## Project updates

- **August 29, 2026 — Browser generation plugins:** the editor Plugins workspace now contains only Puter.js and Hugging Face Spaces. Puter uses real browser authentication and remote image/video generation with My assets delivery; Spaces are validated and embedded with an explicit output import path for their non-uniform APIs.
- **August 26, 2026 — Portable visual splits:** fixed Agent `visual.split` projects so both contiguous clips retain their archived source media after reopening, preserving the full video and embedded source audio through browser export.
- **August 24, 2026 — Rhythm click ripple:** added an editable osu!-inspired effect with music-aware timing, one full-frame refractive water ripple per hit, synchronized grayscale-to-color propagation, right-side controls, matched preview/export rendering, and localization across all 11 interface languages.
- **August 12, 2026 — Desktop color wheels:** added keyframe-ready shadows, midtones, highlights, and offset wheels plus temperature, tint, and saturation, with matching preview and export rendering.
- **August 7, 2026 — v0.9.2 cross-platform Agent Skill:** added reference-video reconstruction, highlight and tension shaping, promotion planning, provider-neutral footage sourcing, local model routing, host setup, voiceover preparation, and audio validation.

Timeline Studio is a local-first browser video editor plus an Agent Skill for creating editable, multi-track `.timeline` projects. It combines visual assembly, timed captions, multilingual AI voiceover, overlays, audio tools, and deterministic browser rendering without turning the project into an opaque one-off script.

Use it when a user asks an Agent to make a vertical short from images, synchronize captions with narration, prepare localized versions, modify an existing editable project, or verify a browser video-editing workflow.

## What can it produce?

Explore reproducible before/after examples and editing recipes:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

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

Skill installation copies the workflow but deliberately does not modify the host. On first local use, run the read-only dependency doctor:

```bash
node scripts/setup-host.mjs --check
```

If Node.js is missing, start with `sh scripts/bootstrap-host.sh --check` on macOS/Linux or `scripts/bootstrap-host.ps1` in Windows PowerShell. Both show an explicit language-runtime plan before their opt-in install mode.

If tools are missing, review the printed plan and explicitly authorize the interactive installer with `node scripts/setup-host.mjs --install`. It installs only declared media tools and pinned Python analysis packages in an isolated Timeline Studio runtime. It never bundles model downloads, GPU drivers, credentials, or paid services. See [host environment setup](references/host-environment.md).

Agent-driven Chinese and mixed Chinese/English narration uses Timeline Studio's owned Hojo TTS Light 80M FP16 browser bundle with two stable voices: 晴岚 and 若溪. Autoregressive generation runs on WebGPU and stable waveform decoding runs on WASM. It does not require MeloTTS, UniDic, or a separate Python voiceover environment. The first explicit generation downloads independently verified 16 MiB shards through ModelScope-first/Hugging-Face-fallback delivery and the editor caches them for repeat use. Product/software tutorials, vlog/travel/event recaps, product marketing/commerce shorts, and narrative/documentary condensations are narrated by default; existing authorized source speech is reused, and missing narration is synthesized locally before picture timing.

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
