# Workflow canvas trackpad gestures

Updated 2026-10-20. Infinite Canvas and Storyboard share `useCanvasGestures` and its production event binding.

- A wheel stream keeps the owner resolved at its first event until a 180 ms pause. Canvas panning continues when a node input moves under the pointer. Scrolling started in a control remains native; it cannot suddenly pan the canvas.
- Ctrl/Cmd-wheel and WebKit pinch stay canvas-local, including over node inputs. Zoom preserves the world point beneath the pointer. Shift-wheel, line/page delta units and explicit zoom controls remain supported.
- All wheel deltas accumulate into a desired view. At most one compositor transform and percentage update runs per animation frame, without re-rendering every node or writing the project per event. Storyboard's grid follows the same transform. View scales remain bounded to 20-200%.
- A settled gesture commits one view change through each workspace's existing project update/save path. Pointer-down, keyboard input or blur flushes the pending view before the next interaction. Loading a different project cancels pending paint. Native controls do not create project edits.
- WebKit gesture events suppress their duplicate wheel stream, with a 300 ms watchdog if gestureend is missing. Gesture listeners are non-passive and scoped to the canvas so they cannot zoom the document or chain into browser navigation.

Validation used a temporary event-binding check outside the repository for ownership crossing, native scrolling, frame batching, anchored pinch, line units, missing gestureend recovery, interaction flush and cleanup. Local browser checks exercised both real workspaces, wheel panning, final-view restoration after reload and explicit zoom. Physical trackpad feel in the Anna host remains a user verification step.
