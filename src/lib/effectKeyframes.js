// Source-local timestamps preserve animation across moves, trims and splits.
export const effectKeyTime = (clip, time) =>
  Math.max(0, Math.min(clip.duration, time - clip.start)) + (clip.sourceOffset || 0);
export function effectPropertyFrames(clip, key) {
  return (clip.parameterKeyframes || [])
    .filter(
      (frame) =>
        Number.isFinite(frame.time) &&
        frame.time >= 0 &&
        frame.values &&
        Object.hasOwn(frame.values, key),
    )
    .sort((a, b) => a.time - b.time);
}
function interpolate(a, b, progress) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * progress;
  if (typeof a === "string" && /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)) {
    return (
      "#" +
      [1, 3, 5]
        .map((index) =>
          Math.round(
            parseInt(a.slice(index, index + 2), 16) * (1 - progress) +
              parseInt(b.slice(index, index + 2), 16) * progress,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }
  if (a && b && typeof a === "object" && typeof b === "object")
    return Object.fromEntries(
      Object.keys(a).map((key) => [key, interpolate(a[key], b[key], progress)]),
    );
  return progress < 1 ? a : b;
}
export function resolveEffectParameters(clip, time) {
  const local = effectKeyTime(clip, time),
    resolved = { ...clip };
  for (const key of [
    "intensity",
    "color",
    "ripple",
    "alignmentYaw",
    "alignmentPitch",
    "alignmentRoll",
  ]) {
    const frames = effectPropertyFrames(clip, key);
    const before = frames.filter((frame) => frame.time <= local).at(-1);
    const after = frames.find((frame) => frame.time > local);
    if (before)
      resolved[key] = after
        ? interpolate(
            before.values[key],
            after.values[key],
            (local - before.time) / (after.time - before.time),
          )
        : before.values[key];
  }
  return resolved;
}
function setFrame(clip, key, time, value, remove = false) {
  const frames = structuredClone(clip.parameterKeyframes || []);
  let frame = frames.find((frame) => Math.abs(frame.time - time) < 0.025);
  if (!frame && !remove) {
    frame = { time, values: {} };
    frames.push(frame);
  }
  if (frame) {
    if (remove) delete frame.values[key];
    else frame.values[key] = value;
  }
  return frames
    .filter((frame) => Object.keys(frame.values || {}).length)
    .sort((a, b) => a.time - b.time);
}
export function toggleEffectKeyframe(clip, key, time, value) {
  const exists = effectPropertyFrames(clip, key).some(
    (frame) => Math.abs(frame.time - time) < 0.025,
  );
  return setFrame(clip, key, time, value, exists);
}
export function updateEffectParameter(clip, key, time, value) {
  return effectPropertyFrames(clip, key).length
    ? { parameterKeyframes: setFrame(clip, key, time, value) }
    : { [key]: value };
}
