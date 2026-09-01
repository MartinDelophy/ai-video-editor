# Timeline Studio generation plugin development

This document is the source-of-truth contract for adding image and video generation providers to Timeline Studio. It is written so that a coding agent can implement a provider without rediscovering the product boundary or copying another provider blindly.

## Current status

Timeline Studio currently ships source-integrated connectors for Puter.js, ComfyUI, and Stable Diffusion WebUI/Forge. Their manifests and transport adapters live under `src/plugins/generation/providers/`; `src/plugins/generation/registry.js` owns discovery, `src/plugins/generation/host.js` owns media validation and My assets commits, and `src/hooks/useGenerationPlugins.js` coordinates the shared lifecycle. Provider inspectors still compose the existing shared UI in `src/components/GenerationPlugins.jsx` and can be extracted incrementally when a provider needs a materially distinct form.

There is not yet a runtime for downloading and executing arbitrary third-party plugin code. Do not claim that a provider can be installed independently until that runtime, its permissions model, and its compatibility checks exist. Today, “develop a plugin” means contributing a reviewed generation-provider adapter to this repository.

The architecture below is the active contract. A new provider must register a manifest and adapter rather than add another provider-specific transport branch to the shared hook.

## Scope

Version 1 covers generation connectors that:

- accept text and, when supported, reference media;
- create images or videos through a real browser SDK, loopback service, or secure backend connection;
- expose honest connection and job state;
- download completed output bytes;
- return normalized media to the host for insertion into My assets.

Version 1 does not cover timeline editing commands, effects, transitions, arbitrary React extensions, model training, ambient content feeds, or generic embedded websites. Those require separate contracts.

## Product invariants

Every provider must preserve these rules:

1. Completed media enters My assets and is never inserted into the timeline automatically.
2. A successful result means Timeline Studio owns usable media bytes or a browser-local object backed by those bytes. An expiring URL alone is not completion.
3. Connection states are real: `disconnected`, `connecting` or `authorizing`, `connected`, and `error` must reflect provider state rather than optimistic UI.
4. Job states are real: use `idle`, `queued`, `running`, `complete`, `cancelled`, and `error`. Report a numeric percentage only when the provider supplies meaningful progress; otherwise show an indeterminate running state.
5. Provider errors must be converted to localized, actionable messages. Never expose a raw `Failed to fetch` string.
6. A plugin may not fabricate authentication, generation, progress, output, or a successful connection.
7. All user-facing fields and states are localized directly in Chinese, English, Japanese, Korean, Spanish, French, German, Portuguese, Thai, Vietnamese, and Russian.

## Provider eligibility

Before implementing a provider, record evidence for the following questions:

- Does it expose a stable documented task/result API or browser SDK?
- Can Timeline Studio automatically retrieve every completed image or video?
- What authentication model does it use?
- Can cancellation be implemented, and what does cancellation actually guarantee?
- Does it expose real progress, only coarse state, or neither?
- Are output URLs temporary? If so, how quickly must they be downloaded?
- What browsers, regions, account types, costs, and content restrictions apply?
- Does browser access require CORS, popup activation, or a secure backend?

Reject generic iframe integrations and services that require the user to paste a result URL manually. Do not label a provider connected when endpoint, authentication, or CORS validation has not completed.

## Provider classes

Choose exactly one runtime class:

### `browser-session`

Use when the provider owns its browser SDK, popup authentication, account session, and usage boundary. Start popup-dependent authentication synchronously in the user's click event. Puter.js is the current example.

### `loopback`

Use for a service running on the user's machine. Accept only `localhost`, `127.0.0.1`, or `::1` over HTTP or HTTPS. Validate the provider-specific health endpoint and CORS before entering `connected`. Never recommend LAN exposure, wildcard CORS, or disabling authentication on a non-loopback interface.

### `secure-backend`

Use when a developer-owned provider secret or privileged server operation is required. Secrets must remain behind a secure backend connection layer. Do not place them in the browser bundle, localStorage, source code, sample configuration, logs, or a plugin manifest.

