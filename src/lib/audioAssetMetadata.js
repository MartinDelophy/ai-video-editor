const metadataByBlob = new WeakMap();

async function readMetadata(blob) {
  const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const [format, tags, track] = await Promise.all([
      input.getFormat(),
      input.getMetadataTags().catch(() => null),
      input.getPrimaryAudioTrack(),
    ]);
    const file = { container: format.name, author: tags?.artist?.trim(), title: tags?.title?.trim() };
    if (!track) return file;

    const [codec, codecParameter, sampleRate, channels, duration, stats] = await Promise.all([
      track.getCodec().catch(() => null),
      track.getCodecParameterString().catch(() => null),
      track.getSampleRate().catch(() => null),
      track.getNumberOfChannels().catch(() => null),
      track.getDurationFromMetadata().then(value => value ?? track.computeDuration()).catch(() => null),
      track.computePacketStats(256).catch(() => null),
    ]);
    return {
      ...file,
      codec: codecParameter === "mp4a.40.2" ? "AAC-LC" : codec?.toUpperCase(),
      sampleRate,
      channels,
      duration,
      bitrate: stats?.averageBitrate,
      sampledBitrate: stats?.packetCount >= 256,
    };
  } finally {
    input.dispose();
  }
}

export function readAudioAssetMetadata(blob) {
  let pending = metadataByBlob.get(blob);
  if (!pending) {
    pending = readMetadata(blob).catch(() => null);
    metadataByBlob.set(blob, pending);
  }
  return pending;
}


// Older projects can contain video references without an audio-presence flag.
export async function videoHasAudio(item, signal) {
  if (item.compatibilityAudioBlob || item.projectMedia?.bindings?.compatibilityAudioBlob) return true;
  const { Input, BlobSource, UrlSource, ALL_FORMATS } = await import("mediabunny");
  if (signal?.aborted) return false;
  const url = item.src || item.url;
  const source = item.blob instanceof Blob ? new BlobSource(item.blob) : url ? new UrlSource(url) : null;
  if (!source) return false;
  const input = new Input({ source, formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  signal?.addEventListener("abort", dispose, { once: true });
  try {
    return Boolean(await input.getPrimaryAudioTrack());
  } finally {
    signal?.removeEventListener("abort", dispose);
    dispose();
  }
}
