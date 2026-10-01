// PNG packets use a microsecond time base: a 25fps image stream would round VFR
// timestamps and reuse the wrong patch even when source decoding is exact.
export function createRepairRangeEncoding(frames, sourceDuration, prefix, trimOffset = 0) {
  const spans = [];
  const lines = ["ffconcat version 1.0"];
  const names = frames.map((_, index) => `${prefix}-${String(index).padStart(6, "0")}.png`);
  const seconds = (value) => (Math.round(value * 1e6) / 1e6).toFixed(6);
  for (let position = 0; position < frames.length; position += 1) {
    const frame = frames[position];
    const end = Math.min(sourceDuration, frame.time + frame.duration);
    const span = spans.at(-1);
    if (span && Math.abs(span.end - frame.time) < 0.000002) span.end = end;
    else spans.push({ start: frame.time, end });
    const nextTime = frames[position + 1]?.time ?? end;
    lines.push(`file '${names[position]}'`, "option framerate 1000000", `duration ${seconds((Math.round(nextTime * 1e6) - Math.round(frame.time * 1e6)) / 1e6)}`);
  }
  lines.push(`file '${names.at(-1)}'`, "option framerate 1000000");
  const enable = spans.map(({ start, end }) => `gte(t,${seconds(start - 0.000001)})*lt(t,${seconds(end - 0.000001)})`).join("+");
  return {
    names,
    manifest: lines.join("\n") + "\n",
    filter: `[0:v]settb=AVTB,setpts='max(PTS-${seconds(trimOffset)}/TB,0)'[base];[1:v]settb=AVTB,setpts=PTS-STARTPTS+${seconds(frames[0].time - 0.000002)}/TB[patch];[base][patch]overlay=eof_action=pass:repeatlast=0:enable='${enable}'[repaired]`,
  };
}
