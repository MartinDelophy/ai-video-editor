# PayPal AI Hackathon sandbox prototype

Branch: `codex/paypal-hackathon-2026`, based on the clean Nebius competition branch so the existing model adapters are available. `/paypal` loads the commission panel separately. `/` stays the direct editor. No live-money API endpoint is present.

## Run

Use `npm ci`, copy `.env.example` to ignored `.env.local`, and configure:

```dotenv
PAYPAL_ALLOWED_ORIGIN=http://127.0.0.1:5179
PAYPAL_SANDBOX_CLIENT_ID=<sandbox app client ID>
PAYPAL_SANDBOX_CLIENT_SECRET=<sandbox app secret>
COMPETITION_ALLOWED_ORIGIN=http://127.0.0.1:5179
COMPETITION_PROVIDER=ollama
```

Run `npm run dev -- --host 127.0.0.1 --port 5179 --strictPort` and open `http://127.0.0.1:5179/paypal`. The sandbox middleware rejects non-loopback requests and non-loopback server configuration. Vite preview/static deployment does not serve these APIs. A production deployment needs its own authenticated server and database; this prototype is single-process local development only.

Create a brief, select 5–180 seconds and an aspect ratio. The server calculates USD 10 + USD 5 per started 15 seconds. This is deterministic pricing, not AI-generated quoting. Confirm the quote, approve with a PayPal sandbox buyer account, return to the same tab, then verify payment. On reload the UI restores only the order ID and session secret; verification first reloads status. If still awaiting approval, press verify again to capture. After server-verified payment, open the existing editing assistant with the brief and ratio prefilled, import media, select AI planning and consent, review/apply edits, then export manually. Requested duration is a brief, not a guarantee that the supported model operations can produce that exact edit.

Ollama requires a locally available model using the existing competition setup. Nebius can be selected using the documented server variables and access code. AI calls are not part of quote generation. A deterministic local edit command is not evidence of AI inference.

## Payment behavior

Orders use Orders v2 and OAuth, always on `api-m.sandbox.paypal.com`. Approval opens the official sandbox site as a same-tab redirect to coexist with the editor's cross-origin isolation headers. Prices and capture IDs are controlled by the server. A browser redirect/query parameter never marks an order paid. The service checks remote order ID, completion, custom commission ID, capture count, currency and exact amount. Create/capture request IDs are durable, retries reconcile previously completed captures, and sequential mutations avoid duplicate orders within this process.

`.paypal-sandbox/orders.json` is ignored and private to the local service. It contains briefs and per-order session secrets; preserve it to resume pending orders. Do not publish it. Session secrets live in same-tab sessionStorage, and the UI is not an access-control boundary for the free editor. Creating another commission replaces the tab's current handle; old sandbox records are retained locally. This is not an escrow service, marketplace settlement or customer account system.

## Actual status

Implemented: 13 interface languages; fixed quotes; sandbox create/approval/capture adapter; durable retry IDs; payment verification; existing assistant handoff; manual editor export.

Pending: real PayPal sandbox credentials and end-to-end sandbox transaction; real model inference in this edition; hosted reviewer access; delivery portal; English demo and final competition submission. No live PayPal usage or completed AI transaction is claimed. Mock validation is only adapter validation.

Official references: [rules](https://paypalaihackathon.devpost.com/rules), [Orders integration](https://developer.paypal.com/api/rest/integration/orders-api), [sandbox quickstart](https://developer.paypal.com/checkout/integrate).
