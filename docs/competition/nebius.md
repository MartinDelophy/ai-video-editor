# Nebius x NVIDIA edition — integration preparation

Branch: `codex/nebius-hackathon-2026`. Route: `/nebius`. Root stays the editor; `/competition` retains Alexa simulation labels.

## Run locally

Install dependencies with `npm ci`. Copy `.env.example` to ignored `.env.local` and set:

```dotenv
COMPETITION_PROVIDER=nebius
COMPETITION_ALLOWED_ORIGIN=http://127.0.0.1:5178
COMPETITION_ACCESS_TOKEN=<choose-a-private-access-code>
NEBIUS_API_KEY=<server-only-key>
COMPETITION_NEBIUS_MODEL=nvidia/Nemotron-3_5-Lightning
```

Run `npm run dev -- --host 127.0.0.1 --port 5178`, open `/nebius`, import your media, choose AI planning, enter the access code, and consent to sending conversation and clip metadata. Request an edit, inspect the review, apply, and undo. API keys must never use a `VITE_` prefix or enter the browser. Local commands do not call Nebius.

The adapter uses the fixed official Token Factory HTTPS endpoint, a bounded JSON schema built from current clip IDs, cancellation, no retries, and no automatic provider fallback. Completion must finish normally; truncated or refused output is rejected. The existing timeline validator and state-guarded review remain authoritative. Metadata and conversation leave the browser only on AI planning requests; media processing/export stay local.

## Free-credit onboarding and submission status

[Builder Program](https://dev.nebius.com/builders) advertises $25 Token Factory credit, subject to eligibility, availability and terms. Claim and verify it before live inference. No paid plan, payment method, or automatic recharge is authorized. A successful mock check is not evidence of actual Nebius usage.

Live inference, deployed reviewer access, updated English demo and Devpost submission remain pending. Preserve service availability for the contest judging period. Submit in Apps and Agents only after verifying an actual NVIDIA model response on Nebius. Describe the additions made during the contest period honestly; this is an existing editor.

Sources: [rules](https://nebiusglobalaihackathon.devpost.com/rules), [API quickstart](https://docs.tokenfactory.nebius.com/quickstart), [structured output](https://docs.tokenfactory.nebius.com/ai-models-inference/json), [official model catalog](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron).
