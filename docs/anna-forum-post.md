# Timeline Studio: production WASM/CSP blocker and strict-validator false positive — minimal reproductions

Hi Anna team,

Jiao suggested posting our integration questions here so the engineering team can investigate. We are adapting **Timeline Studio**, a browser-based video editor, for Anna.

**App:** `@martindelophy/timeline-studio` · **App ID:** `254` · **Private working draft:** `r5`, bundle ready. No release has been cut or submitted for review.

Production observations below were collected on **September 7, 2026**. We also reproduced the CLI failures in isolated local bundles on that date.

| Component | Tested version/environment |
| --- | --- |
| CLI | `@anna-ai/cli@0.1.51` |
| Browser SDK | `@anna-ai/app-runtime@0.16.0` |
| Schema package reported by CLI | `@anna-ai/app-schema@0.22.0` |
| Official local runtime | `anna-app-runtime-local@0.2.0a23` |
| Node.js | `22.14.0` |
| Browser environment | macOS, Codex in-app browser (exact browser build was not captured) |

Real Anna AI edit planning, plan application and undo/redo have worked. Production project upload and restoration, existing-reference conditional saves, file listing, and latest-reference repair have passed our sample checks. **The earlier production-origin storage CORS issue is resolved.**

The first two issues are our highest priorities. The remaining items are questions about supported behavior, not confirmed platform defects.

## 1. Production CSP blocks WebAssembly

**Impact:** browser-local models and our video source-audio extraction path cannot run in the production container. The same WASM capability probe passes in the official local harness.

Relevant directives from a fresh HTTP 200 response for the production draft entry:

```text
script-src 'self' 'self'
worker-src 'self' blob:
```

This is a header excerpt, not the full response. The app's compile/instantiate check is rejected by CSP. SharedArrayBuffer is also unavailable because the page is not cross-origin isolated; this is a separate limitation, not a requirement for the minimal single-threaded probe below.

### Minimal probe

Run this as a normal external script packaged with an Anna UI bundle, in the app iframe. Do not run it in the parent dashboard or bypass CSP in DevTools.

`index.html`:

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>WASM probe</title>
<button id="run" type="button">Run WASM probe</button>
<pre id="result">Not run</pre>
<script src="main.js" defer></script>
</html>
```

`main.js`:

```js
document.querySelector("#run").addEventListener("click", async () => {
  const result = {
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBufferAvailable: typeof SharedArrayBuffer !== "undefined",
  };
  try {
    const module = await WebAssembly.compile(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
    );
    await WebAssembly.instantiate(module);
    result.wasm = "passed";
  } catch (error) {
    result.wasm = "blocked";
    result.errorName = error.name;
    result.errorMessage = String(error.message).replace(/https?:\/\/\S+/g, "[URL]");
  }
  document.querySelector("#result").textContent = JSON.stringify(result, null, 2);
});
```

These eight bytes form a valid empty WASM module. The compile/instantiate operations are the same ones used by Timeline Studio's production capability check; no model download, SDK call, network request, or media file is required. The isolated probe bundle passes local strict validation. It has not been separately uploaded as another Anna app; the production runtime evidence comes from Timeline Studio r5.

**Expected:** a supported, narrowly scoped way to permit packaged WASM in an Anna app.

**Actual:** production compilation is blocked, and trying this manifest override is rejected by the pinned CLI:

```json
"csp_overrides": { "script-src": ["'wasm-unsafe-eval'"] }
```

Actual validation error, exit code **1**:

```text
csp_overrides[script-src] 仅允许 'self' / 'sha256-...' / 'nonce-...': 'wasm-unsafe-eval'
```

**Request:** is there an existing supported capability/configuration for WASM, or a planned fix? Separately, is cross-origin isolation supported for apps that need SharedArrayBuffer?

Our r5 mitigation stops export when requested source audio cannot be read. Both the top-bar and Anna-panel paths show a clear error. Explicitly selecting Muted produces a decodable two-second 1920×1080 MP4 preview. This does not establish complete audiovisual export or fix the platform CSP limitation.

## 2. Strict validation treats an SDK diagnostic string as a host API call

The official SDK contains `recover via anna.tools.getJob({jobId})` in an `invokeAsyncAwait` timeout message (`@anna-ai/app-runtime@0.16.0`, `dist/index.js`, line 430). Our application does not call that method.

The problem reduces to a bundle containing one string declaration, with **no SDK import and no host API calls**.

`manifest.json`:

```json
{
  "schema": 2,
  "permissions": [],
  "required_executas": [],
  "ui": {
    "bundle": { "format": "static-spa", "entry": "index.html" },
    "views": [{ "name": "main", "title": "Validator string repro", "default": true }],
    "host_api": {}
  }
}
```

`bundle/index.html`:

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Validator string repro</title>
<script src="main.js" defer></script>
</html>
```

