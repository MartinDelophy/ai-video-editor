import { useEffect, useState, useSyncExternalStore } from "react";
import {
  cancelVideoProxy,
  clearVideoProxyCache,
  getVideoProxyMode,
  retainVideoProxyUrl,
  releaseVideoProxyUrl,
  synchronizeVideoProxyAssets,
  getVideoProxyRecord,
  getVideoProxyRevision,
  prepareVideoProxy,
  resolvePreviewMediaSource,
  setVideoProxyMode,
  setVideoProxyPlaying,
  subscribeVideoProxy,
  videoProxyInteractionActive,
} from "../lib/videoProxy.js";

export function useVideoProxySource(asset, source, isPlaying) {
  const revision = useSyncExternalStore(subscribeVideoProxy, getVideoProxyRevision);
  const [selected, setSelected] = useState({ source: "", url: "" });
  useEffect(() => {
    if (asset?.src === source) prepareVideoProxy(asset);
  }, [asset, source]);
  useEffect(() => {
    if (
      selected.source !== source ||
      (!isPlaying && !videoProxyInteractionActive()) ||
      (selected.source === source &&
        selected.url !== source &&
        getVideoProxyRecord(source)?.failed === true)
    ) {
      const url = resolvePreviewMediaSource(source);
      if (selected.source !== source || selected.url !== url) setSelected({ source, url });
    }
  }, [source, revision, isPlaying, selected.source, selected.url]);
  const url = selected.source === source ? selected.url : resolvePreviewMediaSource(source);
  useEffect(() => {
    retainVideoProxyUrl(url);
    return () => releaseVideoProxyUrl(url);
  }, [url]);
  return url;
}

export function useVideoProxyController(assets, isPlaying) {
  useSyncExternalStore(subscribeVideoProxy, getVideoProxyRevision);
  useEffect(() => {
    setVideoProxyPlaying(isPlaying);
  }, [isPlaying]);
  useEffect(() => {
    synchronizeVideoProxyAssets(assets);
    assets.forEach(prepareVideoProxy);
  }, [assets]);
  return {
    mode: getVideoProxyMode(),
    setMode: setVideoProxyMode,
    record: getVideoProxyRecord,
    cancel: cancelVideoProxy,
    clear: clearVideoProxyCache,
  };
}
