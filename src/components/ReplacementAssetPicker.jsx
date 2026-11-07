import { useEffect, useId, useRef, useState } from "react";
import { Check, FilmStrip, ImageSquare, UploadSimple } from "@phosphor-icons/react";
import { formatClock } from "../lib/timeline.js";

function AssetCard({ asset, name, selected, onSelect, t }) {
  const video = asset.type === "video";
  const frame = asset.trackFrames?.[0];
  const thumbnail = video ? asset.thumbnail || (typeof frame === "string" ? frame : frame?.src) : asset.src;
  const [failedThumbnail, setFailedThumbnail] = useState("");
  const [visible, setVisible] = useState(false);
  const card = useRef(null);

  useEffect(() => {
    // Most assets have a cached thumbnail. Only ask the decoder for a
    // fallback when a video card without one comes into the viewport.
    if (!video || (thumbnail && thumbnail !== failedThumbnail)) return;
    if (typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: card.current.parentElement,
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [failedThumbnail, thumbnail, video]);

  return (
    <button ref={card} className="replacement-asset-card" type="button" title={name}
      aria-pressed={selected} onClick={onSelect}>
      <span className="replacement-asset-thumbnail">
        {thumbnail && thumbnail !== failedThumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" draggable={false}
            onError={() => setFailedThumbnail(thumbnail)} />
        ) : video && visible && asset.src && failedThumbnail !== asset.src ? (
          <video src={asset.src} preload="metadata" muted playsInline aria-hidden="true"
            onError={() => setFailedThumbnail(asset.src)} />
        ) : video ? <FilmStrip size={26} aria-hidden="true" /> : <ImageSquare size={26} aria-hidden="true" />}
        <span className="replacement-asset-badge">
          {video ? formatClock(asset.duration) : <ImageSquare size={16} aria-label={t("assetImage")} />}
        </span>
        {selected ? <span className="replacement-asset-selected" aria-hidden="true"><Check size={15} weight="bold" /></span> : null}
      </span>
      <span className="replacement-asset-name">{name}</span>
    </button>
  );
}

export function ReplacementAssetPicker({ assets, selected, revealAsset, onSelect, onUpload, copy, shared, t }) {
  const headingId = useId();
  const galleryId = useId();
  const gallery = useRef(null);
  const drag = useRef(null);
  const [scroll, setScroll] = useState({ left: 0, max: 0, visibleFraction: 1 });

  const syncScroll = () => {
    const element = gallery.current;
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    const left = Math.min(max, Math.max(0, element.scrollLeft));
    const visibleFraction = element.scrollWidth ? element.clientWidth / element.scrollWidth : 1;
    setScroll((previous) => previous.left === left && previous.max === max && previous.visibleFraction === visibleFraction
      ? previous : { left, max, visibleFraction });
  };

  useEffect(() => {
    const element = gallery.current;
    syncScroll();
    const observer = new ResizeObserver(syncScroll);
    observer.observe(element);
    const wheel = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const before = element.scrollLeft;
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
      element.scrollLeft += event.deltaY * multiplier;
      // At either end let a vertical wheel gesture continue through the dialog.
      if (element.scrollLeft !== before) event.preventDefault();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, [assets.length]);

  useEffect(() => {
    if (!revealAsset) return;
    const element = gallery.current;
    const index = assets.findIndex((asset) => asset.id === revealAsset);
    const target = element.children[index];
    if (target) {
      const left = target.getBoundingClientRect().left - element.getBoundingClientRect().left;
      if (left < 0) element.scrollLeft += left;
      else if (left + target.offsetWidth > element.clientWidth) {
        element.scrollLeft += left + target.offsetWidth - element.clientWidth;
      }
    }
  }, [revealAsset, assets]);

  const thumbSize = Math.max(0.08, scroll.visibleFraction);
  const thumbOffset = scroll.max ? scroll.left / scroll.max * (1 - thumbSize) : 0;
  const scrollFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const travel = rect.width * (1 - thumbSize);
    if (travel > 0) gallery.current.scrollLeft = (event.clientX - rect.left - drag.current.offset) / travel * scroll.max;
  };

  return (
    <section className="replacement-source-picker" aria-labelledby={headingId}>
      <div className="replacement-source-heading">
        <h3 id={headingId}>{shared.choose}</h3>
        <label className="replacement-upload">
          <UploadSimple size={18} /><span>{copy.upload}</span>
          <input type="file" aria-label={copy.upload} accept="image/*,video/*,.mkv,.mov"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }} />
        </label>
      </div>
      <div className="replacement-asset-strip" id={galleryId} ref={gallery} onScroll={syncScroll}>
        {assets.map((asset) => (
          <AssetCard asset={asset} name={asset.nameKey ? t(asset.nameKey, asset.name) : asset.name} key={asset.id}
            selected={asset.id === selected} onSelect={() => onSelect(asset.id)} t={t} />
        ))}
      </div>
      {assets.length === 0 ? <p className="replacement-status">{copy.empty}</p> : null}
      {assets.length > 4 && scroll.max > 0 ? (
        <div className="replacement-scrollbar" role="scrollbar" aria-label={copy.scroll} aria-controls={galleryId}
          aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(scroll.left / scroll.max * 100)} tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const thumbLeft = rect.left + thumbOffset * rect.width;
            const width = thumbSize * rect.width;
            const onThumb = event.clientX >= thumbLeft && event.clientX <= thumbLeft + width;
            drag.current = { id: event.pointerId, offset: onThumb ? event.clientX - thumbLeft : width / 2 };
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!onThumb) scrollFromPointer(event);
          }}
          onPointerMove={(event) => { if (drag.current?.id === event.pointerId) scrollFromPointer(event); }}
          onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={(event) => {
            const element = gallery.current;
            const step = element.clientWidth / (window.matchMedia("(max-width: 580px)").matches ? 2 : 4);
            const targets = {
              ArrowLeft: element.scrollLeft - step, ArrowRight: element.scrollLeft + step,
              PageUp: element.scrollLeft - element.clientWidth, PageDown: element.scrollLeft + element.clientWidth,
              Home: 0, End: scroll.max,
            };
            if (!(event.key in targets)) return;
            event.preventDefault();
            element.scrollLeft = targets[event.key];
          }}>
          <span className="replacement-scrollbar-rail" aria-hidden="true" />
          <span className="replacement-scrollbar-thumb" aria-hidden="true"
            style={{ width: `${thumbSize * 100}%`, left: `${thumbOffset * 100}%` }} />
        </div>
      ) : null}
    </section>
  );
}
