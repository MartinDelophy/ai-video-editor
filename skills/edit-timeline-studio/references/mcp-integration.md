# Timeline Studio MCP integration

The bundled MCP server is a local STDIO transport over Timeline Studio's existing Agent command runner. It does not implement timeline edits separately and does not require an OpenAI API key.

For a project already open in the browser, use [webmcp-integration.md](webmcp-integration.md) instead. Browser tools operate on live state tokens and preview IDs; the local tools below operate on filesystem paths and revisioned plans.

## Availability

The server requires a Timeline Studio repository checkout with installed Node dependencies and `scripts/timeline-command.mjs`. Launch the adapter inside that checkout so its MCP SDK imports resolve through the checkout's dependencies. It locates the command-layer repository from `TIMELINE_STUDIO_ROOT`, the process working directory, or its source location. Setting `TIMELINE_STUDIO_ROOT` alone does not make the MCP SDK resolvable when directly launching a copied adapter from a standalone installed Skill directory.

Start it from the repository root with:

```bash
npm run mcp
```

The repository's `.codex/config.toml` registers it project-locally. From another working directory, launch the checkout's server with:

```bash
npm --prefix /absolute/path/timeline-studio run mcp --silent
```

For another local Codex project, configure the STDIO command to use that checkout path. A standalone Skill installation carries workflow guidance and adapter source; it does not install the checkout's runtime dependencies. If the checkout is unavailable, use the browser compatibility workflow within the requested scope instead of claiming that the local MCP is ready.

## Tools

- `timeline_project_inspect`: read the project revision, tracks, marker counts by type, media, and warnings.
- `timeline_track_inspect`: read one track and its clips.
- `timeline_clip_inspect`: read one clip's source mapping, properties, and links.
- `timeline_transcript_inspect`: read all serialized speech or one speech clip.
- `timeline_marker_inspect`: read all markers, chapters, ranges, and notes from `project`, or one annotation using optional `markerId`.
- `timeline_project_diff`: validate operations and return a field-level dry-run diff.
- `timeline_project_apply`: apply the same revision-checked operations and write a new `.timeline` archive.
- `timeline_project_render`: render the supported headless subset to a new MP4 and return decoded verification.

## Required write sequence

1. Call `timeline_project_inspect` and retain its revision.
2. Build operations with stable, unique IDs from [command-contract.md](command-contract.md).
3. Call `timeline_project_diff` with the current revision and complete operation list.
4. Review its warnings and changes. Stop on any failed precondition or unsupported operation.
5. Call `timeline_project_apply` with exactly the same project, revision, and operations, plus a new absolute output path.
6. Inspect the new archive before rendering or continuing.

Apply and render never overwrite an existing output through MCP. Choose a new output path for every attempt. The command transaction still enforces revision checks, operation idempotency, caption-to-speech constraints, and all project-aware validation.

`timeline_project_diff` is read-only. `timeline_project_apply` and `timeline_project_render` write only their declared output artifacts. The server does not download models, call remote services, open the editor, or mutate Codex's global configuration.

For marker work, read [timeline-markers.md](timeline-markers.md). Use `timeline_marker_inspect` before constructing `marker.add`, `marker.update`, or `marker.delete` operations, review `changes.markers` in the semantic diff, and inspect the output annotations after apply. MCP routes these operations through the same CLI registry and reducers. Marker-only work requires neither rendering nor browser automation; annotations do not affect rendered duration or become video overlays/container chapters.
