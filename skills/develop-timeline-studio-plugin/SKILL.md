---
name: develop-timeline-studio-plugin
description: Design, evaluate, implement, or review image and video generation connectors for Timeline Studio. Use when adding a provider plugin, extracting the generation plugin host or registry, or checking a connector against Timeline Studio's authentication, output, localization, and My assets contract. Do not use for ordinary video editing or Codex plugin packaging.
---

# Develop Timeline Studio generation plugins

Build a source-integrated generation connector that remains isolated from Timeline Studio's editing core and returns real downloadable media to My assets.

## Start with the contract

Read [../../docs/generation-plugin-development.md](../../docs/generation-plugin-development.md) completely before designing or changing a connector. Treat it as the source of truth for provider eligibility, runtime classes, manifest and adapter shapes, security, localization, output normalization, and completion criteria.

Also read the repository's `AGENTS.md` and inspect the current implementations in:

- `src/components/GenerationPlugins.jsx`
- `src/hooks/useGenerationPlugins.js`

Do not assume that an external installable plugin runtime already exists. Current plugins are reviewed source integrations. If the shared registry and host described by the contract are absent, make only the bounded extraction required for the requested provider and preserve existing provider behavior.

## Decide before implementing

Use the provider's current official documentation to establish:

- a stable task/result API or owned browser SDK;
- automatic retrieval of every generated image or video;
- authentication and credential ownership;
- browser and CORS requirements;
- real job, progress, error, and cancellation semantics;
- temporary-output lifetime, cost, region, and account constraints.

Reject a generic embed or manual result-URL workflow. Stop when the provider requires a developer secret in browser code or lacks a safe automatic output route. State the exact missing capability rather than simulating it.

## Preserve the host boundary

- Put provider transport and response parsing in an isolated adapter.
- Register identity and capabilities through one declarative manifest.
- Let the host own concurrency, cancellation arbitration, media validation, object URLs, notifications, and My assets commits.
- Never let a provider mutate the timeline or receive broad editor state.
- Download and decode output bytes before reporting completion.
- Import all declared outputs, not only the first.
- Use provider-backed progress or an indeterminate state; never fabricate percentages.
- Keep authentication, connection, running, cancelled, complete, and error states honest.

## Product and security requirements

- Completed media goes to My assets without automatic timeline insertion.
- Provider-managed browser sessions may remain inside the provider SDK boundary.
- Developer-owned secrets require a secure backend connection layer.
- Loopback plugins accept only `localhost`, `127.0.0.1`, or `::1` and must validate endpoint and CORS before showing connected.
- Do not recommend LAN exposure or wildcard CORS.
- Localize provider-specific copy directly in `zh`, `en`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `th`, `vi`, and `ru`.
- Convert raw transport failures into localized, actionable errors without leaking secrets.

## Finish visibly

Exercise the real states the provider supports, then run `npm run lint`, `npm run typecheck`, and `npm run build`. Do not add persistent test harnesses or test media to the product repository. Update maintained README project-update sections only after the connector actually ships.

In the final handoff, report the provider class, authentication boundary, supported modes, cancellation truth, output-download behavior, files changed, and validation results. Call out any capability that remains unavailable instead of presenting it as implemented.
