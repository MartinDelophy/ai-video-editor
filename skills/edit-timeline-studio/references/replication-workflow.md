# Reference-video replication

Use this workflow when the user asks to reproduce a reference video's edit, pacing, shot design, or AI-generated result. Replicate the transferable creative grammar, not protected identity, branding, or copyrighted footage the user is not authorized to use.

## 1. Route the request

Classify the job before editing:

- `editing-style replication`: Rebuild the reference from user media or lawfully sourced replacement media. Match its pacing, shot functions, framing, motion grammar, transitions, filters, captions, and beat structure without requiring generated video.
- `AI-generation replication`: Reverse-engineer the storyboard and timing, then create the missing shots with an AI video service or model.
- `hybrid`: Use supplied or sourced footage where it fits and generate only the coverage gaps.

Do not treat “replicate this video” as permission to clone a real person's face or voice, remove provenance, misrepresent generated footage as real, or reuse unlicensed source media. Preserve visible disclosures and generation provenance.

## 2. Resolve the few decisions that change the build

Inspect the reference and provided media first. Then resolve only material gaps:

1. Confirm the intended output ratio, approximate duration, and whether the goal is close visual reconstruction or adaptation of the style to new content.
2. Explicitly ask whether to retain the authorized original audio track. Record one of `retain`, `replace`, or `undecided`; never infer `retain` merely because the reference has audio.
3. For editing-style replication, inventory the user's clips and map them to reference shot functions. If coverage is missing, state the missing roles before sourcing or generating replacements.
4. For AI-generation replication, confirm whether remote or paid generation is permitted and which people, products, logos, text, or environments must remain invariant.

If original audio is retained, verify the user may use it and preserve its exact source-time mapping. If it is replaced, rebuild narration, music, ambience, and sound effects deliberately rather than leaving accidental fragments from the reference.

## 3. Pass the analysis-completeness gate

Do not edit from a sparse contact sheet, a scene-threshold list, or audio beats alone. Read [local-model-routing.md](local-model-routing.md), inventory the repository's locally available and pinned mirrored models, and choose the minimum model chain needed for unresolved evidence. Analyze the whole reference at no coarser than 0.25-second visual intervals, then inspect every detected cut, look change, motion discontinuity, and repeat candidate at native frame rate or within two source frames. Run `scripts/analyze_replication.py <reference> --output-dir <analysis-dir>` when OpenCV and NumPy are available; otherwise reproduce the same evidence with ffprobe, ffmpeg, direct frame inspection, and audio analysis. Keep the raw reference immutable and do not run restoration, repair, interpolation, or aggressive stabilization before extracting evidence.

Build seven time-aligned evidence layers:

1. **Audio clock:** Map music onsets, beats, phrases, accents, silence, and sound effects. When retaining original audio, preserve the complete authorized track at its original source time and gain unless the user explicitly requests a mix change.
2. **Shot and sub-shot boundaries:** Separate hard cuts, flash frames, blur transitions, wipes, overlays, freeze frames, and cuts inside one source shot. A filter change, speed-ramp breakpoint, or repeated insert may create a new editable sub-shot even without a semantic scene change.
3. **Source-reuse graph:** Group repeated frames, repeated source intervals, alternate grades of the same interval, mirrored/reversed reuse, and recurring visual motifs. Record `repeatOf`, occurrence order, and whether repetition is exact, retimed, reframed, or regraded. Never deduplicate an intentional repeat.
4. **Temporal-operation map:** Record source in/out, output in/out, split points, holds, freezes, loops, reversals, jump cuts, and piecewise playback rates. Optical-flow magnitude alone cannot prove a speed value; infer a speed curve only from motion continuity, repeated-source comparisons, frame cadence, and source/output duration evidence. Mark uncertain rates as hypotheses.
5. **Look-state timeline:** Track color versus monochrome, exposure, contrast, saturation, temperature/tint, channel bias, vignette, sharpen/soften, glow, grain, blur, posterization, and opacity/composite changes. Detect look changes from frame evidence and image statistics; do not label every brightness change as a filter when it may come from the source lighting.
6. **Transition anatomy:** Inspect the frames before, during, and after each boundary. Record duration, direction, easing, blur radius or zoom amount, flash color, frame overlap, and whether the effect belongs to the outgoing clip, incoming clip, or a separate overlay.
7. **Subject-geometry track:** Use a semantic detector or valid instance mask to anchor local tracking; never derive the subject from background optical-flow clusters. Detect and track the principal person or semantic subject in every shot. Record center x/y as percentages, bounding-box width/height, headroom, foot or object completeness, facing direction, scale, identity state, confidence, and the smoothed screen-space path. Distinguish intentional reference travel from accidental detector jitter or camera drift. When the reference keeps a person centered, require the replacement to stay within a defined center tolerance; when the reference moves the person, reproduce that path rather than forcing static centering.

Also compute the `highlightScore` defined in [local-model-routing.md](local-model-routing.md) as a secondary, time-aligned emphasis track. Use its audio, motion, shot-change, same-face expression, and clarity contributions to prioritize native-frame inspection around likely impact moments. It does not replace any of the seven evidence layers and cannot justify deleting or inventing an interval.

