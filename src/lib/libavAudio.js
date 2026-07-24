function sampleToFloat(format, value) {
  switch (format) {
    case 0:
    case 5:
      return (value - 128) / 128;
    case 1:
    case 6:
      return value / 0x8000;
    case 2:
    case 7:
      return value / 0x80000000;
    case 3:
    case 8:
      return value;
    default:
      throw new Error(`Unsupported libav.js audio sample format: ${format}`);
  }
}

export function encodeLibavAudioFramesAsWav(frames) {
  const first = frames.find((frame) => frame?.data && frame.nb_samples);
  if (!first) throw new Error("libav.js decoded no audio frames");
  const channels = Math.max(1, first.channels || first.data.length || 1);
  const sampleRate = Math.max(1, first.sample_rate || 48000);
  const frameCount = frames.reduce((total, frame) => total + (frame.nb_samples || 0), 0);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const output = new ArrayBuffer(44 + frameCount * blockAlign);
  const view = new DataView(output);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, output.byteLength - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, frameCount * blockAlign, true);

  let offset = 44;
  for (const frame of frames) {
    if (frame.channels !== channels || frame.sample_rate !== sampleRate) {
      throw new Error("Audio layout changed during libav.js decoding");
    }
    const planar = frame.format >= 5;
    for (let sampleIndex = 0; sampleIndex < frame.nb_samples; sampleIndex += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const raw = planar
          ? frame.data[channel][sampleIndex]
          : frame.data[sampleIndex * channels + channel];
        const sample = Math.max(-1, Math.min(1, sampleToFloat(frame.format, raw)));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }
  }

  return {
    buffer: output,
    channels,
    sampleRate,
    duration: frameCount / sampleRate,
    sampleCount: frameCount,
  };
}
