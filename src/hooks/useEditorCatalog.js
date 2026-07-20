import { useEffect, useMemo, useState } from "react";
import { VOICES } from "../config/editor.js";
import { getRemoteAssetBlob } from "../lib/remoteAssetCache.js";

const DEFAULT_QUERY = { image: "nature", video: "nature", audio: "ambient" };

const formatDuration = (seconds = 0) => {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};

function mapPexelsPhoto(photo) {
  return {
    id: `pexels-image-${photo.id}`, type: "image", src: photo.src?.large2x || photo.src?.large,
    thumbnail: photo.src?.medium, name: photo.alt || `Pexels photo ${photo.id}`,
    meta: `${photo.width} × ${photo.height} · Pexels`, width: photo.width, height: photo.height,
    provider: "Pexels", creator: photo.photographer, creatorUrl: photo.photographer_url,
    sourceUrl: photo.url, license: "Pexels License", licenseUrl: "https://www.pexels.com/license/",
  };
}

function mapPexelsVideo(video) {
  const files = [...(video.video_files || [])].filter((file) => file.link).sort((a, b) => (b.width || 0) - (a.width || 0));
  const source = files.find((file) => (file.width || 0) <= 1920) || files[0];
  return {
    id: `pexels-video-${video.id}`, type: "video", src: source?.link, thumbnail: video.image,
    name: `Pexels video ${video.id}`, meta: `${source?.width || video.width} × ${source?.height || video.height} · ${formatDuration(video.duration)}`,
    width: source?.width || video.width, height: source?.height || video.height, duration: video.duration,
    trackFrames: [], provider: "Pexels", creator: video.user?.name, creatorUrl: video.user?.url,
    sourceUrl: video.url, license: "Pexels License", licenseUrl: "https://www.pexels.com/license/",
  };
}

function stripHtml(value = "") {
  const element = document.createElement("div"); element.innerHTML = value; return element.textContent || "";
}

function mapCommonsPage(page, type) {
  const info = page.imageinfo?.[0] || page.videoinfo?.[0] || {};
  const metadata = info.extmetadata || {};
  const duration = Number.parseFloat(info.duration ?? metadata.Duration?.value) || 0;
  const license = metadata.LicenseShortName?.value || "Free license";
  const derivative = type === "video"
    ? [...(info.derivatives || [])].filter((item) => item.src && item.type?.startsWith("video/") && item.width <= 1280).sort((a, b) => Math.abs((a.width || 0) - 854) - Math.abs((b.width || 0) - 854))[0]
    : type === "audio"
      ? (info.derivatives || []).find((item) => item.src && item.type?.startsWith("audio/"))
      : null;
  const editorSrc = type === "image" ? info.thumburl || info.url : derivative?.src || info.url;
  // Wikimedia only serves a fixed allowlist of thumbnail widths. Keep the
  // API-provided URL intact instead of rewriting it to an unsupported size.
  const thumbnail = type === "image" ? editorSrc : type === "video" ? info.thumburl : "";
  return {
    id: `commons-${type}-${page.pageid}`, type, src: editorSrc, originalSrc: info.url, thumbnail,
    name: page.title?.replace(/^File:/, "") || `Commons ${type}`,
    meta: type === "audio" ? `${formatDuration(duration)} · ${license}` : `${info.width || "—"} × ${info.height || "—"} · ${license}`,
    width: info.width, height: info.height, duration: duration || undefined, trackFrames: type === "video" ? [] : undefined,
    provider: "Wikimedia Commons", creator: stripHtml(metadata.Artist?.value || ""),
    sourceUrl: info.descriptionurl, license,
    licenseUrl: metadata.LicenseUrl?.value || info.descriptionurl,
  };
}

export function mapOpenverseAudio(item) {
  const source = item.url || item.alt_files?.find((file) => file.url)?.url;
  const duration = Math.max(0, (Number(item.duration) || 0) / 1000);
  return {
    id: `openverse-audio-${item.id}`, type: "audio", kind: "music", src: source, previewSrc: source,
    thumbnail: item.thumbnail || "", name: item.title || `Openverse music ${item.id}`, duration,
    meta: `${formatDuration(duration)} · ${String(item.license || "CC").toUpperCase()}`,
    provider: "Openverse", creator: item.creator, creatorUrl: item.creator_url,
    sourceUrl: item.foreign_landing_url, license: String(item.license || "").toUpperCase(),
    licenseUrl: item.license_url, attribution: item.attribution,
  };
}

