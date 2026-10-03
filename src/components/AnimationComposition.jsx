import { useCurrentFrame, useVideoConfig } from "remotion";

const font = "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";
const lightColor = color => [0.299, 0.587, 0.114].reduce((sum, weight, index) => sum + weight * parseInt(color.slice(1 + index * 2, 3 + index * 2), 16), 0) > 160;
// SVG text wraps deterministically without browser-specific line clamp/CSS capture.
function lines(text, width, size, limit = 3) {
  const output = []; let line = "", used = 0;
  for (const character of Array.from(text || "")) {
    const next = /[\u0000-\u00ff]/.test(character) ? size * 0.58 : size;
    if (used + next > width && line) { output.push(line); line = ""; used = 0; }
    line += character; used += next;
  }
  if (line) output.push(line);
  return output.length > limit ? [...output.slice(0, limit - 1), `${output[limit - 1].slice(0, -1)}…`] : output;
}
function Label({ text, x, y, width, size = 26, fill, weight = 400, limit = 3 }) {
  return <text x={x} y={y} fill={fill} fontSize={size} fontWeight={weight} fontFamily={font}>
    {lines(text, width, size, limit).map((line, index) => <tspan key={index} x={x} dy={index ? size * 1.35 : 0}>{line}</tspan>)}
  </text>;
}
export function AnimationComposition({ scene }) {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const portrait = height > width;
  const light = lightColor(scene.background);
  const foreground = light ? "#142630" : "#e9f1f4", secondary = light ? "#536873" : "#a5bac7";
  const surface = light ? "#edf2f5" : "#142630", alternate = light ? "#e0e9ee" : "#192b35";
  const pad = portrait ? 42 : 64, contentWidth = width - pad * 2;
  const titleSize = portrait ? 42 : 46;
  const titleLines = lines(scene.title, contentWidth, titleSize, 2).length;
  const bodyY = Math.max(portrait ? 264 : 214, pad + 66 + (titleLines - 1) * titleSize * 1.35 + (scene.subtitle ? 88 : 60));
  const bodyHeight = height - bodyY - pad;
  const count = scene.kind === "table" ? scene.rows.length : scene.items.length;
  const revealFrames = Math.max(1, Math.min(fps * 0.65, durationInFrames / (count + 2)));
  const state = index => {
    const progress = scene.motion === "none" ? 1 : Math.max(0, Math.min(1, (frame - index * revealFrames * 0.6) / revealFrames));
    const eased = 1 - (1 - progress) ** 3;
    return { opacity: eased, transform: `translate(0 ${scene.motion === "reveal" ? (1 - eased) * 20 : 0})` };
  };
  return <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill={foreground} style={{ width, height, display: "block" }}>
    <rect width={width} height={height} fill={scene.background} />
    <rect x={pad} y={pad} width={52} height={5} rx={2.5} fill={scene.accent} />
    <g {...state(0)}>
      <Label text={scene.title} x={pad} y={pad + 66} width={contentWidth} size={titleSize} weight={700} limit={2} />
      {scene.subtitle && <Label text={scene.subtitle} x={pad} y={bodyY - 44} width={contentWidth} size={23} fill={secondary} limit={1} />}
    </g>
    {scene.kind === "table" && (() => {
      const cellWidth = contentWidth / scene.columns.length;
      const rowHeight = bodyHeight / (scene.rows.length + 1);
      const size = Math.max(16, Math.min(26, rowHeight * 0.27, cellWidth / 7));
      return <>
        <g {...state(0)}><rect x={pad} y={bodyY} width={contentWidth} height={rowHeight} rx={8} fill={scene.accent} />
          {scene.columns.map((column, index) => <Label key={index} text={column} x={pad + index * cellWidth + 14} y={bodyY + rowHeight * 0.5} width={cellWidth - 28} size={size} fill={lightColor(scene.accent) ? "#0c2025" : "#e9f1f4"} weight={700} limit={2} />)}</g>
        {scene.rows.map((row, index) => <g key={index} {...state(index + 1)}>
          <rect x={pad} y={bodyY + (index + 1) * rowHeight} width={contentWidth} height={rowHeight - 2} fill={scene.rowColors?.[index] || (index % 2 ? alternate : surface)} />
          {row.map((cell, column) => <Label key={column} text={cell} x={pad + column * cellWidth + 14} y={bodyY + (index + 1.47) * rowHeight} width={cellWidth - 28} size={size} fill={scene.rowColors?.[index] ? lightColor(scene.rowColors[index]) ? "#0c2025" : "#e9f1f4" : foreground} limit={2} />)}
        </g>)}
      </>;
    })()}
    {scene.kind === "chart" && (() => {
      const maximum = Math.max(1, ...scene.items.map(item => item.value));
      const rowHeight = bodyHeight / count;
      const barY = Math.min(38, rowHeight * 0.55);
      const barHeight = Math.max(6, rowHeight - barY - 10);
      const labelSize = Math.min(26, rowHeight * 0.3);
      return scene.items.map((item, index) => {
        const progress = state(index + 1);
        return <g key={index} opacity={progress.opacity}>
          <Label text={item.label} x={pad} y={bodyY + index * rowHeight + labelSize + 2} width={contentWidth * 0.75} size={labelSize} limit={1} />
          <text x={width - pad} y={bodyY + index * rowHeight + labelSize + 2} fill={item.color || scene.accent} fontSize={labelSize} fontFamily={font} textAnchor="end">{item.value}</text>
          <rect x={pad} y={bodyY + index * rowHeight + barY} width={contentWidth} height={barHeight} rx={5} fill={alternate} />
          <rect x={pad} y={bodyY + index * rowHeight + barY} width={contentWidth * item.value / maximum * progress.opacity} height={barHeight} rx={5} fill={item.color || scene.accent} />
        </g>;
      });
    })()}
    {scene.kind === "cards" && (() => {
      const columns = portrait ? 1 : 2;
      const rows = Math.ceil(count / columns);
      const gap = 18, cardWidth = (contentWidth - gap * (columns - 1)) / columns;
      const cardHeight = (bodyHeight - gap * (rows - 1)) / rows;
      return scene.items.map((item, index) => <g key={index} {...state(index + 1)}>
        <rect x={pad + index % columns * (cardWidth + gap)} y={bodyY + Math.floor(index / columns) * (cardHeight + gap)} width={cardWidth} height={cardHeight} rx={16} fill={surface} />
        <Label text={item.label} x={pad + index % columns * (cardWidth + gap) + 24} y={bodyY + Math.floor(index / columns) * (cardHeight + gap) + 46} width={cardWidth - 48} size={28} fill={item.color || scene.accent} weight={700} limit={2} />
        {item.detail && <Label text={item.detail} x={pad + index % columns * (cardWidth + gap) + 24} y={bodyY + Math.floor(index / columns) * (cardHeight + gap) + 116} width={cardWidth - 48} size={23} limit={Math.max(1, Math.floor((cardHeight - 116) / 31))} />}
      </g>);
    })()}
    {scene.kind === "text" && scene.items.map((item, index) => {
      const rowHeight = bodyHeight / count;
      const size = Math.max(14, Math.min(portrait ? 32 : 36, rowHeight / (item.detail ? 4.5 : 2.5)));
      const lineLimit = rowHeight < 120 ? 1 : 2;
      return <g key={index} {...state(index + 1)}>
        <rect x={pad} y={bodyY + index * rowHeight + 6} width={4} height={Math.min(rowHeight - 12, 76)} rx={2} fill={item.color || scene.accent} />
        <Label text={item.label} x={pad + 22} y={bodyY + index * rowHeight + size} width={contentWidth - 22} size={size} weight={600} limit={lineLimit} />
        {item.detail && <Label text={item.detail} x={pad + 22} y={bodyY + index * rowHeight + size * (lineLimit === 1 ? 2.6 : 3)} width={contentWidth - 22} size={Math.max(12, size * 0.65)} fill={secondary} limit={lineLimit} />}
      </g>;
    })}
  </svg>;
}
