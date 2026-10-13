# Timeline Studio — Qloo taste-aware director

Branch: `codex/qloo-hackathon-2026`, based on main at `4f9930a`.

Current public prototype: https://timeline-studio-qloo.vercel.app/qloo/ — cloud evidence-policy mode; optional local Ollama mode. See the public deployment section for current scope.

## Product slice

Select named cultural references for audience A and B, explicitly confirm the entities returned by Qloo Search, then retrieve movie, artist, or brand affinities with Qloo Insights. A director agent will use those results to propose different briefs for the same user-owned source footage. Evidence and editorial inference must remain visibly separate. Affinity is not proof that a particular edit will perform better, and does not grant rights to copy music, footage, or branding.

Reuse the existing browser editor for reviewable edits and export. Preserve `/` as the direct editor. Introduce the audience workflow separately at `/qloo`. Do not add PayPal checkout to this workflow.

## Current implementation

The initial server adapter implements Search and Insights against the official hackathon host, with server-only credentials, bounded inputs, upstream timeouts, credential-safe errors, and query provenance. It returns the original response in an evidence envelope; it does not invent a normalized schema before a live response has been verified. The separate `/qloo/` UI now supports entity confirmation and two-audience movie affinity comparison, with all 13 interface languages. Real Search and Insights calls were verified on 2026-10-13. A local Qwen3:4b director now generates separate candidate briefs from server-retrieved Qloo evidence and validates citation IDs. These are unreviewed creative hypotheses, not executable edits. Reviewed single-video timeline handoff is implemented; Devpost registration remains pending. A public evidence-policy demo is available.

## Local API development

Requires Node.js 22 or later. Request a hackathon key using the [official guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key). Provisioning may take a few business days. Put `QLOO_API_KEY` in an ignored `.env.local` (never a `VITE_` variable), then run:

```sh
node --env-file=.env.local server/qloo-http.mjs
```

The development server binds only to `127.0.0.1:5182`. Its browser origin defaults to `http://127.0.0.1:5181` and may be configured with `QLOO_ALLOWED_ORIGIN`. Start the frontend with `npm ci` and `npm run dev -- --host 127.0.0.1 --port 5181 --strictPort`, then open `http://127.0.0.1:5181/qloo/`. Vite proxies the following same-origin paths to the local API service:

- `GET /api/qloo/status`: configuration state, never the key.
- `POST /api/qloo/search`: JSON `{ "query": "a named cultural reference" }`.
- `POST /api/qloo/insights`: JSON `{ "entityIds": ["selected Qloo entity ID"], "type": "movie" }`. Also supports artist, brand, book, and tv_show.

No synthetic fallback data. Missing credentials and upstream failures are explicit errors. Contract checks with injected responses are not live integration evidence. Do not commit Qloo response data to the public repository.

## Next gates

1. Completed: key configured privately; real Search and movie Insights validated. Other output categories still need live validation.
2. Completed: entity confirmation and two-audience comparison UI in all 13 interface languages.
3. Candidate briefs, citation checks, and reviewed single-video timeline handoff implemented.
4. Test the same source with contrasting audiences and a generic-model baseline.
5. Public evidence-policy prototype deployed with server-side secrets and per-instance abuse controls. Broader rollout needs distributed quota controls. Local-only builds do not qualify.

