import {
  ALL_FORMATS,
  AppendOnlyStreamTarget,
  BlobSource,
  Conversion,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

let conversion;
let canceled = false;
let paused = false;
async function waitUntilIdle() {
  while (paused && !canceled) await new Promise((resolve) => setTimeout(resolve, 100));
  checkCanceled();
}
const checkCanceled = () => {
  if (canceled) throw new DOMException("Canceled", "AbortError");
};
self.onmessage = async ({ data }) => {
  if (data.type === "pause") {
    paused = data.paused;
    return;
  }
  if (data.type === "cancel") {
    canceled = true;
    await conversion?.cancel();
    return;
  }
  if (data.type !== "start") return;
  let input;
  let verification;
  try {
    const { blob } = data;
    // Hash the entire source in bounded chunks. Names, object URLs and partial
    // fingerprints are not sufficient identities for reusable proxy media.
    const hashes = [];
    for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
      await waitUntilIdle();
      hashes.push(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            await blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer(),
          ),
        ),
      );
    }
    const joined = new Uint8Array(hashes.length * 32);
    hashes.forEach((hash, index) => joined.set(hash, index * 32));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
    const key = `avc-1280-video-only-v2:${blob.size}:${Array.from(digest, (n) => n.toString(16).padStart(2, "0")).join("")}`;
    self.postMessage({ type: "identity", key });
    // The host can satisfy this job from its persistent cache before decoding.
    await new Promise((resolve) => {
      const resume = ({ data: message }) => {
        if (message.type === "continue" || message.type === "cancel") {
          self.removeEventListener("message", resume);
          resolve();
        }
      };
      self.addEventListener("message", resume);
    });
    checkCanceled();
    await waitUntilIdle();
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("Missing video track");
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    // HDR, transparency and unusual timelines need a dedicated proxy transform.
    // Reject rather than silently changing appearance or the source clock.
    const config = await track.getDecoderConfig();
    const color = config?.colorSpace;
    if (color?.transfer === "pq" || color?.transfer === "hlg" || color?.primaries === "bt2020")
      throw new Error("HDR proxy unsupported");
    if (Math.max(width, height) <= 1280) {
      self.postMessage({ type: "skip" });
      return;
    }
    const sourceStart = await track.getFirstTimestamp();
    const sourceEnd = await track.computeDuration();
    if (Math.abs(sourceStart) > 0.001) throw new Error("Nonzero source origin");
    // Fragmented MP4 writes sequentially: avoid one contiguous full-video
    // ArrayBuffer and the in-memory fast-start remux copy for long sources.
    const chunks = [];
    const target = new AppendOnlyStreamTarget(
      new WritableStream({
        write(bytes) {
          chunks.push(new Blob([bytes]));
        },
      }),
    );
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 1 }),
      target,
    });
    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: {
        codec: "avc",
        ...(width >= height ? { width: 1280 } : { height: 1280 }),
        bitrate: 3_000_000,
        keyFrameInterval: 0.5,
        forceTranscode: true,
        hardwareAcceleration: "prefer-hardware",
        allowRotationMetadata: false,
        process: async (sample) => {
          await waitUntilIdle();
          return sample;
        },
      },
      // No frameRate or trim: keep variable-rate source presentation timestamps.
      audio: { discard: true },
    });
    if (
      !conversion.isValid ||
      conversion.discardedTracks.some((item) => item.reason !== "discarded_by_user")
    )
      throw new Error("Unsupported proxy tracks");
    let lastProgress = -1;
    let lastPublish = 0;
    conversion.onProgress = (progress) => {
      const bucket = Math.floor(progress * 100);
      if (bucket !== lastProgress && performance.now() - lastPublish >= 500) {
        lastProgress = bucket;
        lastPublish = performance.now();
        self.postMessage({ type: "progress", progress: Math.min(0.99, progress) });
      }
    };
    await conversion.execute();
    checkCanceled();
    const proxy = new Blob(chunks, { type: "video/mp4" });
    verification = new Input({ source: new BlobSource(proxy), formats: ALL_FORMATS });
    const video = await verification.getPrimaryVideoTrack();
    if (
      !video ||
      (await verification.getPrimaryAudioTrack()) ||
      Math.abs((await video.getFirstTimestamp()) - sourceStart) > 0.001 ||
      Math.abs((await video.computeDuration()) - sourceEnd) > 0.002
    )
      throw new Error("Proxy clock mismatch");
    // Validate every presentation timestamp, including B-frame reorder and VFR
    // cuts. A matching duration alone cannot prove causal frame alignment.
    const times = async (videoTrack) => {
      const result = [];
      for await (const packet of new EncodedPacketSink(videoTrack).packets(undefined, undefined, {
        metadataOnly: true,
      })) {
        await waitUntilIdle();
        result.push(Math.round(packet.timestamp * 1e6));
      }
      return result.sort((a, b) => a - b);
    };
    const originalTimes = await times(track);
    const proxyTimes = await times(video);
    if (
      originalTimes.length !== proxyTimes.length ||
      originalTimes.some((time, index) => Math.abs(time - proxyTimes[index]) > 2)
    )
      throw new Error("Proxy presentation timestamps differ");
    await waitUntilIdle();
    self.postMessage({ type: "done", key, blob: proxy });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  } finally {
    input?.dispose();
    verification?.dispose();
    conversion = null;
  }
};
