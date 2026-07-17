import {
  CirclesThree,
  ClosedCaptioning,
  ImageSquare,
  MusicNote,
  Scan,
  Sticker,
} from "@phosphor-icons/react";

export { MODEL_ID, AUTOMATIC_CAPTION_MODEL_ID, AUTOMATIC_CAPTION_MODEL_LABEL } from "./models.js";

export const SAMPLE_IMAGE = "/assets/sample-portrait.png";
export const DEFAULT_TIMELINE_DURATION_SECONDS = 10;
export const MAX_TIMELINE_DURATION_SECONDS = 24 * 60 * 60;
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
    id: "zh_CN-xiao_ya-medium",
    name: "小雅",
    language: "中文",
    detail: "Piper ONNX · 普通话",
    gender: "自然女声",
    engine: "piper",
    badge: "推荐",
    sampleUrl: "/assets/voice-samples/zh_CN-xiao_ya-medium.mp3",
  },
  {
    id: "zh_CN-chaowen-medium",
    name: "超文",
    language: "中文",
    detail: "Piper ONNX · 普通话",
    gender: "自然人声",
    engine: "piper",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/zh_CN-chaowen-medium.mp3",
  },
  {
    id: "af_heart",
    name: "Heart",
    language: "English",
    detail: "Kokoro 82M · q8",
    gender: "Warm female",
    engine: "kokoro",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/af_heart.mp3",
  },
  {
    id: "am_fenrir",
    name: "Fenrir",
    language: "English",
    detail: "Kokoro 82M · q8",
    gender: "Steady male",
    engine: "kokoro",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/am_fenrir.mp3",
  },
  {
    id: "de_DE-thorsten-medium",
    name: "Thorsten",
    language: "Deutsch",
    detail: "Piper ONNX · Deutsch",
    gender: "Natural male",
    engine: "piper",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/de_DE-thorsten-medium.mp3",
  },
  {
    id: "es_ES-davefx-medium",
    name: "DaveFX",
    language: "Español",
    detail: "Piper ONNX · Español",
    gender: "Natural male",
    engine: "piper",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/es_ES-davefx-medium.mp3",
  },
  {
    id: "fr_FR-siwis-medium",
    name: "Siwis",
    language: "Français",
    detail: "Piper ONNX · Français",
    gender: "Natural voice",
    engine: "piper",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/fr_FR-siwis-medium.mp3",
  },
  {
    id: "it_IT-riccardo-x_low",
    name: "Riccardo",
    language: "Italiano",
    detail: "Piper ONNX · Italiano · x_low",
    gender: "Natural male",
    engine: "piper",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/it_IT-riccardo-x_low.mp3",
  },
  {
    id: "pt_BR-faber-medium",
    name: "Faber",
    language: "Português",
    detail: "Piper ONNX · Português (Brasil)",
    gender: "Natural male",
    engine: "piper",
    badge: "ONNX",
    sampleUrl: "/assets/voice-samples/pt_BR-faber-medium.mp3",
  },
];

