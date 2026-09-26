---
title: "Timeline Studio: From Approved Storyboard to Editable Video with Sanity"
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16).*

## What I Built

A storyboard is useful only if the editor can turn it into an actual sequence of shots. I wanted to connect those two steps without making creators upload all their footage to a cloud service.

I develop and maintain **Timeline Studio**, an open-source browser video editor. For this challenge, I built a Sanity-powered storyboard workflow: write a shot plan, review it, approve a specific version, and turn that version into editable timeline clips using local media.

Sanity stores the shared creative decisions. The browser keeps the source footage and the edit.

The workflow is straightforward:

1. An author creates a brief and ordered shots, each with a duration, visual direction, optional narration draft, and asset hint.
2. A reviewer requests changes with a note or approves the saved version.
3. Approval creates a separate snapshot of that version.
4. In the editor, the creator chooses an approved storyboard and matches its shots to local images or videos.
5. The editor checks that approval is still current, then appends editable clips and shot annotations. One undo reverses the import.

The new workbench uses **Astro with an interactive React/Sanity Studio custom tool**. It shares the schema and workflow components with the editor integration. The editor retains its Vite build, and the two outputs are assembled into one static deployment. `/` opens the editor directly; `/storyboard/` opens the workbench.

## Demo

- [Try the editor — no login required](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/)
- [Open the storyboard workbench](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/storyboard/?lang=en)
- [Download the editable demo project](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/challenge-demo/sanity-storyboard-demo-2026-09-26.timeline)
- [Step-by-step reviewer guide](https://github.com/MartinDelophy/ai-video-editor/blob/codex/sanity-storyboard-workflow/docs/sanity-challenge/reviewer-guide.md)

![An approved storyboard imported as editable clips and timeline annotations in Timeline Studio](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/challenge-demo/sanity-storyboard-demo.png)

The demo is a **13-second editable sequence**, with three shots lasting 4, 5, and 4 seconds. Its local media are screenshots of the editor. Open the downloaded `.timeline` file through the editor's Open project action to inspect the clips and annotations. This is a project archive, not an encoded video or a recording of the review process.

To exercise the cloud handoff, upload local media, open **File → Storyboards**, load the approved demo board, match each shot, and append it. Reading approved boards and editing locally do not require a Sanity login.

Writing and reviewing in the workbench require an account authorized for the selected Sanity project. The reviewer guide also explains how to use your own project and dataset through the connection form. No shared owner password is needed.

## Code

[Source code and feature branch](https://github.com/MartinDelophy/ai-video-editor/tree/codex/sanity-storyboard-workflow)

The main workflow lives in `src/sanity/`. The Astro entry at `storyboard-site/pages/storyboard/index.astro` mounts the shared workbench. Approval and timeline import each have one implementation, rather than separate copies for different frontends.

## My Build Process

I built this integration with **Codex**, iterating on the data contract, interface, and behavior in the actual browser.

My initial instruction was to integrate Sanity on an independent branch. The useful follow-up constraints were concrete: keep media local, preserve the direct editor experience, import only approved content, and protect existing timeline edits. These are a summary of the working constraints, not a verbatim prompt transcript.

### Make the handoff explicit

A cloud storyboard cannot assume that a creator's local file has a particular URL or duration. We made media matching a deliberate step. For video, a source in-point and shot duration must fit the source; the importer does not quietly loop or stretch footage.

The append operation uses the editor's existing ripple-editing behavior and undo system. Shot direction and narration become range-marker notes. They remain editable and do not extend the rendered media duration. Importing a narration draft does not automatically generate speech or captions.

### Treat approval as a versioned decision

A status label alone was insufficient. A reviewer might approve one version while another browser still holds older changes.

We used revision-guarded writes and a separate approved snapshot. Conflicting saves preserve the user's local edits, and unsaved drafts can recover after reload. Revising an approved board removes it from new imports until it is approved again.

### Verify the real integration

Isolated checks helped exercise revision conflicts and withdrawn approvals, but those checks did not establish that authentication and real cloud writes worked.

We then used my signed-in Chrome session to create, save, submit, request changes, recover an unsaved edit after reload, resubmit, and approve a real board. The editor fetched the actual approved snapshot, matched local assets, and created three clips and three annotations. The exported project reopened in a fresh browser.

The deployed preview was checked separately: the Astro workbench loaded the approved board, and anonymous cloud read → local import → undo passed without intercepting network responses.

### Work through build issues

The first Astro configuration used `publicDir: false`, which the build rejected. A dedicated public directory fixed that. An Astro 7 build then exposed a cookie-module compatibility error. Pinning Astro 6.4.8 with its matching React integration produced a working build.

The combined production build and TypeScript check pass. Lint reports zero errors; the repository still has pre-existing warnings. The Sanity schema has also been deployed through the official CLI.

## Sanity Project Details

- **Project ID:** `rgq98xsq`
- **Dataset:** `production` — public
- **Demo board:** `ts-board-19e4f5ec-b9be-4a0b-9a8d-8f577f929e12`
- **Approved snapshot:** `ts-release-37ad30b2-04d4-4a10-a23a-652efb239341`

The schema has two document types:

| Document | Responsibility |
| --- | --- |
| `tsStoryboard` | Brief, language, ordered shots, review note, workflow status, actor/time, and approved-release reference |
| `tsStoryboardRelease` | Approved content snapshot, source revision, storyboard reference, and approval actor/time |

Each shot has a stable key, duration, visual direction, narration draft, and asset hint. Approval creates the release and updates the board in one transaction guarded by `ifRevisionId`.

The editor reads through the non-CDN API and rechecks the approved snapshot immediately before appending. This establishes approval at fetch time; it is not a distributed lock against a later cloud revision. The imported annotations retain the release identity for provenance.

## Design Choices and Limits

This uses ordinary Content Lake documents and an application-defined review workflow. It does not require paid workflow features, and it is a Studio custom tool rather than an App SDK application.

The dataset is public, including demo script drafts and review notes, so it contains only shareable material. Source images, videos, voice profiles, and local project archives are not uploaded by this feature. Official Sanity Studio handles authentication; no developer write token is embedded in the editor.

Approval is an application workflow, not an access-control barrier against a dataset administrator. Imported timelines are independent local edits: later storyboard changes do not silently rewrite a creator's project.

The integration's controls support 13 languages. The result is a small but complete bridge from a shared, reviewed shot plan to a local, editable video sequence.

## Agent Session

I used Codex for implementation, debugging, validation, and assistance preparing this writeup. No public agent-session transcript is attached; the code and reviewer guide document the implementation and reproducible workflow.
