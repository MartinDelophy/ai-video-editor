# Amazon Developer Hackathon 2026

Timeline Studio's competition branch targets **Alexa+ simulated experience** with zero-budget local inference. **AWS Builder is pending evidence**, not yet claimed. `/competition` opens the editing assistant inside the existing editor; `/` stays the normal editor. This is not a certified or live Alexa+ integration.

## Implemented

- Browser-local commands: `9:16`, `trim first 3s`, `music 20%`, `last first` (Chinese equivalents are shown in the Chinese UI).
- Local Ollama planning (default), with an optional Amazon Bedrock **Converse** server adapter. The planner receives the conversation and bounded clip metadata, never source media. It proposes edits; the existing editor previews and validates them before the user applies them.
- Supported AI plan operations: canvas ratio/fit, simple video trims, visual reorder, clip volume/fades/mute. Existing timeline editing, guarded undo, project saving and video export remain available in the editor.
- Real state tokens prevent a delayed plan from changing a project that was edited during planning. Review and apply reuse the production browser command engine.
- All 13 UI languages, explicit simulation disclosure, separate local-command and AI modes, opt-in metadata transmission and cancellable planning.

Local commands are a limited deterministic grammar, not an LLM or evidence of AWS usage. AI planning has no automatic fallback to local commands. Local Ollama inference is not AWS usage. AWS Builder must be supported by a real qualifying integration or documented actual Kiro Crew development; installing Kiro alone is not evidence.

## Run locally

Use Node 22+ and `npm ci`. Install [Ollama](https://ollama.com/download) for your operating system, then run:

```sh
ollama serve
# In a second terminal (one-time model download, approximately 2.5 GB):
ollama pull qwen3:4b
# In this repository:
cp .env.example .env
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
```

If the Ollama desktop app already runs the server, omit `ollama serve`. Open `http://127.0.0.1:5178/competition`, choose AI planning and consent to sending conversation/metadata to the configured local service. Try “Make this a vertical short and keep the first three seconds of the first clip.” Media stays in the browser; only conversation and bounded metadata go to the loopback Ollama API. No paid API or AWS account is needed. Inference speed depends on your hardware; the planner has a two-minute timeout. The access code may be blank only for Ollama through Vite bound explicitly to `127.0.0.1` and a loopback client. Exact origin checking still applies. Do not expose this development server through a tunnel.

Set `COMPETITION_PROVIDER=bedrock` only to opt into AWS. That path requires `AWS_REGION`, `COMPETITION_BEDROCK_MODEL_ID`, the exact allowed origin and a random access token. The SDK uses its normal server-side credential chain. Never put credentials into `VITE_*`, the UI, repository or submission video. Bedrock inference can incur charges. Restart Vite after changing environment settings. There is no automatic cloud fallback.

Exported projects and videos use the existing browser download workflow. Judges can run this locally using their own Ollama installation; a static website alone cannot provide the local model server. Supply the working demo video and complete setup instructions. Public hosted AI is not claimed.

## Deployment

The local Ollama endpoint accepts loopback URLs only. A remotely hosted function cannot reach the reviewer’s computer through that address. Local-run instructions and a video are the default zero-budget submission.

For optional Bedrock hosting, the same request handler serves Vite development, `netlify/functions/competition-plan.mjs`, and `server/competition-lambda.mjs`. No cloud resources are created by the build.

For an AWS deployment, bundle `server/competition-lambda.mjs` with its imports and AWS SDK for Node 22 Lambda. Set the handler to the bundle's `handler`, a timeout of at least 55 seconds, the four configuration variables above, and an execution role with `bedrock:InvokeModel` limited to the selected model/inference-profile resources. Cross-region inference profiles may require permissions on their destination model resources too. Serve the editor and `/api/competition/plan` under one HTTPS origin using a reverse proxy/CloudFront with API caching disabled and POST, Origin, Authorization and Content-Type forwarded. Static frontend hosting and the API do not need to run on the same compute instance. Do not deploy paid resources until the account, model access and cost settings are chosen.

For the existing Netlify hosting path, use its function with the same server environment and AWS server credentials managed in the host's secret configuration. Lambda is preferable when using an AWS execution role instead of persistent access keys. Neither deployment has been performed in this branch yet. Add infrastructure-level throttling, access logs without request bodies, and a spend budget before exposing the paid model endpoint. The reviewer code protects the prototype; it is not a multi-user login system.

## Submission plan

1. Import authorized video and music. Ask for a specific edit through the local model; show the actual reviewed diff and apply it.
2. Continue with another request against the updated timeline; show preview and editable clips.
3. Export the `.timeline` project and finished video through the existing editor.
4. Record a public English demo under 3 minutes. Identify the simulation explicitly.
5. Provide source/run instructions, changes since the competition began, actual model/runtime details, product feedback, and a factual friction log.

Current limitations: metadata-only planning (no understanding of video pixels or speech), no voice-input UI, no assistant-driven narration/caption generation, no remote MCP/actual Alexa+ connection, and no conversation restore after page refresh. These are not represented as working features.

Official references: [competition rules](https://amazonappdev2026.devpost.com/rules), [AWS Bedrock JavaScript Converse example](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html).

## Responsible use of deep synthesis

This tool uses deep-synthesis technology and is intended solely for technical research and learning.

Users must ensure that they:

- use only facial images or videos of themselves or people who have provided lawful authorization;
- do not create or distribute any illegal, infringing, false, or misleading content;
- do not present generated content as authentic footage or impersonate another person without their consent.

Users are solely responsible for any legal liability arising from violations of these requirements.

