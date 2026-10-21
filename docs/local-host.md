# Optional local host

The canonical `/` remains the browser editor. The local host is an opt-in Node 24
runtime for durable project files on macOS. It serves an already built editor on
an ephemeral `127.0.0.1` port and opens Chrome. Windows native project storage and
file selection are not implemented. This contribution does not ship installers,
a bundled Node runtime, or model downloads.

## Run from source

With Node 24 selected, Chrome installed, and the macOS command-line developer
tools available:

```sh
npm ci
npm run build
npm run build:storage
npm run host
```

`build:storage` explicitly compiles the included native filesystem helper into
`.cache/local-host/`. It does not install a compiler or runtime. Rebuild it after
updating the helper. Runtime state lives in the current user's
`Library/Application Support/Timeline Studio`; project folders are selected by
the user and are separate from that directory and from Auto-cut's data.

Use File → Save local project to choose a parent folder and create a named
project. Subsequent edits are queued for saving after a short debounce. A saved
status requires a successful durable save receipt. File → Open local project
opens an existing project directory. Reopening a page in the same running host
can restore its remembered project. After stopping and restarting the host,
launch a fresh authenticated page and open the project directory again.

Portable `.timeline` import/export remains available. Close a bound local project
before importing a portable project, so autosave cannot overwrite it. Complete-project
migration and trash-management interfaces are not part of this integration.
The imported storage implementation retains its supporting record types; migration
and destructive trash routes are not exposed in this runtime. Saving never
automatically collects old media. This is not a new public stable API or a promise of cross-platform
project-package compatibility.

## Sessions and recovery

- Launch links contain a short-lived, single-use bootstrap nonce. Browser page
  credentials are retained in session storage, never project files.
- Authenticated activity extends page expiry by 30 minutes. Event heartbeats
  trigger an authenticated refresh at most once per minute. The open stream
  checks the renewed deadline rather than closing at its original deadline.
- One writable editor lease is permitted per project. Leases last up to one
  minute and are renewed every 20 seconds while the page is active.
- An expired lease or a stale **lease** renewal revision permits reacquisition.
  Pending saves are resumed automatically only for a known lease-expiry error.
  Unrelated failures remain explicit. Reacquisition checks the durable editor
  sequence; another page's newer save produces a project conflict and preserves
  the current page's edits rather than overwriting that save.
- Retry preserves the original snapshot and idempotency key when the outcome
  is unknown. Only a confirmed failed save gets a new key. Completed model or
  remote processing jobs are never rerun by lease recovery.
- For a project conflict, export the current work as `.timeline` if needed,
  then explicitly close/open the project. A still-unknown save must first be
  reconciled by reading its original request receipt; no snapshot is posted
  after a project conflict. A missing receipt stays unknown; an error alone does
  not permit closing or switching projects. Opening or closing replaces the
  timeline only after confirmation. Stopping the host is explicit and is
  blocked while this page has pending work; other pages must be checked by the
  user before stopping the shared service.

The server accepts exact loopback Host and same-origin authenticated browser
requests. Native file selections are short-lived capabilities. Native storage
uses managed relative paths, project ownership and durable save records; it
rejects unsupported platforms instead of falling back to weaker filesystem
operations.

## Attribution and contribution scope

Adapted from Jason-zzr's MIT-licensed [Auto-cut](https://github.com/Jason-zzr/Auto-cut)
work for [issue #111](https://github.com/MartinDelophy/ai-video-editor/issues/111).
The original author is retained on the imported commits: `45fa628`, `20de196`,
`8fa3b52`, `181d1a9`, `145063f`, and `c7cee6d` (adapted from the corresponding Auto-cut commits). Compatibility changes retain the
current editor's audio remux path and use the Timeline Studio identity.
Saved material analysis, reviewed execution plans, transcript semantic review and
optional offline visual search (#112–#115) are integrated through the existing
project and command contracts. See [setup, evidence and limits](material-analysis.md).
Offline detector/search runtime artifacts must be prepared separately.

Validation uses `npm run check` (including the host TypeScript project) and
`npm run build:storage`. Session, stream-expiry, lease, retry, real native save /
reopen and HTTP-client checks are run outside the product repository, consistent
with its policy against committed test harnesses.

Failed or interrupted operations can intentionally retain uniquely named staging
files and quarantine directories. This runtime does not automatically sweep
unconfirmed outputs: preserve the project directory for recovery, and review
leftovers manually rather than deleting files during an unknown outcome.
