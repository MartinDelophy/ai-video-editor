# Sanity storyboards

Timeline Studio can now connect an optional, authenticated storyboard workbench to its local video editor. The editor remains at `/`; `/storyboard/` is a separate Astro frontend mounting the shared React/Sanity Studio custom tool. Opening the editor does not download the Studio or require a Sanity account.

## Workflow

1. Open **File → Storyboards → Open workbench**. Sign in through Sanity's official login screen with an account authorized for the selected project.
2. Create a storyboard. Each ordered shot has a title, visual direction, duration, optional narration draft, and asset reference. Save the draft before submitting it for review.
3. A reviewer can return it with a note or approve its saved version. Approval creates a separate snapshot and updates the board's reference in one revision-guarded transaction. Revising an approved board withdraws it from new imports; previous snapshots remain stored.
4. Return to the editor, upload the required media, and load approved boards. Match each shot to ready local media and, for video, choose its source in-point. Video trims must fit within the source; there is no silent loop or stretch.
5. Review the append interval and select **Append to timeline**. The editor rechecks the approval, appends editable visual clips and range markers, and keeps the existing sequence. Shot direction and narration are marker notes; this action does not generate speech or captions. Existing ripple-mode rules apply to eligible timed tracks at the append boundary. One undo restores the pre-import project.

The marker notes carry the Sanity project, dataset and release ID and survive `.timeline` export/import. Markers are annotations, not rendered media, and do not extend export duration. Importing the same release twice is blocked while its identifying markers remain in the project. Removing those markers intentionally permits another import.

## Free-plan scope and privacy

This integration uses Content Lake documents, ordinary references, custom controls, and application-defined status transitions. It does not require paid Comments, Tasks, scheduled publishing, AI Assist, or a paid workflow service. Sanity does not generate the narration in this implementation.

Free datasets are public. Use public demo scripts or content that can be shared. Raw images, videos, browser asset URLs, local project files, and voice profiles are never uploaded by this feature. The cloud stores script text, shot metadata, review notes, approval snapshots and the responsible Sanity user ID. Even workflow drafts are ordinary public documents, not private Studio draft documents.

The Studio owns login and session refresh using the official Sanity authentication flow. No developer write token is compiled into the editor. The editor's approval reader is anonymous and read-only. Local recovery drafts are isolated by project, dataset and Sanity user ID. They are read before editing and preserved across network/revision errors; **Use cloud version** explicitly discards local edits, while **Save as new board** preserves their content under a new identity. A full local-storage failure is visible.

Approval is an application workflow, not an authorization boundary against other project administrators. Sanity project roles govern actual write access; a user with direct dataset write access can modify documents outside this UI. Free-plan users can use administrator accounts for authors/reviewers. More granular role assignment depends on the project plan.

## Configuration and local development

The default project is `rgq98xsq`, dataset `production`. The editor connection form supports another project and dataset and remembers only those public identifiers. A workbench link includes the same identifiers plus the interface language. To change the deployment defaults, set:

```dotenv
VITE_SANITY_PROJECT_ID=rgq98xsq
VITE_SANITY_DATASET=production
```

Use Node.js 22.19 or newer (required by the build dependencies), install with `npm ci`, and start the editor with `npm run dev:storyboards`. This uses `http://localhost:3333`, Sanity's standard development origin. The same process serves both `/` and `/storyboard/`. For this project's initial setup that origin was already allowed; other projects may need it added.

In Sanity project management, **API → CORS origins**, allow the exact development/deployment origin and enable credentials for the authenticated Studio. Do not add a wildcard origin. A login in Sanity's management dashboard is not necessarily a login in the embedded Studio on another origin. Let the user finish the official login flow; never request their password or copy their browser session.

For a deployment at `https://video-editor.ai-creator.top`, that exact origin must be added before cloud reads/login work. The Netlify storyboard fallback serves the Astro-generated `/storyboard/index.html` for nested workbench routes and login callbacks before the editor SPA fallback. The editor's cross-origin isolation headers stay intact. Production deployment is a separate action from developing this branch.

Run `npm run sanity:schema` after authenticating the official Sanity CLI to publish the shared schema to the selected project. The command needs write access and does not upgrade the billing plan. Schema publication is useful for Sanity's content inspection and agents; Content Lake CRUD itself does not require a deployed schema. The application and CLI share `src/sanity/schema.js`.

## Content contract

