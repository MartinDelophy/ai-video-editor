import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
/** Decode causal source timestamps in one pass instead of seeking a video
 * element for every sample. The bounded canvas pool never grows with duration. */
export async function createFaceAttachmentFrameReader(segment, times, dimensions, signal) {
  if (typeof VideoDecoder === "undefined") return null;
  let input;
  try {
    const blob =
      segment.blob instanceof Blob
        ? segment.blob
        : await fetch(segment.src, { signal }).then((response) => {
            if (!response.ok) throw new Error("FACE_MEDIA_UNAVAILABLE");
            return response.blob();
          });
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      input.dispose();
      return null;
    }
    const scale = Math.min(1, 640 / Math.max(dimensions.width, dimensions.height));
    const sink = new CanvasSink(track, {
      poolSize: 2,
      width: Math.max(2, Math.round(dimensions.width * scale)),
      height: Math.max(2, Math.round(dimensions.height * scale)),
      fit: "contain",
      decoderOptions: { optimizeForLatency: true },
    });
    const iterator = sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]();
    return {
      async next() {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const result = await iterator.next();
        return result.done ? null : result.value?.canvas || null;
      },
      async dispose() {
        try {
          await iterator.return?.();
        } finally {
          input.dispose();
        }
      },
    };
  } catch (error) {
    input?.dispose();
    if (signal.aborted) throw error;
    console.warn("Face effect sequential decoder unavailable", error);
    return null;
  }
}