Entire `bundle/main.js`:

```js
const diagnostic = "recover via anna.tools.getJob({jobId})";
```

Run from the folder containing `manifest.json` and `bundle/`:

```sh
npx --yes @anna-ai/cli@0.1.51 validate --manifest manifest.json --bundle bundle
npx --yes @anna-ai/cli@0.1.51 validate --manifest manifest.json --bundle bundle --strict
```

Actual results from the installed pinned CLI:

| Case | Exit code |
| --- | --- |
| Default validation | **0** |
| Same bundle, strict validation | **1** |
| Only replace the string with `const diagnostic = "recover via the job recovery API";`, strict validation | **0** |

Sanitized strict output:

```text
[validate] @anna-ai/app-schema dispatcher_version=0.22.0 (<cli-install>/node_modules/@anna-ai/app-schema)
✗ host-api: <repro>/bundle/main.js:1 calls anna.tools.getJob but manifest.ui.host_api.tools does not grant it
✗ validate failed: 1 error(s)
```

The CLI's `dist/cli.js` defines `ANNA_CALL_RE` around line 114. `scanHostApiCalls` applies the regex to source lines without excluding strings; `checkHostApiAllowance` reports the match as a call. This identifies a local CLI false positive; we have not assumed that the server-side review scanner behaves identically.

**Request:** please distinguish actual calls from diagnostic strings, or document how this false positive should be handled during review. We have retained the official SDK and have not added unrelated Executa permissions to silence it.

## 3. Storage first-write and concurrency semantics

Does `storage.set` with `if_match: ""` guarantee creation only when the record does not exist? If not, what is the supported atomic create-if-absent operation? Could you provide the contracts or examples for conflicts, conditional deletion, and pagination?

Existing-reference conditional saves passed. First-insert semantics, destructive deletion, and multipage listing remain unverified on our side.

## 4. Host-assisted download completion

Could you provide a complete `files.download` example, supported-browser information, and failure reporting? Does success mean a download was initiated or the file was saved?

The exported video appears in cloud file listings, confirming upload. We have not yet confirmed file delivery to the device in our test environment, so we are not reporting this as a proven platform download failure.

## 5. Platform data policies

To write an accurate Anna-specific privacy notice, please point us to the policies covering model inputs, outputs and logs, training use, uploaded media/projects, access, retention, backups, and deletion.

## 6. Review and release control

Our understanding is that the first release and subsequent versions require review, and approval may publish an app immediately. Can an approved version remain unpublished until the developer chooses to release it? What materials are required for the initial submission, and how should unavailable WASM-dependent features be disclosed? If a new version is cut during review, what is the supported process to replace the review candidate?

## 7. Builder Program and parallel distribution

We plan to maintain our independent website alongside the Anna edition. Is parallel distribution and monetization permitted, or is there an exclusivity or primary-distribution requirement?

For a workflow that uses Anna AI to generate a reviewable edit plan, while editing and rendering happen locally in the browser, how are Qualified App Runs and grant eligibility determined? The AI planning step currently receives the user's brief and clip metadata, not video frames or audio.

Thank you for helping us resolve the two technical blockers and clarify the remaining contracts. Our goal is to complete reproducible end-to-end validation before submitting a release.

Martin
Timeline Studio
