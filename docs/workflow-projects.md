# Portable workflow projects

Infinite Canvas and Storyboard have a localized Project menu for downloading a complete `.workflow` archive, importing one as a new project, explicitly backing up to Anna, browsing account-scoped cloud backups, restoring a cloud backup as a new local project, and downloading a cloud backup. Empty and unfinished graphs can be saved too. This is independent of timeline project backups and the main timeline's latest-project pointer.

## Package and restore contract

The ZIP envelope reuses the existing project archive worker/codec. `project.json` identifies version 1 of `timeline-studio-workflow`, its workflow kind, editable graph/view/model settings and, for Storyboard, the active conversation/draft and exact image mentions. Referenced original/generated image, video and audio bytes are embedded with MIME metadata and SHA-256 hashes. Storyboard also includes locally owned unconnected composer attachments. Missing media blocks a purported complete export rather than writing remote object URLs into the package. Limits are 512 MiB and 400 media files; archive decoding bounds cumulative inflated bytes and entry count. Unknown formats, incompatible workflow kinds, malformed graphs, cycles, missing media, mismatched checksums and truncated archives are rejected before opening a copy. Legacy reference-to-reference Storyboard provenance is retained for old drafts, without adding a reference input port to the current editor.

A local copy is committed to a new UUID project namespace before it is selected. Import remaps media IDs and their structured signatures/chat references; node and dependency identities remain local to the new project. The original project's snapshot is not overwritten. Project switching waits for the current workspace's queued save and refuses to leave uncommitted edits. A small account-scoped local catalog retains the original project and imported copies, with the last selected copy restored on reopening. Storyboard uses a fresh conversation namespace for each imported copy. These catalogs do not create or replace main timeline projects.

Completed media and prompts remain editable. Provider connection credentials, local workflow templates and unfinished cloud job receipts are excluded. Opening a project never submits generation or resumes somebody else's billed job. Recipients configure their own generation connectors. This is portable editing, not realtime collaboration or an anonymous public link.

## Anna storage

Explicit backup uses the existing `storeAnnaFile` upload/finalize path with `kind: sessions` and an immutable `workflow-{canvas|storyboard}-{timestamp}.workflow` filename under `timeline-studio/sessions/{UUID}/`. Backup is acknowledged only after finalization succeeds. There is no automatic cloud upload, no main latest-project pointer write, no deletion, and no public permission change.

Cloud listing is restricted to `timeline-studio/sessions/`, filters the matching workflow filename/kind and follows bounded explicit pagination. It excludes unrelated sessions and timeline archives. Restoration/download uses the existing descriptor validation and an expected ETag/size check with a freshly resolved host download URL; signed URLs and owner overrides are never retained in the graph or package. The shared main timeline file browser continues to list only its existing projects/exports namespaces.

## Verification limits

Temporary checks and local browser fixtures stay outside the repository. Both archive formats are round-tripped with binary media, exact references and credential/job exclusion. Local browser download/import/switching is exercised separately from cloud transport tests. Anna transport wiring checks are not a claim of real-account upload/restore certification; a real host roundtrip must be reported explicitly when available.
