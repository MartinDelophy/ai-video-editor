import { drawImageTriangle, polygon } from "./canvasPerspective.js";

// The quad stores offsets from the clip's editable position in frame units.
// Source pixels fill a fixed card aperture, so replacing media never reshapes it.
export const TEMPLATE_CARD_ASPECT = 1.375;

export function hasTemplateCardCorners(corners) {
  return Array.isArray(corners) && corners.length === 4
    && corners.every((point) => Array.isArray(point) && point.length === 2
      && point.every((value) => Number.isFinite(value) && Math.abs(value) <= 1.5));
}

export function getTemplateCardBox(frameHeight) {
  const height = frameHeight * 0.32;
  return { width: height * TEMPLATE_CARD_ASPECT, height };
}

function cardMapping(corners, width, height, scale = 1) {
  const [tl, tr, br, bl] = corners.map(([x, y]) => ({ x: x * width * scale, y: y * height * scale }));
  const dx1 = tr.x - br.x, dx2 = bl.x - br.x;
  const dy1 = tr.y - br.y, dy2 = bl.y - br.y;
  const sx = tl.x - tr.x + br.x - bl.x, sy = tl.y - tr.y + br.y - bl.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 0.00001) return null;
  const g = (sx * dy2 - dx2 * sy) / det, h = (dx1 * sy - sx * dy1) / det;
  if (Math.min(1 + g, 1 + h, 1 + g + h) < 0.02) return null;
  return {
    a: tr.x - tl.x + g * tr.x, b: tr.y - tl.y + g * tr.y,
    c: bl.x - tl.x + h * bl.x, d: bl.y - tl.y + h * bl.y,
    e: tl.x, f: tl.y, g, h,
  };
}

export function templateCardCssTransform(corners, frame, box, scale) {
  const map = cardMapping(corners, frame.width, frame.height, scale);
  if (!map) return "none";
  const { a, b, c, d, e, f, g, h } = map;
  return `matrix3d(${a / box.width},${b / box.width},0,${g / box.width},${c / box.height},${d / box.height},0,${h / box.height},0,0,1,0,${e},${f},0,1)`;
}

export function drawTemplateCard(context, source, canvas, corners) {
  const map = cardMapping(corners, canvas.width, canvas.height);
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!map || !width || !height) return;
  const { a, b, c, d, e, f, g, h } = map;
  const project = (u, v) => {
    const depth = 1 + g * u + h * v;
    return { x: (a * u + c * v + e) / depth, y: (b * u + d * v + f) / depth };
  };
  const sw = Math.min(width, height * TEMPLATE_CARD_ASPECT);
  const sh = sw / TEMPLATE_CARD_ASPECT;
  const sample = (u, v) => ({ x: (width - sw) / 2 + sw * u, y: (height - sh) / 2 + sh * v });
  const mesh = 3;
  context.save();
  polygon(context, [project(0, 0), project(1, 0), project(1, 1), project(0, 1)]);
  context.clip();
  for (let row = 0; row < mesh; row++) {
    for (let column = 0; column < mesh; column++) {
      const x = column / mesh, y = row / mesh, right = (column + 1) / mesh, bottom = (row + 1) / mesh;
      const uv = [[x, y], [right, y], [right, bottom], [x, bottom]];
      const points = uv.map(([u, v]) => project(u, v));
      const texture = uv.map(([u, v]) => sample(u, v));
      drawImageTriangle(context, source, [texture[0], texture[1], texture[2]], [points[0], points[1], points[2]]);
      drawImageTriangle(context, source, [texture[0], texture[2], texture[3]], [points[0], points[2], points[3]]);
    }
  }
  context.restore();
}
