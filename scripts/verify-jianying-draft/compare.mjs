import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, readdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mapTimeline, transitionCatalog } from "../../apps/host/jianying-draft/timeline-mapper.ts";
import { serializeDraft, writeDraft, draftSettings } from "../../apps/host/jianying-draft/draft-writer.ts";
import { jianyingDraftRoot, validateDraftName } from "../../apps/host/jianying-draft/jianying-paths.ts";
import { jianyingTargetProfile, requireJianyingTarget } from "../../apps/host/jianying-draft/jianying-profile.ts";
import { builtInStickerMedia } from "../../apps/host/jianying-draft/jianying-export-service.ts";

const directory = fileURLToPath(new URL(".", import.meta.url));
const fixture = JSON.parse(await readFile(process.argv[2] || join(directory, "fixtures/sample-snapshot.json"), "utf8"));
const resolveMedia = ref => ref ? fixture.media[ref.entityId] : undefined;
const resolveSticker = stickerId => stickerId === "trend-flame" ? fixture.media.sticker : undefined;

function canonical(draft) {
  draft = JSON.parse(JSON.stringify(draft));
  // IDs are random, but every link is still compared through a consistent canonical identity.
  const ids = new Map();
  const materialIds = new Set(Object.values(draft.materials).flat().map(material => material.id));
  draft.tracks.forEach((track, index) => {
    ids.set(track.id, `track:${index}`);
    track.segments.forEach((segment, i) => {
      const prefix = `track:${index}:segment:${i}`;
      ids.set(segment.id, prefix);
      segment.common_keyframes.forEach((property, k) => {
        ids.set(property.id, `${prefix}:keyframes:${k}`);
        property.keyframe_list.forEach((keyframe, point) => {
          ids.set(keyframe.id, `${prefix}:keyframes:${k}:${point}`);
        });
      });
      assert(materialIds.has(segment.material_id), "Missing primary material");
      ids.set(segment.material_id, `${prefix}:material`);
      segment.extra_material_refs.forEach((ref, j) => {
        assert(materialIds.has(ref), "Dangling extra_material_refs");
        ids.set(ref, `${prefix}:extra:${j}`);
      });
    });
  });
  const visit = value => {
    if (typeof value === "string") return ids.get(value) || value;
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "content" && typeof item === "string" ? visit(JSON.parse(item)) : visit(item)]));
  };
  const normalized = visit({ canvas_config: draft.canvas_config, duration: draft.duration, fps: draft.fps, materials: draft.materials, tracks: draft.tracks });
  for (const values of Object.values(normalized.materials)) values.sort((a, b) => a.id.localeCompare(b.id));
  return normalized;
}

