const MMS_MODEL_BY_VOICE = {
  "ko_KR-mms-medium": "Xenova/mms-tts-kor",
  "vi_VN-mms-medium": "Xenova/mms-tts-vie",
  "ru_RU-mms-medium": "Xenova/mms-tts-rus",
  "th_TH-mms-medium": "siridech/mms-tts-tha-onnx",
};

const runtimePromises = new Map();
let thaiVocabPromise;

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, samples[index])) * 32767, true);
  return new Blob([buffer], { type: "audio/wav" });
}

export async function predictMmsVoice(input, onProgress) {
  const modelId = MMS_MODEL_BY_VOICE[input.voiceId];
  if (!modelId) throw new Error(`Unsupported MMS voice: ${input.voiceId}`);
  if (!runtimePromises.has(modelId)) {
    runtimePromises.set(modelId, (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.useBrowserCache = false;
      const isRootOnnxModel = modelId === "siridech/mms-tts-tha-onnx";
      return pipeline("text-to-speech", modelId, {
        dtype: isRootOnnxModel ? "fp32" : "q8",
        device: "wasm",
        ...(isRootOnnxModel ? { model_file_name: "../model" } : {}),
        progress_callback: (event) => onProgress?.(event),
      });
    })().catch((error) => { runtimePromises.delete(modelId); throw error; }));
  }
  const synthesizer = await runtimePromises.get(modelId);
  onProgress?.({ backend: "wasm" });
  let text = input.text.trim();
  if (input.voiceId === "ko_KR-mms-medium") {
    const { convert } = await import("hangul-romanization");
    text = convert(text);
  }
  let samples;
  let sampleRate = 16000;
  if (input.voiceId === "th_TH-mms-medium") {
    thaiVocabPromise ??= fetch("https://huggingface.co/siridech/mms-tts-tha-onnx/resolve/main/vocab.json").then((response) => {
      if (!response.ok) throw new Error(`Thai MMS vocabulary failed to load (${response.status})`);
      return response.json();
    });
    const [vocab, { Tensor }] = await Promise.all([thaiVocabPromise, import("@huggingface/transformers")]);
    const characterIds = [...text].map((character) => vocab[character]).filter(Number.isInteger);
    if (!characterIds.length) throw new Error("Thai MMS input contains no supported characters");
    const ids = [0];
    characterIds.forEach((id) => ids.push(id, 0));
    const dims = [1, ids.length];
    const modelOutput = await synthesizer.model({
      input_ids: new Tensor("int64", BigInt64Array.from(ids, BigInt), dims),
      attention_mask: new Tensor("int64", BigInt64Array.from(ids, () => 1n), dims),
    });
    samples = modelOutput?.waveform?.data;
    sampleRate = Number(synthesizer.model.config?.sampling_rate) || sampleRate;
  } else {
    const output = await synthesizer(text);
    samples = output?.audio;
    sampleRate = Number(output?.sampling_rate) || sampleRate;
  }
  if (!(samples instanceof Float32Array) || !samples.length || samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error("MMS generated invalid audio");
  }
  return encodeWav(samples, sampleRate);
}
