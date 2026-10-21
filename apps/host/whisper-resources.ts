import { constants } from "node:fs";
import { mkdir, open, rename, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { HostError } from "./sessions.ts";
import { SILERO_HF_REVISION, SILERO_MODEL_SHA256 } from "../../src/config/sileroVad.js";

export const whisperModelId = "onnx-community/whisper-small_timestamped";
export const whisperRevision = "65caa70f294b46e1c33ff820aae6b16d048ab818";
export const yolosModelId = "Xenova/yolos-tiny";
export const yolosRevision = "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d";
export const sileroModelId = "haixin/timeline-studio-voice-models";
export const sileroRevision = SILERO_HF_REVISION;
const sileroFiles = [
  ["model.onnx", 2243022, SILERO_MODEL_SHA256],
  ["LICENSE", 1075, "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b"],
  ["SOURCE_NOTES.md", 529, "6e3fa39f3278adac8bc142ec1f8400e31bab3259058a8313b5f9dd13bb471869"],
  ["manifest.json", 406, "ebd24eaf2dd68d21b469251fdf27240629760a46561947592b73463e82168c13"],
] as const;
// Fixed upstream bytes, including tokenizer, alignment configuration and provenance.
const whisperFiles = [
  ["onnx/encoder_model_quantized.onnx", 92240498, "9f5635b596e6084045c7426ca6f6f99db8ce606ea895397c3b4a3c0aa3f9b070"],
  ["onnx/decoder_model_merged_quantized.onnx", 156795750, "c831996a6d5a535cf17447b0d7ecc36da6b72696e6fb906852ba6136b9199abb"],
  ["config.json", 2227, "457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18"],
  ["generation_config.json", 3893, "f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0"],
  ["preprocessor_config.json", 339, "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d"],
  ["tokenizer.json", 2480466, "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"],
  ["tokenizer_config.json", 282683, "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce"],
  ["special_tokens_map.json", 2194, "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691"],
  ["added_tokens.json", 34604, "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1"],
  ["vocab.json", 1036584, "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a"],
  ["merges.txt", 493869, "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6"],
  ["normalizer.json", 52666, "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd"],
  ["quantize_config.json", 10126, "b3c4c46d19751453cf47929fc25828e39f6e46025d9d66840e4f85047640b268"],
  ["README.md", 533, "32beef908082737f4f48dc6cdbbf7774667a7e48740ce6bf0f686d37e4cfab81"],
  ["LICENSE", 1063, "b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"],
] as const;
const licenseUrl = "https://raw.githubusercontent.com/openai/whisper/6e3be77e1a105e59086e3e21ff5f609fd6fa89a5/LICENSE";
const yolosFiles = [
  ["onnx/model_quantized.onnx", 9661148, "82b5c1de8aaaffd763c67d67b09b742a1c53628acfee3077af3fa59233e86b6b"],
  ["config.json", 4145, "ce8640ba6bd97a7b36ccf2d0dba9a6ac233211e2dc0c5dc4c63d922e80338c08"],
  ["preprocessor_config.json", 457, "b010730968cdbccf8767b61b0a8e903396d831fd97f3c44cc9f0c0437deb7b7f"],
  ["README.md", 1722, "c59adbed4be53a455627a6fc3c026c3a719d49f0ce993e9939348aa6f57caa9e"],
  ["LICENSE", 1082, "97acb244135bb2ed8ca578990bc91b670d61d0c5c37fc67b17bdc252d865cd9d"],
] as const;

export function createAnalysisResources(machineDirectory: string | undefined, componentId: "whisper-small-q8" | "yolos-tiny-q8" | "silero-vad") {
  const whisper = componentId === "whisper-small-q8";
  const silero = componentId === "silero-vad";
  const modelId = whisper ? whisperModelId : silero ? sileroModelId : yolosModelId;
  const revision = whisper ? whisperRevision : silero ? sileroRevision : yolosRevision;
  const files: readonly (readonly [string, number, string])[] = whisper ? whisperFiles : silero ? sileroFiles : yolosFiles;
  const source = `https://huggingface.co/${modelId}/resolve/${revision}/${silero ? "silero-vad/" : ""}`;
  const notice = whisper ? licenseUrl : silero ? source + "LICENSE" : "https://raw.githubusercontent.com/hustvl/YOLOS/14333677914ef7a39be648ae2a12647587234171/LICENSE";
  const localModelRoot = `/local-components/${whisper ? "whisper" : silero ? "silero" : "yolos"}/`;
  const directory = machineDirectory ? join(machineDirectory, "components", `${componentId}-${revision}`) : null;
  let preparing: Promise<void> | null = null;
  let cancellation: AbortController | null = null;
  let error = "";
  let receivedBytes = 0;
  const totalBytes = files.reduce((total, file) => total + file[1], 0);
  const verifiedFile = async (root: string, entry: typeof files[number]) => {
    const path = join(root, entry[0]), canonical = await realpath(path);
    if (canonical !== path) throw new Error("Component resource path changed.");
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== entry[1]) throw new Error("Component resource size differs.");
      const hash = createHash("sha256");
      for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
      if (hash.digest("hex") !== entry[2]) throw new Error("Component resource digest differs.");
      return handle;
    } catch (failure) { await handle.close(); throw failure; }
  };
  const verify = async () => {
    if (!directory) return false;
    try { for (const entry of files) await (await verifiedFile(directory, entry)).close(); return true; }
    catch { return false; }
  };
  return {
    async status() {
      return { componentId, modelId, revision, precision: silero ? "fp32" : "q8",
        state: preparing ? "preparing" : await verify() ? "verified" : "missing", receivedBytes, totalBytes, error,
        localModelRoot };
    },
    async requireFiles() {
      if (!(await verify())) throw new HostError("COMPONENT_NOT_READY", 503, "Prepare the selected fixed local model resources before analysis.");
    },
    prepare() {
      if (!directory) throw new HostError("COMPONENT_NOT_READY", 503, "The machine component directory is unavailable.");
      if (preparing) return;
      cancellation = new AbortController();
      const signal = cancellation.signal;
      error = ""; receivedBytes = 0;
      preparing = (async () => {
        if (await verify()) return;
        const parent = join(machineDirectory!, "components"), temporary = join(parent, `.${componentId}-${randomUUID()}`);
        await mkdir(join(temporary, "onnx"), { recursive: true, mode: 0o700 });
        for (const entry of files) {
          signal.throwIfAborted();
          const response = await fetch(entry[0] === "LICENSE" ? notice : source + entry[0], { signal });
          if (!response.ok || !response.body) throw new Error("The fixed component source could not be read.");
          const handle = await open(join(temporary, entry[0]), "wx", 0o600);
          try {
            const hash = createHash("sha256"); let size = 0;
            for await (const chunk of response.body) {
              size += chunk.length; receivedBytes += chunk.length;
              if (size > entry[1]) { await response.body.cancel().catch(() => {}); throw new Error("Component exceeds its fixed size."); }
              hash.update(chunk);
              let offset = 0;
              while (offset < chunk.length) offset += (await handle.write(chunk, offset, chunk.length - offset)).bytesWritten;
            }
            if (size !== entry[1] || hash.digest("hex") !== entry[2]) throw new Error("Component source bytes differ from the fixed revision.");
            await handle.sync();
          } finally { await handle.close(); }
        }
        for (const part of [join(temporary, "onnx"), temporary]) { const handle = await open(part, "r"); try { await handle.sync(); } finally { await handle.close(); } }
        // Do not overwrite a prior or damaged installation; preserve it for diagnosis.
        await rename(temporary, directory);
        const handle = await open(parent, "r"); try { await handle.sync(); } finally { await handle.close(); }
      })().catch(() => { error = "组件准备未完成。原文件和临时下载已保留，可检查存储空间与网络后重试。"; })
        .finally(() => { preparing = null; cancellation = null; });
    },
    async content(path: string) {
      const entry = files.find(item => item[0] === path);
      if (!directory || !entry) throw new HostError("COMPONENT_NOT_READY", 404, "This fixed component resource is unavailable.");
      let handle;
      try { handle = await verifiedFile(directory, entry); }
      catch { throw new HostError("COMPONENT_NOT_READY", 503, "This component resource is missing or damaged."); }
      return { size: entry[1], stream: handle.createReadStream({ start: 0, autoClose: true }),
        mimeType: path.endsWith(".json") ? "application/json" : "application/octet-stream" };
    },
    async close() { cancellation?.abort(); await preparing; },
  };
}
