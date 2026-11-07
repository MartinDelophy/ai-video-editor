const sources = {
  "cat-ears": "/assets/effects/vfx/crystal-cat-ear.webp",
  "devil-horns": "/assets/effects/vfx/crystal-devil-horn.webp",
};
let revision = 0;
export const faceAttachmentAssetRevision = () => revision;
const images = new Map();
const loading = new Map();
const tinted = new Map();
export function ensureFaceAttachmentAssets(clips = []) {
  return Promise.all(
    [...new Set(clips.map((clip) => clip.effect).filter((kind) => sources[kind]))].map((kind) => {
      if (!loading.has(kind))
        loading.set(
          kind,
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              const prepared = document.createElement("canvas");
              prepared.width = image.naturalWidth;
              prepared.height = image.naturalHeight;
              const ctx = prepared.getContext("2d");
              ctx.globalAlpha = kind === "cat-ears" ? 0.78 : 0.9;
              ctx.drawImage(image, 0, 0);
              const feather = ctx.createLinearGradient(
                0,
                prepared.height * 0.85,
                0,
                prepared.height,
              );
              feather.addColorStop(0, "#fff");
              feather.addColorStop(1, "rgba(255,255,255,.08)");
              ctx.globalCompositeOperation = "destination-in";
              ctx.fillStyle = feather;
              ctx.fillRect(0, 0, prepared.width, prepared.height);
              images.set(kind, prepared);
              revision++;
              resolve(image);
            };
            image.onerror = () => {
              loading.delete(kind);
              reject(new Error("FACE_ATTACHMENT_ASSET_UNAVAILABLE"));
            };
            image.src = sources[kind];
          }),
        );
      return loading.get(kind);
    }),
  );
}
export function getFaceAttachmentAsset(kind, color) {
  const image = images.get(kind);
  if (!image) {
    void ensureFaceAttachmentAssets([{ effect: kind }]).catch(() => {});
    return null;
  }
  const defaultColor = kind === "cat-ears" ? "#d4b3e7" : "#a51538";
  if (!color || color.toLowerCase() === defaultColor) return image;
  const key = `${kind}:${color}`;
  if (tinted.has(key)) return tinted.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  // Color blending preserves the generated glass luminance, highlights and alpha.
  context.globalCompositeOperation = "color";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(image, 0, 0);
  if (tinted.size >= 24) tinted.delete(tinted.keys().next().value);
  tinted.set(key, canvas);
  return canvas;
}
