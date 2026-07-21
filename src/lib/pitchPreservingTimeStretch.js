const clampRate = (value) => Math.max(0.25, Math.min(4, Number(value) || 1));

function findAlignedSourceStart(input, previousStart, expectedStart, frameSize, synthesisHop) {
  const overlap = frameSize - synthesisHop;
  const referenceStart = previousStart + synthesisHop;
  const searchRadius = Math.min(256, Math.max(32, Math.floor(frameSize / 8)));
  let bestStart = Math.max(0, Math.min(input.length - 1, Math.round(expectedStart)));
  let bestScore = -Infinity;
  for (let offset = -searchRadius; offset <= searchRadius; offset += 4) {
    const candidate = Math.max(0, Math.min(input.length - 1, Math.round(expectedStart + offset)));
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < overlap; index += 16) {
      const left = input[referenceStart + index] || 0;
      const right = input[candidate + index] || 0;
      dot += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const score = dot / Math.sqrt(Math.max(1e-12, leftEnergy * rightEnergy));
    if (score > bestScore) {
      bestScore = score;
      bestStart = candidate;
    }
  }
  return bestStart;
}

export function timeStretchChannelData(input, playbackRate, { frameSize = 2048 } = {}) {
  const rate = clampRate(playbackRate);
  const source = input instanceof Float32Array ? input : Float32Array.from(input || []);
  if (!source.length) return new Float32Array(1);
  if (Math.abs(rate - 1) < 0.0001) return source.slice();

  const safeFrameSize = Math.max(256, Math.min(frameSize, source.length));
  const synthesisHop = Math.max(64, Math.floor(safeFrameSize / 4));
  const analysisHop = synthesisHop * rate;
  const outputLength = Math.max(1, Math.round(source.length / rate));
  const output = new Float32Array(outputLength);
  const weights = new Float32Array(outputLength);
  let previousSourceStart = 0;

  for (let outputStart = 0, grain = 0; outputStart < outputLength; outputStart += synthesisHop, grain += 1) {
    const expectedSourceStart = grain * analysisHop;
    if (expectedSourceStart >= source.length) break;
    const sourceStart = grain === 0
      ? 0
      : findAlignedSourceStart(source, previousSourceStart, expectedSourceStart, safeFrameSize, synthesisHop);
    previousSourceStart = sourceStart;
    const available = Math.min(safeFrameSize, source.length - sourceStart, outputLength - outputStart);
    for (let index = 0; index < available; index += 1) {
      const window = Math.sin(Math.PI * index / Math.max(1, safeFrameSize - 1)) ** 2;
      output[outputStart + index] += source[sourceStart + index] * window;
      weights[outputStart + index] += window;
    }
  }

  for (let index = 0; index < output.length; index += 1) {
    if (weights[index] > 1e-5) output[index] /= weights[index];
  }
  return output;
}

export function createPitchPreservedAudioBuffer(context, decoded, {
  sourceOffset = 0,
  sourceDuration = 0,
  playbackRate = 1,
} = {}) {
  const rate = clampRate(playbackRate);
  const sampleRate = decoded.sampleRate;
  const offsetSamples = Math.max(0, Math.min(decoded.length, Math.round(sourceOffset * sampleRate)));
  const availableSamples = Math.max(0, decoded.length - offsetSamples);
  const requestedSamples = sourceDuration > 0 ? Math.round(sourceDuration * sampleRate) : availableSamples;
  const sourceSamples = Math.max(1, Math.min(availableSamples, requestedSamples));
  const outputLength = Math.max(1, Math.round(sourceSamples / rate));
  const output = context.createBuffer(decoded.numberOfChannels, outputLength, sampleRate);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const input = decoded.getChannelData(channel).subarray(offsetSamples, offsetSamples + sourceSamples);
    output.copyToChannel(timeStretchChannelData(input, rate), channel);
  }
  return output;
}
