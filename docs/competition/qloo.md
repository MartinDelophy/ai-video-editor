# Timeline Studio — Qloo taste-aware director

Branch: `codex/qloo-hackathon-2026`, based on main at `4f9930a`.

## Product slice

Select named cultural references for audience A and B, explicitly confirm the entities returned by Qloo Search, then retrieve movie, artist, or brand affinities with Qloo Insights. A director agent will use those results to propose different briefs for the same user-owned source footage. Evidence and editorial inference must remain visibly separate. Affinity is not proof that a particular edit will perform better, and does not grant rights to copy music, footage, or branding.

Reuse the existing browser editor for reviewable edits and export. Preserve `/` as the direct editor. Introduce the audience workflow separately at `/qloo`. Do not add PayPal checkout to this workflow.

## Current implementation

The initial server adapter implements Search and Insights against the official hackathon host, with server-only credentials, bounded inputs, upstream timeouts, credential-safe errors, and query provenance. It returns the original response in an evidence envelope; it does not invent a normalized schema before a live response has been verified. No model-based director, UI, timeline handoff, real Qloo response, hosted demo, or registration is claimed yet.

## Local API development

Requires Node.js 22 or later. Request a hackathon key using the [official guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key). Provisioning may take a few business days. Put `QLOO_API_KEY` in an ignored `.env.local` (never a `VITE_` variable), then run:

```sh
node --env-file=.env.local server/qloo-http.mjs
```

The development server binds only to `127.0.0.1:5182`. Its browser origin defaults to `http://127.0.0.1:5181` and may be configured with `QLOO_ALLOWED_ORIGIN`. Intended same-origin frontend proxy paths:

- `GET /api/qloo/status`: configuration state, never the key.
- `POST /api/qloo/search`: JSON `{ "query": "a named cultural reference" }`.
- `POST /api/qloo/insights`: JSON `{ "entityIds": ["selected Qloo entity ID"], "type": "movie" }`. Also supports artist, brand, book, and tv_show.

No synthetic fallback data. Missing credentials and upstream failures are explicit errors. Contract checks with injected responses are not live integration evidence. Do not commit Qloo response data to the public repository.

## Next gates

1. Obtain key; validate actual Search and Insights response schemas and category support.
2. Build entity confirmation and two-audience comparison UI in all 13 interface languages.
3. Add grounded director planning, evidence citations, review and existing timeline handoff.
4. Test the same source with contrasting audiences and a generic-model baseline.
5. Deploy a public working app with server-side secrets, bounded spending/quotas and abuse controls. Local-only builds do not qualify.

Deadline: 2026-10-31 11:45 Asia/Shanghai. Public demo and code/license are required; demo video is optional. [Official requirements](https://qloo.devpost.com/).
