const CAPTION_FONT_WEIGHT = 700;
const CAPTION_LINE_HEIGHT = 1.35;
const CAPTION_PADDING_X = 22;
const CAPTION_PADDING_Y = 12;
const CAPTION_MIN_HEIGHT = 44;
const CAPTION_MIN_WIDTH_RATIO = 0.32;
const CAPTION_MAX_WIDTH_RATIO = 0.68;
const CAPTION_MAX_WIDTH = 680;
const CAPTION_RADIUS = 7;
const CAPTION_SHADOW_BLUR = 6;
const CAPTION_SHADOW_OFFSET_Y = 1;

export const CAPTION_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

function toPositiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeFrameSize(size) {
  return {
    width: toPositiveNumber(size?.width),
    height: toPositiveNumber(size?.height),
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getCaptionScale(referenceFrame, renderFrame) {
  const reference = normalizeFrameSize(referenceFrame);
  const render = normalizeFrameSize(renderFrame);
  if (!reference.height || !render.height) {
    return 1;
  }
  return render.height / reference.height;
}

export function resolveCaptionMetrics({
  captionSize = 12,
  captionStyle = {},
  referenceFrame,
  renderFrame,
} = {}) {
  const frame = normalizeFrameSize(renderFrame);
  const scale = getCaptionScale(referenceFrame, frame);
  const fontSize = Math.max(1, toPositiveNumber(captionSize, 12) * scale);
  const paddingX = toPositiveNumber(captionStyle.paddingX, CAPTION_PADDING_X) * scale;
  const paddingY = toPositiveNumber(captionStyle.paddingY, CAPTION_PADDING_Y) * scale;
  const minWidth = frame.width * CAPTION_MIN_WIDTH_RATIO;
  const maxWidth = Math.max(
    minWidth,
    Math.min(frame.width * CAPTION_MAX_WIDTH_RATIO, CAPTION_MAX_WIDTH * scale),
  );

  return {
    scale,
    fontSize,
    fontWeight: CAPTION_FONT_WEIGHT,
    fontFamily: CAPTION_FONT_FAMILY,
    font: `${CAPTION_FONT_WEIGHT} ${fontSize}px ${CAPTION_FONT_FAMILY}`,
    lineHeight: fontSize * CAPTION_LINE_HEIGHT,
    paddingX,
    paddingY,
    minHeight: CAPTION_MIN_HEIGHT * scale,
    minWidth,
    maxWidth,
    radius: toPositiveNumber(captionStyle.radius, CAPTION_RADIUS) * scale,
    shadowBlur: CAPTION_SHADOW_BLUR * scale,
    shadowOffsetY: CAPTION_SHADOW_OFFSET_Y * scale,
  };
}

let measurementContext = null;

export function getCaptionMeasurementContext() {
  if (measurementContext || typeof document === "undefined") {
    return measurementContext;
  }
  const canvas = document.createElement("canvas");
  measurementContext = canvas.getContext("2d");
  return measurementContext;
}

function getGraphemes(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (item) => item.segment);
  }
  return Array.from(text);
}

function getWrapTokens(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text), (item) => item.segment);
  }
  return text.match(/\s+|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]|[^\s\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/gu) ?? [];
}

function splitOversizedToken(context, token, maxWidth) {
  const chunks = [];
  let current = "";
  getGraphemes(token).forEach((grapheme) => {
    const candidate = current + grapheme;
    if (current && context.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  });
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function wrapCaptionText(context, text, maxWidth) {
  const safeText = String(text ?? "");
  const paragraphs = safeText.split(/\r?\n/);
  const lines = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let current = "";
    getWrapTokens(paragraph).forEach((token) => {
      const candidate = current + token;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        return;
      }

      if (current) {
        lines.push(current.trimEnd());
      }
      const nextToken = token.trimStart();
      if (!nextToken) {
        current = "";
        return;
      }

      if (context.measureText(nextToken).width <= maxWidth) {
        current = nextToken;
        return;
      }

      const chunks = splitOversizedToken(context, nextToken, maxWidth);
      lines.push(...chunks.slice(0, -1));
      current = chunks.at(-1) ?? "";
    });

    lines.push(current.trimEnd());
  });

  return lines.length ? lines : [""];
}

