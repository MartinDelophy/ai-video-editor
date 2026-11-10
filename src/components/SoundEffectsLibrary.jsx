import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Plus } from "@phosphor-icons/react";
import { getSoundCategoryLabel, SOUND_EFFECT_CATEGORIES } from "../i18nSoundEffects.js";
import "./SoundEffectsLibrary.css";

const SoundWaveform = memo(function SoundWaveform({ peaks }) {
  return (
    <span className="sound-library-waveform" aria-hidden="true">
      {peaks.map((peak, index) => <i key={index} style={{ "--peak": peak }} />)}
    </span>
  );
});

export function SoundEffectsLibrary({ assets, copy, language, empty, addDisabled, isPlaying, pauseTimeline, onPointerDown, onAdd }) {
  const audition = useRef(null);
  const list = useRef(null);
  const [playingId, setPlayingId] = useState("");
  const [error, setError] = useState(false);
  const [category, setCategory] = useState("all");
  const visible = category === "all" ? assets : assets.filter((asset) => asset.category === category);
  const stop = useCallback(() => {
    if (!audition.current) return;
    const { player, url } = audition.current;
    audition.current = null;
    player.pause();
    if (url) URL.revokeObjectURL(url);
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (audition.current && (isPlaying || !assets.some((asset) => asset.id === audition.current.id && (category === "all" || asset.category === category)))) {
      stop();
      setPlayingId("");
    }
  }, [assets, category, isPlaying, stop]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [assets, category]);

  function toggleAudition(asset) {
    const alreadyPlaying = audition.current?.id === asset.id;
    stop();
    setPlayingId("");
    setError(false);
    if (alreadyPlaying) return;
    if (isPlaying) pauseTimeline();
    const url = asset.blob ? URL.createObjectURL(asset.blob) : "";
    const player = new Audio(url || asset.src);
    player.volume = 0.65;
    audition.current = { player, url, id: asset.id };
    setPlayingId(asset.id);
    const finish = (failed) => {
      if (audition.current?.player !== player) return;
      stop();
      setPlayingId("");
      setError(failed);
    };
    player.onended = () => finish(false);
    player.play().catch(() => finish(true));
  }

  const number = new Intl.NumberFormat(language, { style: "unit", unit: "second", maximumFractionDigits: 2 });
  return (
    <>
      <div className="sound-library-categories" role="group" aria-label={copy.tab}>
        {SOUND_EFFECT_CATEGORIES.map((id) => (
          <button type="button" key={id} aria-pressed={id === category} onClick={() => setCategory(id)}>
            {getSoundCategoryLabel(language, id)}
          </button>
        ))}
      </div>
      <div className="sound-library-hint">{copy.hint}</div>
      {error ? <div role="status" className="sound-library-hint">{copy.unavailable}</div> : null}
      <div className="asset-list sound-library-list" ref={list}>
        {visible.length ? visible.map((asset) => {
          const playing = !isPlaying && playingId === asset.id;
          const auditionLabel = `${playing ? copy.stop : copy.play} · ${asset.name}`;
          const addLabel = `${copy.add} · ${asset.name}`;
          return (
            <div className={`sound-library-row ${playing ? "is-auditioning" : ""}`} key={asset.id}>
              <button type="button" className="sound-library-play" title={auditionLabel} aria-label={auditionLabel} onClick={() => toggleAudition(asset)}>
                {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
              </button>
              <div className="sound-library-drag" onPointerDown={(event) => onPointerDown(event, asset)} title={asset.name}>
                <strong>{asset.name}</strong>
                <small>{asset.categoryLabel} · {number.format(asset.duration)}</small>
                <SoundWaveform peaks={asset.previewPeaks} />
              </div>
              <button type="button" className="sound-library-add" title={addLabel} aria-label={addLabel} disabled={addDisabled} onClick={() => {
                stop();
                setPlayingId("");
                void onAdd(asset);
              }}>
                <Plus size={16} weight="bold" />
              </button>
            </div>
          );
        }) : <div className="empty-state">{empty}</div>}
      </div>
    </>
  );
}
