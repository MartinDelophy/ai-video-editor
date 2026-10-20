import { getCaptionTimeline, getVisualSegmentTimeline, getTimedSegmentsEnd, packTimedSegmentsIntoLanes,
  packCaptionSegmentsIntoLanes } from "../../../src/lib/timeline.js";
import { getLinkedSourceAudioSegments, shouldMuteEmbeddedVideoAudio } from "../../../src/lib/sourceAudioSync.js";
import { RATIO_OPTIONS, STICKER_LIBRARY } from "../../../src/config/editor.js";
import { objectReference, type ObjectReference } from "../storage/records.ts";
import { addExportIssue, createExportReport, type ExportReportCategory } from "./compatibility-report.ts";
import { jianyingTargetProfile, transitionCatalog } from "./jianying-profile.ts";
import type { ClipSettings, DraftClip, DraftKeyframeProperty, DraftModel, DraftTrack, MediaResolver, ResolvedMedia,
  StickerResolver } from "./draft-types.ts";

type Item = Record<string, unknown>;
const record = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const list = (value: unknown): Item[] => Array.isArray(value) ? value.map(record) : [];
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const us = (seconds: number) => Math.round(seconds * 1_000_000);
const present = (value: unknown) => Boolean(value) && (typeof value !== "object" || Object.keys(value as object).length > 0);

export function clipMediaReference(item: Item, assets: Item[] = []): ObjectReference | null {
  const bindings = record(item.mediaBindings);
  const value = item.mediaRef ?? bindings.blob ?? bindings.src ?? bindings.url;
  if (value) {
    const parsed = objectReference.safeParse(value);
    return parsed.success && parsed.data.kind === "media" ? parsed.data : null;
  }
  const asset = assets.find(asset => asset.id === item.assetId || asset.assetId === item.assetId);
  return asset && item.assetId ? clipMediaReference(asset) : null;
}

export function timelineMediaReferences(payload: Item) {
  const assets = list(payload.userAssets);
  return [
    ...["imageRef", "audioRef", "musicRef", "sourceAudioRef"].map(field => clipMediaReference({ mediaRef: payload[field] })),
    ...["visualSegments", "visualOverlaySegments", "audioSegments", "musicSegments", "stickerSegments"]
      .flatMap(field => list(payload[field]).map(item => clipMediaReference(item, assets))),
  ].filter(ref => ref !== null);
}

export { transitionCatalog } from "./jianying-profile.ts";

const KEYFRAME_PROPERTIES = [
  { source: "x", propertyType: "KFTypePositionX", convert: (value: number) => value / 50 },
  { source: "y", propertyType: "KFTypePositionY", convert: (value: number) => -value / 50 },
  { source: "scale", propertyType: "KFTypeScaleX", convert: (value: number) => Math.max(0.1, value) },
  { source: "rotation", propertyType: "KFTypeRotation", convert: (value: number) => value },
  { source: "opacity", propertyType: "KFTypeAlpha", convert: (value: number) => Math.max(0, Math.min(1, value)) },
] as const;

function visualSettings(item: Item, legacySettings: (value: Item) => ClipSettings) {
  const base = record(item.baseTransform);
  if (!Object.keys(base).length) return legacySettings(item);
  return {
    alpha: Math.max(0, Math.min(1, number(base.opacity, 1))),
    flip: { horizontal: false, vertical: false },
    rotation: number(base.rotation),
    scale: { x: Math.max(0.1, number(base.scale, 1)), y: Math.max(0.1, number(base.scale, 1)) },
    transform: { x: number(base.x) / 50, y: -number(base.y) / 50 },
  };
}

function visualKeyframes(item: Item, duration: number, fps: number) {
  const input = list(item.keyframes), durationUs = us(duration);
  const properties: DraftKeyframeProperty[] = [];
  let invalid = 0;
  const unsupported = new Set<string>();
  for (const frame of input) {
    for (const key of Object.keys(frame)) {
      if (key !== "time" && !KEYFRAME_PROPERTIES.some(property => property.source === key)) unsupported.add(key);
    }
  }
  for (const property of KEYFRAME_PROPERTIES) {
    const samples = new Map<number, number>();
    for (const frame of input) {
      const time = Number(frame.time), value = Number(frame[property.source]);
      if (!(property.source in frame)) continue;
      if (!Number.isFinite(time) || !Number.isFinite(value)) { invalid += 1; continue; }
      const frameIndex = Math.round(Math.max(0, time) * fps);
      const timeOffset = Math.min(durationUs, Math.round(frameIndex * 1_000_000 / fps));
      samples.set(timeOffset, property.convert(value));
    }
    if (samples.size) properties.push({ propertyType: property.propertyType,
      keyframes: [...samples].sort(([left], [right]) => left - right)
        .map(([timeOffset, value]) => ({ timeOffset, value })) });
  }
  return { properties, invalid, unsupported: [...unsupported], hasY: properties.some(item => item.propertyType === "KFTypePositionY"),
    hasAlpha: properties.some(item => item.propertyType === "KFTypeAlpha") };
}

