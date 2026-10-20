import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, open, readFile, realpath, rename, statfs, unlink } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import template from "./assets/draft_info_template.json" with { type: "json" };
import metaTemplate from "./assets/draft_meta_info.json" with { type: "json" };
import keyValue from "./assets/key_value_template.json" with { type: "json" };
import { HostError } from "../sessions.ts";
import { addExportIssue } from "./compatibility-report.ts";
import { transitionCatalog } from "./jianying-profile.ts";
import type { DraftClip, DraftModel, ResolvedMedia } from "./draft-types.ts";

type Material = Record<string, unknown>;
type PackagedMedia = { sourcePath: string; finalPath: string; stagingPath: string; relativePath: string; sizeBytes: number;
  media: ResolvedMedia };
type ValidatedDraft = {
  materials: Record<string, Material[]>;
  tracks: Array<{ segments: Array<{
    material_id: string;
    extra_material_refs: string[];
    target_timerange: { duration: number };
    source_timerange: { start: number; duration: number } | null;
    common_keyframes: Array<{ keyframe_list: Array<{ time_offset: number; values: number[] }> }>;
  }> }>;
};
const id = () => randomUUID().replaceAll("-", "");
const code = (error: unknown) => error && typeof error === "object" && "code" in error ? error.code : undefined;
// Embedded for bundled/SEA hosts; the golden harness checks the original asset bytes.
export const draftSettings = "[General]\ndraft_create_time=0\ndraft_last_edit_time=0\nreal_edit_keys=1\nreal_edit_seconds=0\n";

export function serializeDraft(model: DraftModel) {
  const content = structuredClone(template);
  const materials: Record<string, Material[]> = content.materials;
  const tracks: Material[] = [];
  let duration = 0;
  const material = (clip: DraftClip, materialId: string) => {
    if (clip.text !== undefined) {
      materials.texts.push({ id: materialId, content: JSON.stringify({
        styles: [{ fill: { alpha: 1, content: { render_type: "solid", solid: { alpha: 1, color: [1, 1, 1] } } },
          range: [0, [...clip.text].length], size: 8, bold: false, italic: false, underline: false, strokes: [] }], text: clip.text,
      }), typesetting: 0, alignment: 0, letter_spacing: 0, line_spacing: 0.02, line_feed: 1,
      line_max_width: 0.82, force_apply_line_max_width: false, check_flag: 7, type: "text", global_alpha: 1 });
      return;
    }
    const media = clip.media!;
    const mediaDuration = media.kind === "image" ? Math.max(10_800_000_000, clip.source!.start + clip.source!.duration) : Math.round((media.durationSeconds ??
      ((clip.source!.start + clip.source!.duration) / 1_000_000)) * 1_000_000);
    const common = { id: materialId, path: media.path, duration: mediaDuration,
      local_material_id: basename(media.path, extname(media.path)), source_platform: 0 };
    if (media.kind === "audio") {
      materials.audios.push({ ...common, app_id: 0, category_id: "", category_name: "local", check_flag: 3,
        copyright_limit_type: "none", effect_id: "", formula_id: "", music_id: materialId,
        name: clip.name || basename(media.path), type: "extract_music", wave_points: [] });
    } else {
      materials.videos.push({ ...common, audio_fade: null, category_id: "", category_name: "local", check_flag: 63487,
        crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0,
          lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
        crop_ratio: "free", crop_scale: 1, height: clip.height, width: clip.width, material_id: materialId,
        material_name: clip.name || basename(media.path), media_path: "", type: media.kind === "image" ? "photo" : "video",
        video_algorithm: { algorithms: [], complement_frame_config: null, deflicker: null, gameplay_configs: [],
          motion_blur_config: null, noise_reduction: null, path: "", quality_enhance: null, time_range: null }, team_id: "" });
    }
  };
  for (const track of [...model.tracks].sort((a, b) => a.renderIndex - b.renderIndex)) {
    const segments = [...track.segments].sort((a, b) => a.target.start - b.target.start).map(clip => {
      const materialId = id(), speedId = id();
      material(clip, materialId);
      materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: clip.speed, type: "speed" });
      const refs = [speedId];
      if (clip.transition) {
        const meta = transitionCatalog[clip.transition.id], transitionId = id();
        materials.transitions.push({ category_id: "", category_name: "", duration: clip.transition.duration,
          effect_id: meta.effectId, id: transitionId, is_overlap: meta.overlap, name: meta.name,
          platform: "all", resource_id: meta.resourceId, type: "transition" });
        refs.push(transitionId);
      }
      const commonKeyframes = (clip.keyframes ?? []).map(property => ({
        id: id(),
        material_id: "",
        property_type: property.propertyType,
        // Jianying evaluates visual keyframes on the source clock, including trim and constant speed.
        keyframe_list: property.keyframes.map(keyframe => ({ id: id(),
          time_offset: clip.source ? clip.source.start + Math.min(clip.source.duration, Math.round(keyframe.timeOffset * clip.speed))
            : keyframe.timeOffset,
          values: [keyframe.value], curveType: "Line", graphID: "",
          left_control: { x: 0, y: 0 }, right_control: { x: 0, y: 0 } })),
      }));
      duration = Math.max(duration, clip.target.start + clip.target.duration);
      return { enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true,
        enable_color_match_adjust: false, enable_color_wheels: true, enable_lut: true, enable_smart_color_adjust: false,
        last_nonzero_volume: 1, reverse: false, track_attribute: 0, track_render_index: 0, visible: true,
        id: id(), material_id: materialId, target_timerange: clip.target, common_keyframes: commonKeyframes, keyframe_refs: [],
        source_timerange: clip.source, speed: clip.speed, volume: clip.volume, extra_material_refs: refs,
        is_tone_modify: false, clip: clip.clip,
        ...(clip.clip ? { uniform_scale: { on: true, value: 1 } } : {}),
        ...(track.type === "video" ? { hdr_settings: { intensity: 1, mode: 1, nits: 1000 } } :
          track.type === "audio" ? { hdr_settings: null } : {}),
        render_index: track.renderIndex };
    });
    tracks.push({ attribute: 0, flag: 0, id: id(), is_default_name: !track.name, name: track.name, segments, type: track.type });
  }
  return { ...content, fps: model.fps, duration, canvas_config: { width: model.width, height: model.height, ratio: "original" }, tracks };
}

