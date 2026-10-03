import { preserveUnmaskedImage } from "../../../../lib/imageEditMask.js";
import { connectAnna, generateAnnaImage, editAnnaImage } from "../../../../lib/annaRuntime.js";
import { normalizeImageBlob } from "../../host.js";
const check = signal => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
export function createAnnaAdapter() {
  return {
    async connect({ signal }) { await connectAnna({ signal }); return { state: "connected", capabilities: ["text-to-image", "image-to-image"] }; },
    async generate({ request, signal }) {
      check(signal);
      if (!["text-to-image", "image-to-image"].includes(request.mode) || typeof request.prompt !== "string" || !request.prompt.trim() || request.prompt.length > 4000) throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
      const size = { "1:1": "2048x2048", "16:9": "2560x1440", "9:16": "1440x2560" }[request.aspectRatio || "1:1"];
      if (!size) throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
      const result = request.mode === "image-to-image"
        ? await editAnnaImage({ prompt: request.prompt.trim(), blob: request.referenceAssets?.[0]?.blob, name: request.referenceAssets?.[0]?.name, maskBlob: request.maskBlob, signal })
        : await generateAnnaImage({ prompt: request.prompt.trim(), size, signal });
      if (!Array.isArray(result.images) || !result.images.length || result.images.length > 4) throw Object.assign(new Error("empty_result"), { code: "empty_result" });
      const outputs = [];
      for (const item of result.images) {
        check(signal);
        const url = new URL(item.url);
        if (url.protocol !== "https:") throw Object.assign(new Error("invalid_result"), { code: "invalid_result" });
        const response = await fetch(url.href, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw Object.assign(new Error("download_failed"), { code: "download_failed" });
        const downloaded = await response.blob();
        const normalized = await normalizeImageBlob(request.maskBlob ? await preserveUnmaskedImage(request.referenceAssets[0].blob, downloaded, request.maskBlob) : downloaded);
        check(signal);
        outputs.push({ ...normalized, type: "image", fileName: `Anna-${Date.now()}-${outputs.length + 1}.png`, providerLabel: "Anna", prompt: request.prompt, provenance: { provider: "Anna", model: result.model, generatedAt: new Date().toISOString() } });
      }
      return { provider: "anna", outputs };
    },
  };
}
