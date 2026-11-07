import { useEffect, useId, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { replacementCopy } from "../i18nVisualReplacement.js";
import { templateCopy } from "../i18nTemplates.js";
import { getMediaFileKind } from "../lib/mediaCompatibility.js";
import { cancelLatestVideoFrameRequest, requestLatestVideoFrame } from "../lib/videoFrameSync.js";
import { getReplacementTiming } from "../lib/visualReplacement.js";
import { ReplacementAssetPicker } from "./ReplacementAssetPicker.jsx";
import { ReplacementSourceRange } from "./ReplacementSourceRange.jsx";
import "./VisualReplacementDialog.css";

export function VisualReplacementDialog({ language, t, clip, assets, onUpload, onClose, onReplace }) {
  const copy = replacementCopy(language);
  const shared = templateCopy(language);
  const titleId = useId();
  const dialog = useRef(null);
  const video = useRef(null);
  const range = useRef(null);
  const [selected, setSelected] = useState("");
  const [revealAsset, setRevealAsset] = useState("");
  const [sourceRange, setSourceRange] = useState(null);
  const [invalid, setInvalid] = useState(false);

  const asset = assets.find((item) => item.id === selected);
  const sourceLength = asset?.type === "video" ? Number(asset.duration) || 0 : 0;
  const sameSource = asset?.src === clip.src;
  const defaultStart = sameSource ? clip.sourceStart || 0 : 0;
  const defaultEnd = Math.min(sourceLength, defaultStart + (sameSource ? clip.sourceDuration || clip.duration : clip.duration));
  const start = sourceRange?.start ?? defaultStart;
  const end = sourceRange?.end ?? defaultEnd;
  const timing = getReplacementTiming(asset, clip.duration, start, end);
  const assetReady = asset && !asset.preparing && !asset.mediaUnavailable && asset.width > 0 && asset.height > 0;
  const videoSrc = assetReady && asset.type === "video" ? asset.src : "";
  const seconds = new Intl.NumberFormat(language, { style: "unit", unit: "second", maximumFractionDigits: 2 });
  const speed = new Intl.NumberFormat(language, { maximumFractionDigits: 3 });
  const equation = timing && videoSrc
    ? `${seconds.format(clip.duration)} × ${speed.format(timing.playbackRate)} = ${seconds.format(timing.sourceDuration)}`
    : "";
  range.current = timing && videoSrc ? { start, end } : null;
  const previewAt = (value) => {
    const player = video.current;
    if (!player || player.readyState < 1 || !Number.isFinite(value)) return;
    player.pause();
    requestLatestVideoFrame(player, Math.max(0, Math.min(player.duration - 0.001, value)));
  };
  const changeAsset = (id) => {
    if (id !== selected) {
      setSelected(id);
      setSourceRange(null);
    }
    setRevealAsset("");
    setInvalid(false);
  };
  const uploadAsset = (file) => {
    if (!["image", "video"].includes(getMediaFileKind(file))) {
      setInvalid(true);
      return;
    }
    const uploaded = onUpload([file], { insertFirstVisual: false, quiet: true })?.[0];
    if (!uploaded) {
      setInvalid(true);
      return;
    }
    changeAsset(uploaded.id);
    setRevealAsset(uploaded.id);
  };

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!videoSrc || !player) return;
    let frame = 0;
    const stopAtEnd = () => {
      if (range.current && player.currentTime >= range.current.end) {
        player.pause();
        return true;
      }
      return false;
    };
    const monitor = () => {
      frame = 0;
      if (!player.paused && !stopAtEnd()) frame = requestAnimationFrame(monitor);
    };
    const startPlayback = () => {
      const trim = range.current;
      if (trim && (player.currentTime < trim.start - 0.005 || player.currentTime >= trim.end)) {
        cancelLatestVideoFrameRequest(player);
        player.currentTime = trim.start;
      }
      if (!frame) frame = requestAnimationFrame(monitor);
    };
    player.addEventListener("play", startPlayback);
    player.addEventListener("timeupdate", stopAtEnd);
    return () => {
      cancelAnimationFrame(frame);
      cancelLatestVideoFrameRequest(player);
      player.removeEventListener("play", startPlayback);
      player.removeEventListener("timeupdate", stopAtEnd);
      player.pause();
    };
  }, [videoSrc]);
  useEffect(() => {
    if (video.current) video.current.playbackRate = timing?.playbackRate ?? 1;
  }, [timing?.playbackRate, videoSrc]);

  return (
    <dialog ref={dialog} className="visual-replacement-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
      <form onSubmit={(event) => { event.preventDefault(); if (timing) onReplace(asset, timing); }}>
        <header className="replacement-header">
          <div className="replacement-heading">
            <h2 id={titleId}>{copy.title}</h2>
            <p className="replacement-current">
              <span>{copy.current} ·</span>
              <span className="replacement-current-name" title={clip.name}>{clip.name}</span>
              <span>· {seconds.format(clip.duration)}</span>
            </p>
          </div>
          <button className="replacement-close" type="button" aria-label={t("close")} onClick={onClose}><X size={22} /></button>
        </header>
        <div className="replacement-body">
          <ReplacementAssetPicker assets={assets} selected={selected} revealAsset={revealAsset}
            onSelect={changeAsset} onUpload={uploadAsset} copy={copy} shared={shared} t={t} />
          {invalid || asset?.mediaUnavailable ? <p className="replacement-status" role="status">{shared.failed}</p>
            : asset && !assetReady ? <p className="replacement-status" role="status">{shared.reading}</p> : null}
          {assetReady ? (
            <div className="replacement-preview">
              {videoSrc ? <video key={videoSrc} ref={video} src={videoSrc} controls playsInline preload="auto"
                controlsList="nodownload noplaybackrate" onLoadedMetadata={() => previewAt(start)} />
                : <img src={asset.src} alt={asset.name} />}
            </div>
          ) : null}
          {videoSrc ? <ReplacementSourceRange key={selected} start={start} end={end} max={sourceLength} copy={copy}
            equation={equation} valid={Boolean(timing)}
            onChange={(edge, value) => {
              setSourceRange({ start, end, [edge]: value });
              previewAt(value);
            }} /> : assetReady ? <p className="replacement-status">{copy.fixed}</p> : null}
        </div>
        <footer className="replacement-footer">
          <button type="button" onClick={onClose}>{t("cancel")}</button>
          <button className="replacement-confirm" type="submit" disabled={!timing}>{copy.title}</button>
        </footer>
      </form>
    </dialog>
  );
}