export const TOOL_RAIL = [
  { id: "media", label: "媒体", icon: ImageSquare },
  { id: "caption", label: "字幕", icon: ClosedCaptioning },
  { id: "smart", label: "智能", icon: Scan },
  { id: "audio", label: "音频", icon: MusicNote },
  { id: "transition", label: "转场", icon: CirclesThree },
  { id: "stickers", label: "贴纸", icon: Sticker },
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

export const STICKER_PAGE_SIZE = 9;
export const DEFAULT_STICKER_SEGMENT_SECONDS = 3;

export const STICKER_CATEGORIES = [
  { id: "all", name: "全部", nameEn: "All", kind: "stickerCategory" },
  { id: "trending", name: "热门", nameEn: "Hot", kind: "stickerCategory" },
  { id: "voice", name: "旁白", nameEn: "Voiceover", kind: "stickerCategory" },
  { id: "reaction", name: "互动", nameEn: "Reactions", kind: "stickerCategory" },
  { id: "commerce", name: "带货", nameEn: "Shop", kind: "stickerCategory" },
];

export const STICKER_LIBRARY = [
  { id: "trend-flame", name: "热度火焰", nameEn: "Hot Flame", category: "trending", src: "/assets/stickers/trend-flame.png" },
  { id: "trend-spark", name: "闪光爆点", nameEn: "Spark Burst", category: "trending", src: "/assets/stickers/trend-spark.png" },
  { id: "trend-bolt", name: "闪电强调", nameEn: "Lightning", category: "trending", src: "/assets/stickers/trend-bolt.png" },
  { id: "trend-starburst", name: "爆点星芒", nameEn: "Starburst", category: "trending", src: "/assets/stickers/trend-starburst.png" },
  { id: "trend-crown", name: "精选皇冠", nameEn: "Crown", category: "trending", src: "/assets/stickers/trend-crown.png" },
  { id: "trend-megaphone", name: "扩音提醒", nameEn: "Megaphone", category: "trending", src: "/assets/stickers/trend-megaphone.png" },
  { id: "trend-rocket", name: "起飞火箭", nameEn: "Rocket", category: "trending", src: "/assets/stickers/trend-rocket.png" },
  { id: "trend-confetti", name: "彩带庆祝", nameEn: "Confetti", category: "trending", src: "/assets/stickers/trend-confetti.png" },
  { id: "trend-verified", name: "认证勾选", nameEn: "Verified Check", category: "trending", src: "/assets/stickers/trend-verified.png" },
  { id: "voice-mic", name: "录音麦克风", nameEn: "Studio Mic", category: "voice", src: "/assets/stickers/voice-mic.png" },
  { id: "voice-waveform", name: "音频波形", nameEn: "Waveform", category: "voice", src: "/assets/stickers/voice-waveform.png" },
  { id: "voice-headphones", name: "监听耳机", nameEn: "Headphones", category: "voice", src: "/assets/stickers/voice-headphones.png" },
  { id: "voice-sound-ring", name: "声波圆环", nameEn: "Sound Ring", category: "voice", src: "/assets/stickers/voice-sound-ring.png" },
  { id: "voice-caption-card", name: "字幕卡片", nameEn: "Caption Card", category: "voice", src: "/assets/stickers/voice-caption-card.png" },
  { id: "voice-music-note", name: "音乐音符", nameEn: "Music Note", category: "voice", src: "/assets/stickers/voice-music-note.png" },
  { id: "voice-speaker", name: "扬声器", nameEn: "Speaker", category: "voice", src: "/assets/stickers/voice-speaker.png" },
  { id: "voice-magic-wand", name: "魔法增强", nameEn: "Magic Wand", category: "voice", src: "/assets/stickers/voice-magic-wand.png" },
  { id: "voice-timeline-marker", name: "时间线标记", nameEn: "Timeline Marker", category: "voice", src: "/assets/stickers/voice-timeline-marker.png" },
  { id: "react-heart", name: "爱心", nameEn: "Heart", category: "reaction", src: "/assets/stickers/react-heart.png" },
  { id: "react-like", name: "点赞", nameEn: "Like", category: "reaction", src: "/assets/stickers/react-like.png" },
  { id: "react-smile", name: "微笑", nameEn: "Smile", category: "reaction", src: "/assets/stickers/react-smile.png" },
  { id: "react-surprise", name: "惊讶", nameEn: "Surprise", category: "reaction", src: "/assets/stickers/react-surprise.png" },
  { id: "react-eyes", name: "亮眼", nameEn: "Bright Eyes", category: "reaction", src: "/assets/stickers/react-eyes.png" },
  { id: "react-applause", name: "鼓掌", nameEn: "Applause", category: "reaction", src: "/assets/stickers/react-applause.png" },
  { id: "react-chat", name: "评论气泡", nameEn: "Chat Bubble", category: "reaction", src: "/assets/stickers/react-chat.png" },
  { id: "react-dots", name: "互动点点", nameEn: "Dot Bubble", category: "reaction", src: "/assets/stickers/react-dots.png" },
  { id: "react-alert", name: "重点提醒", nameEn: "Alert Burst", category: "reaction", src: "/assets/stickers/react-alert.png" },
  { id: "shop-gift", name: "礼盒", nameEn: "Gift", category: "commerce", src: "/assets/stickers/shop-gift.png" },
  { id: "shop-bag", name: "购物袋", nameEn: "Shopping Bag", category: "commerce", src: "/assets/stickers/shop-bag.png" },
  { id: "shop-tag", name: "价格标签", nameEn: "Blank Tag", category: "commerce", src: "/assets/stickers/shop-tag.png" },
  { id: "shop-coins", name: "金币", nameEn: "Coins", category: "commerce", src: "/assets/stickers/shop-coins.png" },
  { id: "shop-box", name: "产品盒", nameEn: "Product Box", category: "commerce", src: "/assets/stickers/shop-box.png" },
  { id: "shop-cart", name: "购物车", nameEn: "Cart", category: "commerce", src: "/assets/stickers/shop-cart.png" },
  { id: "shop-camera", name: "相机", nameEn: "Camera", category: "commerce", src: "/assets/stickers/shop-camera.png" },
  { id: "shop-idea", name: "灵感灯泡", nameEn: "Idea Bulb", category: "commerce", src: "/assets/stickers/shop-idea.png" },
  { id: "shop-calendar", name: "日历", nameEn: "Calendar", category: "commerce", src: "/assets/stickers/shop-calendar.png" },
];

export const STICKERS = [
  { id: "none", name: "无贴纸", text: "" },
  ...STICKER_LIBRARY,
];
