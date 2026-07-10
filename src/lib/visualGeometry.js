const EPSILON = 1e-8;

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, toFiniteNumber(value, minimum)));
}

function getSize(size) {
  const width = Math.max(0, toFiniteNumber(size?.width));
  const height = Math.max(0, toFiniteNumber(size?.height));
  return { width, height, valid: width > 0 && height > 0 };
}

function getAspectRatio(target) {
  if (Number.isFinite(target) && target > 0) {
    return target;
  }

  const ratio = toFiniteNumber(target?.aspectRatio);
  if (ratio > 0) {
    return ratio;
  }

  const size = getSize(target);
  return size.valid ? size.width / size.height : 1;
}

function getRawBoxCoordinates(box) {
  if (!box) {
    return null;
  }

  if (box.normalized && typeof box.normalized === "object") {
    return getRawBoxCoordinates(box.normalized);
  }

  const xMin = box.xMin ?? box.xmin ?? box.left ?? box.x;
  const yMin = box.yMin ?? box.ymin ?? box.top ?? box.y;
  const xMax =
    box.xMax ??
    box.xmax ??
    box.right ??
    (xMin !== undefined && box.width !== undefined
      ? toFiniteNumber(xMin) + toFiniteNumber(box.width)
      : undefined);
  const yMax =
    box.yMax ??
    box.ymax ??
    box.bottom ??
    (yMin !== undefined && box.height !== undefined
      ? toFiniteNumber(yMin) + toFiniteNumber(box.height)
      : undefined);

  if ([xMin, yMin, xMax, yMax].some((value) => !Number.isFinite(Number(value)))) {
    return null;
  }

  return {
    xMin: Math.min(Number(xMin), Number(xMax)),
    yMin: Math.min(Number(yMin), Number(yMax)),
    xMax: Math.max(Number(xMin), Number(xMax)),
    yMax: Math.max(Number(yMin), Number(yMax)),
  };
}

/**
 * Convert a pixel or normalized bounding box into source-relative 0..1 coordinates.
 */
export function normalizeBoundingBox(box, sourceSize = null) {
  const raw = getRawBoxCoordinates(box);
  if (!raw) {
    return null;
  }

  const source = getSize(sourceSize);
  const values = [raw.xMin, raw.yMin, raw.xMax, raw.yMax];
  const looksNormalized = values.every((value) => value >= -EPSILON && value <= 1 + EPSILON);
  const explicitlyNormalized =
    box?.isNormalized === true ||
    box?.coordinateSpace === "normalized" ||
    box?.normalized === true;

  if (!source.valid && !looksNormalized && !explicitlyNormalized) {
    return null;
  }

  const xDivisor = source.valid && !looksNormalized && !explicitlyNormalized ? source.width : 1;
  const yDivisor = source.valid && !looksNormalized && !explicitlyNormalized ? source.height : 1;
  const xMin = clamp(raw.xMin / xDivisor);
  const yMin = clamp(raw.yMin / yDivisor);
  const xMax = clamp(raw.xMax / xDivisor);
  const yMax = clamp(raw.yMax / yDivisor);
  const width = Math.max(0, xMax - xMin);
  const height = Math.max(0, yMax - yMin);

  return {
    x: xMin,
    y: yMin,
    xMin,
    yMin,
    xMax,
    yMax,
    width,
    height,
    centerX: xMin + width / 2,
    centerY: yMin + height / 2,
    isNormalized: true,
  };
}

export function normalizeDetections(detections, sourceSize) {
  return (Array.isArray(detections) ? detections : [])
    .map((detection) => {
      const box = normalizeBoundingBox(detection?.box, sourceSize);
      if (!box || box.width <= EPSILON || box.height <= EPSILON) {
        return null;
      }

      return {
        ...detection,
        label: String(detection?.label ?? "object"),
        score: clamp(detection?.score),
        box,
      };
    })
    .filter(Boolean);
}

function getBoxArea(box) {
  return Math.max(0, box?.width ?? 0) * Math.max(0, box?.height ?? 0);
}

