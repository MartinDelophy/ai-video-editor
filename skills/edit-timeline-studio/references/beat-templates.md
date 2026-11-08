# Beat templates and mask transitions

For a request to apply a built-in beat template, inspect `capabilities.templates` using `timeline_project_inspect`. Match the requested pattern to the catalog, then inspect ready image and video assets. The catalog reports exact slot keys, required slots, default BPM and required tracks. Use the user's material in the requested slots. The four reference templates offer sample imagery, and Spinning Cards has a demo intro and numbered placeholder cuts.

| Template ID | Editing pattern |
| --- | --- |
| `beat-montage` | Three-panel beat montage with a required `main` source and optional `detail` and `alternate` shots |
| `card-rotation` | Four rotating media faces, a shattering heart, then ten numbered shot slots |
| `seven-slat-intro` | One image or video across seven timed reveal strips |
| `film-orbit-beat` | Six replaceable shots with neon film-frame motion |
| `ripple-mask-beat` | Ten shots with a diagonal fold and eight concentric mask transitions |
| `staggered-mask-beat` | Sixteen material slots for staggered overlays, step masks and two-sided shutters |

In the open editor, call `timeline_edit_preview` with the current `stateToken` and a `template` object. It takes `templateId`, optional `slots` keyed by material slot, `bpm` from 60 to 180, and `soundtrack` set to `none` or `built-in`. The default is `none`. The built-in score is added only when Music has no source and is writable. For Spinning Cards, optional `faces` maps `diamond`, `club`, `heart` and `spade` to ready asset IDs. Unspecified suits follow the selected beat material or demo faces. Preparing a personalized intro renders that short clip locally, so allow the preview call time to finish.

The reviewed template appends at the end of the main Visuals track and uses its default aspect ratio when that track is empty. Review the returned start, duration, soundtrack status, added tracks, effects and markers. Apply via `timeline_edit_apply` with its `previewId`. Inspect the result and sample frames at a beat boundary and during a reveal. Sample the mix if a soundtrack was requested. Template markers are annotations, and the generated intro is one editable video clip whose four media bindings are set when preparing the template.

For individual junctions use `transition.set` with the outgoing main clip ID, `transitionId` and optional `duration` in seconds. The mask IDs are `diagonal-fold`, `ripple-mask`, `step-mask` and `shutter-mask`. They reveal the incoming clip's first source frame before the cut and can use the full outgoing clip duration. Use `timeline_track_inspect({track:"effects"})` to inspect timeline effect instances. Full template preparation and rendered effects use the live browser. Local CLI/STDIO MCP can inspect existing effect clips and review or set transitions on an archive. Use the browser renderer for finished video containing these effects or transitions.