async function searchCommons(type, query, signal) {
  const filetype = type === "image" ? "bitmap" : type;
  const timedMedia = type === "video" || type === "audio";
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: `${query} filetype:${filetype}`,
    gsrnamespace: "6", gsrlimit: "24", prop: timedMedia ? "videoinfo" : "imageinfo",
    [timedMedia ? "viprop" : "iiprop"]: "url|size|mime|extmetadata|derivatives",
    [timedMedia ? "viurlwidth" : "iiurlwidth"]: "1280", format: "json", origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map((page) => mapCommonsPage(page, type)).filter((asset) => asset.src);
}

async function searchPexels(type, query, key, signal) {
  const path = type === "video" ? "videos/search" : "search";
  const params = new URLSearchParams({ query, per_page: "24", orientation: "all" });
  const response = await fetch(`https://api.pexels.com/v1/${path}?${params}`, { headers: { Authorization: key }, signal });
  if (!response.ok) throw new Error(`Pexels ${response.status}`);
  const data = await response.json();
  return type === "video" ? (data.videos || []).map(mapPexelsVideo) : (data.photos || []).map(mapPexelsPhoto);
}

async function searchOpenverseAudio(query, signal) {
  const params = new URLSearchParams({ q: query, page_size: "20", license: "cc0,by,pdm", categories: "music" });
  const response = await fetch(`https://api.openverse.org/v1/audio/?${params}`, { signal });
  if (!response.ok) throw new Error(`Openverse ${response.status}`);
  const data = await response.json();
  return (data.results || []).map(mapOpenverseAudio)
    .filter((asset) => asset.src && asset.duration >= 15 && asset.duration <= 600)
    .slice(0, 24);
}

export function useEditorCatalog(voiceFilter) {
  const [libraryType, setLibraryType] = useState("image");
  const [libraryQuery, setLibraryQuery] = useState(DEFAULT_QUERY.image);
  const [builtInAssets, setBuiltInAssets] = useState([]);
  const [libraryStatus, setLibraryStatus] = useState("loading");
  const [libraryError, setLibraryError] = useState("");
  const [assetDownloadStates, setAssetDownloadStates] = useState({});
  const pexelsKey = String(import.meta.env.VITE_PEXELS_API_KEY || "").trim();

  const filteredVoices = useMemo(() => VOICES.filter((voice) => voiceFilter === "all" || voice.language === voiceFilter), [voiceFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setLibraryStatus("loading"); setLibraryError("");
    const timer = setTimeout(async () => {
      try {
        const query = libraryQuery.trim() || DEFAULT_QUERY[libraryType];
        const assets = libraryType === "audio"
          ? await searchOpenverseAudio(query, controller.signal)
          : pexelsKey
            ? await searchPexels(libraryType, query, pexelsKey, controller.signal)
            : await searchCommons(libraryType, query, controller.signal);
        setBuiltInAssets(assets); setLibraryStatus("ready");
      } catch (error) {
        if (error.name === "AbortError") return;
        setBuiltInAssets([]); setLibraryStatus("error"); setLibraryError(error.message || "Unable to load media");
      }
    }, 320);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [libraryQuery, libraryType, pexelsKey]);

  const selectLibraryType = (type) => { setLibraryType(type); setLibraryQuery(DEFAULT_QUERY[type]); };
  const prefetchLibraryAsset = async (asset) => {
    if (!asset?.src || !/^https?:/i.test(asset.src) || assetDownloadStates[asset.id]?.status === "ready") return;
    setAssetDownloadStates((states) => ({ ...states, [asset.id]: { status: "loading", progress: states[asset.id]?.progress || 0 } }));
    try {
      let lastProgressBucket = -1;
      await getRemoteAssetBlob(asset, (progress) => {
        const progressBucket = progress >= 1 ? 20 : Math.floor(progress * 20);
        if (progressBucket === lastProgressBucket) return;
        lastProgressBucket = progressBucket;
        setAssetDownloadStates((states) => ({ ...states, [asset.id]: { status: progress >= 1 ? "ready" : "loading", progress } }));
      });
    } catch {
      setAssetDownloadStates((states) => ({ ...states, [asset.id]: { status: "error", progress: 0 } }));
    }
  };
  return { builtInAssets, filteredVoices, libraryType, libraryQuery, setLibraryQuery, selectLibraryType, libraryStatus, libraryError, assetDownloadStates, prefetchLibraryAsset, libraryProvider: libraryType === "audio" ? "Openverse Music" : pexelsKey ? "Pexels" : "Wikimedia Commons" };
}