function getFallbackTextWidth(text, fontSize) {
  return getGraphemes(String(text ?? "")).reduce(
    (width, grapheme) => width + (/^[\u0000-\u00ff]$/.test(grapheme) ? fontSize * 0.58 : fontSize),
    0,
  );
}

export function getCaptionTextLayout({
  context = getCaptionMeasurementContext(),
  text = "",
  captionSize = 12,
  captionStyle = {},
  referenceFrame,
  renderFrame,
} = {}) {
  const frame = normalizeFrameSize(renderFrame);
  const metrics = resolveCaptionMetrics({ captionSize, captionStyle, referenceFrame, renderFrame: frame });
  if (context) {
    context.font = metrics.font;
  }

  const paragraphWidths = String(text ?? "")
    .split(/\r?\n/)
    .map((paragraph) =>
      context ? context.measureText(paragraph).width : getFallbackTextWidth(paragraph, metrics.fontSize),
    );
  const preferredTextWidth = Math.max(0, ...paragraphWidths);
  const width = clamp(
    preferredTextWidth + metrics.paddingX * 2,
    metrics.minWidth,
    metrics.maxWidth,
  );
  const contentWidth = Math.max(1, width - metrics.paddingX * 2);
  const lines = context
    ? wrapCaptionText(context, text, contentWidth)
    : String(text ?? "").split(/\r?\n/);
  const height = Math.max(
    metrics.minHeight,
    lines.length * metrics.lineHeight + metrics.paddingY * 2,
  );

  return {
    text: String(text ?? ""),
    frame,
    metrics,
    width,
    height,
    contentWidth,
    lines,
    style: captionStyle,
  };
}

function normalizePlacement(placement) {
  if (typeof placement === "string") {
    const placements = {
      top: { x: 50, y: 18 },
      middle: { x: 50, y: 50 },
      bottom: { x: 50, y: 78 },
    };
    return placements[placement] ?? placements.bottom;
  }
  return {
    x: Number.isFinite(Number(placement?.x)) ? Number(placement.x) : 50,
    y: Number.isFinite(Number(placement?.y)) ? Number(placement.y) : 78,
  };
}

export function positionCaptionLayout(layout, placement) {
  const point = normalizePlacement(placement);
  return {
    x: (layout.frame.width * point.x) / 100 - layout.width / 2,
    y: (layout.frame.height * point.y) / 100 - layout.height / 2,
    centerX: (layout.frame.width * point.x) / 100,
    centerY: (layout.frame.height * point.y) / 100,
  };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, safeRadius);
    return;
  }
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

export function drawCaptionLayout(context, layout, position = { x: 0, y: 0 }) {
  const { metrics } = layout;
  const style = layout.style ?? {};
  const opacity = Math.max(0, Math.min(1, Number(style.backgroundOpacity ?? 0.62)));
  const borderWidth = Math.max(0, Number(style.borderWidth ?? 0)) * metrics.scale;
  context.save();
  roundedRectPath(context, position.x, position.y, layout.width, layout.height, metrics.radius);
  context.fillStyle = style.backgroundColor || "#05080d";
  context.globalAlpha = opacity;
  context.fill();
  context.globalAlpha = 1;
  if (borderWidth) {
    context.lineWidth = borderWidth;
    context.strokeStyle = style.borderColor || "#ffffff";
    context.stroke();
  }

  context.font = metrics.font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = style.textColor || "#f5fbff";
  context.shadowColor = style.effect === "neon" ? (style.borderColor || "#35f0dd") : `rgba(0, 0, 0, ${Math.max(0, Math.min(1, Number(style.shadowOpacity ?? 0.45)))})`;
  context.shadowBlur = style.effect === "neon" ? metrics.shadowBlur * 2.6 : metrics.shadowBlur;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = metrics.shadowOffsetY;
  const blockHeight = layout.lines.length * metrics.lineHeight;
  const firstLineY = position.y + (layout.height - blockHeight) / 2 + metrics.lineHeight / 2;
  layout.lines.forEach((line, index) => {
    context.fillText(
      line,
      position.x + layout.width / 2,
      firstLineY + index * metrics.lineHeight,
      layout.contentWidth,
    );
  });
  context.restore();
}
