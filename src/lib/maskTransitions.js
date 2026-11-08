export const MASK_TRANSITION_IDS = ["diagonal-fold", "ripple-mask", "step-mask", "shutter-mask"];
export const isMaskTransition = (id) => MASK_TRANSITION_IDS.includes(id);
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => v * v * (3 - 2 * v);

export function maskTransitionPaths(id, progress, w, h) {
  const p = smooth(clamp(progress));
  const point = (x, y) => `${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`;
  const polygon = (points) => `M${points.map(([x, y]) => point(x, y)).join("L")}Z`;
  const rectangle = (x, y, width, height) => polygon([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
  const whole = rectangle(0, 0, 1, 1);
  if (progress >= 1) return { path: whole, edge: "" };
  if (id === "ripple-mask") {
    const diagonal = Math.hypot(w, h) / 2;
    const radius = diagonal * (p * 1.27);
    const gap = Math.min(w, h) * 0.085 * Math.sin(Math.PI * p);
    const circle = (r) => r > 0.01
      ? `M${w / 2 + r} ${h / 2}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z` : "";
    const waves = [radius + gap, radius + gap * 0.55, radius + gap * 0.27, radius];
    const edge = waves.filter((r) => r < diagonal).map(circle).join("");
    return { path: circle(waves[0]) + circle(waves[1]) + circle(waves[2]), edge, evenOdd: true };
  }
  if (id === "diagonal-fold") {
    const center = 0.5;
    const span = (1 - p) * 1.05;
    const hole = polygon([[center, 0.5 - span * 1.5], [center + span, 0.5], [center, 0.5 + span * 1.5], [center - span, 0.5]]);
    return { path: whole + hole, edge: hole, evenOdd: true };
  }
  const points = id === "step-mask"
    ? [[0, 0], [p * 1.35, 0], [p * 1.35, 0.34], [p, 0.34], [p, 0.67], [p * 0.66 + p ** 4 * 0.36, 0.67], [p * 0.66 + p ** 4 * 0.36, 1], [0, 1]]
    : [[0, 0], [Math.min(0.5, p * 0.55), 0], [Math.min(0.5, p * 0.55), 1], [0, 1]];
  if (id === "step-mask") {
    const edgePoints = points.slice(1, 7);
    return { path: polygon(points), edge: `M${edgePoints.map(([x, y]) => point(x, y)).join("L")}` };
  }
  const right = Math.max(0.5, 1 - p * 0.55);
  return {
    path: polygon(points) + rectangle(right, 0, 1 - right, 1),
    edge: `M${point(p * 0.55, 0)}L${point(p * 0.55, 1)}M${point(right, 0)}L${point(right, 1)}`,
  };
}

export function maskTransitionAppearance(id, progress, width, height) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const { path, edge, evenOdd } = maskTransitionPaths(id, progress, w, h);
  const svg = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`;
  const stroke = Math.max(1, Math.min(w, h) * 0.008);
  return {
    maskImage: svg(`<path d="${path}" fill="white" fill-rule="${evenOdd ? "evenodd" : "nonzero"}"/>`),
    edgeImage: edge ? svg(`<path d="${edge}" fill="none" stroke="#050812" stroke-opacity=".40" stroke-width="${stroke * 1.9}"/><path d="${edge}" fill="none" stroke="#eefaff" stroke-opacity=".48" stroke-width="${stroke}"/>`) : "",
  };
}

export function strokeMaskTransition(context, edge, w, h) {
  if (!edge) return;
  context.save();
  const path = new Path2D(edge);
  context.lineWidth = Math.max(1, Math.min(w, h) * 0.008) * 1.9;
  context.strokeStyle = "#05081266";
  context.stroke(path);
  context.lineWidth /= 1.9;
  context.strokeStyle = "#eefaff7a";
  context.stroke(path);
  context.restore();
}
