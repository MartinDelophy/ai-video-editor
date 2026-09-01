import { dataUrlToBlob, inspectImageBlob } from "../../host.js";
import { fetchLocalJson, normalizeLoopbackEndpoint } from "../shared/loopback.js";

export function createWebUIAdapter() {
  return {
    async connect({ config }) {
      const endpoint = normalizeLoopbackEndpoint(config.endpoint, 7860);
      await fetchLocalJson(`${endpoint}/sdapi/v1/samplers`);
      return { state: "connected", endpoint };
    },

    async generate({ request, connection, signal }) {
      const prompt = String(request.prompt || "").trim();
      const body = {
        prompt,
        negative_prompt: String(request.negativePrompt || "").trim(),
        width: Number(request.width),
        height: Number(request.height),
        steps: Number(request.steps),
        seed: Number(request.seed),
      };
      if (request.mode === "img2img") {
        if (!request.initImage) throw new Error("图生图需要先选择一张参考图片。");
        body.init_images = [request.initImage];
      }
      const result = await fetchLocalJson(`${connection.endpoint}/sdapi/v1/${request.mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!Array.isArray(result?.images) || !result.images.length) throw new Error("WebUI 没有返回图片。");
      const outputs = [];
      for (const [index, encoded] of result.images.entries()) {
        const blob = dataUrlToBlob(encoded);
        const info = await inspectImageBlob(blob);
        outputs.push({
          type: "image",
          blob,
          mimeType: blob.type || "image/png",
          fileName: `${prompt.slice(0, 34) || "WebUI generation"}${result.images.length > 1 ? `-${index + 1}` : ""}.png`,
          ...info,
          prompt,
          providerLabel: "Stable Diffusion WebUI",
          provenance: { provider: "Stable Diffusion WebUI", seed: Number(request.seed), generatedAt: new Date().toISOString() },
        });
      }
      return { outputs };
    },
  };
}