- `tsStoryboard`: title, brief, content language, ordered `shots`, `status`, `reviewNote`, transition actor/time and an `approvedRelease` reference.
- `tsStoryboardRelease`: immutable-by-UI content snapshot, reference to its storyboard, approval actor/time and source revision.
- Each shot: stable `_key`, title, visual direction, narration draft, asset reference, and duration in seconds.
- Status flow: `draft → inReview → approved`, or `inReview → changesRequested → inReview`; `approved → draft` begins a new revision.

The custom tool uses `ifRevisionId` on all updates/transitions. Release creation and board approval are atomic. The import reader uses the non-CDN API with cache disabled and rereads the currently approved reference immediately before applying locally. Because Sanity and the browser do not share a transaction, this establishes an approval check at fetch time, not a distributed lock against a later cloud revision.

UI copy for the integration is defined directly in 13 languages. Sanity's own authentication/provider screens are platform-owned. Astro, its React integration, Sanity Studio and styled-components are pinned; React was raised within the existing 19.2 patch series to satisfy Studio's peer requirement. The large Studio bundle loads only on the separate workbench route.

## Development evidence and checks

This feature was developed with Codex on `codex/sanity-storyboard-workflow`. The existing editor predates this work; the new contribution is the storyboard data contract, review tool, revision-safe saves, and reviewed local timeline handoff. Keep that distinction in a challenge submission.

Local validation on 2026-09-26:

- Production build and TypeScript check passed. Repository lint had no errors; the added integration files had no warnings. The existing repository still has unrelated warnings.
- The official Sanity CLI successfully extracted both document schemas.
- An isolated transport exercised draft save, review, change request, resubmission, approval, revision conflict, preserved edits and saving a separate copy.
- The real editor, with intercepted approval responses and a temporary uploaded image, appended two shots plus two range notes, restored the original sequence with one undo, and rejected withdrawn approval. The same interaction passed at 1440px and 412px widths.
- Direct browser reads against the real `rgq98xsq/production` dataset succeeded from `http://localhost:3333`, and the official Studio login screen loaded.
- A follow-up check in the user’s signed-in Chrome verified real authenticated creation/save, submission, change request, unsaved local recovery after a confirmed reload, resubmission, and approval in `rgq98xsq/production`. The resulting public demo board is `ts-board-19e4f5ec-b9be-4a0b-9a8d-8f577f929e12`; its approved snapshot is `ts-release-37ad30b2-04d4-4a10-a23a-652efb239341`.
- The real editor read that approved snapshot without intercepted responses and matched it to three existing public repository screenshots held as local assets. Import produced three editable visual clips of 4s, 5s and 4s, three range markers with shot notes and release provenance, and a 13s preview duration. No media was uploaded to Sanity.
- The real Chrome session exported the demo as a `.timeline` archive containing all three screenshots. A fresh browser reopened that archive and verified three visual clips, three markers and the 13s preview duration; ZIP media integrity checks also passed.
- After official GitHub CLI login, the shared schema was deployed successfully (1/1). No browser credentials were extracted for the CLI. The independent preview origin was added with credentials using Sanity’s official CLI.

Disposable verification scripts, transport doubles, schema extracts and screenshots live outside the product repository. Isolated transport checks are not evidence of authenticated cloud writes.

References: [Sanity transactions](https://www.sanity.io/docs/content-lake/transactions), [Studio](https://www.sanity.io/studio), [Growth trial and downgrade](https://www.sanity.io/docs/platform-management/growth-plan-trial), [DEV challenge](https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m).

## Astro production frontend and submission materials

`npm run build` builds the Vite editor, builds the Astro workbench into a separate temporary output, and assembles both into `dist`. Astro never clears the editor output or duplicates its public media/runtime directory. The workbench reuses the same `Workbench.jsx`, schema and workflow functions. `npm run dev:storyboards` remains the combined Vite development convenience; `npm run dev:workbench` runs the actual Astro frontend on port 3334 and needs that origin allowed in Sanity. Production preview must honor the `/storyboard/*` rewrite in `netlify.toml`.

See the [English submission draft](sanity-challenge/submission.md), [reviewer guide](sanity-challenge/reviewer-guide.md), and [eligibility clarification draft](sanity-challenge/eligibility-question.md). These are preparation materials, not evidence of a published entry or confirmed eligibility.

Preview deployment: [https://sanity-storyboards--web-player-ai-voice-editor.netlify.app](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/). This is a Netlify draft deployment; the production domain is unchanged. Public demo archive and screenshot were copied into the ignored deployment output from the external demo folder, not stored as test media in the product repository.
