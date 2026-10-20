import type { ObjectReference } from "../storage/records.ts";

export type Timerange = { start: number; duration: number };
export type DraftTargetProfile = {
  id: string;
  product: "jianying";
  appVersion: string;
  platform: "macOS";
  bundleId: string;
  applicationPath: string;
  executableName: string;
  defaultDraftRoots: string[];
  mainTimelineFile: "draft_info.json";
  synchronizedTimelineFiles: string[];
  template: { product: "jianying"; appVersion: string; format: "plaintext-bootstrap" };
};
export type ExportIssue = {
  track: string;
  segmentId: string;
  feature: string;
  reason: string;
  targetProfile: string;
};
export type ExportReport = {
  status: "editable-pass" | "editable-with-degradation" | "blocked";
  target: DraftTargetProfile;
  mapped: ExportIssue[];
  degraded: ExportIssue[];
  unsupported: ExportIssue[];
  blocked: ExportIssue[];
  /** Compatibility alias for older route consumers. */
  skipped: ExportIssue[];
};
export type ResolvedMedia = {
  path: string; kind: "video" | "image" | "audio"; durationSeconds: number | null;
  mimeType: string; width?: number; height?: number; sizeBytes?: number; identity?: string;
};
export type ClipSettings = {
  alpha: number; flip: { horizontal: boolean; vertical: boolean }; rotation: number;
  scale: { x: number; y: number }; transform: { x: number; y: number };
};
export type DraftKeyframe = { timeOffset: number; value: number };
export type DraftKeyframeProperty = {
  propertyType: "KFTypePositionX" | "KFTypePositionY" | "KFTypeScaleX" | "KFTypeRotation" | "KFTypeAlpha";
  keyframes: DraftKeyframe[];
};
export type DraftClip = {
  target: Timerange; source: Timerange | null; speed: number; volume: number;
  media?: ResolvedMedia; name: string; width: number; height: number; clip: ClipSettings | null;
  text?: string; transition?: { id: string; duration: number }; keyframes?: DraftKeyframeProperty[];
};
export type DraftTrack = { name: string; type: "video" | "audio" | "text"; renderIndex: number; segments: DraftClip[] };
export type DraftModel = { width: number; height: number; fps: number; tracks: DraftTrack[]; report: ExportReport };
export type MediaResolver = (ref: ObjectReference | null) => ResolvedMedia | undefined;
export type StickerResolver = (stickerId: string) => ResolvedMedia | undefined;