function getCenterAffinity(box) {
  const distance = Math.hypot((box?.centerX ?? 0.5) - 0.5, (box?.centerY ?? 0.5) - 0.5);
  return clamp(1 - distance / Math.SQRT1_2);
}

/**
 * Rank detections as editing subjects. Preferred labels (person by default) win,
 * followed by confidence, visible area, and proximity to the frame center.
 */
export function selectPrimarySubject(detections, options = {}) {
  const preferredLabels = (options.preferredLabels ?? ["person"])
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);
  const preferredRanks = new Map(preferredLabels.map((label, index) => [label, index]));
  const minScore = clamp(options.minScore ?? 0);
  const minArea = Math.max(0, toFiniteNumber(options.minArea, 0));

  const ranked = (Array.isArray(detections) ? detections : [])
    .map((detection) => {
      const box = normalizeBoundingBox(detection?.box);
      const score = clamp(detection?.score);
      const area = getBoxArea(box);
      if (!box || score < minScore || area <= minArea) {
        return null;
      }

      const label = String(detection?.label ?? "object");
      const preferredRank = preferredRanks.get(label.toLowerCase());
      const preferredBonus =
        preferredRank === undefined ? 0 : Math.max(0.35, 0.72 - preferredRank * 0.08);
      const rankScore =
        preferredBonus + score * 0.48 + Math.sqrt(area) * 0.34 + getCenterAffinity(box) * 0.18;

      return {
        detection: {
          ...detection,
          label,
          score,
          box,
        },
        rankScore,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.rankScore - left.rankScore);

  return ranked.length
    ? {
        ...ranked[0].detection,
        rankScore: ranked[0].rankScore,
      }
    : null;
}

function positionCropAxis({ sourceLength, cropLength, focus, paddedMinimum, paddedMaximum }) {
  const maximumStart = Math.max(0, sourceLength - cropLength);
  const idealStart = focus * sourceLength - cropLength / 2;
  const containmentMinimum = Math.max(0, paddedMaximum * sourceLength - cropLength);
  const containmentMaximum = Math.min(maximumStart, paddedMinimum * sourceLength);

  if (containmentMinimum <= containmentMaximum) {
    return clamp(idealStart, containmentMinimum, containmentMaximum);
  }

  return clamp(idealStart, 0, maximumStart);
}

function getIntersectionArea(left, right) {
  if (!left || !right) {
    return 0;
  }

  const width = Math.max(0, Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin));
  const height = Math.max(0, Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin));
  return width * height;
}

/**
 * Return the largest source crop with the target aspect ratio, anchored so the
 * detected subject and requested padding remain visible whenever possible.
 * Pixel coordinates are returned for CanvasRenderingContext2D.drawImage, with
 * an additional normalized rectangle for DOM/object-position calculations.
 */