## Target source layout

Source-integrated providers should converge on this layout:

```text
src/plugins/generation/
├── contract.js
├── registry.js
├── host.js
└── providers/
    └── example-provider/
        ├── manifest.js
        ├── adapter.js
        ├── Inspector.jsx
        ├── copy.js
        └── index.js
```

- `contract.js` owns shared capability, state, request, result, and error shapes.
- `registry.js` is the only catalog registration point.
- `host.js` owns job arbitration, cancellation, output normalization, and My assets commits.
- `manifest.js` contains declarative identity and capability metadata only.
- `adapter.js` contains provider transport and response parsing without React state.
- `Inspector.jsx` composes shared controls for provider-specific inputs.
- `copy.js` contains direct feature-specific copy for all 11 languages.

If this shared host is not present, create the smallest bounded extraction needed for the provider being added. Preserve existing behavior and migrate one provider at a time. Do not rewrite the whole plugin workspace as a prerequisite for a single connector.

## Manifest contract

The target manifest is a source-controlled JavaScript object so it can reference an owned icon component without allowing runtime code injection:

```js
export const manifest = {
  schemaVersion: 1,
  id: "example-provider",
  displayName: "Example Provider",
  version: "1.0.0",
  runtime: "browser-session", // browser-session | loopback | secure-backend
  capabilities: ["text-to-image"],
  outputTypes: ["image"],
  auth: "provider-session", // none | provider-session | user-credential | backend
  defaultEndpoint: null,
};
```

Requirements:

- `id` is stable lower-case kebab-case and must not change with branding copy.
- `version` follows semantic versioning for adapter behavior.
- `capabilities` uses only host-known values.
- A manifest never contains tokens, cookies, API keys, account identifiers, workflow secrets, or executable remote URLs.
- Card descriptions and field labels are resolved from `copy.js`, not embedded as one-language manifest strings.

Initial capability values:

- `text-to-image`
- `image-to-image`
- `text-to-video`
- `image-to-video`
- `workflow-image`
- `workflow-video`

Add a new capability value only when its request and result semantics cannot be represented by an existing value.

## Adapter contract

An adapter receives host services and returns provider lifecycle methods:

```js
export function createAdapter(services) {
  return {
    async connect({ config, signal }) {},
    async disconnect() {},
    async generate({ request, signal, onState, onProgress }) {},
    async cancel({ job }) {},
    normalizeError(error) {},
  };
}
```

### Host services

The host, not the provider, owns shared product behavior. Expose only the services the adapter needs:

```js
{
  fetch,
  createId,
  now,
  decodeImage,
  inspectVideo,
}
```

Do not give adapters direct access to `setUserAssets`, timeline mutation functions, global editor state, notifications, or arbitrary DOM roots. The adapter returns normalized results; the host commits them.

### Connection result

```js
{
  state: "connected",
  accountLabel: "optional non-sensitive label",
  endpoint: "optional validated endpoint",
  capabilities: ["text-to-image"],
}
```

### Generation request

```js
{
  mode: "text-to-image",
  prompt: "...",
  negativePrompt: "...",
  model: "provider-model-id",
  seed: 123,
  width: 1024,
  height: 1024,
  durationSeconds: null,
  aspectRatio: "1:1",
  referenceAssets: [],
  providerOptions: {},
}
```

Use shared fields whenever possible. Provider-only settings belong in `providerOptions` and must be validated by the adapter before network activity.

### Generation result

Return one or more normalized outputs:

```js
{
  provider: "example-provider",
  jobId: "provider-job-id",
  outputs: [
    {
      type: "image", // image | video
      blob,
      mimeType: "image/png",
      fileName: "example.png",
      width: 1024,
      height: 1024,
      durationSeconds: null,
      prompt: "...",
      model: "provider-model-id",
      seed: 123,
      provenance: {
        provider: "Example Provider",
        generatedAt: "ISO-8601 timestamp",
      },
    },
  ],
}
```

