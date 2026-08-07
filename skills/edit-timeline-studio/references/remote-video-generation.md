# Remote video generation routing

Use this reference only after media inspection shows that existing footage, lawful web footage, and built-in editing effects cannot truthfully supply a required shot. Treat every remote generation as a paid or account-bound external action unless current official documentation proves otherwise.

## Classify the requested output

- Use a general video generator for text-to-video, image-to-video, first/last-frame continuation, reference-controlled shots, or video-to-video transformation.
- Use a remote digital-human service only when the brief explicitly requires a presenter, spokesperson, training host, or personalized talking portrait. Never offer the browser-local JoyVASA + LivePortrait editor feature as the Skill's general generation fallback.
- Use programmable composition when the job is deterministic assembly of supplied or generated media, text, data, captions, audio, and motion graphics. Do not describe composition services as models that invent new footage.

## Discover current providers

Search current official documentation before every recommendation. The following links are discovery seeds, not a permanent ranking or guarantee that a model, feature, price, region, or API remains available.

### General text, image, or video generation

- OpenAI Videos API: `https://platform.openai.com/docs/api-reference/videos`
- Google Veo on Vertex AI: `https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation`
- Runway API: `https://docs.dev.runwayml.com/api/`
- MiniMax video generation: `https://platform.minimax.io/docs/guides/video-generation`
- Alibaba Cloud Model Studio video generation: `https://www.alibabacloud.com/help/en/model-studio/use-video-generation/`
- Kling API platform: `https://kling.ai/document-api/quickStart%2FproductIntroduction%2Foverview`
- Luma video generation API: `https://docs.lumalabs.ai/reference/creategeneration`
- Amazon Nova Reel: `https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-reel.html`
- Adobe Firefly Services: `https://developer.adobe.com/firefly-services/docs/firefly-api/getting-started/usage-notes/`
- Pika API entry: `https://pika.art/api`

### Remote digital-human services

- HeyGen API: `https://docs.heygen.com/`
- Synthesia API: `https://docs.synthesia.io/reference/introduction`

### Programmable composition

- Remotion: `https://www.remotion.dev/`
- Shotstack Edit API: `https://shotstack.io/docs/api/`
- Creatomate Render API: `https://creatomate.com/docs/api/reference/create-a-render`
- Cloudinary video transformations: `https://cloudinary.com/documentation/video_manipulation_and_delivery`

Include only providers that fit the current shot blueprint. Keep the shortlist small and provider-neutral. Prefer direct first-party APIs; identify partner-hosted or aggregator access explicitly and never present it as a first-party endpoint.

## Compare candidates

For each viable provider, verify and report:

- current model and endpoint identity;
- text, image, first/last-frame, reference, or video input support;
- identity, product, camera, seed, negative-prompt, and continuity controls;
- native duration, resolution, aspect ratio, frame rate, and generated-audio support;
- region, account, quota, moderation, watermark, provenance, and commercial-use constraints;
- current price or credit basis and the estimated cost for the requested candidates;
- input retention, output expiry, deletion controls, and whether submitted media may leave the user's region;
- synchronous, asynchronous, webhook, polling, cancellation, and retry behavior;
- whether output URLs expire and how quickly the bytes must be persisted.

Do not rank a provider on remembered quality claims. Match it to the shot's observable requirements, then let the user choose before any paid, remote, privacy-sensitive, or account-bound call.

## Keep approval proportional

- Do not show a remote-generation prompt during ordinary editing, local analysis, media cleanup, captioning, voice work, effects, assembly, or export when no generated shot is required.
- If the user explicitly requests remote generation, one approval may cover a clearly bounded batch with the selected provider and model, input assets, candidate count, and maximum estimated spend. Do not interrupt once per candidate inside that approved boundary.
- Ask again only when the batch would exceed its approved cost or scope, change provider or processing region, introduce new private or identity-bearing media, or materially change rights, retention, disclosure, or privacy conditions.
- A recommendation or shot plan is not authorization to submit media, spend credits, or start a remote job.

## Normalize the generation job

Represent every provider request with one provider-independent record:

```json
{
  "jobId": "stable-local-id",
  "provider": "selected-provider",
  "model": "verified-model-id",
  "mode": "text-to-video | image-to-video | video-to-video | digital-human | composition",
  "prompt": "verbatim generation prompt",
  "negativePrompt": "optional constraints",
  "inputAssets": [],
  "durationSeconds": 0,
  "aspectRatio": "16:9",
  "resolution": "provider-supported value",
  "audioRequested": false,
  "seed": null,
  "status": "planned | awaiting-approval | queued | running | succeeded | failed | cancelled",
  "remoteJobId": null,
  "estimatedCost": null,
  "createdAt": null,
  "completedAt": null,
  "provenance": {}
}
```

Keep provider-specific parameters under `provenance.providerParameters`; do not leak them into the portable timeline schema.

## Execute and ingest safely

1. Preserve the approved shot brief, references, protected identity/product constraints, provider, model, settings, cost estimate, and user approval.
2. Keep API secrets in an existing local credential store or trusted backend. Never embed them in browser code, project archives, prompts, logs, or generated media metadata.
3. Submit one shot or bounded candidate batch. Save the remote job ID immediately.
4. Poll with bounded backoff or use a verified webhook. Surface provider-safe error messages and retain enough structured state to retry only the failed shot.
5. On success, download the actual media bytes before any result URL expires. Verify checksum, container, codecs, dimensions, duration, decoded frames, and audio presence.
6. Preserve the untouched raw generation and its provenance. Add it to My assets; never insert or replace timeline media automatically.
7. Let the user select a candidate, then place it through normal reversible Timeline Studio operations. Keep editing, captions, voiceover, effects, and export local when supported.
8. When the output contains synthetic people, voices, or identity transformation, retain required disclosure and provenance through the final export.

## Reject unsafe or unsuitable routes

Reject or ask for a different route when a provider cannot preserve protected identity or product geometry, requires an unauthorized face or voice, cannot satisfy the delivery region or privacy requirement, exposes only an unofficial credential-forwarding endpoint, requires watermark removal, has incompatible output rights, or cannot provide downloadable media suitable for an editable project.