for (const transition of Object.keys(transitionCatalog)) {
  const sample = structuredClone(fixture);
  sample.payload.visualSegments[0].transition.id = transition;
  sample.payload.visualSegments[0].baseTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  sample.payload.visualSegments[0].keyframes = [
    { time: 0, x: 0, y: 0, scale: 1 },
    { time: 0.5, x: 10, y: 12, scale: 2.2 },
    { time: 1, x: 0, y: 0, scale: 1 },
  ];
  const model = mapTimeline(sample.payload, resolveMedia, resolveSticker);
  const reference = spawnSync(process.env.PYTHON || "python3", [join(directory, "generate-reference.py")], {
    input: JSON.stringify(sample), encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (reference.status !== 0) throw new Error(`Python oracle failed: ${reference.stderr}`);
  try { assert.deepStrictEqual(canonical(serializeDraft(model)), canonical(JSON.parse(reference.stdout))); }
  catch (error) { throw new Error(`Golden ${transition}: ${error.message.slice(0, 12000)}`, { cause: error }); }
  assert(model.report.degraded.some(item => item.segmentId === "s1" && item.feature === "sticker"));
  assert(model.report.skipped.some(item => item.segmentId === "mark1" && item.feature === "marker"));
}
const model = mapTimeline(fixture.payload, resolveMedia, resolveSticker);
const builtInStickers = await builtInStickerMedia(fileURLToPath(new URL("../../dist", import.meta.url)), fixture.payload);
assert.equal(builtInStickers.get("trend-flame")?.mimeType, "image/png");
assert((builtInStickers.get("trend-flame")?.width ?? 0) > 0 && (builtInStickers.get("trend-flame")?.height ?? 0) > 0);
const sticker = model.tracks.find(track => track.name === "sticker-0")?.segments[0];
assert(sticker);
assert.deepStrictEqual(sticker.clip, { alpha: 0.8, flip: { horizontal: false, vertical: false }, rotation: 15,
  scale: { x: 0.264, y: 0.264 }, transform: { x: 0.64, y: 0.6 } });
const missing = mapTimeline(fixture.payload, () => undefined, resolveSticker);
assert(missing.report.unsupported.some(item => item.segmentId === "v1" && item.feature === "media"));
const unsupported = structuredClone(fixture.payload);
unsupported.visualSegments[0].speedCurve = { enabled: true };
unsupported.visualSegments[1].baseTransform = { x: 10, y: 12, scale: 1, rotation: 0, opacity: 1 };
unsupported.visualSegments[1].keyframes = [{ time: 0, x: 10, y: 12, scale: 1 }, { time: 1, x: 20, y: 24, scale: 2 }];
unsupported.visualSegments[1].subjectEffect = { enabled: true };
const degraded = mapTimeline(unsupported, resolveMedia, resolveSticker);
assert(degraded.report.unsupported.some(item => item.segmentId === "v1" && item.feature === "timing"));
assert(degraded.report.mapped.some(item => item.segmentId === "v2" && item.feature === "keyframes"));
assert(degraded.report.unsupported.some(item => item.segmentId === "v2" && item.feature === "subjectEffect"));
const animated = serializeDraft(degraded).tracks.flatMap(track => track.segments)
  .find(segment => segment.common_keyframes.length);
assert(animated);
assert.deepStrictEqual(animated.common_keyframes.map(item => item.property_type),
  ["KFTypePositionX", "KFTypePositionY", "KFTypeScaleX"]);
assert.equal(animated.uniform_scale.on, true);
assert.deepStrictEqual(animated.common_keyframes[1].keyframe_list.map(item => item.values[0]), [-0.24, -0.48]);
assert.throws(() => validateDraftName("../escape"));
await assert.rejects(jianyingDraftRoot(undefined, "win32"), { code: "COMPONENT_NOT_READY" });
await assert.rejects(requireJianyingTarget("win32"), { code: "COMPONENT_NOT_READY" });
assert.equal(jianyingTargetProfile.id, "jianying-11.6.0-macos");
const root = await mkdtemp(join(tmpdir(), "autocut-jianying-golden-"));
await assert.rejects(jianyingDraftRoot(undefined, "darwin", root), { code: "JIANYING_DRAFT_ROOT_NOT_FOUND" });
assert.equal(await jianyingDraftRoot(root), await realpath(root));
const sourceRoot = join(root, "fixture-source");
await mkdir(sourceRoot);
const sourcePaths = new Map();
for (const track of model.tracks) {
  for (const clip of track.segments) {
    if (!clip.media) continue;
    let source = sourcePaths.get(clip.media.path);
    if (!source) {
      source = join(sourceRoot, `${sourcePaths.size}-${clip.media.path.split("/").at(-1)}`);
      const bytes = Buffer.from(`fixture:${clip.media.path}\n`);
      await writeFile(source, bytes);
      sourcePaths.set(clip.media.path, source);
    }
    clip.media = { ...clip.media, path: source, sizeBytes: (await readFile(source)).byteLength };
  }
}
const output = await writeDraft(root, "中文 golden draft", model);
assert.deepStrictEqual((await readdir(output.draftPath)).sort(),
  ["assets", "draft_info.json", "draft_meta_info.json", "draft_settings", "key_value.json"].sort());
assert.equal((await readdir(join(output.draftPath, "assets", "media"))).length, sourcePaths.size);
assert(output.report.mapped.some(item => item.feature === "mediaPackage"));
assert.equal(await readFile(join(output.draftPath, "draft_settings"), "utf8"), draftSettings);
assert.equal(draftSettings, await readFile(new URL("../../apps/host/jianying-draft/assets/draft_settings_template", import.meta.url), "utf8"));
const info = JSON.parse(await readFile(join(output.draftPath, "draft_info.json"), "utf8"));
const meta = JSON.parse(await readFile(join(output.draftPath, "draft_meta_info.json"), "utf8"));
assert.equal(meta.draft_id, info.id);
assert.equal(meta.tm_duration, info.duration);
assert.equal(meta.draft_fold_path, output.draftPath);
await assert.rejects(writeDraft(root, "中文 golden draft", model), { code: "TARGET_NOT_EMPTY" });
console.log(`PASS: transition/sticker field comparisons, transform keyframes, compatibility categories, packaged media, platform/root errors and non-overwriting staged output.\nSynthetic artifacts retained: ${root}\nNot verified: actual project-media probing, authenticated host route, or opening in Jianying 11.6.`);
