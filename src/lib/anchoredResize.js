const HANDLE_DIRECTIONS = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0],
  se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0],
};

const rotate = (x, y, radians) => ({
  x: x * Math.cos(radians) - y * Math.sin(radians),
  y: x * Math.sin(radians) + y * Math.cos(radians),
});

export function getAnchoredResize({ handle, pointer, frame, box, transform, scale }) {
  const direction = HANDLE_DIRECTIONS[handle];
  if (!direction) return transform;
  const initialScale = Math.max(0.0001, Number(transform.scale) || 1);
  const radians = (Number(transform.rotation) || 0) * Math.PI / 180;
  const center = {
    x: frame.left + frame.width * (0.5 + (Number(transform.x) || 0) / 100),
    y: frame.top + frame.height * (0.5 + (Number(transform.y) || 0) / 100),
  };
  const diagonal = rotate(direction[0] * box.width, direction[1] * box.height, radians);
  const anchor = {
    x: center.x - diagonal.x * initialScale / 2,
    y: center.y - diagonal.y * initialScale / 2,
  };
  const projectedScale = ((pointer.x - anchor.x) * diagonal.x + (pointer.y - anchor.y) * diagonal.y)
    / Math.max(1, diagonal.x ** 2 + diagonal.y ** 2);
  const nextScale = Number.isFinite(scale) ? scale : projectedScale;
  const nextCenter = {
    x: anchor.x + diagonal.x * nextScale / 2,
    y: anchor.y + diagonal.y * nextScale / 2,
  };
  return {
    ...transform,
    scale: nextScale,
    x: (nextCenter.x - frame.left - frame.width / 2) / Math.max(1, frame.width) * 100,
    y: (nextCenter.y - frame.top - frame.height / 2) / Math.max(1, frame.height) * 100,
  };
}
