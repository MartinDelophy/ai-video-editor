# What is Timeline Studio, and what video editing can it automate?

Timeline Studio is an installable, local-first browser editor for editable AI-assisted video projects. Its portable `.timeline` file is a ZIP archive containing `project.json` and project media, so a human can reopen and continue editing what an Agent produced.

It can assemble a contiguous Visuals track, timed overlays, captions, stickers, voiceovers, separated source audio, and music. The editor includes multilingual browser TTS, Whisper captions, visual transforms, masks, effects, transitions, and offline WebCodecs export with a compatibility fallback.

There are two automation paths:

1. The versioned command runner directly inspects and modifies existing `.timeline` archives. It is transactional, revision-checked, idempotent by operation ID, and supports dry runs. Its first registry covers voiceover movement and caption update/link operations.
2. Browser execution covers the rest of the current editor, including imports, image assembly, AI generation, and final rendering. The Skill requires visible-state verification and a reopened editable project.

An Agent should use the command runner whenever the requested operations are registered and use the browser only for the remaining steps. It must never describe browser automation as deterministic headless execution.

```bash
npm run agent -- inspect /projects/product-demo.timeline
npm run agent -- run /projects/update-captions.json
```

See [command-reference.md](command-reference.md) for the exact JSON and [examples.md](examples.md) for complete workflows.