function mediaKey(media: ResolvedMedia) {
  return media.identity ? `identity:${media.identity}` : `path:${media.path}`;
}

function packagedFilename(media: ResolvedMedia, index: number) {
  const original = basename(media.path).normalize("NFC").replace(/[\u0000-\u001f:]/g, "_");
  const extension = extname(original).toLowerCase();
  const stem = (extension ? original.slice(0, -extension.length) : original).slice(0, 96) || `media-${index + 1}`;
  const digest = /^[0-9a-f]{64}$/.test(media.identity ?? "")
    ? media.identity!
    : createHash("sha256").update(media.identity ?? media.path).digest("hex");
  return `${digest.slice(0, 16)}-${stem}${extension}`;
}

async function availableBytes(root: string) {
  const value = await statfs(root, { bigint: true });
  return value.bavail * value.bsize;
}

async function syncFile(path: string) {
  const file = await open(path, "r");
  try { await file.sync(); } finally { await file.close(); }
}

async function packageMedia(model: DraftModel, root: string, stagingPath: string, draftPath: string) {
  const packagedModel = structuredClone(model), sources = new Map<string, ResolvedMedia>();
  for (const track of packagedModel.tracks) {
    for (const clip of track.segments) if (clip.media) sources.set(mediaKey(clip.media), clip.media);
  }
  const checked = new Map<string, PackagedMedia>();
  let required = 16n * 1024n * 1024n;
  let index = 0;
  for (const [key, media] of sources) {
    if (!isAbsolute(media.path)) throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "Draft media must resolve to an absolute local file.");
    let sourcePath: string;
    let stat;
    try {
      sourcePath = await realpath(media.path);
      stat = await lstat(sourcePath);
    } catch {
      throw new HostError("STORAGE_IO_FAILED", 503, `Draft media is unavailable: ${basename(media.path)}.`);
    }
    if (!stat.isFile() || media.sizeBytes !== undefined && stat.size !== media.sizeBytes) {
      throw new HostError("OUTPUT_VALIDATION_FAILED", 503, `Draft media changed before packaging: ${basename(media.path)}.`);
    }
    const relativePath = join("assets", "media", packagedFilename(media, index));
    checked.set(key, { sourcePath, finalPath: join(draftPath, relativePath), stagingPath: join(stagingPath, relativePath),
      relativePath, sizeBytes: stat.size, media });
    required += BigInt(stat.size);
    index += 1;
  }
  if (required > await availableBytes(root)) {
    throw new HostError("STORAGE_IO_FAILED", 507, "The Jianying draft volume does not have enough free space to package referenced media.");
  }
  if (checked.size) await mkdir(join(stagingPath, "assets", "media"), { recursive: true, mode: 0o700 });
  for (const item of checked.values()) {
    try { await link(item.sourcePath, item.stagingPath); }
    catch { await copyFile(item.sourcePath, item.stagingPath, constants.COPYFILE_EXCL); }
    const copied = await lstat(item.stagingPath);
    if (!copied.isFile() || copied.size !== item.sizeBytes) {
      throw new HostError("OUTPUT_VALIDATION_FAILED", 503, `Packaged media failed size validation: ${basename(item.stagingPath)}.`);
    }
    await syncFile(item.stagingPath);
  }
  for (const track of packagedModel.tracks) {
    for (const clip of track.segments) {
      if (!clip.media) continue;
      const packaged = checked.get(mediaKey(clip.media));
      if (!packaged) throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "A draft media reference was not packaged.");
      clip.media = { ...clip.media, path: packaged.finalPath, sizeBytes: packaged.sizeBytes };
    }
  }
  const manifest = { schemaVersion: 1, targetProfile: packagedModel.report.target.id,
    media: [...checked.values()].map(item => ({ identity: item.media.identity ?? null, path: item.relativePath,
      sizeBytes: item.sizeBytes, kind: item.media.kind, mimeType: item.media.mimeType })) };
  if (checked.size) {
    const manifestPath = join(stagingPath, "assets", "manifest.json");
    const file = await open(manifestPath, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(manifest, null, 2), "utf8"); await file.sync(); } finally { await file.close(); }
  }
  addExportIssue(packagedModel.report, "mapped", { track: "project", segmentId: "", feature: "mediaPackage",
    reason: `${checked.size} deduplicated media files were packaged inside the editable draft.` });
  return { model: packagedModel, media: [...checked.values()] };
}

