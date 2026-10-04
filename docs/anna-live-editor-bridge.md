# Anna current-editor bridge (experimental)

The initial bridge is read-only. External Anna chat sends `open_app_view` to the main view with:

```json
{
  "timelineStudioRequest": {
    "schemaVersion": 1,
    "requestId": "inspect-unique-request-001",
    "method": "project.inspect",
    "issuedAt": 1791070000000
  }
}
```

Replace issuedAt with current Unix milliseconds and use a fresh requestId per inspection. The SDK's `entry_payload` event handles an already open single-instance window; the initial SDK entryPayload handles a newly opened window. A request expires after two minutes. Window focus/open acknowledgement is not execution success. Await the `chat.append_artifact` app_event with the matching requestId and inspect result.ok.

The response contains duration, ratio, per-track counts, marker counts, warnings and capturedAt. It omits captions, filenames, URLs, media bytes, private app storage and serialized command revision (which is not a live editing conflict token). Pending startup/recovery returns EDITOR_NOT_READY. Unsupported methods return UNSUPPORTED_REQUEST; no edits execute. IDs are deduplicated in the mounted bridge; failed artifact delivery allows same-ID retry while the request is fresh. This is bounded session deduplication, not a durable exactly-once contract.

The host manifest explicitly allows chat.append_artifact. No Executa app-storage permission is added. The external archive tools remain independent. This is an asynchronous window/chat path, not a synchronous Executa-to-iframe RPC. runtime_state patches are not used as a command channel because the window documentation says patches are not guaranteed to broadcast.

Sources: [LLM window integration](https://anna.partners/developers/apps/app-ui-llm.md), [window events](https://anna.partners/developers/apps/app-ui-windows.md), [host chat API](https://anna.partners/developers/apps/app-ui-host-api.md), [Executa storage](https://anna.partners/developers/tools/executa-storage.md).

Local checks cover correlation, duplicate delivery, expiry, unsupported mutation rejection, omission of caption text and preservation of source state. Production window-to-chat delivery must be verified separately before describing this as a fully working live-editor integration. Mutating methods, rendering, browser AI and synchronous result polling are not implemented.

Working draft r79 was uploaded with bundle ready on 2026-10-04. Build, ESLint, TypeScript and Anna schema validation passed. Store and review versions were not changed.

Production probe found that open_app_view requires an integer app_id despite the string examples in the window guide. Use verified app_id 254 for this Anna deployment, never guess an identifier.

## Production probe — 2026-10-04

Draft r80 includes the integer-ID correction and Skill 0.1.2. External chat first rejected the documented string app_id at argument validation. Retrying verified integer 254 successfully focused an existing server window, but no correlated artifact appeared. One intervening attempt failed before tool dispatch with Anna's personality-row unique-constraint error; the next tool invocation succeeded. Closing the old window and calling open_app_view again returned new server window 61724ed3-f241-4cf2-82b0-f1143ab66a8b, yet the dashboard DOM contained zero iframes. Thus the new-window probe did not execute editor code; it cannot establish that the application return handler failed. Do not advertise production success or add mutating methods until actual iframe delivery and correlated result are verified.

The publicly served production window manager (`/static/js/anna-app-window-manager.js?v=cb66d0d1`) provides a concrete explanation for the existing-window case: `openFromDetail()` replaces existing.detail and raises/restores it, then returns without calling bridge.pushEvent for entry_payload. Its applyEvent switch also has no runtime_state_synced branch. The host bridge supports pushEvent, but the manager does not use it for these requests. This is a platform implementation gap relative to the published guide; application code cannot receive an event the host never forwards. Refresh subsequently hydrated one iframe, so the zero-iframe new-window observation is specifically the live event/mount path, not permanent window loss.

Working draft r81 is ready (content hash 249b7edcff41ba47d4fa9129c0e06496b23393a434293275d76ff2a70a94f5a7). The bridge emits content-free request/delivery diagnostics with the request ID and host error code, allowing a future platform fix to be verified without exposing project contents. Store/review releases remain unchanged.

Final r81 console verification after hydration: request received bridge-live-1791070455513, then artifact delivery failed with permission_denied. This proves the iframe's initial payload handler ran; it does not prove successful result delivery. ui.host_api.chat already declares append_artifact in the working manifest. The runtime ACL/installed-version selection must be resolved on Anna before claiming production support. No permission bypass was attempted. Browser proof: /tmp/anna-live-bridge-verification.jpg.