Deadline: 2026-10-31 11:45 Asia/Shanghai. Public demo and code/license are required; demo video is optional. [Official requirements](https://qloo.devpost.com/).

## Live validation — 2026-10-13

Qloo Search resolved two named movie references. Separate movie Insights calls returned distinct nonempty recommendation sets. The browser journey confirmed both entities and displayed the returned affinities through the local API proxy. Response data stays outside the repository; credentials stay in ignored mode-0600 `.env.local`. Mock contract checks remain separate from these real calls.

The director requires Ollama serving `qwen3:4b` at `127.0.0.1:11434`. `POST /api/qloo/direct` accepts the Insights fields plus `brief` (up to 1600 characters) and a supported language code. The server re-fetches Qloo evidence and asks the model for a brief, rejecting invalid shapes and unknown cited IDs. Source media is not inspected by this planner. Citation validation proves an ID exists in evidence, not that an editorial inference is correct. Initial real outputs over-inferred shot details and timings; instructions were tightened, numeric affinity was removed from model input, and proposals stay separate from timeline mutation. Hosting this optional model mode would need a hosted model endpoint; the public policy mode does not.

Director output additionally uses a constrained JSON schema and rejects digits in creative fields, omitted text, and unknown citation IDs. This is a formatting and provenance gate, not semantic proof of an editing recommendation. It does not execute timeline changes.

Creative action fields are now restricted to localized, allowlisted choices (opening emphasis, pace, framing, and source-audio treatment), rather than free-form shot claims or numeric timings. The model selects a candidate and explains its cultural references; these choices require creator review; the handoff below supports only a source trim.

Latest browser check: both audiences completed live Qloo calls and local model generation. For the tightly constrained ten-second gift brief, both candidates selected the same core options, while their cited inspirations differed. One rationale was returned in English despite Chinese being requested. These are known quality gaps; the current prototype does not yet demonstrate a strong differentiated editing outcome or enforce generated-language consistency. Do not represent this as a finished competition submission.

## Public Vercel prototype — 2026-10-13

Public URL: https://timeline-studio-qloo.vercel.app/qloo/

The deployed Node function uses **evidence-policy** mode: Qloo Search resolves a selected entity, and real Qloo Insights results drive a versioned rank-weighted genre heuristic. Family/fantasy/animation signals favor a gentle pacing candidate; action/thriller/crime favor a punchy candidate; near ties remain balanced. These are transparent application rules, not Qloo-provided editing instructions, LLM output, audience guarantees, or proof of better performance. Original framing and source audio are preserved in the suggestions. Free-form footage notes are retained for human review; the policy does not semantically understand or inspect footage.

The local Ollama director remains optional via `QLOO_DIRECTOR=ollama`; cloud functions do not connect to a developer laptop. The online experience requires no separate model API. Users can inspect citations and query provenance. The selected candidate can now be handed to the editor for an explicit, reversible single-video source trim.

A progressive WebMCP integration registers `qloo_search_cultural_reference` and `qloo_grounded_video_brief` only when a real browser model-context API is available. The test browser did not expose the WebMCP connector, so agent invocation through that browser remains unverified. The HTTP tool endpoints and GUI are independently usable; do not claim a simulated agent connection.

Vercel configuration is in `vercel.json`, with the Node handler in `api/qloo/[action].mjs`. Configure `QLOO_API_KEY` as a server-side secret for the chosen environment. Keys and `.vercel` metadata are ignored. Deploy with Vercel CLI; no automatic Git deployments are enabled for this project. The service bounds input size, upstream duration, concurrent work and per-IP requests per instance. This is not a distributed global quota; use provider quotas and deployment controls for a larger rollout.

Public checks: `/`, `/qloo/`, and API status return HTTP 200 without login. A real public-origin Search call succeeds. Local environment files and server source paths are inaccessible; unrelated browser origins are rejected. Contract tests use synthetic data and are not substituted for these real network calls.

Devpost registration and submission are still pending. This public deployment is a prototype, not proof that the entry has passed eligibility or judging review.

## Reviewed editor handoff — 2026-10-13

“Review in editor” transfers the selected reference and pace through same-tab session storage (one-hour expiry). Gentle/balanced/punchy default to editable 12/10/8-second retained durations. These numbers are application heuristics, not Qloo measurements. Exactly one supported plain video longer than the chosen duration is required. The editor preserves framing and source audio, uses its existing inspect/preview tools, and requires Apply changes before mutation. Existing freshness checks and one-step undo remain in force.

Actual local Chrome validation imported an authorized 10.03-second portrait video, reviewed and applied an 8-second trim, undid it to restore the original duration, then reapplied and exported. ffprobe confirmed 720×1280 H.264 video lasting 8 seconds and an AAC audio stream (8.021-second container due to audio padding). This validates the editing handoff, not the artistic quality of the pacing heuristic or external agent invocation.