function validateDraftContent(content: ReturnType<typeof serializeDraft>, draftPath: string) {
  const draft = content as unknown as ValidatedDraft;
  const materialIds = new Set(Object.values(draft.materials).flat().map(material => material.id));
  for (const track of draft.tracks) {
    for (const segment of track.segments) {
      if (!materialIds.has(segment.material_id) || segment.extra_material_refs.some(reference => !materialIds.has(reference)) ||
          segment.target_timerange.duration <= 0) {
        throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "Draft material references or segment timing are inconsistent.");
      }
      for (const property of segment.common_keyframes) {
        const start = segment.source_timerange?.start ?? 0;
        const end = start + (segment.source_timerange?.duration ?? segment.target_timerange.duration);
        let previous = -1;
        for (const keyframe of property.keyframe_list) {
          if (!Number.isSafeInteger(keyframe.time_offset) || keyframe.time_offset < start ||
              keyframe.time_offset > end || keyframe.time_offset <= previous ||
              keyframe.values.length !== 1 || !Number.isFinite(keyframe.values[0])) {
            throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "Draft keyframes are outside their segment or not strictly ordered.");
          }
          previous = keyframe.time_offset;
        }
      }
    }
  }
  for (const media of [...draft.materials.videos, ...draft.materials.audios]) {
    const within = relative(draftPath, String(media.path));
    const parts = within.split("/");
    if (!within || parts.includes("..") || isAbsolute(within) || parts[0] !== "assets" || parts[1] !== "media" || parts.length < 3) {
      throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "Draft media references must stay inside the exported draft assets directory.");
    }
  }
}

