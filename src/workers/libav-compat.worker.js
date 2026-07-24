import LibAV from "@libav.js/variant-webcodecs";
import libavFactory from "../vendor/libav-timeline-compat/libav-6.9.8.1-timeline-compat.wasm.mjs";
import libavWasmUrl from "../vendor/libav-timeline-compat/libav-6.9.8.1-timeline-compat.wasm.wasm?url";
import { encodeLibavAudioFramesAsWav } from "../lib/libavAudio.js";

let runtimePromise = null;
const LIBAV_VARIANT = "timeline-compat";
const READ_CHUNK_BYTES = 4 * 1024 * 1024;

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = LibAV.LibAV({
      factory: libavFactory,
      wasmurl: libavWasmUrl,
      variant: LIBAV_VARIANT,
      noworker: true,
      nothreads: true,
    });
  }
  return runtimePromise;
}

function safeName(name) {
  const cleaned = String(name || "input.mkv").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `probe-${crypto.randomUUID()}-${cleaned}`;
}

async function readCodecParameters(libav, stream) {
  const codecpar = stream.codecpar;
  const codec = await libav.avcodec_get_name(stream.codec_id);
  const common = {
    index: stream.index,
    type:
      stream.codec_type === libav.AVMEDIA_TYPE_VIDEO
        ? "video"
        : stream.codec_type === libav.AVMEDIA_TYPE_AUDIO
          ? "audio"
          : "other",
    codec,
    codecId: stream.codec_id,
    duration: Number.isFinite(stream.duration) ? stream.duration : 0,
    timeBase: [stream.time_base_num, stream.time_base_den],
  };
  if (common.type === "video") {
    return {
      ...common,
      width: await libav.AVCodecParameters_width(codecpar),
      height: await libav.AVCodecParameters_height(codecpar),
    };
  }
  if (common.type === "audio") {
    return {
      ...common,
      sampleRate: await libav.AVCodecParameters_sample_rate(codecpar),
      channels: await libav.AVCodecParameters_ch_layout_nb_channels(codecpar),
    };
  }
  return common;
}

async function readPacketSummary(libav, formatContext, streams) {
  const packet = await libav.av_packet_alloc();
  try {
    const [, packetGroups] = await libav.ff_read_frame_multi(formatContext, packet, {
      limit: 4 * 1024 * 1024,
      unify: true,
    });
    const packets = packetGroups?.[0] || [];
    const streamMap = new Map(streams.map((stream) => [stream.index, stream]));
    const keyframes = {};
    for (const item of packets) {
      if (!(item.flags & libav.AV_PKT_FLAG_KEY)) continue;
      const stream = streamMap.get(item.stream_index);
      if (!stream) continue;
      const pts = libav.i64tof64(item.pts || 0, item.ptshi || 0);
      const time = (pts * stream.time_base_num) / stream.time_base_den;
      if (!Number.isFinite(time) || time < 0) continue;
      const values = keyframes[item.stream_index] || (keyframes[item.stream_index] = []);
      if (values.length < 80) values.push(time);
    }
    return { packetCount: packets.length, keyframes };
  } finally {
    await libav.av_packet_free_js(packet).catch(() => {});
  }
}

async function probe(file, originalName) {
  const libav = await getRuntime();
  const filename = safeName(originalName);
  let formatContext = 0;
  await libav.mkreadaheadfile(filename, file);
  try {
    const opened = await libav.ff_init_demuxer_file(filename);
    formatContext = opened[0];
    const rawStreams = opened[1];
    const streams = await Promise.all(
      rawStreams.map((stream) => readCodecParameters(libav, stream)),
    );
    const packetSummary = await readPacketSummary(libav, formatContext, rawStreams);
    const durationLow = await libav.AVFormatContext_duration(formatContext);
    const durationHigh = await libav.AVFormatContext_durationhi(formatContext);
    const containerDuration = libav.i64tof64(durationLow, durationHigh) / libav.AV_TIME_BASE;
    const duration =
      Number.isFinite(containerDuration) && containerDuration > 0
        ? containerDuration
        : Math.max(0, ...streams.map((stream) => stream.duration || 0));
    const extension =
      String(originalName || "")
        .split(".")
        .pop()
        ?.toLowerCase() || "";
    return {
      backend: "libav",
      container: extension === "mkv" || extension === "mka" ? "matroska" : extension,
      duration,
      streams,
      ...packetSummary,
      runtime: { mode: libav.libavjsMode, target: "wasm", variant: LIBAV_VARIANT },
    };
  } finally {
    if (formatContext) await libav.avformat_close_input_js(formatContext).catch(() => {});
    await libav.unlinkreadaheadfile(filename).catch(() => {});
  }
}

