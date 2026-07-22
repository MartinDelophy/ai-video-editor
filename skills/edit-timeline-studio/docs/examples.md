# What complete video-editing workflows can Agents reproduce?

Each case preserves an editable `.timeline`. Paths are examples; replace them with absolute local paths. Browser steps use the installed Skill because headless import, generation, and render commands are not available yet.

## 1. Codex turns an image folder into a vertical video

- User prompt: `Use $edit-timeline-studio. Import the five named images in order, create a 9:16 15-second video, add simple captions, export and verify it.`
- Input files: `/demo/images/01-cover.png` through `/demo/images/05-cta.png`, `/demo/script.txt`.
- Execution: `npm run dev`; Codex imports the five explicit files in the browser, sets 9:16, adjusts clip durations, adds captions, then exports.
- Timeline summary: five contiguous Visuals clips, five timed captions, 15 seconds, 9:16.
- Final output: `/demo/out/image-story.mp4`.
- Editable project download: `/demo/out/image-story.timeline` (created by File → Export project package).

## 2. Claude Code generates voiceover and synchronized captions

- User prompt: `Use the Timeline Studio skill to generate an English voiceover from script.txt, keep every caption linked, and verify playback.`
- Input files: `/demo/voice/script.txt`, `/demo/voice/background.png`.
- Execution: `npm run dev`; Claude Code selects an English voice in the browser, generates audio, verifies caption links, and exports the project and render.
- Timeline summary: one Visuals clip, one or more voiceover clips, linked timed captions, 16:9.
- Final output: `/demo/out/voice-caption.mp4`.
- Editable project download: `/demo/out/voice-caption.timeline`.

## 3. An Agent automatically revises a product introduction

- User prompt: `Move voice-main to 3s, keep linked captions synchronized, replace caption-hero text, and save a new revision.`
- Input file: `/demo/product/product-intro.timeline`.
- Execution commands: `npm run agent -- project.diff /demo/product/revise-plan.json`, then `npm run agent -- project.run /demo/product/revise-plan.json`, followed by `npm run agent -- project.inspect /demo/out/product-intro-v2.timeline`.
- Plan operations: `timed.move` for `voice-main`; `caption.update` for `caption-hero`.
- Timeline summary: revision 1, voiceover and linked caption begin at 3 seconds, original media entries unchanged.
- Final output: no opaque render is required for this metadata-only revision.
- Editable project download: `/demo/out/product-intro-v2.timeline`.

## 4. Batch-produce localized versions

- User prompt: `Create English, French, and German editable versions, preserving visuals and replacing narration and captions.`
- Input files: `/demo/localize/master.timeline`, `/demo/localize/{en,fr,de}.txt`.
- Execution: use the browser Skill once per language for voice generation; export `master-en.timeline`, `master-fr.timeline`, and `master-de.timeline`. Use `npm run agent -- project.inspect` on every archive and verify the expected caption/audio counts.
- Timeline summary: identical Visuals timing across three projects; localized linked caption and voiceover tracks.
- Final outputs: `/demo/out/master-{en,fr,de}.mp4`.
- Editable project downloads: `/demo/out/master-{en,fr,de}.timeline`.

## 5. Open a `.timeline`, unlink a caption, retime it, and re-export

- User prompt: `Unlink caption-7 from voice-2, set it to 8.2–10.0 seconds, change its text, and save without touching the source archive.`
- Input file: `/demo/revise/source.timeline`.
- Execution commands: `npm run agent -- project.diff /demo/revise/retime-plan.json`, then `npm run agent -- project.run /demo/revise/retime-plan.json`.
- Plan operations: `caption.unlink_audio`, then `caption.update` with `start`, `end`, and `text`; output points to a different archive.
- Timeline summary: one detached caption at 8.2–10.0 seconds; voiceover timing and archived media are unchanged; revision increments once.
- Final output: optionally reopen in the browser and export `/demo/out/revised.mp4`.
- Editable project download: `/demo/out/revised.timeline`.

For exact plan syntax, see [command-reference.md](command-reference.md). “Download” here means the portable archive produced at the listed path; examples deliberately do not claim hosted sample binaries that the repository does not ship.
