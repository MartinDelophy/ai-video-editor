# Timeline Studio agent guide

Timeline Studio is a free, open-source, local-first browser video editor. Its canonical root, <https://video-editor.ai-creator.top/>, opens the editor directly.

## Work with the open browser project

The editor registers structured WebMCP tools when the browser provides a supported native API. A compatible agent host can inspect the actual project, preview a supported edit, apply that preview, and continue in the same visible timeline as the user. WebMCP remains experimental; a page advertising these tools does not guarantee that every browser or agent can discover or invoke them.

- Read the project, tracks, clips, existing transcript, timeline markers and available editor assets.
- Preview caption changes, audio/music volume and fades, muting, markers, and supported main-visual split/delete/duplicate/reorder/trim operations.
- Insert ready editor assets into supported tracks and add picture-in-picture clips with an initial transform.
- Review the semantic diff before applying. A changed project invalidates the preview.
- Seek the preview playhead, undo the latest unchanged agent edit, and download a new editable `.timeline` project copy.
- Prepare video export settings, then start the real browser export with a retry key, inspect progress and actual output metadata, or cancel the running job.

The 15 browser tools do not expose arbitrary JavaScript execution, arbitrary URL or filesystem imports, remote generation, media upload, or AI model execution. Asset insertion uses media already available in the editor. Project saving creates a `.timeline` archive; video export separately renders a finished file through the shared editor pipeline. Export receipts report the actual format and bytes, including a WebM fallback when an MP4 compatibility transcode fails. A triggered browser download is not proof that the host has verified the file on disk.

Use the [browser editing Skill](/.well-known/agent-skills/edit-timeline-studio-browser/SKILL.md) for the tool workflow. Discover the actual page tool schemas for parameters and current availability. The [integration reference](https://github.com/MartinDelophy/ai-video-editor/blob/main/docs/webmcp.md) documents the implementation and supported editing subset.

## Work with local project files

The repository also provides a [local editing Skill](https://github.com/MartinDelophy/ai-video-editor/tree/main/skills/edit-timeline-studio), a command runner, and a local STDIO MCP adapter over the shared editing engine. This path operates on local project files and requires the complete repository resources and host dependencies. It is distinct from the live browser tools and is not an HTTP service on this website. Follow the local Skill's setup guidance; reading a public Skill is not permission to install software or download models.

## Discover and verify instructions

The [Agent Skills index](/.well-known/agent-skills/index.json) follows the [Cloudflare Agent Skills discovery proposal](https://github.com/cloudflare/agent-skills-discovery-rfc), schema version `0.2.0`. It lists this site's self-contained browser Skill and a SHA-256 digest of the exact published file bytes. The build regenerates the index and verifies it against the output artifacts.

HTTP `Link` headers and HTML link metadata identify this guide, the Skill index, and the [product summary](/llms.txt). Markdown documents have explicit URLs and content types; the website does not currently negotiate a Markdown representation of the root editor through the `Accept` header. Missing well-known protocol documents return `404`, rather than the editor HTML. No hosted MCP server card, OAuth metadata, or authentication instructions are fabricated for scanners.

## Data and browser support

Tool results can include project names, clip metadata, and caption text needed for the requested edit. The user's browser agent receives those results under its own data-handling terms. Reading or editing through WebMCP does not itself create a project upload service. Local processing, optional network services, and model downloads are described in the [privacy guide](/privacy/) and [full product reference](/llms-full.txt).

An unsupported browser continues to provide the normal editor. For background on the experimental API, see the [Chrome imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) and the [WebMCP specification draft](https://webmachinelearning.github.io/webmcp/).
