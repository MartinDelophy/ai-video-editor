# Infinite Canvas

The Workflow → Infinite canvas entry opens a three-column editable workspace. It starts empty and uses real assets and service receipts. No demo images, responses, progress or provider authorization are supplied.

## Node and execution contract

`src/lib/canvasGraph.js` defines ten node kinds and their typed ports. Text/media/character/scene are editable local source nodes. Script breakdown and shot design use structured Anna LLM results; image/video reuse the registered generation host; voice uses the Anna TTS catalog; music reuses browser-local AI Music. Edges express dependencies, never chronological order. Incompatible edges, occupied single-input ports and cycles are rejected. Connected upstream results must exist and be current before execution.

Generation is manual. Editing prompts, switching results or connecting nodes never starts a paid task. A running node captures its input signature; later edits remain intact and its completed output is marked out of date if needed. Results are versioned and downloaded media bytes are committed to My assets without timeline insertion. Provider reference support is enforced: Anna receives character/scene image references and first-frame video input, WebUI accepts a single reference for img2img, and connectors without reference bindings reject such inputs instead of silently ignoring them. ComfyUI requires an explicit API-format workflow. Loopback endpoints and CORS are validated by the existing adapters.

Anna video job IDs and immutable submission parameters are stored as soon as available. Stopping ends local waiting; it does not claim to cancel processing or billing. Resume queries that existing job ID without submitting a new generation. Other interrupted tasks are never replayed automatically.

## Assistant edits

Anna receives an inspected graph snapshot and a canvas-only tool catalog. It may propose node creation, descriptions, connections or removal, but cannot execute generation. The user sees the semantic operation list before applying it. Apply rejects a proposal if the inspected graph has since changed, validates types/cycles again and records an undo snapshot. Canvas logic is independent of provider transports and does not duplicate timeline editing commands.

## Browser recovery

IndexedDB stores graph state and referenced media bytes under the Anna account namespace and project ID. Startup reads finish before editing/writing is enabled. Saves use compare-and-swap revisions, acknowledge only transaction completion for the current snapshot, and preserve conflicting edits in a per-editor recovery copy. Reopening offers recovery or the latest main record. Undo/redo remains session-local; no cross-device sync is promised. All feature UI copy is directly available in 13 interface languages.

## Verification boundary

Connection/catalog checks do not run generation. End-to-end cloud generation consumes the user's account quota and must be initiated through the real Run control in the Anna host. A standalone local Anna page cannot complete the host handshake.

## Output continuation

Every edge carries an arrow toward its input. Drag an output to an existing compatible input to connect; only valid input targets highlight. Release over empty canvas, or activate the output with a click/keyboard, to open a menu of compatible node/input pairs. Choosing an option creates the next node and its edge as one undoable edit. Escape/cancel discards the pending cable. Terminal outputs honestly explain that no downstream node is currently available and direct the user to preview/download.

Node pickers retain native scrolling without panning or zooming the canvas underneath, including at scroll boundaries. Floating menus use a thin, subdued scrollbar; the next-node menu keeps its heading and close control visible while scrolling.

## Referencing nodes in chat

Type `@` in the canvas composer to search current nodes by localized type, text or ID. Arrow keys navigate; Enter or Tab selects a node into a removable reference pill without sending the message. Reference identities remain node IDs even when names change. Deleted nodes are excluded. Requests send `referencedNodeIds` separately from the instruction and resolve them against the inspected graph; selected-node context remains independent. References do not run nodes or grant generation permission.

## Node layout

Input ports occupy a reserved band below the node header. Preview and text content begin below that band, with node geometry and edge output anchors growing together for each input. Empty-state icons and labels are centered; authored text remains left aligned.
