# Reviewer guide

Deployed preview: [https://sanity-storyboards--web-player-ai-voice-editor.netlify.app](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/).

For a quick look without importing a board, download the [editable demo archive](https://sanity-storyboards--web-player-ai-voice-editor.netlify.app/challenge-demo/sanity-storyboard-demo-2026-09-26.timeline) and use the editor’s Open project action. To exercise the actual cloud-to-local handoff, follow the import steps below.

 Locally run `npm ci` with Node 22.19+ and `npm run dev:storyboards`, then open `http://localhost:3333`. The combined production build is `npm run build`; its `/storyboard/` document is built by Astro. `npm run dev:workbench` serves the Astro frontend separately on port 3334; allow that exact origin in Sanity before using its login.

## Import an already approved board — no Sanity login

1. Open the editor `/`, choose English if needed, and start an empty project.
2. Upload the repository screenshots `docs/screenshots/editor-empty-en.png`, `editor-timeline.png`, and `export-progress.png`. If upload inserts a clip automatically, remove it from the timeline while retaining its media asset to reproduce the empty starting sequence.
3. Open **File → Storyboards**. Use project `rgq98xsq` and dataset `production`, then load approved boards.
4. Select **Timeline Studio · 本地剪辑演示**. Match its three shots in order to the three screenshots above.
5. Inspect the append interval, then append. Expect three editable visual clips lasting **4s, 5s, 4s**, three range annotations, and a **13s** sequence.
6. Inspect a marker's notes for shot direction and release provenance. Undo once to remove the whole import; redo restores it.
7. Export a `.timeline` project and reopen it to inspect embedded media and annotations. This project archive is distinct from an encoded video export.

The public snapshot ID is `ts-release-37ad30b2-04d4-4a10-a23a-652efb239341`. No account credentials are needed for this route. Local image/video bytes are not sent to Sanity.

## Author and review — official Sanity login required

Use an account authorized for the selected Sanity project, or your own project and public dataset. Do not share the project owner's password. Enter your project ID and dataset in the editor connection form before opening its workbench; allow the exact application origin with credentials in your project's CORS settings.

1. Create a separate board with public demo text. Add shots and save.
2. Submit it for review. Request changes with a concrete note.
3. Change one shot without saving, reload and accept the browser's leave-page dialog if shown. Verify the local draft is recovered, then save it.
4. Resubmit and approve. Verify the approved state and release reference.
5. Return to the editor and import with your own local media.
6. For a conflict check, open the same saved draft in two tabs. Save a change in one, then try saving the older version in the other. The stale tab must preserve its edits and offer recovery choices.

Author and reviewer may be the same authorized account in this demonstration. Different button labels do not imply separate security roles. Approval cannot prevent direct modifications by a project administrator.

## What the supplied demonstration proves

The supplied `.timeline` archive demonstrates editable import and project recovery. Its screenshots are illustrative media, not a screen recording of workflow actions. The recorded development evidence separately documents the real authenticated cloud run. A judge who only follows the no-login route exercises cloud read and local import, not cloud writes.