export function getSmartCropRect(sourceSize, target, subjectBox = null, options = {}) {
  const settings =
    typeof options === "number"
      ? { padding: options }
      : options && typeof options === "object"
        ? options
        : {};
  const source = getSize(sourceSize);
  if (!source.valid) {
    return null;
  }

  const targetAspectRatio = Math.max(EPSILON, getAspectRatio(target));
  const sourceAspectRatio = source.width / source.height;
  let width;
  let height;

  if (sourceAspectRatio > targetAspectRatio) {
    height = source.height;
    width = height * targetAspectRatio;
  } else {
    width = source.width;
    height = width / targetAspectRatio;
  }

  width = Math.min(source.width, width);
  height = Math.min(source.height, height);

  const subject = normalizeBoundingBox(subjectBox) ?? normalizeBoundingBox({ xMin: 0.5, yMin: 0.5, xMax: 0.5, yMax: 0.5 });
  const padding = Math.max(0, toFiniteNumber(settings.padding, 0.12));
  const paddedX = subject.width * padding;
  const paddedY = subject.height * padding;
  const padded = {
    xMin: clamp(subject.xMin - paddedX),
    yMin: clamp(subject.yMin - paddedY),
    xMax: clamp(subject.xMax + paddedX),
    yMax: clamp(subject.yMax + paddedY),
  };
  const focusX = clamp(settings.focusX ?? subject.centerX ?? 0.5);
  const focusY = clamp(settings.focusY ?? subject.centerY ?? 0.5);
  const x = positionCropAxis({
    sourceLength: source.width,
    cropLength: width,
    focus: focusX,
    paddedMinimum: padded.xMin,
    paddedMaximum: padded.xMax,
  });
  const y = positionCropAxis({
    sourceLength: source.height,
    cropLength: height,
    focus: focusY,
    paddedMinimum: padded.yMin,
    paddedMaximum: padded.yMax,
  });
  const normalized = {
    x: x / source.width,
    y: y / source.height,
    xMin: x / source.width,
    yMin: y / source.height,
    xMax: (x + width) / source.width,
    yMax: (y + height) / source.height,
    width: width / source.width,
    height: height / source.height,
    centerX: (x + width / 2) / source.width,
    centerY: (y + height / 2) / source.height,
    isNormalized: true,
  };
  const subjectArea = getBoxArea(subject);
  const subjectCoverage = subjectArea > 0 ? getIntersectionArea(subject, normalized) / subjectArea : 1;

  return {
    x,
    y,
    xMin: x,
    yMin: y,
    xMax: x + width,
    yMax: y + height,
    width,
    height,
    sourceWidth: source.width,
    sourceHeight: source.height,
    targetAspectRatio,
    normalized,
    subjectCoverage: clamp(subjectCoverage),
  };
}

function getNormalizedCrop(cropRect, sourceSize) {
  if (cropRect?.normalized) {
    return normalizeBoundingBox(cropRect.normalized);
  }

  const inferredSource =
    sourceSize ??
    (cropRect?.sourceWidth && cropRect?.sourceHeight
      ? { width: cropRect.sourceWidth, height: cropRect.sourceHeight }
      : null);
  return normalizeBoundingBox(cropRect, inferredSource) ?? normalizeBoundingBox({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 });
}

/** Map a source-relative subject box through a crop rectangle into frame pixels. */
export function mapSourceBoxToFrame(subjectBox, cropRect, frameSize, sourceSize = null) {
  const frame = getSize(frameSize);
  const source = getSize(
    sourceSize ??
      (cropRect?.sourceWidth && cropRect?.sourceHeight
        ? { width: cropRect.sourceWidth, height: cropRect.sourceHeight }
        : null),
  );
  const subject = normalizeBoundingBox(subjectBox, source.valid ? source : null);
  const crop = getNormalizedCrop(cropRect, source.valid ? source : null);
  if (!frame.valid || !subject || !crop || crop.width <= EPSILON || crop.height <= EPSILON) {
    return null;
  }

  const unclipped = {
    xMin: (subject.xMin - crop.xMin) / crop.width,
    yMin: (subject.yMin - crop.yMin) / crop.height,
    xMax: (subject.xMax - crop.xMin) / crop.width,
    yMax: (subject.yMax - crop.yMin) / crop.height,
  };
  const normalized = normalizeBoundingBox({
    ...unclipped,
    coordinateSpace: "normalized",
  });
  if (!normalized) {
    return null;
  }

  const subjectArea = getBoxArea(subject);
  const visibleRatio = subjectArea > 0 ? getIntersectionArea(subject, crop) / subjectArea : 0;
  const x = normalized.xMin * frame.width;
  const y = normalized.yMin * frame.height;
  const width = normalized.width * frame.width;
  const height = normalized.height * frame.height;

  return {
    x,
    y,
    xMin: x,
    yMin: y,
    xMax: x + width,
    yMax: y + height,
    width,
    height,
    frameWidth: frame.width,
    frameHeight: frame.height,
    normalized,
    unclippedNormalized: {
      ...unclipped,
      width: unclipped.xMax - unclipped.xMin,
      height: unclipped.yMax - unclipped.yMin,
    },
    visibleRatio: clamp(visibleRatio),
  };
}

