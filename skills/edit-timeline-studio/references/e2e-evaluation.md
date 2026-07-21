# End-to-end evaluation loop

Use real browser interactions and real media. Unit tests and DOM assertions supplement this loop but do not replace it.

## Required loop

1. Define one user-visible scenario, its fixture, starting state, and expected outcome.
2. Run it from a fresh project and capture concise evidence at every meaningful boundary.
3. Record the first failed action exactly; do not hide it behind the successful fallback.
4. Classify the cause:
   - `product`: editor behavior or accessibility contract is wrong;
   - `browser-control`: the automation surface behaves differently from normal UI input;
   - `environment`: port, codec, model, browser, network, or filesystem condition;
   - `skill`: guidance was missing, ambiguous, stale, or overly confident.
5. Fix the product or update the smallest relevant Skill section. Do not encode a product bug as permanent workflow guidance when the product can be fixed.
6. Run the skill validator, synchronize the installed copy, rerun the failed scenario, then run adjacent smoke scenarios.
7. Preserve raw screenshots, console errors, media probes, downloads, and project archives outside the Skill directory when they materially explain a failure.

## Core scenario matrix

Run these across empty and pre-populated projects where applicable:

1. Start the local server with the default port free and occupied; open the actual emitted URL.
2. Import the first image, first video with audio, video without audio, and audio-only asset.
3. Import a second visual and verify it remains in the asset library until explicitly placed.
4. Exercise visible upload controls, file-input fallback, drag/drop, rejected type, duplicate filename, and canceled chooser.
5. Verify the first-visual coach guide: persistent completion only through the user's explicit action; temporary dismissal through close or Escape.
6. Trim, split, reorder, delete, undo, redo, save, reopen, and compare media identity and source-time mapping. Include a sub-second split where mute controls and handles consume most of the clip width; verify clip-scoped context-menu deletion and immediate recovery from a deliberately detected wrong-target action.
7. Add and move captions, stickers, voiceover, music, source audio, and picture-in-picture; verify lane visibility and overlap packing.
    - On mobile, tapping a sticker must stage it without changing the timeline, reveal one fixed Cancel/Add sticker bar, add exactly one timed sticker only after confirmation, and close without mutation on Cancel. Verify a dense four-column grid at 412×915. Desktop remains a three-column grid with its existing click-to-add behavior and no mobile confirmation bar.
    - In both desktop and mobile Captions properties, verify the empty state shows exactly one visible Add caption action and one Import SRT action. Add caption creates a localized default caption at the current playhead, selects it, focuses its text editor, and remains available beside the populated caption list without duplicating the empty-state controls.
    - At both the 48px desktop row height and 40px mobile row height, verify voiceover, source-audio, and music clip bodies are vertically centered with their complete waveform border and selection outline visible above the row divider; the transparent touch target may be larger than the 32px visible body.
    - Verify every visible source-audio, voiceover, and music clip has waveform bars on desktop and mobile. With decoded peaks, bars reflect those peaks; with deliberately empty peaks during restore/editing, a stable low-emphasis placeholder remains visible instead of a blank clip.
8. Verify embedded video audio, mute, Separate audio, derived-piece deletion, link modes, preview playback, and export without doubled or missing sound. Separate audio from a clip trimmed at both ends and assert the project duration, source-audio piece duration, source start, source duration, and waveform range remain mapped to that clip rather than the full original asset.
9. Change transforms, masks, keyframes, speed, effects, animations, and aspect ratio; compare preview with deterministic export.
    - For both a video clip and a voiceover/independent-audio clip, test 0.5×, 1×, 1.5×, and 2× on desktop and mobile. Verify the timeline width and linked caption end update from preserved source duration, seeking resolves the correct source timestamp, splitting advances source offsets by timeline duration multiplied by rate, and decoded export duration/audio match preview. Use a known-frequency or voiced fixture to verify linked-audio speed changes preserve pitch in preview, deterministic export, and compatibility export.
10. Export MP4/WebM and decode the entire result to verify dimensions, duration, frame count, visible captions/overlays, and a real non-silent audio track when expected. Extract frames inside every caption range and visually verify the burned-in text. Test both a captured browser download event and the fallback where the event times out but a new artifact exists on disk.
11. Compare same-tab autosave, a newly opened same-origin tab, and explicit `.timeline` save/reopen. Verify duration, ordering, assets, track state, selections that should persist, and generated media links; never treat an “Autosaved” label as proof that local blobs will reopen.
12. Repeat critical flows in every supported interface language, narrow desktop panels, reduced motion, and at least the supported Chromium path; include Firefox/Windows regressions when available.
13. On mobile, select visual, caption, sticker, source-audio, voiceover, and music clips by ordinary tap and verify that the fixed action bar is track-specific. Voiceover and music must expose Audio, Split, Captions, Vocal Separation, and Delete; source audio must omit unsupported vocal separation; visual clips must not expose audio-only actions. At desktop width, the mobile bar stays hidden and the corresponding right-click context menu remains available.
    - Sticker clips expose Back, Properties, Copy, and Delete. Properties opens the selected sticker's dedicated property drawer directly while the selected clip and fixed action bar remain visible; closing the drawer preserves both, and Delete removes the clip and hides the empty sticker lane.
    - Repeat after first selecting a Visuals clip. Press a voiceover clip before the prior selection state settles, then press Edit; the explicit pressed-track target must win and open audio-clip properties rather than Visuals properties.
14. Still on mobile, verify that selecting a source-audio, voiceover, or music clip pans the timeline just enough to keep the full time-accurate clip visible when it fits. For all three audio types, the clip action bar's Audio action opens the dedicated audio-clip property sheet directly above the current action bar; the selected clip and its Back/Audio/Split/Captions/Separation/Delete menu remain visible and unchanged throughout opening, editing, and closing, and neither the Audio feature home nor the persistent Media/Captions/Smart/Audio/Stickers rail may replace it. Verify that voiceover and music speed changes update time-accurate clip width, pitch-preserving preview, and export; linked source-audio speed changes its associated video clip. Long localized audio-track labels remain one ellipsized line inside the label column, and desktop behavior remains unchanged.
    - Verify one-second and sub-second audio clips at mobile zoom: clips rendered at 220px or narrower hide the duration badge entirely so the waveform and clip body remain unobstructed; wider mobile clips may use compact copy without intercepting dragging or selection. Desktop retains the precise full duration label.
15. Exercise AI paths with cold and warm caches, unavailable models, download failure, cancellation, WASM/WebGPU fallback, and truthful backend reporting.
16. Test handoff-only requests separately from concrete editing requests so the Agent never invents creative changes.

## Observation record

Keep each finding concise and reproducible:

```json
{
  "scenario": "first video import on occupied default port",
  "fixture": "/absolute/path/video.mp4",
  "attempt": "activate Choose File while listening for filechooser",
  "observed": "no chooser event",
  "fallback": "click visible upload surface with current screenshot coordinates",
  "verification": "asset card and 17.94-second Visuals clip appeared",
  "classification": "browser-control",
  "skillChange": "document upload fallback and actual-port discovery",
  "regressions": ["first image import", "second visual remains in assets"]
}
```

Never place credentials, private media contents, or unrelated local paths in an observation record.
