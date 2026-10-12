import { ALL_FORMATS, BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, Input, Mp4OutputFormat, Output } from "mediabunny";
import { throwIfExportAborted } from "./exportCancellation.js";

// Copy camera AAC packets without video decode, full-file WASM copies, PCM
// expansion or re-encoding. Explicit packets also preserve encoder priming.
const completed = new WeakMap();

export async function remuxEmbeddedAudio(blob, signal) {
  throwIfExportAborted(signal);
  if (completed.has(blob)) return completed.get(blob);
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  let output;
  let finished = false;
  const cancel = () => { void output?.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    throwIfExportAborted(signal);
    if (!track) return { blob: null, duration: 0 };
    if (track.codec !== "aac") return null;
    const decoderConfig = await track.getDecoderConfig();
    if (!decoderConfig) return null;
    const duration = await track.computeDuration();
    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat(), target });
    const source = new EncodedAudioPacketSource("aac");
    output.addAudioTrack(source);
    throwIfExportAborted(signal);
    await output.start();
    const sink = new EncodedPacketSink(track);
    // MP4 writers require non-negative timestamps. Retain AAC preroll and
    // compensate its shift in the timeline source offset after decoding.
    let sourceOffset = 0;
    let first = true;
    for await (const packet of sink.packets()) {
      throwIfExportAborted(signal);
      if (first) { sourceOffset = Math.max(0, -packet.timestamp); first = false; }
      await source.add(packet.clone({ timestamp: packet.timestamp + sourceOffset }), { decoderConfig });
    }
    source.close();
    await output.finalize();
    finished = true;
    throwIfExportAborted(signal);
    if (!target.buffer) return null;
    const result = { blob: new Blob([target.buffer], { type: "audio/mp4" }), duration, sourceOffset, storageDuration: duration + sourceOffset };
    completed.set(blob, result);
    return result;
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!finished) await output?.cancel().catch(() => {});
    input.dispose();
  }
}