async function writeExclusive(path: string, value: string) {
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(value, "utf8"); await file.sync(); } finally { await file.close(); }
}

async function assertTargetMissing(draftPath: string) {
  try {
    await lstat(draftPath);
    throw new HostError("TARGET_NOT_EMPTY", 409, "Could not create a new draft directory. Existing drafts are never overwritten.");
  } catch (error) {
    if (error instanceof HostError) throw error;
    if (code(error) !== "ENOENT") throw new HostError("STORAGE_IO_FAILED", 503, "Could not inspect the target draft path.");
  }
}

export async function writeDraft(root: string, name: string, model: DraftModel) {
  const draftPath = join(root, name);
  const nameDigest = createHash("sha256").update(name).digest("hex").slice(0, 20);
  const lockPath = join(root, `.autocut-${nameDigest}.lock`);
  const stagingPath = join(root, `.autocut-${nameDigest}-${randomUUID()}.staging`);
  let lockFile: Awaited<ReturnType<typeof open>>;
  try { lockFile = await open(lockPath, "wx", 0o600); }
  catch (error) {
    throw new HostError(code(error) === "EEXIST" ? "RESOURCE_BUSY" : "STORAGE_IO_FAILED",
      code(error) === "EEXIST" ? 409 : 503,
      code(error) === "EEXIST" ? "Another Auto-cut export is already writing this draft name." : "Could not reserve the draft export name.");
  }
  try {
    await assertTargetMissing(draftPath);
    await mkdir(stagingPath, { mode: 0o700 });
    const packaged = await packageMedia(model, root, stagingPath, draftPath);
    const content = serializeDraft(packaged.model), draftId = randomUUID().toUpperCase(), timestamp = Date.now() * 1000;
    content.id = draftId; content.name = name;
    content.create_time = Math.floor(timestamp / 1000); content.update_time = Math.floor(timestamp / 1000);
    content.platform.os = "mac"; content.last_modified_platform.os = "mac";
    const metadata = { ...structuredClone(metaTemplate), draft_id: draftId, draft_name: name,
      draft_fold_path: draftPath, draft_root_path: root, tm_duration: content.duration,
      tm_draft_create: timestamp, tm_draft_modified: timestamp };
    validateDraftContent(content, draftPath);
    // Metadata is written last; the hidden staging directory is not discoverable as a Jianying draft.
    await writeExclusive(join(stagingPath, "draft_info.json"), JSON.stringify(content, null, 2));
    await writeExclusive(join(stagingPath, "draft_settings"), draftSettings);
    await writeExclusive(join(stagingPath, "key_value.json"), JSON.stringify(keyValue));
    await writeExclusive(join(stagingPath, "draft_meta_info.json"), JSON.stringify(metadata, null, 2));
    const writtenContent = JSON.parse(await readFile(join(stagingPath, "draft_info.json"), "utf8"));
    const writtenMetadata = JSON.parse(await readFile(join(stagingPath, "draft_meta_info.json"), "utf8"));
    validateDraftContent(writtenContent, draftPath);
    if (writtenMetadata.draft_id !== writtenContent.id || writtenMetadata.tm_duration !== writtenContent.duration ||
        writtenMetadata.draft_fold_path !== draftPath) {
      throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "Draft metadata does not match the staged timeline.");
    }
    for (const media of packaged.media) {
      const stat = await lstat(media.stagingPath);
      if (!stat.isFile() || stat.size !== media.sizeBytes) throw new HostError("OUTPUT_VALIDATION_FAILED", 503, "Staged media validation failed.");
    }
    await assertTargetMissing(draftPath);
    await rename(stagingPath, draftPath);
    return { draftPath, draftName: name, report: packaged.model.report };
  } catch (error) {
    if (error instanceof HostError) throw error;
    if (["EEXIST", "ENOTEMPTY"].includes(String(code(error)))) {
      throw new HostError("TARGET_NOT_EMPTY", 409, "Could not publish the draft because the target name now exists.");
    }
    throw new HostError("STORAGE_IO_FAILED", 503,
      `Draft writing failed. Unregistered staging evidence is retained at ${stagingPath}.`);
  } finally {
    await lockFile.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}