Read [highlight-tension-workflow.md](highlight-tension-workflow.md) and build a role-based beat map plus `tensionTarget` before choosing replacement shots. Mark setup, rise, pre-impact, primary/secondary peak, aftershock, and bridge roles; identify anticipation, apex/hero, and result frames at native rate for every peak. Do not let every fast or high-scoring interval compete at equal weight. Reserve the strongest clear source action for the primary peak and require surrounding beats to prepare, contrast with, or release it.

The gate passes only when every reference interval belongs to an identified shot or sub-shot and each row has a source/reconstruction role, audio relationship, temporal operation, look state, transition-in/out, repetition group, subject-geometry target, confidence, and acceptance criteria. The analysis record must also include the local-model capability inventory and exact inference provenance for every model-derived track. Resolve unexplained intervals before acquiring replacement footage or editing.

### Strict look reconstruction and visual optimum

Treat appearance as a time-varying target, not one preset for the complete video. Split a look state at any meaningful exposure, grade, filter, lighting, blur, flash, or texture change, including changes inside one semantic shot. For each stable interval and transition ramp, measure and retain:

- linear or decoded luma distribution, median brightness/lightness, black point, white point, shadow/highlight percentiles, clipping ratios, gamma/midtone shape, global and local contrast;
- saturation distribution, hue occupancy, skin or principal-subject color where present, neutral balance, temperature/tint, Lab channel bias, RGB channel means/curves, and selective-color relationships;
- sharpness and edge density, defocus/motion blur, denoise or compression character, grain/noise, glow/halation, vignette, posterization, opacity, blend/composite state, and monochrome conversion behavior;
- global-frame, principal-subject, face/skin when applicable, costume/product, and background measurements separately so a bright background does not force the subject to the wrong grade.

Estimate the replacement's ungraded measurements on the exact chosen source interval after crop/reframe but before the final look. Solve editable grading parameters to minimize a bounded perceptual objective rather than copying reference slider values that were applied to different source pixels. Use a documented objective such as:

`lookError = w1*lumaDistribution + w2*contrastCurve + w3*LabColor + w4*saturationHue + w5*subjectColor + w6*textureSharpness + w7*temporalConsistency + penalties`

Set weights per shot purpose and record them. Penalties must cover clipped highlights, crushed blacks, unstable frame-to-frame exposure, implausible skin, broken brand/product colors, damaged costume identity, amplified compression, halos, banding, and excessive sharpening. For Spider-Man or similarly color-coded subjects, preserve recognizable red/blue relationships unless the reference intentionally enters monochrome or a clearly different stylized state.

Optimize in stages: exposure and black/white points; contrast and gamma; white balance and channel bias; global and selective saturation/hue; local subject/background balance; then texture, blur, grain, glow, and vignette. Re-measure after every stage. Use masks or semantic subject regions only when locally available and quality-gated; feather temporal masks and reject identity/matte failures instead of letting the grade flicker.

The visual optimum is the closest perceptual reconstruction that remains technically valid and semantically faithful. A lower numeric histogram error is not better if it clips detail, makes skin or costume colors implausible, introduces flicker, or destroys source quality. When exact reference appearance and replacement-footage integrity conflict, preserve the reference's look hierarchy and intent while minimizing visible damage, then record the residual mismatch.

Validate every look state with same-timebase A/B frames, difference or histogram evidence, and continuous playback across its entry and exit. Report per-state luma, color, saturation, texture, clipping, and temporal-stability error separately; do not hide one failed state inside a video-wide average.

## 4. Reverse-engineer an editable blueprint

Create an editable shot table with one row per reference beat:

- reference in/out time and duration;
- narrative or commercial purpose;
- subject count, action, framing, camera angle, and composition;
- global camera motion and semantic subject motion;
- speed changes, holds, loops, and transition anatomy;
- filter, grade, blur, depth, texture, graphics, captions, and overlays;
- source occurrence group, split/reuse relationship, and exact-versus-retimed repetition;
- piecewise playback-rate curve, freeze/reverse state, and confidence basis;
- principal-subject center, scale, headroom/completeness, path, and allowed drift;
- spoken phrase, music onset, beat, accent, silence, and sync relationship;
- reconstruction method: supplied clip, lawful sourced clip, generated shot, or graphics;
- confidence, invariants, and acceptance criteria.

Also record beat role, target tension, candidate-versus-selected highlight status, subject dominance, action legibility, stakes/meaning, visual novelty, audio alignment, hero-frame time, result-frame time, and contribution to the next payoff. A row cannot pass as a peak merely because it has high motion or a cut on a beat.

Use representative frames, dense boundary frames, OCR, transcript, audio onsets, perceptual similarity, and both global and subject-region optical flow. Use optical flow to measure movement, stabilization, reframing, temporal discontinuities, and transition motion; do not use it alone to identify a filter, subject, exact playback rate, or editorial intent. Infer filters and grading from image statistics plus frame evidence, infer semantics from vision/speech/OCR, infer repetition from structural similarity across nonadjacent intervals, and infer cut points from the combined audio-visual record.

