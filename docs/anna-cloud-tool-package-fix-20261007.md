# Cloud tool package correction — 2026-10-07

Anna's application installation displayed `Tool deploy failed: plugins: 1 plugins failed` while deploying one tool to the Cloud Agent. The existing Project Tools 0.1.3 snapshot contains only a darwin-arm64 archive. Anna's documented binary resolver can fall back to a single-entry platform map, so an unsupported Linux host may receive the Mac executable. This is a supported explanation, not a verified deployment-log diagnosis.

The corrected build supports a supplied official Node 22.14.0 runtime directory, preserving its upstream license and executable permissions. The Linux x86_64 runtime archive was verified against Node's official SHA-256: `69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec`. Tool 0.1.5 packages include Mac ARM and Linux x86_64. Protocol initialize, describe and health pass for the native Mac launcher and the Linux package's identical JavaScript executed using local Node; eight tools and version 0.1.5 are returned. The Linux ELF has not yet run under Linux: the installed Docker daemon is unavailable. Cloud installation and invocation remain required validation.

A standalone Skill lookup/list omitted the bundled Skill, but idempotent publish independently confirmed existing Executa 1176, Skill 0.1.2, version 626, same ID and content hash. It was not missing and was not newly made public. Bundled visibility is separate from standalone public publication.

The existing app 0.1.1-beta.3 is published, latest and release-approved. Frozen app dependencies must be updated through a new app snapshot; uploading a new tool alone does not repair the published app's dependency snapshot.

## Submission receipt

- Project Tools 0.1.5: Executa 1175, frozen version 645, content hash `a4899fe18d8664f1c0a696f02698ba4ba3934c80c00636aef26471be6d03a261`. Independent list confirms both `darwin-arm64` and `linux-x86_64` CDN entries.
- Draft r95 ready; content hash `9e83da285219db2e4bbe260a3d090b88d217c47790425eba9266d3f31d596091`.
- App 0.1.1-beta.4: version 1128, bundle 1056, pins tool 645 and Skill 626. Existing UI bundle is byte-identical: 188 files, 229276735 bytes, manifest hash `4656df320eb4e75c3eb5774a0f2f07da0fafbe9397e466c9b3a94ff70c4ca734`.
- Release review returned pending; `is_latest: false`, `published_at: null`. The fix is submitted, not publicly released. Store installation still uses beta.3 until approval. Real Cloud Agent installation and the requested narrated ChatCut capture remain pending.

## Dependency isolation and installation verification

The Cloud Agent reports Linux x86_64 and sees server tool 0.1.5, but the tool is not running. A subsequent installed-app screenshot reports: `Package installed but failed to load as Executa plugin (describe handshake failed)`. The exact handshake failure cause remains unresolved; adding the Linux package alone did not establish successful deployment.

Removed both required Executas from `anna/manifest.json` and removed `bundled_executas` from `anna/app.json`, retaining plugin source for separate investigation. In-app ChatCut uses the editor's own command session and does not depend on these external Agent packages. Draft r96 installed without the deployment stage and Timeline Studio opened successfully to its project-recovery dialog. A stale installation-health warning may still reference the earlier dependencies.

App 0.1.1-beta.5, version 1129, freezes no Executas and reuses the same UI content (bundle 1057). Release submission returned `release_review_state: pending`, `is_latest: false`, and `published_at: null`; public rollout is not yet confirmed.
