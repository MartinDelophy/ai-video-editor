import { getVisualSegmentTimeline } from "./timeline.js";
import { getVisualSourceTime } from "./visualEffects.js";
import { getFaceAttachmentAsset } from "./faceAttachmentAssets.js";
import { resolveEffectParameters } from "./effectKeyframes.js";
import { drawCatFace } from "./catFaceEffect.js";
import { FACE_EFFECT_IDS, isFaceEffect } from "./faceEffectKinds.js";
export { FACE_EFFECT_IDS, isFaceEffect } from "./faceEffectKinds.js";
export function facePoseImageRatios(face, width, height) {
  const [left, right, nose] = face.five;
  const dx = (right.x - left.x) * width,
    dy = (right.y - left.y) * height;
  const nx = (nose.x - (left.x + right.x) / 2) * width,
    ny = (nose.y - (left.y + right.y) / 2) * height;
  const squared = Math.max(1e-6, dx * dx + dy * dy);
  return { noseYaw: (nx * dx + ny * dy) / squared, nosePitch: (ny * dx - nx * dy) / squared };
}
/** Face attachments consume normalized, inspected detector landmarks.
 * Missing or rejected faces deliberately produce no drawing. */
export function resolveFaceAttachmentPose(face, width, height) {
  if (!face || face.score < 0.7 || face.five?.length !== 5) return null;
  const [left, right, nose] = face.five;
  if (!face.five.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const dx = (right.x - left.x) * width,
    dy = (right.y - left.y) * height;
  const eyeDistance = Math.hypot(dx, dy);
  if (eyeDistance < Math.min(width, height) * 0.025) return null;
  const angle = Math.atan2(dy, dx);
  if (Math.abs(angle) > Math.PI / 3) return null;
  const yaw = ((nose.x - (left.x + right.x) / 2) * width) / eyeDistance;
  if (Math.abs(yaw) > (Number.isFinite(left.z) && Number.isFinite(right.z) ? 1 : 0.65)) return null;
  const spatialDistance = Math.hypot(eyeDistance, ((right.z || 0) - (left.z || 0)) * width);
  const forehead = face.forehead || {
    x: (left.x + right.x) / 2 + (Math.sin(angle) * eyeDistance * 0.85) / width,
    y: (left.y + right.y) / 2 - (Math.cos(angle) * eyeDistance * 0.85) / height,
  };
  const eyeZ = ((left.z || 0) + (right.z || 0)) / 2;
  const ratios = facePoseImageRatios(face, width, height);
  const pose = {
    forehead: { x: forehead.x * width, y: forehead.y * height },
    yawRadians:
      Number.isFinite(left.z) && Number.isFinite(right.z)
        ? Math.asin(Math.max(-0.85, Math.min(0.85, ((right.z - left.z) * width) / spatialDistance)))
        : yaw * 1.6,
    pitchRadians: Number.isFinite(forehead.z)
      ? Math.max(
          -0.45,
          Math.min(
            0.45,
            Math.atan2(
              -((forehead.z || 0) - eyeZ) * width,
              Math.hypot(
                (forehead.x - (left.x + right.x) / 2) * width,
                (forehead.y - (left.y + right.y) / 2) * height,
              ),
            ),
          ),
        )
      : 0,
    x: ((left.x + right.x) / 2) * width,
    y: ((left.y + right.y) / 2) * height,
    scale: spatialDistance,
    angle,
    yaw,
    nose: { x: nose.x * width, y: nose.y * height },
    mouth: face.five.slice(3).reduce(
      (center, point) => ({
        x: center.x + (point.x * width) / 2,
        y: center.y + (point.y * height) / 2,
      }),
      { x: 0, y: 0 },
    ),
  };
  if (face.poseReference) {
    // Optical flow updates head angles on every sample; sparse detector depth
    // anchors correct accumulated drift rather than freezing yaw between anchors.
    const reference = face.poseReference;
    pose.yawRadians = Math.max(
      -1.1,
      Math.min(1.1, reference.yaw + (ratios.noseYaw - reference.noseYaw) * 1.6),
    );
    pose.pitchRadians = Math.max(
      -0.65,
      Math.min(0.65, reference.pitch + (ratios.nosePitch - reference.nosePitch) * 1.6),
    );
  }
  return pose;
}

// Project the generated glass sprite through a tracked head coordinate frame.
// Roots follow the forehead, rather than an eye-line offset floating above it.
export function drawFaceAttachment(
  context,
  pose,
  kind,
  { opacity = 1, scale = 1, color, yaw = 0, pitch = 0, rotation = 0 } = {},
) {
  if (!pose || !FACE_EFFECT_IDS.includes(kind)) return;
  if (kind === "cat-face") {
    drawCatFace(context, pose, { opacity, scale, color, yaw, pitch, rotation });
    return;
  }
  const image = getFaceAttachmentAsset(kind, color);
  if (!image) return;
  const ry = Math.max(-1.1, Math.min(1.1, pose.yawRadians + (yaw * Math.PI) / 180));
  const rx = Math.max(-0.75, Math.min(0.75, pose.pitchRadians + (pitch * Math.PI) / 180));
  const roll = pose.angle + (rotation * Math.PI) / 180;
  const project = (x, y, z) => {
    const xx = x * Math.cos(ry) + z * Math.sin(ry),
      zz = -x * Math.sin(ry) + z * Math.cos(ry);
    const yy = y * Math.cos(rx) - zz * Math.sin(rx);
    return {
      x: pose.forehead.x + pose.scale * (xx * Math.cos(roll) - yy * Math.sin(roll)),
      y: pose.forehead.y + pose.scale * (xx * Math.sin(roll) + yy * Math.cos(roll)),
    };
  };
  // Cranial roots sit behind the facial forehead plane, not on the forehead.
  // The backward depth projects toward the visible crown on a turned head.
  // Far attachment first. Each has its own projected plane and outward splay.
  const sides = ry > 0 ? [1, -1] : [-1, 1];
  for (const side of sides) {
    const root = project(side * 0.64, -0.5, -0.95);
    const height = (kind === "cat-ears" ? 1.0 : 1.02) * scale;
    const width = height * (kind === "cat-ears" ? 0.95 : 0.4);
    const splay = -side * 0.4;
    const vx = project(
      side * 0.64 + Math.cos(splay) * width,
      -0.5,
      -0.95 + Math.sin(splay) * width,
    );
    const vy = project(side * 0.64 + side * 0.07 * height, -0.5 - height, -0.95 - 0.12 * height);
    drawAttachmentSprite(context, image, {
      root,
      across: { x: vx.x - root.x, y: vx.y - root.y },
      up: { x: vy.x - root.x, y: vy.y - root.y },
      mirror: side,
      opacity,
    });
  }
}

// Shared affine sprite painting for tracked footage and art-directed library covers.
export function drawAttachmentSprite(
  context,
  image,
  { root, across, up, mirror = 1, opacity = 1 },
) {
  if (!image) return;
  const iw = image.naturalWidth || image.width,
    ih = image.naturalHeight || image.height;
  const ax = across.x / iw,
    ay = across.y / iw,
    bx = -up.x / ih,
    by = -up.y / ih;
  context.save();
  context.globalAlpha *= Math.max(0, Math.min(1, opacity));
  context.transform(
    mirror * ax,
    mirror * ay,
    bx,
    by,
    root.x - mirror * ax * iw * 0.5 - bx * ih * 0.96,
    root.y - mirror * ay * iw * 0.5 - by * ih * 0.96,
  );
  context.drawImage(image, 0, 0, iw, ih);
  context.restore();
}

export function faceSourceKey(segment) {
  return JSON.stringify([
    segment.id,
    segment.assetId || segment.archiveMediaId || segment.id,
    segment.sourceStart,
    segment.sourceDuration,
    segment.playbackRate,
    segment.speedCurve,
  ]);
}
function findFaceTrack(tracks, segment, sourceTime) {
  const key = faceSourceKey(segment);
  return tracks?.find(
    (track) =>
      track.segmentId === segment.id &&
      track.sourceKey === key &&
      (track.still ||
        (sourceTime >= track.frames[0]?.sourceTime &&
          sourceTime < track.frames.at(-1)?.sourceTime + 0.025) ||
        (track.frames.length === 1 && Math.abs(sourceTime - track.frames[0].sourceTime) < 0.025)),
  );
}
function sampleFace(track, time) {
  if (track.still) return track.frames[0]?.face || null;
  const frames = track.frames;
  let low = 0,
    high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].sourceTime <= time) low = mid + 1;
    else high = mid;
  }
  if (!low && frames.length === 1 && Math.abs(time - frames[0].sourceTime) < 0.025)
    return frames[0].face;
  const left = frames[low - 1],
    right = frames[low];
  if (!left || !left.face) return null;
  if (!right) return Math.abs(time - left.sourceTime) < 0.025 ? left.face : null;
  if (!right.face) return null;
  const mix = Math.max(
    0,
    Math.min(1, (time - left.sourceTime) / Math.max(1e-8, right.sourceTime - left.sourceTime)),
  );
  return {
    ...left.face,
    forehead:
      left.face.forehead && right.face.forehead
        ? Object.fromEntries(
            ["x", "y", "z"].map((key) => [
              key,
              (left.face.forehead[key] || 0) +
                ((right.face.forehead[key] || 0) - (left.face.forehead[key] || 0)) * mix,
            ]),
          )
        : left.face.forehead,
    five: left.face.five.map((point, i) => ({
      x: point.x + (right.face.five[i].x - point.x) * mix,
      y: point.y + (right.face.five[i].y - point.y) * mix,
      z: (point.z || 0) + ((right.face.five[i].z || 0) - (point.z || 0)) * mix,
    })),
  };
}
export function drawTrackedFaceAttachments(
  context,
  canvas,
  clips,
  time,
  segment,
  sourceTime,
  layout,
) {
  if (!segment || !layout) return;
  for (const rawClip of clips || []) {
    const clip = resolveEffectParameters(rawClip, time);
    if (
      !isFaceEffect(clip) ||
      clip.hidden ||
      time < clip.start ||
      time >= clip.start + clip.duration
    )
      continue;
    const track = findFaceTrack(clip.faceAnalysis?.tracks, segment, sourceTime);
    if (!track) continue;
    const face = sampleFace(track, sourceTime);
    if (!face) continue;
    const crop = layout.smartCropRect || { x: 0, y: 0, width: track.width, height: track.height };
    const rect = layout.drawRect;
    const mapPoint = (point) => ({
      x: (rect.x + ((point.x * track.width - crop.x) / crop.width) * rect.width) / canvas.width,
      y: (rect.y + ((point.y * track.height - crop.y) / crop.height) * rect.height) / canvas.height,
      z: ((((point.z || 0) * track.width) / crop.width) * rect.width) / canvas.width,
    });
    const mapped = {
      ...face,
      five: face.five.map(mapPoint),
      forehead: face.forehead ? mapPoint(face.forehead) : undefined,
    };
    const pose = resolveFaceAttachmentPose(mapped, canvas.width, canvas.height);
    drawFaceAttachment(context, pose, clip.effect, {
      scale: 0.7 + (clip.intensity ?? 0.5) * 0.6,
      color: clip.color,
      yaw: clip.alignmentYaw || 0,
      pitch: clip.alignmentPitch || 0,
      rotation: clip.alignmentRoll || 0,
    });
  }
}

export function getFaceAttachmentPoseAtTime(clip, segments, time) {
  const ranges = getVisualSegmentTimeline(segments || []);
  const index = ranges.findIndex((range) => time >= range.start && time < range.end);
  if (index < 0) return null;
  const segment = segments[index];
  const sourceTime = getVisualSourceTime(segment, time - ranges[index].start);
  const track = findFaceTrack(clip.faceAnalysis?.tracks, segment, sourceTime);
  if (!track) return null;
  const face = sampleFace(track, sourceTime);
  return face ? resolveFaceAttachmentPose(face, track.width, track.height) : null;
}
