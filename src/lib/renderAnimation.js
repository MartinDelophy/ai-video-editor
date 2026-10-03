import { animationDimensions, validateAnimationScene } from "./animationScene.js";

export async function renderAnimation({ scene: input, signal, onProgress }) {
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  check();
  const scene = validateAnimationScene(input);
  const [{ renderMediaOnWeb, canRenderMediaOnWeb }, { AnimationComposition }] = await Promise.all([
    import("@remotion/web-renderer"), import("../components/AnimationComposition.jsx"),
  ]);
  check();
  const dimensions = animationDimensions(scene.aspectRatio);
  let encoding = { container: "mp4", videoCodec: "h264", muted: true, ...dimensions };
  if (!(await canRenderMediaOnWeb(encoding)).canRender) {
    encoding = { ...encoding, container: "webm", videoCodec: "vp8" };
    if (!(await canRenderMediaOnWeb(encoding)).canRender) throw Object.assign(new Error("Animation encoding unavailable"), { code: "ANIMATION_UNAVAILABLE" });
  }
  check();
  await document.fonts.ready;
  check();
  try {
    const rendered = await renderMediaOnWeb({
      composition: { id: "chatcut-animation", component: AnimationComposition, ...dimensions, fps: 30, durationInFrames: Math.round(scene.duration * 30), calculateMetadata: null },
      inputProps: { scene }, ...encoding, signal, pageResponsiveness: "high", videoBitrate: "high", keyframeIntervalInSeconds: 1,
      // Remotion's canvas frames carry a timestamp but no duration. Supply the
      // exact next-frame boundary so the final encoded frame retains its hold.
      onFrame: frame => new VideoFrame(frame, { duration: Math.round((Math.round(frame.timestamp * 30 / 1e6) + 1) * 1e6 / 30) - frame.timestamp }),
      onProgress: value => onProgress?.({ progress: Math.round(value.progress * 100) }),
    });
    check();
    const blob = await rendered.getBlob();
    check();
    if (!blob.size) throw new Error("Empty render");
    return { blob, scene, ...dimensions, duration: Math.round(scene.duration * 30) / 30, extension: encoding.container };
  } catch (error) {
    check();
    throw Object.assign(new Error("Animation rendering failed", { cause: error }), { code: "ANIMATION_FAILED" });
  }
}

export async function generateAnimationAssets(input, retainUrl) {
  const output = await renderAnimation(input);
  if (input.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const src = URL.createObjectURL(output.blob);
  const asset = { id: crypto.randomUUID(), type: "video", kind: "generated-animation", name: `${output.scene.title.replace(/[\\/:*?"<>|]/g, "-")}.${output.extension}`, blob: output.blob, src, previewSrc: src, width: output.width, height: output.height, duration: output.duration, sourceDuration: output.duration, generated: true, generation: { providerId: "remotion", version: 1, scene: output.scene } };
  try {
    const { sampleChatCutMedia } = await import("./chatCutMedia.js");
    const sampled = await sampleChatCutMedia([asset], { assetId: asset.id, times: [Math.max(0, output.duration - 0.1)] }, { signal: input.signal });
    // An entrance animation starts empty. Show its readable final layout on
    // asset cards instead of an uninformative black first-frame preview.
    asset.thumbnail = sampled.frames[0].data;
    if (input.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    retainUrl?.(src);
    return { assets: [asset] };
  } catch (error) {
    URL.revokeObjectURL(src);
    if (input.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw Object.assign(new Error("Animation video could not be decoded", { cause: error }), { code: "ANIMATION_FAILED" });
  }
}
