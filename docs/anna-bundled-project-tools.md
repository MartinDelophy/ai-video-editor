# Anna bundled project tools

Implemented 2026-10-04. Source entry point: `skills/edit-timeline-studio/anna/plugin.mjs`; Skill guidance: `skills/edit-timeline-studio/anna/SKILL.md`.

## Contract

The Executa exposes eight project-file tools: project, track, clip, marker and transcript inspection; semantic diff; guarded apply; verified headless render. It uses the same command client as the existing STDIO MCP adapter and the same production command runner/registry as the CLI. There is no second editing reducer, arbitrary command execution, URL fetching, media upload, cloud-project access or browser-window bridge.

Inspect establishes source-byte identity and revision. Diff returns a session-local, single-use UUID receipt for the exact source, revision and ordered operations. Apply requires that receipt, repeats source validation and writes a new archive. Receipts expire after 15 minutes; restart requires a fresh inspection/diff. Requests execute serially. Every invocation copies the source bytes into a temporary archive so concurrent changes cannot alter the content being processed. Temporary archives and plan files are removed after execution. Imported local media remains on the established CLI path until content-addressed import receipts exist.

The source/output paths must be absolute and supplied by the user. No uploaded browser file is assumed to exist on the Agent filesystem. Filesystem access comes from the Agent host; the adapter requests no Anna storage or LLM grants. Output project writes use the CLI's exclusive-create protection. Existing outputs and the input archive are never overwritten.

## Distribution

`npm run build:anna:executa` creates a self-contained JavaScript package without npm dependencies at runtime. `npm run build:anna:executa -- --native` additionally includes the verified Node 22.14.0 macOS arm64 runtime and its full upstream license. The initial native distribution supports **macOS Apple Silicon only**. Do not advertise Windows/Linux or Intel Mac installation until their native packages are built and verified. FFmpeg/ffprobe are optional host prerequisites for rendering, not for inspecting/editing archives.

The tool and prompt Skill have separate Executa manifests under `anna/executas/`. The app references their symbolic `bundled:` handles; Anna CLI resolves them to server-minted IDs. The local `tool-dev-*` ID is only for the harness. It is never a published app binding. Generated bundles, binary archives and identity caches are ignored.

Build and archive before publishing native artifacts:

```sh
npm run build:anna:executa -- --native
mkdir -p anna/executas/timeline-project-tools/dist
tar -czf anna/executas/timeline-project-tools/dist/timeline-project-tools-0.1.2-darwin-arm64.tar.gz -C anna/executas/timeline-project-tools/bundle .
```

Publish/resolve Tool and Skill before cutting a new app version; validate the resulting bindings, permissions, installation and installed Agent discovery. Updating only the mutable working draft does not modify the already published store version or its Bundled tools & skills section.

## Internal and external callers

An external Agent with the installed tools can process an explicit accessible `.timeline` archive. The app may call its declared tools through Anna's `tools.invoke`/async-job host API with those same schemas, but this is not a way to pass browser blob URLs or implicitly access the current cloud project. ChatCut continues using the in-browser session for live edits, preview and browser AI; moving all browser operations through an external process would add latency and lose the live project boundary.

The next live-window integration needs a tested request/result bridge, window identity, user-authorized project scope, deadlines, cancellation, state-token validation, deduplication and actual result acknowledgements. Anna's open/update window payload APIs alone do not establish that bridge. Do not label it implemented.

## Rendering limits

The existing FFmpeg renderer handles its documented portable subset. Unsupported visible captions, stickers, overlays, source audio, transitions, visual effects and spatial audio fail explicitly. Embedded video audio also fails rather than silently exporting without sound. Use the browser editor for richer compositions and AI operations. Success reports actual output and ffprobe verification, never an invented export result.

## Validation

Temporary external QA exercised the packaged process through initialize/describe and multiple invokes: inspect → diff → apply → inspect output, exact-plan receipts, changed-source rejection, receipt replay rejection, existing-output rejection and byte-for-byte original preservation. The official Anna Executa harness accepted the protocol manifest. QA files are outside the repository.

Sources: [Bundling](https://anna.partners/developers/apps/app-bundling.md), [Protocol](https://anna.partners/developers/tools/executa-protocol.md), [Binary distribution](https://anna.partners/developers/tools/executa-binary.md), [Skill format](https://anna.partners/developers/skills/skill-format.md), [Host API](https://anna.partners/developers/apps/app-ui-host-api.md), [APS scope restrictions](https://anna.partners/developers/tools/executa-storage.md).

## Working draft registration

Tool `tool-martindelophy-timeline-studio-project-tools-kcfrnud5` 0.1.2 and Skill `skill-martindelophy-timeline-studio-project-editing-frg47sga` 0.1.0 are registered as app_bundled. Native tool artifact is mirrored by Anna with SHA-256 `f24448b4019db9d598ebedd883eefab8bee93190ba0dc537f62f0f9c545628c6`. Working draft r78 is ready with both resolved bindings. The existing store release/review candidate was not cut or replaced. Platform-installed Agent discovery and cross-platform packages remain outside this validation.

## Local refinement — 2026-10-04

Tool version 0.1.3 and Skill version 0.1.2 were published as app-bundled dependencies by working draft r80. Parameter descriptions now distinguish track, clip, asset and output identities; invalid arguments include field-level details and recoverable adapter errors include next actions. Preview fingerprints canonicalize object keys while preserving array and operation order. Successful apply returns the actual outputProject path. The Skill covers response-loss recovery and verifies existing outputs before retry. Native-process validation covers reordered keys, rejected modified operations, consumed receipts, changed source files, exclusive outputs and verified MP4 rendering. Anna working draft r80 includes the refined tool and Skill versions.
