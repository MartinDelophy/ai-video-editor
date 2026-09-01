function imageExtensionForMime(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  return "png";
}

export async function normalizeImageBlob(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The provider returned an empty image.");
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = (start, length) => String.fromCharCode(...header.slice(start, start + length));
  let mime = String(blob.type || "").toLowerCase().split(";", 1)[0];
  if (header[0] === 0x89 && ascii(1, 3) === "PNG") mime = "image/png";
  else if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) mime = "image/jpeg";
  else if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") mime = "image/webp";
  else if (ascii(4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(8, 4))) mime = "image/avif";
  if (!mime.startsWith("image/")) throw new Error(`The provider returned ${mime || "an unknown format"} instead of an image.`);
  const normalized = blob.type === mime ? blob : new Blob([blob], { type: mime });
  try {
    const bitmap = await createImageBitmap(normalized);
    const result = { blob: normalized, mimeType: mime, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (!result.width || !result.height) throw new Error("The generated image has no dimensions.");
    return result;
  } catch (error) {
    throw new Error("The provider returned an image that the browser could not decode.", { cause: error });
  }
}

export async function inspectImageBlob(blob) {
  const normalized = await normalizeImageBlob(blob);
  return { width: normalized.width, height: normalized.height };
}

export async function waitForVideoMetadata(video) {
  if (video.readyState >= 1) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("error", finish);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 2500);
    video.addEventListener("loadedmetadata", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
  });
}

export async function inspectVideoBlob(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The provider returned an empty video.");
  const src = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = src;
  try {
    await waitForVideoMetadata(video);
    return {
      durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    };
  } finally {
    URL.revokeObjectURL(src);
  }
}

export async function readMediaBlob(src) {
  if (!src) throw new Error("The provider did not return a media URL.");
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

export function dataUrlToBlob(value) {
  const normalized = String(value || "").trim();
  const payload = normalized.includes(",") ? normalized.slice(normalized.indexOf(",") + 1) : normalized;
  const mime = normalized.match(/^data:([^;,]+)/)?.[1] || "image/png";
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export function extensionForImageMime(mime) {
  return imageExtensionForMime(mime);
}

export async function commitGenerationOutputs(outputs, {
  imageUrlRefs,
  notify,
  setSelectedLibraryAssetId,
  setUserAssets,
}) {
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error("The provider returned no media outputs.");
  const assets = [];
  for (const output of outputs) {
    if (!(output.blob instanceof Blob) || output.blob.size === 0) {
      throw new Error(`The provider did not return downloadable bytes for ${output.fileName || "an output"}.`);
    }
    const id = crypto.randomUUID();
    if (output.type === "video") {
      const info = output.width && output.height ? output : { ...output, ...(await inspectVideoBlob(output.blob)) };
      const src = URL.createObjectURL(output.blob);
      imageUrlRefs.current.add(src);
      assets.push({
        id,
        type: "video",
        kind: "generated-video",
        name: output.fileName || "generated-video.mp4",
        meta: `${info.width || 1280}×${info.height || 720}${info.durationSeconds ? ` · ${info.durationSeconds.toFixed(1)}s` : ""}`,
        src,
        previewSrc: src,
        blob: output.blob,
        duration: info.durationSeconds || 0,
        width: info.width || 1280,
        height: info.height || 720,
        provider: output.providerLabel,
        generated: true,
        prompt: output.prompt || "",
        generation: output.provenance,
      });
    } else {
      const normalized = await normalizeImageBlob(output.blob);
      const src = URL.createObjectURL(normalized.blob);
      imageUrlRefs.current.add(src);
      assets.push({
        id,
        type: "image",
        kind: "generated-image",
        name: output.fileName || `generated-image.${imageExtensionForMime(normalized.mimeType)}`,
        meta: `${normalized.width}×${normalized.height}`,
        src,
        originalSrc: src,
        blob: normalized.blob,
        width: normalized.width,
        height: normalized.height,
        provider: output.providerLabel,
        generated: true,
        prompt: output.prompt || "",
        generation: output.provenance,
      });
    }
  }
  setUserAssets((items) => [...assets.slice().reverse(), ...items]);
  const selectedId = assets.at(-1)?.id || "";
  if (selectedId) setSelectedLibraryAssetId(selectedId);
  notify?.("生成结果已加入 My assets");
  return { assetIds: assets.map((asset) => asset.id), selectedAssetId: selectedId };
}
