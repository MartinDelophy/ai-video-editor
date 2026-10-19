export const createBlockoutScene = () => ({
  revision: 0,
  duration: 8,
  objects: [],
  motions: [],
  script: [],
  shots: [{ id: "s1", start: 0, end: 8, position: [5, 3.6, 7], target: [0, 1, 0] }],
});
const vec = (value, limit = 100) =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => Number.isFinite(n) && Math.abs(n) <= limit);
export function applyBlockoutEdits(scene, operations) {
  if (!Array.isArray(operations) || !operations.length || operations.length > 32)
    throw Error("INVALID_EDITS");
  const next = structuredClone(scene);
  for (const operation of operations) {
    if (operation.type === "update") {
      const object = next.objects.find((o) => o.id === operation.id);
      if (!object) throw Error("MISSING_OBJECT");
      for (const key of ["position", "rotation", "scale", "target"])
        if (operation[key] !== undefined) {
          if (
            !vec(operation[key], key === "rotation" ? 36000 : 100) ||
            (key === "scale" && operation[key].some((n) => n <= 0))
          )
            throw Error("INVALID_VECTOR");
          object[key] = [...operation[key]];
        }
    } else if (operation.type === "add") {
      if (!["actor", "prop"].includes(operation.kind) || next.objects.length >= 32)
        throw Error("INVALID_OBJECT");
      if (operation.position !== undefined && !vec(operation.position))
        throw Error("INVALID_VECTOR");
      next.objects.push({
        id: crypto.randomUUID(),
        kind: operation.kind,
        name: String(next.objects.filter((item) => item.kind === operation.kind).length + 1),
        position: operation.position || [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
    } else if (operation.type === "duration") {
      if (!Number.isFinite(operation.seconds) || operation.seconds < 3 || operation.seconds > 120)
        throw Error("INVALID_DURATION");
      next.motions = structuredClone(getBlockoutMotions(next));
      const ratio = operation.seconds / next.duration;
      next.shots.forEach((s) => {
        s.start *= ratio;
        s.end *= ratio;
      });
      for (const list of [next.motions || [], next.script || []])
        for (const item of list) {
          item.start *= ratio;
          item.end *= ratio;
        }
      next.duration = operation.seconds;
    } else if (operation.type === "camera") {
      const shot = next.shots.find((s) => s.id === operation.id);
      if (!shot || !vec(operation.position) || !vec(operation.target))
        throw Error("INVALID_CAMERA");
      shot.position = operation.position;
      shot.target = operation.target;
    } else if (operation.type === "shot") {
      if (
        typeof operation.id !== "string" ||
        !Number.isFinite(operation.start) ||
        !Number.isFinite(operation.end) ||
        operation.start < 0 ||
        operation.end <= operation.start ||
        operation.end > next.duration ||
        !vec(operation.position) ||
        !vec(operation.target) ||
        (operation.label !== undefined &&
          (typeof operation.label !== "string" || operation.label.length > 200))
      )
        throw Error("INVALID_SHOT");
      const shots = next.shots.filter((item) => item.id !== operation.id);
      if (shots.some((item) => item.start < operation.end && item.end > operation.start))
        throw Error("OVERLAPPING_SHOT");
      const shot = { ...operation };
      delete shot.type;
      next.shots = [...shots, shot].sort((a, b) => a.start - b.start);
    } else if (operation.type === "motion") {
      const actor = next.objects.find(
        (item) => item.id === operation.objectId && item.kind === "actor",
      );
      if (
        !actor ||
        typeof operation.id !== "string" ||
        !["move", "hold"].includes(operation.kind) ||
        !Number.isFinite(operation.start) ||
        !Number.isFinite(operation.end) ||
        operation.start < 0 ||
        operation.end <= operation.start ||
        operation.end > next.duration ||
        !vec(operation.to) ||
        (operation.from && !vec(operation.from)) ||
        (operation.rotation && !vec(operation.rotation, 36000))
      )
        throw Error("INVALID_MOTION");
      const others = (next.motions || []).filter((item) => item.id !== operation.id);
      if (
        others.some(
          (item) =>
            item.objectId === operation.objectId &&
            item.start < operation.end &&
            item.end > operation.start,
        )
      )
        throw Error("OVERLAPPING_MOTION");
      const motion = { ...operation };
      delete motion.type;
      if (
        motion.label !== undefined &&
        (typeof motion.label !== "string" || motion.label.length > 200)
      )
        throw Error("INVALID_LABEL");
      next.motions = [...others, motion];
    } else if (operation.type === "script.replace") {
      if (!Array.isArray(operation.segments) || operation.segments.length > 200)
        throw Error("INVALID_SCRIPT");
      const segments = operation.segments
        .map((item, index) => {
          if (
            typeof item.text !== "string" ||
            !item.text.trim() ||
            item.text.length > 2000 ||
            !Number.isFinite(item.start) ||
            !Number.isFinite(item.end) ||
            item.start < 0 ||
            item.end <= item.start ||
            item.end > next.duration ||
            (item.objectId && !next.objects.some((o) => o.id === item.objectId))
          )
            throw Error("INVALID_SCRIPT");
          return {
            id: `script-${index}`,
            start: item.start,
            end: item.end,
            text: item.text.trim(),
            ...(item.objectId ? { objectId: item.objectId } : {}),
          };
        })
        .sort((a, b) => a.start - b.start);
      if (segments.some((item, index) => index && item.start < segments[index - 1].end))
        throw Error("OVERLAPPING_SCRIPT");
      next.script = segments;
    } else throw Error("INVALID_OPERATION");
  }
  next.revision = scene.revision + 1;
  return next;
}
export const BLOCKOUT_EDIT_TOOL = {
  name: "blockout_scene_edit",
  description:
    "Propose edits to the supplied inspected 3D blockout scene. Only IDs from current scene. Changes are reviewed before application. Units meters/degrees. Character target is a walking destination. camera edits a shot, not an object. motion adds a real timed move/hold for an actor using objectId, id, start/end seconds, to/from vectors and optional rotation/label. script.replace replaces ordered non-overlapping script segments with start/end/text and optional objectId. Keep all timed ranges within scene duration. Author the requested story text as timed script segments so playback can follow it. Do not claim to generate speech, facial expression or arbitrary geometry.",
  inputSchema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 32,
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["update", "add", "duration", "camera", "motion", "script.replace", "shot"],
            },
            id: { type: "string" },
            kind: { type: "string", enum: ["actor", "prop", "move", "hold"] },
            objectId: { type: "string" },
            start: { type: "number" },
            end: { type: "number" },
            label: { type: "string", maxLength: 200 },
            from: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            to: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            segments: {
              type: "array",
              maxItems: 200,
              items: {
                type: "object",
                properties: {
                  start: { type: "number" },
                  end: { type: "number" },
                  text: { type: "string", maxLength: 2000 },
                  objectId: { type: "string" },
                },
                required: ["start", "end", "text"],
                additionalProperties: false,
              },
            },
            position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            rotation: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            scale: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            target: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            seconds: { type: "number" },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
    },
    required: ["operations"],
    additionalProperties: false,
  },
};