When retaining original audio, make the audio clock authoritative. Mark phrase boundaries, music beats, accents, pauses, and sound-effect events, then align shot entries, exits, speed ramps, filter changes, and motion peaks to those events. Preserve natural sync and reject a visually similar cut that drifts from the retained track.

## 5. Build an editing-style replication

Prefer the user's supplied media. Match each source to a shot function and subject-geometry target rather than forcing chronological one-to-one substitution. Preserve source identity and keep the mapping from reference beat to replacement clip visible in the decision record.

When the user supplied no suitable media, read [web-footage-sourcing.md](web-footage-sourcing.md) and search the current web for downloadable, lawfully usable footage. Give provider-neutral, current suggestions across suitable source categories instead of hard-coding a platform. Short-video platforms are valid candidates when the original publisher or authorized account enables a platform-provided download. Prefer first-party sources and explicit commercial-use terms when the output is commercial. Record the source URL, creator/provider, download path, license or usage basis, access date, exact downloaded asset, checksum, and intervals used. Do not use third-party downloaders, bypass a disabled control, remove provenance watermarks, or assume search-result visibility or downloadability grants reuse rights. If no compliant source fits, present the gap and offer generation or a user-supplied replacement.

Detect and track the replacement's principal subject before deciding its crop. Map the replacement subject path to the reference subject path with crop/transform keyframes or smart reframing. Use bounded smoothing and explicit keyframes so the subject does not float, jitter, or drift away from a reference-centered composition; verify that the crop never removes required head, hands, feet, costume, or product geometry.

Split replacement sources at every required sub-shot boundary. Reuse the same source interval when the reference repeats it, and preserve the repeat's exact order, duration, grade, crop, direction, and rate variant. Recreate filters, movement, transitions, reframing, piecewise speed ramps, freezes, captions, and beat cuts as editable clip properties and effects. A constant trim is not an acceptable substitute for an observed speed curve or repeated insert. Build the simplest mechanism that explains all evidence. Do not bake the entire reference into one overlay or use the reference video as the hidden final render.

Keep this path local-first when a repository or `.timeline` project is available: run analysis and asset preparation locally, express edits through project-file operations, render locally, and decode/compare locally. Do not open the editor UI for routine imports, trims, filters, transforms, repetitions, speed segments, transitions, rendering, or verification once the local project pipeline supports them. Use Browser only for a confirmed UI-only capability or an explicit user request.

## 6. Build an AI-generation replication

Finish the shot table before choosing a generator. Convert each row into a generation brief containing subject/action, environment, framing, camera motion, duration, aspect ratio, start/end continuity, negative constraints, and locked identity or product details. Generate shot-by-shot rather than asking one long prompt to reproduce the full edit.

If the user has not selected a generator, read [remote-video-generation.md](remote-video-generation.md), search current official platform documentation, and present a short comparison of viable options. Compare only capabilities material to the blueprint: text-to-video or image-to-video input, reference/identity control, camera control, native shot duration, aspect ratio/resolution, audio support, regional availability, cost or credits, privacy, watermark/provenance, and API or UI access. Cite the official sources and let the user choose before starting a paid, remote, account-bound, or privacy-sensitive job. Do not claim a platform capability from memory when it may have changed.

Keep prompts, reference images, model/service identity, settings, seeds when available, raw generations, and provenance with the project. Reject generations that change protected identity, product geometry, readable text, required action, or continuity. Regenerate only failed rows, then assemble them against the reconstructed timing blueprint.

When retaining original audio, generate visuals to the audio-defined beat durations and trim or retime only within natural motion tolerances. When replacing audio, lock the new narration and audio structure before final shot timing.

## 7. Validate replication quality

Render a first pass and compare it with the reference on the same timebase before declaring completion. Produce a full-duration paired contact sheet plus boundary strips for every edit point. Compare shot/sub-shot count and duration, repeated-occurrence order, source reuse, split points, piecewise speed curves, freeze/reverse behavior, look-state changes, framing, subject center/scale/path and drift, camera and subject motion, transition anatomy, text placement, beat synchronization, retained-audio waveform alignment, and invariants.

Score `timing`, `repetition`, `temporal operations`, `look`, `transition`, `subject geometry/framing`, `motion`, `audio sync`, `highlight hierarchy`, and `tension shape` separately. Identify the worst mismatch, revise it, and rerender. Do not average away a failed category: close timing cannot compensate for missing repetition, a monochrome preset cannot compensate for the wrong look-state sequence, centered source crops cannot compensate for subject drift, correct clips at constant speed cannot compensate for missing ramps, and dense beat cuts cannot compensate for a missing primary payoff.

Reject completion for unexplained reference intervals, missing repeated shots, flattened source reuse, missing split or speed operations, guessed filters, copied unauthorized media, unapproved remote generation, identity or product drift, missing provenance, audio-sync drift, equal-weight shot intensity, an obscured hero frame, missing anticipation/result coverage, a flat tension envelope, or a flattened render that is not normally editable. Deliver both the portable `.timeline` project and rendered result under the standard verification workflow.
