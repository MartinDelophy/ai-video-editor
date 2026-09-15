import { packProjectArchive, unpackProjectArchive } from "../lib/projectArchiveCodec.js";

self.onmessage = async ({ data }) => {
  try {
    const result = data.operation === "pack"
      ? await packProjectArchive(data.input)
      : await unpackProjectArchive(data.input, {
          onProgress: (progress) => self.postMessage({ type: "progress", progress }),
        });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
