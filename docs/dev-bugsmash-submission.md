---
title: "The Timeline Was Split, but the Audio Wasn't: Fixing Source Offsets in a Browser Video Editor"
published: false
tags: devchallenge, bugsmash, javascript, webaudio
---

*This is a submission for [DEV's Summer Bug Smash: Clear the Lineup](https://dev.to/bugsmash) powered by [Sentry](https://sentry.io/).*

## Project Overview

[Timeline Studio](https://github.com/MartinDelophy/ai-video-editor) is a local-first AI video editor that runs in the browser. It combines a multi-track timeline with captions, AI voiceovers, music, visual transforms, and deterministic offline export.

Like most editors, it uses non-destructive editing: splitting a clip should not rewrite the underlying media. Each timeline segment instead stores where it appears in the project and which range of the original source it represents.

That distinction exposed a subtle but very audible bug.

## Bug Fix or Performance Improvement

Voiceover clips could be split at the playhead, and the UI correctly produced two timeline segments. Their positions, durations, and waveform slices looked right. However, playback of the second segment started from the beginning of the original audio.

For example, splitting a four-second source after 1.5 seconds should create these views of the same source:

```text
first segment:  timeline 2.0s -> 3.5s, source 1.0s -> 2.5s
second segment: timeline 3.5s -> 6.0s, source 2.5s -> 5.0s
```

The old playback path effectively calculated only this:

```js
audio.currentTime = timelineTime - segment.start;
```

That is correct for an unsplit clip whose source starts at zero. It is wrong for the second half of a non-destructively split clip. The result was especially confusing because the timeline geometry and waveform suggested a clean edit while the user heard repeated audio.

The same data-model mismatch also affected explicit seeking and offline export. Fixing only real-time playback would have left the exported file different from the editor preview.

## Code

The fix is available in commit [`8287b90`](https://github.com/MartinDelophy/ai-video-editor/commit/8287b90a66ff0156246b6c6696f16775b35688fa).

The core split logic now preserves a source offset for the second segment:

```js
const firstDuration = time - source.start;
const secondDuration = source.duration - firstDuration;

const first = {
  ...source,
  duration: firstDuration,
  peaks: source.peaks.slice(0, peakSplit),
};

const second = {
  ...source,
  start: time,
  duration: secondDuration,
  sourceStart: (source.sourceStart || 0) + firstDuration,
  peaks: source.peaks.slice(peakSplit),
};
```

Every consumer then resolves source time with the same rule:

```js
const sourceTime = (segment.sourceStart || 0)
  + getTimelineTrackLocalTime(timelineTime, segment.start, segment.duration);
```

Offline mixing receives the same offset and trimmed duration:

```js
{
  sourceOffset: Math.max(0, item.sourceStart || 0),
  sourceDuration: Math.max(0, item.duration || 0),
  playbackRate: 1,
}
```

## My Improvements

### 1. I made the timeline segment model explicit

A timeline clip now carries two different coordinates:

- `start`: where the segment begins in the edited project
- `sourceStart`: where its content begins in the original audio

Keeping these concepts separate is the foundation of non-destructive editing. A split changes timeline ranges and source views, not the original `Blob`.

### 2. I fixed every playback path, not only the visible symptom

The source offset is now honored when:

- playback crosses into a segment;
- the user seeks with the playhead;
- the media synchronization effect corrects drift;
- the deterministic offline audio mixer prepares the export;
- the compatibility export path schedules decoded audio buffers.

This keeps preview and export behavior consistent.

### 3. I preserved waveform continuity

The waveform peak array is split at the proportional position of the edit. The first segment keeps the peaks before the cut and the second keeps the remaining peaks. This makes the visual representation agree with the source range users actually hear.

### 4. I preserved linked-caption behavior

When a voiceover is linked to a caption, the original caption stays linked to the first segment and its end is clamped to the split time. The new audio segment receives its own identity, preventing ambiguous links between one caption and two independently editable clips.

### 5. I added a regression test for the complete invariant

The test starts with a segment that already has a non-zero `sourceStart`, splits it at the playhead, and verifies:

- both timeline ranges;
- the accumulated source offset of the second segment;
- both waveform slices;
- fade-boundary cleanup;
- caption relinking;
- selection of the newly created segment;
- safe replacement of object URLs.

```js
expect(audioSegments[0]).toMatchObject({
  start: 2,
  duration: 1.5,
  sourceStart: 1,
  peaks: [0.1, 0.2],
});

expect(audioSegments[1]).toMatchObject({
  start: 3.5,
  duration: 2.5,
  sourceStart: 2.5,
  peaks: [0.3, 0.4],
});
```

The important part is `sourceStart: 2.5`: the original offset of 1 second plus the 1.5 seconds retained by the first piece.

## What I Learned

Media editors often display one timeline while internally managing several clocks: project time, clip-local time, source-media time, and sometimes playback-rate-adjusted time. Bugs appear when a shortcut that is valid for an unsplit clip is reused after editing creates a non-zero source offset.

The most useful invariant for this fix was:

```text
source time = source offset + clip-local timeline time
```

Once that rule was encoded consistently across playback, seeking, synchronization, and export, the editor stopped merely *looking* correct and began producing the correct audio as well.