// One time mapping shared by the viewport, rendered exports and timeline lanes.
export function getBlockoutMotions(scene) {
  const explicit = scene.motions || [];
  const covered = new Set(explicit.map((item) => item.objectId));
  return [
    ...explicit,
    ...scene.objects
      .filter(
        (object) =>
          object.kind === "actor" &&
          object.target &&
          !covered.has(object.id) &&
          object.target.some((n, i) => n !== object.position[i]),
      )
      .map((object) => ({
        id: `walk-${object.id}`,
        objectId: object.id,
        start: 0,
        end: Math.min(4, scene.duration),
        kind: "move",
        from: object.position,
        to: object.target,
      })),
  ];
}
export function getBlockoutActorPose(scene, object, time) {
  let position = [...object.position],
    rotation = [...object.rotation],
    moving = false;
  const motions = getBlockoutMotions(scene)
    .filter((item) => item.objectId === object.id)
    .sort((a, b) => a.start - b.start);
  for (const motion of motions) {
    if (time < motion.start) break;
    const fraction = Math.max(0, Math.min(1, (time - motion.start) / (motion.end - motion.start)));
    const from = motion.from || position;
    position = from.map((value, i) => value + ((motion.to || from)[i] - value) * fraction);
    if (motion.rotation)
      rotation = rotation.map((value, i) => value + (motion.rotation[i] - value) * fraction);
    moving =
      motion.kind === "move" &&
      time >= motion.start &&
      time < motion.end &&
      position.some((_, i) => (motion.to || from)[i] !== from[i]);
  }
  return { position, rotation, moving };
}
export function getBlockoutScriptIndex(segments = [], time = 0) {
  return segments.findIndex(
    (segment, index) =>
      time >= segment.start &&
      (time < segment.end || (index === segments.length - 1 && time === segment.end)),
  );
}

export function getBlockoutShot(scene, time) {
  return [...scene.shots].reverse().find((shot) => time >= shot.start) || scene.shots[0];
}