export function mapTimeline(payload: Item, resolveMedia: MediaResolver, resolveSticker: StickerResolver = () => undefined): DraftModel {
  const ratio = RATIO_OPTIONS.find(option => option.id === payload.ratioId) ?? RATIO_OPTIONS[0];
  const model: DraftModel = { width: ratio.width, height: ratio.height, fps: 30, tracks: [],
    report: createExportReport(jianyingTargetProfile) };
  const assets = list(payload.userAssets), visibility = record(payload.trackVisibility);
  const report = (category: ExportReportCategory, track: string, item: Item, feature: string, reason: string) =>
    addExportIssue(model.report, category, { track, segmentId: text(item.id), feature, reason });
  const skip = (track: string, item: Item, feature: string, reason: string) => report("unsupported", track, item, feature, reason);
  const mapped = (track: string, item: Item, feature: string, reason: string) => report("mapped", track, item, feature, reason);
  const degraded = (track: string, item: Item, feature: string, reason: string) => report("degraded", track, item, feature, reason);
  const settings = (item: Item): ClipSettings => ({
    alpha: number(item.opacity, 1), flip: { horizontal: false, vertical: false },
    rotation: number(item.rotation), scale: { x: number(item.scale, 1), y: number(item.scale, 1) },
    transform: { x: (number(item.x, 50) - 50) / 50, y: (50 - number(item.y, 50)) / 50 },
  });
  const track = (name: string, type: DraftTrack["type"], renderIndex: number): DraftTrack => {
    const value: DraftTrack = { name, type, renderIndex, segments: [] };
    model.tracks.push(value);
    return value;
  };
  const add = (target: DraftTrack, item: Item, start: number, duration: number, volume: number, visual = false,
    mediaOverride?: ResolvedMedia, clipOverride?: ClipSettings) => {
    if (item.hidden || visibility[target.name] === false || visibility[target.name.split("-")[0]] === false) {
      skip(target.name, item, "visibility", "Hidden track or clip omitted."); return;
    }
    if (start < 0 || duration <= 0 || !Number.isSafeInteger(us(start + duration)) || us(duration) <= 0) {
      skip(target.name, item, "timing", "Invalid or sub-microsecond range."); return;
    }
    const end = us(start + duration), begin = us(start);
    if (target.segments.some(segment => begin < segment.target.start + segment.target.duration && end > segment.target.start)) {
      skip(target.name, item, "overlap", "Overlapping clips in the same output track."); return;
    }
    if (record(item.speedCurve).enabled || item.reverse || item.reversed) {
      skip(target.name, item, "timing", "Variable-speed or reversed source timing is not mapped."); return;
    }
    const media = mediaOverride ?? resolveMedia(clipMediaReference(item, assets));
    if (!media) { skip(target.name, item, "media", "Managed media is missing or unreadable."); return; }
    if (visual ? !["video", "image"].includes(media.kind) : media.kind !== "audio") {
      skip(target.name, item, "media", "Media kind does not match the output track."); return;
    }
    if (media.mimeType === "image/svg+xml") {
      skip(target.name, item, "media", "SVG requires rasterization, which this export does not perform."); return;
    }
    const speed = media.kind === "image" ? 1 : number(item.playbackRate, 1);
    const sourceStart = media.kind === "image" ? 0 : number(item.sourceStart);
    const sourceDuration = duration * speed;
    if (speed <= 0 || sourceStart < 0 || media.kind !== "image" && media.durationSeconds !== null &&
        sourceStart + sourceDuration > media.durationSeconds + 0.001) {
      skip(target.name, item, "sourceRange", "Trim or speed exceeds the available source."); return;
    }
    const width = number(item.width), height = number(item.height);
    if (visual && (!width || !height) || media.durationSeconds === null) {
      skip(target.name, item, "metadataDegraded", "Unknown dimensions use canvas size; unknown duration uses the requested source end.");
    }
    const segment: DraftClip = { name: text(item.name), target: { start: begin, duration: end - begin },
      source: { start: us(sourceStart), duration: us(sourceDuration) }, speed,
      volume: item.muted ? 0 : volume, media, width: width > 0 ? width : model.width, height: height > 0 ? height : model.height,
      clip: visual ? clipOverride ?? visualSettings(item, settings) : null };
    if (visual && Array.isArray(item.keyframes) && item.keyframes.length) {
      const motion = visualKeyframes(item, duration, model.fps);
      if (motion.properties.length) {
        segment.keyframes = motion.properties;
        mapped(target.name, item, "keyframes", `${motion.properties.length} editable transform keyframe properties mapped at ${model.fps} fps.`);
      } else {
        skip(target.name, item, "keyframes", "No finite transform keyframes could be mapped.");
      }
      if (motion.invalid) degraded(target.name, item, "keyframes", `${motion.invalid} invalid keyframe samples were omitted.`);
      if (motion.unsupported.length) skip(target.name, item, "keyframeProperties",
        `Unsupported keyframe properties: ${motion.unsupported.join(", ")}.`);
      if (motion.hasY) mapped(target.name, item, "keyframeY",
        "Vertical motion uses the Jianying normalized Y-axis mapping verified in Jianying Pro 11.6.0 on macOS.");
      if (motion.hasAlpha) degraded(target.name, item, "keyframeAlpha",
        "Alpha keyframes remain editable but are not relied on for rendered video fades.");
    }
    target.segments.push(segment);
    mapped(target.name, item, "clip", "Timing, source trim, constant speed and volume mapped.");
    if (visual && present(item.baseTransform)) mapped(target.name, item, "baseTransform", "Position, scale, rotation and opacity mapped to editable clip settings.");
    for (const feature of ["propertyKeyframes", "colorGrade", "mask", "vision", "depth",
      "subjectEffect", "smartFrame", "animation", "animations", "fadeIn", "fadeOut", "fadeInDuration", "fadeOutDuration", "volumeKeyframes"]) {
      const value = item[feature];
      if (present(value)) skip(target.name, item, feature, "Not mapped; base media is retained without this effect.");
    }
    if (item.filterId && item.filterId !== "none") skip(target.name, item, "filter", "Auto-cut filter is not a Jianying effect resource.");
    if (item.spatialEffect && item.spatialEffect !== "original") skip(target.name, item, "spatialEffect", "Audio spatial processing is not mapped.");
    return segment;
  };

  const visuals = list(payload.visualSegments);
  if (!visuals.length && payload.imageRef) visuals.push({ id: "visual-fallback", mediaRef: payload.imageRef,
    duration: payload.imageDuration, type: payload.visualType, name: payload.imageName });
  const ranges = getVisualSegmentTimeline(visuals);
  const linked = payload.sourceAudioLinked ? getLinkedSourceAudioSegments(visuals, text(payload.sourceAudioAssetId), number(payload.sourceAudioDuration)) : [];
  const main = track("image", "video", 0);
  const mainClips = visuals.map((item, index) => {
    // The JS helper infers null/never[] from its default arguments; its runtime contract accepts media presence and linked clips.
    const embeddedMuted = shouldMuteEmbeddedVideoAudio as unknown as (item: Item, options: {
      sourceAudioBlob: unknown; sourceAudioAssetId: string; sourceAudioLinked: boolean; linkedSegments: Item[];
    }) => boolean;
    const mute = embeddedMuted(item, { sourceAudioBlob: payload.sourceAudioRef,
      sourceAudioAssetId: text(payload.sourceAudioAssetId), sourceAudioLinked: Boolean(payload.sourceAudioLinked), linkedSegments: linked });
    return add(main, item, ranges[index].start, ranges[index].duration, mute ? 0 : number(item.volume, 1), true);
  });
  visuals.forEach((item, index) => {
    const transition = record(item.transition), id = text(transition.id);
    if (!id || id === "none") return;
    const clip = mainClips[index], next = mainClips[index + 1];
    if (!clip || !next || !transitionCatalog[id]) { skip(main.name, item, "transition", "Unsupported transition or missing adjacent clip."); return; }
    clip.transition = { id, duration: us(Math.max(0.1, Math.min(number(transition.duration, 0.5), ranges[index].duration, ranges[index + 1].duration))) };
    if (transitionCatalog[id].evidence === "jianying-11.6.0-visual-oracle") mapped(main.name, item, "transition",
      `${transitionCatalog[id].name} uses a native Jianying resource verified in Jianying Pro 11.6.0 on macOS.`);
    else degraded(main.name, item, "transition",
      `${transitionCatalog[id].name} uses a legacy Jianying bootstrap resource; editable structure is retained but 11.6 visual equivalence requires oracle confirmation.`);
  });
  const timed = (items: Item[], name: string, type: "audio" | "video", volume: number, renderIndex = 0) => {
    const lanes = packTimedSegmentsIntoLanes(items, { preferredLaneKey: name === "audio" ? "lane" : "" }) as Item[][];
    lanes.forEach((lane, index) => {
      const output = track(`${name}-${index}`, type, renderIndex + index);
      for (const item of lane) add(output, item, number(item.start), number(item.duration), number(item.volume, volume), type === "video");
    });
  };
  timed(list(payload.visualOverlaySegments), "overlay", "video", 1, 1);
  timed(list(payload.audioSegments), "audio", "audio", 1);
  if (!list(payload.audioSegments).length && payload.audioRef) timed([{ id: "voice-fallback", mediaRef: payload.audioRef,
    start: 0, duration: payload.audioDuration }], "audio", "audio", 1);
  const music = list(payload.musicSegments);
  timed(music.length ? music.map(item => ({ ...item, mediaRef: clipMediaReference(item, assets) ?? payload.musicRef })) : payload.musicRef ? [{ id: "music-fallback", mediaRef: payload.musicRef,
    start: payload.musicStart, duration: payload.musicDuration, name: payload.musicName }] : [], "music", "audio", number(payload.musicVolume, 1));
  if (payload.sourceAudioRef) {
    timed(payload.sourceAudioLinked && linked.length ? linked.map((item: Item) => ({ ...item, mediaRef: payload.sourceAudioRef })) :
      [{ id: "source-audio", mediaRef: payload.sourceAudioRef, start: payload.sourceAudioStart,
        duration: payload.sourceAudioDuration, name: payload.sourceAudioName }],
    "source", "audio", number(payload.sourceAudioVolume, 1));
  }
  const captions = list(payload.captionSegments);
  const captionRanges = getCaptionTimeline(captions, getTimedSegmentsEnd(list(payload.audioSegments)));
  const captionLanes = packCaptionSegmentsIntoLanes(captions, captionRanges) as { segment: Item; range: { start: number; duration: number } }[][];
  captionLanes.forEach((lane, index) => {
    const output = track(`caption-${index}`, "text", 15000 + index);
    for (const { segment: item, range } of lane) {
      if (!payload.captionsEnabled || visibility.caption === false || visibility[output.name] === false || item.hidden) {
        skip(output.name, item, "visibility", "Hidden caption omitted."); continue;
      }
      if (!text(item.text) || us(range.duration) <= 0) { skip(output.name, item, "text", "Empty caption or invalid duration."); continue; }
      output.segments.push({ target: { start: us(range.start), duration: us(range.start + range.duration) - us(range.start) },
        source: null, speed: 1, volume: 1, name: "", width: 0, height: 0, text: text(item.text),
        clip: settings(record(item.placement ?? payload.captionPlacement)) });
      mapped(output.name, item, "caption", "Text, timing and placement mapped using the default Jianying font.");
      degraded(output.name, item, "captionStyle", "Font, size, styling, effects and smart avoidance are not reproduced.");
    }
  });
  const stickerCatalog = new Map(STICKER_LIBRARY.map(item => [item.id, item]));
  const stickerLanes = packTimedSegmentsIntoLanes(list(payload.stickerSegments)) as Item[][];
  stickerLanes.forEach((lane, index) => {
    const output = track(`sticker-${index}`, "video", 10_000 + index);
    for (const item of lane) {
      const stickerId = text(item.stickerId), catalog = stickerCatalog.get(stickerId), media = resolveSticker(stickerId);
      if (!catalog || !media || media.kind !== "image" || !media.width || !media.height) {
        skip(output.name, item, "sticker", "Built-in sticker PNG is missing or unreadable."); continue;
      }
      const sourceRatio = media.width / media.height, canvasRatio = model.width / model.height;
      const fittedWidth = sourceRatio >= canvasRatio ? model.width : model.height * sourceRatio;
      const requestedScale = Math.max(0.2, Math.min(3, number(item.scale, 1)));
      const desiredWidth = Math.min(model.width, model.height) * 0.22 * requestedScale * (sourceRatio >= 1 ? 1 : sourceRatio);
      const imageScale = desiredWidth / fittedWidth;
      const clip = add(output, { ...item, name: text(item.name, catalog.name), width: media.width, height: media.height },
        number(item.start), number(item.duration), 0, true, media,
        settings({ ...item, scale: imageScale, opacity: Math.max(0, Math.min(1, number(item.opacity, 1))) }));
      if (clip) degraded(output.name, item, "sticker", "Built-in PNG mapped as an editable image layer; it is not a native Jianying sticker resource.");
    }
  });
  for (const item of list(payload.timelineMarkers)) skip("markers", item, "marker", "Timeline annotations are not mapped.");
  for (const feature of ["selectedFilterId", "sourceAudioSpatialEffect"]) {
    if (payload[feature] && !["none", "original"].includes(text(payload[feature]))) skip("project", {}, feature, "Global effect is not mapped.");
  }
  if (payload.fitMode && payload.fitMode !== "contain") degraded("project", {}, "fitMode", "Jianying default contain framing is used.");
  degraded("project", {}, "fps", "The committed snapshot has no export frame rate; draft uses 30 fps.");
  model.tracks = model.tracks.filter(item => item.segments.length).sort((a, b) => a.renderIndex - b.renderIndex);
  return model;
}