async function decodeAudio(file, originalName) {
  const libav = await getRuntime();
  const filename = safeName(originalName);
  let formatContext = 0;
  let decoder = null;
  await libav.mkreadaheadfile(filename, file);
  try {
    const opened = await libav.ff_init_demuxer_file(filename);
    formatContext = opened[0];
    const streams = opened[1];
    const streamIndex = streams.findIndex(
      (stream) => stream.codec_type === libav.AVMEDIA_TYPE_AUDIO,
    );
    if (streamIndex < 0) throw new Error("No audio stream found");
    const stream = streams[streamIndex];
    const codec = await libav.avcodec_get_name(stream.codec_id);
    if (codec !== "ac3") {
      throw new Error(`The ${LIBAV_VARIANT} build cannot decode ${codec || "this audio codec"}`);
    }
    await Promise.all(
      streams.map((candidate, index) =>
        index === streamIndex
          ? Promise.resolve()
          : libav.AVStream_discard_s(candidate.ptr, libav.AVDISCARD_ALL),
      ),
    );
    decoder = await libav.ff_init_decoder(stream.codec_id, stream.codecpar);
    const [, context, packet, frame] = decoder;
    const frames = [];
    while (true) {
      const [result, packetGroups] = await libav.ff_read_frame_multi(formatContext, packet, {
        limit: READ_CHUNK_BYTES,
      });
      const packets = packetGroups[streamIndex] || [];
      if (packets.length) {
        frames.push(...(await libav.ff_decode_multi(context, packet, frame, packets, false)));
      }
      if (result === libav.AVERROR_EOF) break;
      if (result !== 0 && result !== -libav.EAGAIN) {
        throw new Error(`libav.js demux failed: ${await libav.ff_error(result)}`);
      }
    }
    frames.push(...(await libav.ff_decode_multi(context, packet, frame, [], true)));
    return { backend: "libav", codec, ...encodeLibavAudioFramesAsWav(frames) };
  } finally {
    if (decoder) await libav.ff_free_decoder(decoder[1], decoder[2], decoder[3]).catch(() => {});
    if (formatContext) await libav.avformat_close_input_js(formatContext).catch(() => {});
    await libav.unlinkreadaheadfile(filename).catch(() => {});
  }
}

self.onmessage = async (event) => {
  if (!["probe", "probe-and-decode-audio", "decode-audio"].includes(event.data?.type)) return;
  try {
    const compatibility =
      event.data.type === "decode-audio" ? null : await probe(event.data.file, event.data.name);
    let decodedAudio = null;
    let audioDecodeError = "";
    if (event.data.type !== "probe") {
      try {
        decodedAudio = await decodeAudio(event.data.file, event.data.name);
      } catch (error) {
        if (event.data.type === "decode-audio") throw error;
        audioDecodeError = error instanceof Error ? error.message : String(error);
      }
    }
    const result =
      event.data.type === "probe"
        ? compatibility
        : event.data.type === "decode-audio"
          ? decodedAudio
          : { ...compatibility, decodedAudio, audioDecodeError };
    const transfers = decodedAudio?.buffer ? [decodedAudio.buffer] : [];
    self.postMessage({ type: "result", result }, transfers);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
