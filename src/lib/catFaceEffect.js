const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const rgba = (color, alpha) => {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "df8e9f";
  return `rgba(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(",")},${alpha})`;
};

// Paint in the tracked nose's coordinate frame. All details are resolution
// independent and use the same saved landmarks in preview and export.
export function drawCatFace(
  context,
  pose,
  { opacity = 1, scale = 1, color = "#df8e9f", yaw = 0, pitch = 0, rotation = 0 } = {},
) {
  if (!pose?.nose || !pose.mouth) return;
  const roll = pose.angle + (rotation * Math.PI) / 180;
  const ry = clamp(pose.yawRadians + (yaw * Math.PI) / 180, -1.15, 1.15);
  const rx = clamp(pose.pitchRadians + (pitch * Math.PI) / 180, -0.75, 0.75);
  const size = pose.scale * scale;
  const dx = pose.mouth.x - pose.nose.x;
  const dy = pose.mouth.y - pose.nose.y;
  const mouthY = clamp((dy * Math.cos(pose.angle) - dx * Math.sin(pose.angle)) / size, 0.16, 0.5);
  context.save();
  context.globalAlpha *= clamp(opacity, 0, 1);
  context.translate(pose.nose.x, pose.nose.y);
  context.rotate(roll);
  context.scale(size, size);
  context.transform(Math.cos(ry), -Math.sin(ry) * Math.sin(rx), 0, Math.cos(rx), 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const side of [-1, 1]) {
    context.save();
    // The far cheek fades as the face turns; no marks spill past the profile.
    context.globalAlpha *= 1 - clamp(side * Math.sin(ry), 0, 1) * 0.72;
    context.translate(side * 0.64, mouthY * 0.36);
    context.scale(0.33, 0.2);
    const blush = context.createRadialGradient(0, 0, 0.08, 0, 0, 1);
    blush.addColorStop(0, rgba(color, 0.38));
    blush.addColorStop(0.55, rgba(color, 0.18));
    blush.addColorStop(1, rgba(color, 0));
    context.fillStyle = blush;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }

  // A soft muzzle integrates the markings with real skin instead of covering it.
  for (const side of [-1, 1]) {
    context.save();
    context.translate(side * 0.13, mouthY * 0.42);
    context.scale(0.21, 0.14);
    const muzzle = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    muzzle.addColorStop(0, "rgba(255,244,233,.2)");
    muzzle.addColorStop(1, "rgba(255,244,233,0)");
    context.fillStyle = muzzle;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }

  for (const side of [-1, 1]) {
    context.save();
    context.globalAlpha *= 1 - clamp(side * Math.sin(ry), 0, 1) * 0.75;
    for (let index = 0; index < 3; index++) {
      const y = mouthY * 0.32 + (index - 1) * 0.075;
      const endY = y + (index - 1) * 0.15;
      const whisker = () => {
        context.beginPath();
        context.moveTo(side * 0.3, y);
        context.bezierCurveTo(side * 0.53, y - 0.035, side * 0.84, endY, side * 1.04, endY - 0.025);
      };
      whisker();
      context.strokeStyle = "rgba(49,31,39,.65)";
      context.lineWidth = 0.021;
      context.stroke();
      whisker();
      context.strokeStyle = "rgba(255,236,224,.5)";
      context.lineWidth = 0.006;
      context.stroke();
    }
    for (const [x, y] of [
      [0.235, 0.025],
      [0.29, 0.09],
      [0.23, 0.14],
    ]) {
      context.beginPath();
      context.ellipse(side * x, mouthY * 0.25 + y, 0.013, 0.012, 0, 0, Math.PI * 2);
      context.fillStyle = "rgba(75,39,46,.68)";
      context.fill();
    }
    context.restore();
  }

  const nose = context.createLinearGradient(0, -0.08, 0, 0.08);
  nose.addColorStop(0, rgba(color, 1));
  nose.addColorStop(1, "rgba(105,44,64,.96)");
  context.beginPath();
  context.moveTo(0, -0.045);
  context.bezierCurveTo(-0.11, -0.12, -0.18, -0.01, -0.085, 0.045);
  context.quadraticCurveTo(0, 0.12, 0.085, 0.045);
  context.bezierCurveTo(0.18, -0.01, 0.11, -0.12, 0, -0.045);
  context.fillStyle = nose;
  context.fill();
  context.beginPath();
  context.ellipse(-0.045, -0.04, 0.033, 0.013, -0.3, 0, Math.PI * 2);
  context.fillStyle = "rgba(255,227,233,.65)";
  context.fill();

  context.beginPath();
  context.moveTo(0, 0.085);
  context.lineTo(0, mouthY * 0.68);
  context.moveTo(-0.14, mouthY * 0.61);
  context.quadraticCurveTo(-0.07, mouthY * 0.92, 0, mouthY * 0.68);
  context.quadraticCurveTo(0.07, mouthY * 0.92, 0.14, mouthY * 0.61);
  context.strokeStyle = "rgba(79,36,51,.7)";
  context.lineWidth = 0.018;
  context.stroke();
  context.restore();
}
