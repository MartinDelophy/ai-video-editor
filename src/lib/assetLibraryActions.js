import { decodeWaveform } from "./media.js";

export function createAssetLibraryActions(deps) {
  async function selectAsset(asset, options = {}) {
    if (asset.type === "audio") {
      if (!asset.blob) return void deps.notify("当前音频素材不可用，请重新上传");
      const hasValidDuration = Number.isFinite(Number(asset.duration)) && Number(asset.duration) > 0;
      const decoded = asset.peaks?.length && hasValidDuration
        ? { duration: Number(asset.duration), peaks: asset.peaks }
        : await decodeWaveform(asset.blob, 96);
      deps.replaceMusic(
        asset.blob,
        decoded.duration,
        decoded.peaks,
        asset.name,
        undefined,
        { focusAudio: options.focusAudio !== false },
      );
      return;
    }
    deps.replaceVisualTimeline(asset, deps.getVisualDurationForAsset(asset));
    deps.notify(`${asset.type === "video" ? "视频" : "图片"}素材已应用到预览和时间线`);
  }

  function deleteUserAsset(asset) {
    deps.removeVisionRecordsForAsset(asset);
    const urlInUse = deps.userAssets.some((item) => item.id !== asset.id && item.src === asset.src);
    if (deps.selectedLibraryAssetId === asset.id) deps.setSelectedLibraryAssetId("");
    deps.setUserAssets((items) => items.filter((item) => item.id !== asset.id));
    if (!urlInUse && deps.imageUrlRefs.current.has(asset.src)) {
      URL.revokeObjectURL(asset.src); deps.imageUrlRefs.current.delete(asset.src);
    }
    if (asset.type === "audio" && asset.blob === deps.musicBlob) {
      deps.clearMusicTrack("背景音乐素材已删除，时间线已同步清空");
      return;
    }
    const isActiveVisual = asset.type !== "audio" && (asset.src === deps.imageSrc ||
      deps.visualSegments.some((segment) => segment.assetId === asset.id || segment.src === asset.src));
    if (!isActiveVisual) return void deps.notify("素材已删除");
    const segments = deps.visualSegments.filter((segment) => segment.assetId !== asset.id && segment.src !== asset.src);
    if (asset.type === "video" && deps.sourceAudioBlob && asset.src === deps.imageSrc) deps.clearSourceAudioTrack(null);
    if (segments.length) deps.commitVisualSegments(segments, "素材已删除，对应视觉片段已移除");
    else deps.clearImageTrack("视觉素材已删除，时间线已同步清空");
  }
  return { deleteUserAsset, selectAsset };
}
