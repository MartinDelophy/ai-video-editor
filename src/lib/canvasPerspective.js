export function polygon(context, points) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
  context.closePath();
}

export function drawImageTriangle(context, image, [s0, s1, s2], [d0, d1, d2]) {
  const ux = s1.x - s0.x, uy = s1.y - s0.y;
  const vx = s2.x - s0.x, vy = s2.y - s0.y;
  const det = ux * vy - uy * vx;
  const dx = d1.x - d0.x, dy = d1.y - d0.y;
  const ex = d2.x - d0.x, ey = d2.y - d0.y;
  const a = (dx * vy - ex * uy) / det, b = (dy * vy - ey * uy) / det;
  const c = (ex * ux - dx * vx) / det, d = (ey * ux - dy * vx) / det;
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  context.save();
  // Slight overlap prevents seams between independently rasterized triangles.
  polygon(context, [d0, d1, d2].map(({ x, y }) => ({ x: x + (x - cx) * 0.018, y: y + (y - cy) * 0.018 })));
  context.clip();
  context.transform(a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y);
  context.drawImage(image, 0, 0);
  context.restore();
}