function getLayoutPosition(layout) {
  const position = layout?.objectPosition ?? layout?.position ?? {};
  const rawX = toFiniteNumber(position.x ?? layout?.positionX, 0.5);
  const rawY = toFiniteNumber(position.y ?? layout?.positionY, 0.5);
  return {
    x: clamp(Math.abs(rawX) > 1 ? rawX / 100 : rawX),
    y: clamp(Math.abs(rawY) > 1 ? rawY / 100 : rawY),
  };
}

/**
 * Map a normalized source box into a rendered frame using the same contain,
 * cover, or smart-crop geometry used by DOM media and export canvases.
 */
export function mapNormalizedBoxToFrame(box, sourceSize, frameSize, layout = {}) {
  const source = getSize(sourceSize);
  const frame = getSize(frameSize);
  const normalizedBox = normalizeBoundingBox(box, source.valid ? source : null);
  if (!source.valid || !frame.valid || !normalizedBox) {
    return null;
  }

  const smartCrop = layout?.smartCrop;
  if (smartCrop) {
    const cropRect =
      smartCrop && typeof smartCrop === "object" && (smartCrop.normalized || smartCrop.width)
        ? smartCrop
        : getSmartCropRect(
            source,
            layout?.outputSize ?? frame,
            normalizedBox,
            layout?.padding ?? layout?.cropPadding ?? 0.12,
          );
    const mapped = mapSourceBoxToFrame(normalizedBox, cropRect, frame);
    return mapped
      ? {
          ...mapped,
          fitMode: "smart-crop",
          cropRect,
          drawRect: { x: 0, y: 0, width: frame.width, height: frame.height },
        }
      : null;
  }

  const fitMode = layout?.fitMode === "cover" ? "cover" : "contain";
  const sourceAspectRatio = source.width / source.height;
  const frameAspectRatio = frame.width / frame.height;
  const useWidth =
    fitMode === "cover"
      ? sourceAspectRatio < frameAspectRatio
      : sourceAspectRatio > frameAspectRatio;
  const drawWidth = useWidth ? frame.width : frame.height * sourceAspectRatio;
  const drawHeight = useWidth ? frame.width / sourceAspectRatio : frame.height;
  const position = getLayoutPosition(layout);
  const drawX = (frame.width - drawWidth) * position.x;
  const drawY = (frame.height - drawHeight) * position.y;
  const raw = {
    xMin: drawX + normalizedBox.xMin * drawWidth,
    yMin: drawY + normalizedBox.yMin * drawHeight,
    xMax: drawX + normalizedBox.xMax * drawWidth,
    yMax: drawY + normalizedBox.yMax * drawHeight,
  };
  const unclippedNormalized = {
    xMin: raw.xMin / frame.width,
    yMin: raw.yMin / frame.height,
    xMax: raw.xMax / frame.width,
    yMax: raw.yMax / frame.height,
  };
  const clippedNormalized = normalizeBoundingBox({
    ...unclippedNormalized,
    coordinateSpace: "normalized",
  });
  if (!clippedNormalized) {
    return null;
  }

  const unclippedArea = Math.max(0, unclippedNormalized.xMax - unclippedNormalized.xMin) *
    Math.max(0, unclippedNormalized.yMax - unclippedNormalized.yMin);
  const visibleArea = getBoxArea(clippedNormalized);
  const x = clippedNormalized.xMin * frame.width;
  const y = clippedNormalized.yMin * frame.height;
  const width = clippedNormalized.width * frame.width;
  const height = clippedNormalized.height * frame.height;

  return {
    x,
    y,
    xMin: x,
    yMin: y,
    xMax: x + width,
    yMax: y + height,
    width,
    height,
    frameWidth: frame.width,
    frameHeight: frame.height,
    normalized: clippedNormalized,
    unclippedNormalized: {
      ...unclippedNormalized,
      width: unclippedNormalized.xMax - unclippedNormalized.xMin,
      height: unclippedNormalized.yMax - unclippedNormalized.yMin,
    },
    visibleRatio: unclippedArea > 0 ? clamp(visibleArea / unclippedArea) : 0,
    fitMode,
    cropRect: null,
    drawRect: { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
  };
}

function normalizeFrameRect(rect, frameSize) {
  if (rect?.normalized) {
    return normalizeBoundingBox(rect.normalized);
  }
  return normalizeBoundingBox(rect, frameSize);
}

function normalizePlacementPoint(placement, fallback) {
  if (typeof placement === "string") {
    const placements = {
      top: { x: 0.5, y: 0.18 },
      middle: { x: 0.5, y: 0.5 },
      bottom: { x: 0.5, y: 0.82 },
    };
    return placements[placement] ?? fallback;
  }

  if (!placement) {
    return fallback;
  }

  const rawX = toFiniteNumber(placement.x, fallback.x);
  const rawY = toFiniteNumber(placement.y, fallback.y);
  return {
    x: clamp(Math.abs(rawX) > 1 ? rawX / 100 : rawX),
    y: clamp(Math.abs(rawY) > 1 ? rawY / 100 : rawY),
  };
}

function getCaptionDimension(value, frameDimension, fallback) {
  const dimension = toFiniteNumber(value, fallback);
  if (dimension <= 0) {
    return fallback;
  }
  return clamp(dimension > 1 ? dimension / frameDimension : dimension, 0.01, 1);
}

function createCaptionRect(point, width, height, safeMargin) {
  const usableWidth = Math.max(0.01, 1 - safeMargin * 2);
  const usableHeight = Math.max(0.01, 1 - safeMargin * 2);
  const safeWidth = Math.min(width, usableWidth);
  const safeHeight = Math.min(height, usableHeight);
  const centerX = clamp(point.x, safeMargin + safeWidth / 2, 1 - safeMargin - safeWidth / 2);
  const centerY = clamp(point.y, safeMargin + safeHeight / 2, 1 - safeMargin - safeHeight / 2);

  return {
    xMin: centerX - safeWidth / 2,
    yMin: centerY - safeHeight / 2,
    xMax: centerX + safeWidth / 2,
    yMax: centerY + safeHeight / 2,
    width: safeWidth,
    height: safeHeight,
    centerX,
    centerY,
    isNormalized: true,
  };
}

const DEFAULT_CAPTION_CANDIDATES = [
  { id: "bottom", x: 0.5, y: 0.82 },
  { id: "top", x: 0.5, y: 0.18 },
  { id: "bottom-left", x: 0.22, y: 0.82 },
  { id: "bottom-right", x: 0.78, y: 0.82 },
  { id: "top-left", x: 0.22, y: 0.18 },
  { id: "top-right", x: 0.78, y: 0.18 },
  { id: "middle-left", x: 0.22, y: 0.5 },
  { id: "middle-right", x: 0.78, y: 0.5 },
  { id: "middle", x: 0.5, y: 0.5 },
];

/**
 * Choose a normalized caption center with the least subject overlap. Pixel or
 * normalized subject rectangles are accepted. The previous placement receives
 * a movement penalty to reduce visible jumping between sampled video frames.
 */
function chooseCaptionAvoidancePlacement(
  subjectRects,
  frameSize,
  captionSize = {},
  options = {},
) {
  const frame = getSize(frameSize);
  if (!frame.valid) {
    return { x: 50, y: 78, placement: "bottom", overlapRatio: 0 };
  }

  const subjects = (Array.isArray(subjectRects) ? subjectRects : [subjectRects])
    .map((rect) => normalizeFrameRect(rect, frame))
    .filter((rect) => rect && rect.width > EPSILON && rect.height > EPSILON);
  const defaultHeight = Math.max(0.08, Math.min(0.2, 72 / frame.height));
  const captionWidth = getCaptionDimension(captionSize.width, frame.width, 0.68);
  const captionHeight = getCaptionDimension(captionSize.height, frame.height, defaultHeight);
  const safeMargin = clamp(options.safeMargin ?? 0.04, 0, 0.2);
  const preferred = normalizePlacementPoint(options.preferredPlacement, { x: 0.5, y: 0.82 });
  const previous = options.previousPlacement
    ? normalizePlacementPoint(options.previousPlacement, preferred)
    : null;
  const configuredCandidates = Array.isArray(options.candidates) && options.candidates.length
    ? options.candidates
    : DEFAULT_CAPTION_CANDIDATES;
  const candidates = previous
    ? [{ id: "previous", ...previous }, ...configuredCandidates]
    : configuredCandidates;
  const captionArea = captionWidth * captionHeight;

  const ranked = candidates.map((candidate, index) => {
    const point = normalizePlacementPoint(candidate, preferred);
    const rect = createCaptionRect(point, captionWidth, captionHeight, safeMargin);
    const intersections = subjects.map((subject) => getIntersectionArea(rect, subject));
    const totalIntersection = intersections.reduce((sum, area) => sum + area, 0);
    const overlapRatio = captionArea > 0 ? Math.min(1, totalIntersection / captionArea) : 0;
    const maximumSubjectCoverage = subjects.reduce((coverage, subject, subjectIndex) => {
      const subjectArea = getBoxArea(subject);
      return Math.max(
        coverage,
        subjectArea > 0 ? intersections[subjectIndex] / subjectArea : 0,
      );
    }, 0);
    const preferredDistance = Math.hypot(rect.centerX - preferred.x, rect.centerY - preferred.y);
    const movementDistance = previous
      ? Math.hypot(rect.centerX - previous.x, rect.centerY - previous.y)
      : 0;
    const score =
      overlapRatio * 20 +
      maximumSubjectCoverage * 4 +
      preferredDistance * 0.32 +
      movementDistance * 0.72 +
      index * 1e-5;

    return {
      id: candidate.id ?? `candidate-${index}`,
      rect,
      overlapRatio,
      score,
    };
  });

  ranked.sort((left, right) => left.score - right.score);
  const best = ranked[0];
  const rect = best?.rect ?? createCaptionRect(preferred, captionWidth, captionHeight, safeMargin);
  const x = rect.centerX * 100;
  const y = rect.centerY * 100;

  return {
    x,
    y,
    placement: best?.id ?? "bottom",
    overlapRatio: best?.overlapRatio ?? 0,
    score: best?.score ?? 0,
    normalizedPosition: { x: rect.centerX, y: rect.centerY },
    rect: {
      x: rect.xMin * frame.width,
      y: rect.yMin * frame.height,
      xMin: rect.xMin * frame.width,
      yMin: rect.yMin * frame.height,
      xMax: rect.xMax * frame.width,
      yMax: rect.yMax * frame.height,
      width: rect.width * frame.width,
      height: rect.height * frame.height,
      normalized: rect,
    },
  };
}

export function getCaptionAvoidancePlacement(
  subjectBox,
  optionsOrFrameSize = {},
  legacyCaptionSize = {},
  legacyOptions = {},
) {
  const isStructuredCall = Boolean(
    optionsOrFrameSize?.frameSize ||
      optionsOrFrameSize?.sourceSize ||
      optionsOrFrameSize?.fitMode ||
      optionsOrFrameSize?.smartCrop,
  );

  if (!isStructuredCall) {
    return chooseCaptionAvoidancePlacement(
      subjectBox,
      optionsOrFrameSize,
      legacyCaptionSize,
      legacyOptions,
    );
  }

  const options = optionsOrFrameSize;
  const frameSize = options.frameSize;
  const mappedSubject = options.sourceSize
    ? mapNormalizedBoxToFrame(subjectBox, options.sourceSize, frameSize, {
        fitMode: options.fitMode,
        smartCrop: options.smartCrop,
        outputSize: options.outputSize ?? frameSize,
        padding: options.padding ?? options.cropPadding,
        objectPosition: options.objectPosition,
      })
    : subjectBox;

  return chooseCaptionAvoidancePlacement(
    mappedSubject,
    frameSize,
    options.captionSize ?? {},
    {
      preferredPlacement: options.basePlacement ?? options.preferredPlacement,
      previousPlacement: options.previousPlacement,
      candidates: options.candidates,
      safeMargin: options.safeMargin,
    },
  );
}

export const getAvoidingCaptionPlacement = getCaptionAvoidancePlacement;
