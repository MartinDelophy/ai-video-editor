---
title: "From approved storyboard to editable timeline: a Sanity workflow for local video editing"
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a draft submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16). Publication is pending clarification of the existing-project eligibility rule and final author review.*

## What I Built

I built a storyboard review and handoff workflow for Timeline Studio. An author describes a sequence of shots, a reviewer requests changes or approves a version, and an editor turns that approved version into editable clips using media already on their computer.

**Scope disclosure:** Timeline Studio is an existing open-source browser video editor. I am submitting the new Sanity storyboard workflow developed during this challenge, not claiming that the entire editor was created during the entry period. The new work includes the document schema, review interface, revision-safe approval snapshots, browser draft recovery, and the approved-storyboard-to-local-timeline handoff.

The workflow frontend is an Astro page with an interactive React/Sanity Studio custom tool. The existing editing application retains its Vite build. Both are assembled into one static deployment: `/storyboard/` opens the workbench, while `/` immediately opens the editor.

The useful boundary is between a shared decision and private source media. Sanity holds the shot plan and review state. Images and video stay in the browser. Approval does not upload footage or silently modify an edit.

## Demo

[Open the editor](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/) · [Open the Astro storyboard workbench](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/storyboard/?lang=en)

![An editable storyboard imported into the local timeline](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/challenge-demo/sanity-storyboard-demo.png)

[Download the editable 13-second demo project](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/challenge-demo/sanity-storyboard-demo-2026-09-26.timeline).

The verified local demo contains three shots lasting 4, 5, and 4 seconds. It uses three existing public editor screenshots as local media. It is an editable 13-second demonstration project, not a recorded walkthrough of the approval process.

The [reviewer guide](https://github.com/MartinDelophy/ai-video-editor/tree/codex/sanity-storyboard-workflow/docs/sanity-challenge/reviewer-guide.md) has a no-login import route and a separate authenticated author/reviewer route.

In the real authenticated run, I created and saved a board, submitted it, requested a revision, recovered an unsaved local edit after reload, resubmitted it, and approved it. The editor then fetched the real approved snapshot and imported three visual clips plus three range annotations. I exported the resulting `.timeline` archive and reopened it in a fresh browser.

## Code

Base project: [Timeline Studio](https://github.com/MartinDelophy/ai-video-editor).

Feature branch: [codex/sanity-storyboard-workflow](https://github.com/MartinDelophy/ai-video-editor/tree/codex/sanity-storyboard-workflow).

The main contribution is in `src/sanity/`. `storyboard-site/pages/storyboard/index.astro` mounts the shared workbench; it does not duplicate the editing or approval logic.

## My Build Process

I used Codex, with the existing repository's local-first editing constraints as instructions. The initial request was to integrate Sanity on an independent branch. Later, I asked whether the result actually met the challenge requirements and asked Codex to fill the gaps.

The important development decisions were more specific than “add a CMS”:

- Keep the root URL as a direct editor. The workbench has its own route and bundle.
- Store structured shot plans, not opaque project archives or source videos.
- Require an explicit match between approved shots and local assets before importing.
- Preserve existing edits, normal ripple behavior, and one-step undo.
- Use ordinary Content Lake documents so the feature does not depend on paid workflow products.

These are a reconstruction of the implemented constraints, not a verbatim transcript of prompts. I have not published a complete agent session.

One important correction was distinguishing a test double from evidence of cloud behavior. Isolated checks exercised conflicts and withdrawn approval, but they did not establish that real login or writes worked. We subsequently used the actual signed-in Chrome session to validate cloud saves and approval, then performed an import without intercepted responses.

Browser reload also exposed a recovery case worth demonstrating: an unsaved change had to survive leaving the page. We confirmed recovery after the user accepted the browser's reload dialog, rather than treating a successful save as a draft-recovery test.

A second correction came from rereading the challenge: the original frontend was React/Vite, while the prompt names Astro or Next.js. I added a real Astro entry page for the new workbench and kept the existing editor intact. The first Astro build rejected `publicDir: false`; using a dedicated public directory fixed that configuration error. The initial Astro 7 build also exposed a cookie-module compatibility error. I pinned Astro 6.4.8 with its matching React integration, then verified the complete production build. The release checks are recorded in the accompanying readiness document.

## Sanity Project Details

- Project ID: **`rgq98xsq`**
- Dataset: **`production`**, public
- Storyboard: `ts-board-19e4f5ec-b9be-4a0b-9a8d-8f577f929e12`
- Approved snapshot: `ts-release-37ad30b2-04d4-4a10-a23a-652efb239341`

`tsStoryboard` contains the brief, content language, ordered shots, review note, status, actor/time, and an approved-release reference. Each shot has a stable key, duration, visual direction, narration draft, and asset hint.

`tsStoryboardRelease` contains the approved content snapshot, source revision, storyboard reference, and approval actor/time. Approval creates the release and updates the board in one transaction guarded by `ifRevisionId`. A stale save fails without discarding local edits.

The reader uses the non-CDN API and rechecks the approved release immediately before appending. This checks approval at fetch time; it is not a distributed lock against a subsequent cloud edit. Shot notes retain the release identity in the exported project.

The interface supports 13 languages. Narration remains editable notes at import time: this workflow does not automatically synthesize speech or captions.

## Limits and Tradeoffs

This is a Studio custom tool and an application-defined document workflow. It does not use Sanity App SDK or claim to implement agent-driven approval. UI approval is not an access-control boundary against a dataset administrator.

The demo dataset is public, including the script drafts and review notes. It contains shareable demonstration text, not confidential production scripts. Authentication and session refresh belong to official Sanity Studio; no developer write token is embedded in the editor.

Existing imported timelines are independent local edits. They do not silently change when someone revises the cloud storyboard. Media matching is explicit, and a video trim must fit the local source rather than looping or stretching silently.

## Agent Session

No public session attached yet. An optional curated transcript must omit secrets and private account details and be made publicly accessible before linking it here.
