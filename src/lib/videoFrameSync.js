const videoSeekStates = new WeakMap();
const SEEK_TIME_EPSILON = 0.002;
const EARLY_PRESENTED_FRAME_TOLERANCE = 0.04;

function getSeekState(video) {
  let state = videoSeekStates.get(video);
  if (!state) {
    state = { version: 0, pending: null, active: null, frameRequest: 0,
      videoFrameRequest: 0, fallbackFrame: 0, seeked: null, reset: null };
    videoSeekStates.set(video, state);
  }
  return state;
}

function clearObservation(video, state) {
  if (state.videoFrameRequest) video.cancelVideoFrameCallback?.(state.videoFrameRequest);
  if (state.fallbackFrame) window.cancelAnimationFrame(state.fallbackFrame);
  if (state.seeked) {
    video.removeEventListener("seeked", state.seeked);
    video.removeEventListener("loadeddata", state.seeked);
  }
  if (state.reset) {
    video.removeEventListener("emptied", state.reset);
    video.removeEventListener("error", state.reset);
  }
  state.videoFrameRequest = 0;
  state.fallbackFrame = 0;
  state.seeked = null;
  state.reset = null;
}

function scheduleLatestSeek(video, state) {
  if (state.active || !state.pending || state.frameRequest) return;
  state.frameRequest = window.requestAnimationFrame(() => applyLatestSeek(video, state));
}

function applyLatestSeek(video, state) {
  state.frameRequest = 0;
  if (state.active || !state.pending) return;
  clearObservation(video, state);
  const request = state.pending;
  const version = ++state.version;
  state.pending = null;
  state.active = request;
  const hasFrameCallback = typeof video.requestVideoFrameCallback === "function";
  let earlyMediaTime = null;
  let finished = false;
  const finish = (mediaTime) => {
    if (state.version !== version || finished) return;
    finished = true;
    clearObservation(video, state);
    state.active = null;
    try { request.onPresented?.(mediaTime); }
    finally { scheduleLatestSeek(video, state); }
  };
  const watchFrame = () => {
    state.videoFrameRequest = video.requestVideoFrameCallback((_now, metadata) => {
      if (state.version !== version || finished) return;
      state.videoFrameRequest = 0;
      // Some decoders submit the target frame before clearing `seeking`.
      // Retain its actual PTS instead of requiring an additional paused frame.
      if (Number.isFinite(metadata?.mediaTime)) earlyMediaTime = metadata.mediaTime;
      if (video.seeking || earlyMediaTime === null) { watchFrame(); return; }
      finish(earlyMediaTime);
    });
  };
  const onSeeked = () => {
    if (state.version !== version || finished) return;
    // Same-frame seeks need not emit another rVFC. Allow two compositor frames
    // before unlocking the queue, but never report requested currentTime as a
    // confirmed PTS. Keep observing a late final frame if nothing is pending.
    if (state.fallbackFrame) window.cancelAnimationFrame(state.fallbackFrame);
    state.fallbackFrame = window.requestAnimationFrame(() => {
      if (state.version !== version || finished) return;
      state.fallbackFrame = window.requestAnimationFrame(() => {
        if (state.version !== version || finished) return;
        state.fallbackFrame = 0;
        if (video.seeking || video.readyState < 2) return;
        if (!hasFrameCallback) { finish(video.currentTime); return; }
        // A superseded seek can still submit an old frame. Only reconcile a
        // nearby causal PTS; for longer/unknown frame intervals keep observing
        // without blocking the next request or inventing the requested time.
        const earlyFrameOffset = earlyMediaTime === null ? Infinity : request.targetTime - earlyMediaTime;
        if (earlyFrameOffset >= -SEEK_TIME_EPSILON && earlyFrameOffset <= EARLY_PRESENTED_FRAME_TOLERANCE) {
          finish(earlyMediaTime);
          return;
        }
        state.active = null;
        scheduleLatestSeek(video, state);
      });
    });
  };
  state.seeked = onSeeked;
  state.reset = () => cancelLatestVideoFrameRequest(video);
  video.addEventListener("seeked", onSeeked, { once: true });
  if (video.readyState < 2) video.addEventListener("loadeddata", onSeeked, { once: true });
  video.addEventListener("emptied", state.reset, { once: true });
  video.addEventListener("error", state.reset, { once: true });
  if (hasFrameCallback) watchFrame();
  try {
    if (Math.abs(video.currentTime - request.targetTime) > SEEK_TIME_EPSILON) {
      video.currentTime = request.targetTime;
    } else if (!video.seeking) {
      onSeeked();
    }
  } catch {
    // A replaced/unloaded element must not retain work for the new preview.
    cancelLatestVideoFrameRequest(video);
  }
}

export function requestLatestVideoFrame(video, targetTime, options = {}) {
  if (!video || !Number.isFinite(targetTime)) return;
  const state = getSeekState(video);
  const request = {
    targetTime: Math.max(0, targetTime),
    onPresented: typeof options.onPresented === "function" ? options.onPresented : null,
  };
  if (state.active && Math.abs(state.active.targetTime - request.targetTime) <= SEEK_TIME_EPSILON) {
    // React synchronization can repeat the controller's request. Preserve its
    // observer, and discard any intermediate target that is no longer wanted.
    state.active.onPresented = request.onPresented;
    state.pending = null;
    return;
  }
  state.pending = request;
  if (options.immediate) {
    // The exact press/release takes precedence over intermediate movement.
    if (state.frameRequest) window.cancelAnimationFrame(state.frameRequest);
    state.frameRequest = 0;
    state.active = null;
    applyLatestSeek(video, state);
  } else {
    // Finish an in-flight decode before jumping straight to the latest target.
    scheduleLatestSeek(video, state);
  }
}

export function cancelLatestVideoFrameRequest(video) {
  const state = video && videoSeekStates.get(video);
  if (!state) return;
  state.version += 1;
  if (state.frameRequest) window.cancelAnimationFrame(state.frameRequest);
  clearObservation(video, state);
  state.frameRequest = 0;
  state.active = null;
  state.pending = null;
}
