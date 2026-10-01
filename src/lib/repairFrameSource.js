import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSampleSink } from "mediabunny";

// Microsecond keys match WebCodecs timestamps without grouping neighboring frames.
export const repairFrameKey = (time) => Math.round(time * 1e6);

export async function openRepairFrameSource(blob, signal) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const aborted = () => { if (signal?.aborted) throw new DOMException("Repair canceled", "AbortError"); };
  try {
    aborted();
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("Source video track unavailable");
    const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
    const packets = new EncodedPacketSink(track);
    const frames = [];
    // Metadata only: no full-video image decode or PNG extraction. Sort by PTS,
    // since B-frames are stored in decode order, not presentation order.
    for await (const packet of packets.packets(undefined, undefined, { metadataOnly: true })) {
      aborted();
      if (packet.timestamp >= 0 || packet.timestamp + packet.duration > 0) frames.push({ timestamp: packet.timestamp, duration: packet.duration });
    }
    frames.sort((a, b) => a.timestamp - b.timestamp);
    const unique = frames.filter((frame, i) => !i || repairFrameKey(frame.timestamp) !== repairFrameKey(frames[i - 1].timestamp));
    for (let i = 0; i < unique.length - 1; i++) unique[i].duration = unique[i + 1].timestamp - unique[i].timestamp;
    const duration = await track.computeDuration();
    if (unique.length && !(unique.at(-1).duration > 0)) unique.at(-1).duration = duration - unique.at(-1).timestamp;
    const sink = await track.canDecode() ? new VideoSampleSink(track) : null;
    return {
      width, height, duration, frames: unique,
      canDecode: Boolean(sink),
      async bitmapAt(time) {
        aborted();
        if (!sink) return null;
        const sample = await sink.getSample(time + 0.0000001);
        if (!sample) throw new Error("Source presentation frame unavailable");
        try {
          aborted();
          const canvas = new OffscreenCanvas(width, height);
          sample.draw(canvas.getContext("2d", { colorSpace: "srgb" }), 0, 0, width, height);
          return { bitmap: await createImageBitmap(canvas), timestamp: sample.timestamp };
        } finally { sample.close(); }
      },
      async *decodeFrames(selected) {
        const iterator = sink?.samplesAtTimestamps(selected.map((frame) => frame.timestamp + 0.0000001));
        try {
          for (const [completed, frame] of selected.entries()) {
            aborted();
            const sample = iterator ? (await iterator.next()).value : null;
            let decoded = null;
            if (sink && !sample) throw new Error("Source presentation frame unavailable");
            if (sample) {
              try {
                aborted();
                const canvas = new OffscreenCanvas(width, height);
                sample.draw(canvas.getContext("2d", { colorSpace: "srgb" }), 0, 0, width, height);
                decoded = { bitmap: await createImageBitmap(canvas), timestamp: sample.timestamp };
              } finally { sample.close(); }
            }
            // Ownership passes to the consumer for just this frame.
            yield { completed, frame, decoded };
          }
        } finally { await iterator?.return(); }
      },
      dispose() { input.dispose(); },
    };
  } catch (error) { input.dispose(); throw error; }
}

export function selectRepairFrames(frames, sourceStart, sourceDuration, regions, playbackRate) {
  return frames.flatMap((frame) => {
    const time = Math.max(0, frame.timestamp - sourceStart);
    // Include the frame covering a non-frame-aligned trim start, like Conversion.
    if (frame.timestamp + frame.duration <= sourceStart || time >= sourceDuration) return [];
    const activeRegions = regions.filter((region) => time / playbackRate >= region.start && time / playbackRate < region.end);
    return activeRegions.length ? [{ ...frame, time,
      duration: Math.min(sourceDuration - time, frame.timestamp + frame.duration - sourceStart - time), activeRegions }] : [];
  });
}
