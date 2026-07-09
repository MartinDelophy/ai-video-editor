import {
  CirclesThree,
  ClosedCaptioning,
  ImageSquare,
  MagicWand,
  MusicNote,
  Sparkle,
  Sticker,
  TextT,
} from "@phosphor-icons/react";

export const SAMPLE_IMAGE = "/assets/sample-portrait.png";
export const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const FFMPEG_CLASS_WORKER_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js";
export const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
export const MAX_TIMELINE_DURATION_SECONDS = 30 * 60;
export const IMAGE_SEGMENT_SECONDS = 2;
export const MIN_VISUAL_SEGMENT_SECONDS = 0.5;
export const MAX_IMAGE_THUMBNAILS = 80;
export const IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL = 0.05;
export const IMAGE_SNAP_THRESHOLD_PIXELS = 16;
export const MIN_CAPTION_SEGMENT_SECONDS = 1.2;
export const MAX_CAPTION_SEGMENT_SECONDS = 12;
export const SUPPORTED_MEDIA_TYPES = ["image/", "video/", "audio/"];
export const ASSET_DRAG_MIME = "application/x-ai-voiceover-asset";

export const DEFAULT_SCRIPT = "";

export const EXPORT_RECORDING_FORMATS = [
  {
    mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    extension: "mp4",
    label: "MP4",
  },
  {
    mimeType: "video/mp4;codecs=h264,aac",
    extension: "mp4",
    label: "MP4",
  },
  {
    mimeType: "video/mp4",
    extension: "mp4",
    label: "MP4",
  },
  {
    mimeType: "video/webm;codecs=vp9,opus",
    extension: "webm",
    label: "WebM",
  },
  {
    mimeType: "video/webm;codecs=vp8,opus",
    extension: "webm",
    label: "WebM",
  },
  {
    mimeType: "video/webm",
    extension: "webm",
    label: "WebM",
  },
];

export const AUDIO_RECORDING_FORMATS = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/mp4", extension: "m4a" },
];

export const VOICES = [
  {
    id: "zh_CN-huayan-medium",
    name: "华言",
    language: "中文",
    detail: "Piper ONNX · 普通话",
    gender: "温柔女声",
    engine: "piper",
    badge: "推荐",
  },
  {
    id: "zh_CN-huayan-x_low",
    name: "轻量华言",
    language: "中文",
    detail: "Piper ONNX · 小模型",
    gender: "快速预览",
    engine: "piper",
    badge: "轻量",
  },
  {
    id: "af_heart",
    name: "Heart",
    language: "English",
    detail: "Kokoro 82M · q8",
    gender: "Warm female",
    engine: "kokoro",
    badge: "ONNX",
  },
  {
    id: "am_fenrir",
    name: "Fenrir",
    language: "English",
    detail: "Kokoro 82M · q8",
    gender: "Steady male",
    engine: "kokoro",
    badge: "ONNX",
  },
];

export const TOOL_RAIL = [
  { id: "media", label: "媒体", icon: ImageSquare },
  { id: "text", label: "文本", icon: TextT },
  { id: "caption", label: "字幕", icon: ClosedCaptioning },
  { id: "audio", label: "音频", icon: MusicNote },
  { id: "transition", label: "转场", icon: CirclesThree },
  { id: "effects", label: "效果", icon: Sparkle },
  { id: "stickers", label: "贴纸", icon: Sticker },
  { id: "filters", label: "滤镜", icon: MagicWand },
];

export const RATIO_OPTIONS = [
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "1:1", label: "1:1", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5", width: 1080, height: 1350 },
];

export const FILTER_OPTIONS = [
  { id: "none", name: "原片", css: "none" },
  { id: "cool", name: "冷调清透", css: "contrast(1.04) saturate(0.96) hue-rotate(8deg)" },
  { id: "film", name: "胶片暗角", css: "contrast(1.12) saturate(0.82) brightness(0.92)" },
  { id: "bright", name: "轻亮人像", css: "brightness(1.08) contrast(0.98) saturate(1.05)" },
];

export const EFFECT_OPTIONS = [
  { id: "effect-clean", name: "清晰增强", css: "contrast(1.08) saturate(1.08) brightness(1.03)" },
  { id: "effect-soft", name: "柔光", css: "brightness(1.08) contrast(0.94) saturate(1.06)" },
  { id: "effect-cinematic", name: "电影感", css: "contrast(1.18) saturate(0.86) brightness(0.92)" },
  { id: "effect-vivid", name: "高饱和", css: "contrast(1.08) saturate(1.28)" },
  { id: "effect-night", name: "夜景", css: "brightness(0.82) contrast(1.2) saturate(1.08)" },
  { id: "effect-warm", name: "暖调", css: "sepia(0.16) saturate(1.12) brightness(1.04)" },
  { id: "effect-cold", name: "冷蓝", css: "hue-rotate(12deg) saturate(0.98) contrast(1.06)" },
  { id: "effect-noir", name: "黑白", css: "grayscale(1) contrast(1.18)" },
  { id: "effect-dream", name: "梦幻", css: "brightness(1.1) saturate(1.18) blur(0.2px)" },
];

export const VISUAL_STYLE_OPTIONS = [...FILTER_OPTIONS, ...EFFECT_OPTIONS];

export const TRANSITIONS = [
  { id: "none", name: "无转场" },
  { id: "fade", name: "淡入淡出" },
  { id: "zoom", name: "轻推拉" },
  { id: "flash", name: "闪白切换" },
  { id: "wipe-left", name: "左推入" },
  { id: "wipe-up", name: "上推入" },
  { id: "blur", name: "模糊切" },
  { id: "split", name: "双开门" },
  { id: "glitch", name: "故障闪" },
];

export const STICKERS = [
  { id: "none", name: "无贴纸", text: "" },
  { id: "new", name: "新品感", text: "NEW" },
  { id: "hot", name: "热点", text: "HOT" },
  { id: "note", name: "旁白", text: "AI VOICE" },
];
