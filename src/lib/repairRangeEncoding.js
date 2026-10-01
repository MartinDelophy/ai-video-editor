// A sparse image stream holds its last frame through gaps; overlay enable ranges
// prevent that held frame from replacing any unselected source video.
export function createRepairRangeEncoding(frames, frameRate, sourceDuration, prefix) {
  const spans = [];
  const lines = ["ffconcat version 1.0"];
  const names = frames.map((_, index) => `${prefix}-${String(index).padStart(6, "0")}.png`);
  for (let position = 0; position < frames.length; position += 1) {
    const { index } = frames[position];
    const span = spans.at(-1);
    if (span && span.end === index) span.end = index + 1;
    else spans.push({ start: index, end: index + 1 });
    const nextIndex = frames[position + 1]?.index ?? index + 1;
    lines.push(`file '${names[position]}'`, `option framerate ${frameRate}`, `duration ${(nextIndex - index) / frameRate}`);
  }
  // The concat demuxer needs a terminal packet to honor the final duration.
  lines.push(`file '${names.at(-1)}'`, `option framerate ${frameRate}`);
  const enable = spans.map(({ start, end }) => `gte(t,${start / frameRate})*lt(t,${Math.min(sourceDuration, end / frameRate)})`).join("+");
  const offset = frames[0].index / frameRate;
  return {
    names,
    manifest: lines.join("\n") + "\n",
    filter: `[0:v]setpts=PTS-STARTPTS[base];[1:v]setpts=PTS-STARTPTS+${offset}/TB[patch];[base][patch]overlay=eof_action=pass:repeatlast=0:enable='${enable}'[repaired]`,
  };
}