The host validates that each blob is non-empty, identifies its real media type, decodes it, assigns Timeline Studio asset IDs, creates object URLs, and commits all valid outputs to My assets. If a provider declares multiple outputs, do not silently keep only the first.

## Cancellation and concurrency

- Only one generation job may own the shared inspector job surface at a time unless the product explicitly adds a queue.
- Use `AbortController` for client-side work and call a provider cancellation endpoint when one exists.
- Distinguish “request cancelled remotely” from “the editor stopped waiting.” Do not claim remote cancellation if only local polling stopped.
- Ignore late callbacks from superseded connection or generation attempts.
- Clean up timers, object URLs, listeners, polling loops, and temporary provider files.

## Inspector and catalog rules

- Register the provider card through the shared registry rather than editing catalog rendering branches.
- Reuse shared connection banners, job status, progress, fields, and actions.
- Keep provider-specific controls prompt-first and no larger than required by the provider's actual API.
- Enabled Generate and Cancel actions use a pointer cursor; disabled actions use `not-allowed`.
- Closing an inspector must not falsely cancel a remote job unless the UI explicitly says it will.
- Authentication, cost, account ownership, and local-service boundaries must be visible before the first consequential action.
- Completed output opens Media → My assets only after the bytes have been committed.

## Localization

Every provider must define direct copy for these locale keys:

```text
zh, en, ja, ko, es, fr, de, pt, th, vi, ru
```

At minimum localize the card description, connection instructions, input labels, help text, action labels, connection errors, job errors, cancellation state, and result confirmation. Do not rely on a generic English fallback for provider-specific copy.

## Implementation workflow for an AI coding agent

1. Read `AGENTS.md`, this document, `src/components/GenerationPlugins.jsx`, and `src/hooks/useGenerationPlugins.js`.
2. Inspect the provider's current official API documentation. Record runtime class, authentication, stable endpoints, CORS behavior, job lifecycle, cancellation semantics, result format, cost boundary, and regional constraints.
3. Decide whether the provider is eligible. Stop with a concrete explanation if automatic result retrieval or a safe credential route is missing.
4. Write a short integration plan naming the shared host changes and provider-isolated files. Do not start by copying an existing provider branch.
5. Implement the manifest and transport adapter. Keep provider parsing outside React.
6. Add the inspector with shared controls and all 11 locale dictionaries.
7. Normalize and download every output, then let the host commit it to My assets. Never insert it into the timeline.
8. Verify the real disconnected, connecting or authorization, connected, running, cancelled, complete, and error paths supported by the provider.
9. Run `npm run lint`, `npm run typecheck`, and `npm run build`. Do not add a persistent automated-test workspace or test media to this repository.
10. Update maintained README project-update sections only when the connector actually ships, respecting the five-entry, newest-first, localized update rule.

## Definition of done

A connector is complete only when:

- its provider eligibility evidence is documented in the change summary;
- no developer-owned secret reaches browser code or repository files;
- connection and CORS validation are real;
- the provider has an isolated manifest and adapter;
- all advertised modes call real provider endpoints or SDK methods;
- progress is provider-backed or explicitly indeterminate;
- cancellation semantics are described honestly;
- every declared output is downloaded, decoded, and added to My assets;
- no output is inserted into the timeline automatically;
- feature-specific UI is localized in all 11 supported languages;
- errors are actionable and do not expose raw transport messages or secrets;
- existing providers still behave correctly;
- lint, type checking, and production build pass.

## Recommended AI request

Use this prompt when asking an agent to add a provider:

```text
Use $develop-timeline-studio-plugin to evaluate and integrate <provider> as a Timeline Studio generation connector.

Use the provider's current official API documentation. First establish whether it has a stable task/result API, automatic media download, a safe authentication route, honest job state, and compatible CORS behavior. If it is eligible, implement the smallest provider-isolated adapter and inspector that follows the Timeline Studio generation plugin contract. Localize all provider-specific UI in the 11 supported languages, download every output into My assets, never insert it into the timeline automatically, and validate lint, typecheck, and build. Do not place developer secrets in browser code and do not claim an external installable plugin runtime exists.
```
