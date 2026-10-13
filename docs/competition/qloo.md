# Timeline Studio — Qloo taste-aware director

Branch: `codex/qloo-hackathon-2026`, based on main at `4f9930a`.

## Product slice

Select named cultural references for audience A and B, explicitly confirm the entities returned by Qloo Search, then retrieve movie, artist, or brand affinities with Qloo Insights. A director agent will use those results to propose different briefs for the same user-owned source footage. Evidence and editorial inference must remain visibly separate. Affinity is not proof that a particular edit will perform better, and does not grant rights to copy music, footage, or branding.

Reuse the existing browser editor for reviewable edits and export. Preserve `/` as the direct editor. Introduce the audience workflow separately at `/qloo`. Do not add PayPal checkout to this workflow.

## Current implementation

The initial server adapter implements Search and Insights against the official hackathon host, with server-only credentials, bounded inputs, upstream timeouts, credential-safe errors, and query provenance. It returns the original response in an evidence envelope; it does not invent a normalized schema before a live response has been verified. The separate `/qloo/` UI now supports entity confirmation and two-audience movie affinity comparison, with all 13 interface languages. Real Search and Insights calls were verified on 2026-10-13. A local Qwen3:4b director now generates separate candidate briefs from server-retrieved Qloo evidence and validates citation IDs. These are unreviewed creative hypotheses, not executable edits. Timeline handoff, hosted demo, and Devpost registration remain pending.

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
3. Candidate director briefs and citation checks implemented; human review and existing timeline handoff remain pending.
4. Test the same source with contrasting audiences and a generic-model baseline.
5. Deploy a public working app with server-side secrets, bounded spending/quotas and abuse controls. Local-only builds do not qualify.

Deadline: 2026-10-31 11:45 Asia/Shanghai. Public demo and code/license are required; demo video is optional. [Official requirements](https://qloo.devpost.com/).

## Live validation — 2026-10-13

Qloo Search resolved two named movie references. Separate movie Insights calls returned distinct nonempty recommendation sets. The browser journey confirmed both entities and displayed the returned affinities through the local API proxy. Response data stays outside the repository; credentials stay in ignored mode-0600 `.env.local`. Mock contract checks remain separate from these real calls.

The director requires Ollama serving `qwen3:4b` at `127.0.0.1:11434`. `POST /api/qloo/direct` accepts the Insights fields plus `brief` (up to 1600 characters) and a supported language code. The server re-fetches Qloo evidence and asks the model for a brief, rejecting invalid shapes and unknown cited IDs. Source media is not inspected by this planner. Citation validation proves an ID exists in evidence, not that an editorial inference is correct. Initial real outputs over-inferred shot details and timings; instructions were tightened, numeric affinity was removed from model input, and proposals stay separate from timeline mutation. Public deployment will need a hosted model endpoint and appropriate quota controls.

Director output additionally uses a constrained JSON schema and rejects digits in creative fields, omitted text, and unknown citation IDs. This is a formatting and provenance gate, not semantic proof of an editing recommendation. It does not execute timeline changes.

Creative action fields are now restricted to localized, allowlisted choices (opening emphasis, pace, framing, and source-audio treatment), rather than free-form shot claims or numeric timings. The model selects a candidate and explains its cultural references; these choices still require creator review and are not applied to the editor.

Latest browser check: both audiences completed live Qloo calls and local model generation. For the tightly constrained ten-second gift brief, both candidates selected the same core options, while their cited inspirations differed. One rationale was returned in English despite Chinese being requested. These are known quality gaps; the current prototype does not yet demonstrate a strong differentiated editing outcome or enforce generated-language consistency. Do not represent this as a finished competition submission.
