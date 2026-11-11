import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AUDIO_FADE_FIELDS, formatAudioFadeDuration, getAudioFadeControl } from "../lib/audioFade.js";
import { TimelineGain } from "./TimelineGain.jsx";
import { WaveformStrip } from "./ui.jsx";
import "./TimelineAudioFades.css";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const BASELINE = 91;
const PLATEAU = 29;

function fadeEnvelopeGeometry(fadeIn, fadeOut, clipWidth, volume) {
  const width = clipWidth || 32;
  const edge = Math.min(15, 500 / width);
  const halfGap = Math.min(25, 1100 / width);
  const overlap = Math.max(100, fadeIn + fadeOut);
  const left = clamp(100 * fadeIn / overlap, edge, 100 - edge);
  const right = clamp(100 - 100 * fadeOut / overlap, edge, 100 - edge);
  const center = clamp((left + right) / 2, edge + halfGap, 100 - edge - halfGap);
  const level = Math.sqrt(clamp(volume, 0, 4));
  const gainY = level < 1 ? 82 - (82 - PLATEAU) * level : PLATEAU - 13 * (level - 1);
  // Leave room to grab the gain line even when both fades reach the center.
  return {
    start: Math.min(left, center - halfGap),
    end: Math.max(right, center + halfGap),
    peakY: BASELINE - (BASELINE - gainY) * 100 / overlap,
  };
}

function FadeEnvelope({ fadeIn, fadeOut, start, end, peakY }) {
  const rise = fadeIn > 0
    ? `M 0 ${BASELINE} C ${start / 3} ${BASELINE} ${start * 2 / 3} ${peakY} ${start} ${peakY}`
    : `M 0 ${peakY} H ${start}`;
  const tail = 100 - end;
  const fall = fadeOut > 0
    ? `M ${end} ${peakY} C ${end + tail / 3} ${peakY} ${end + tail * 2 / 3} ${BASELINE} 100 ${BASELINE}`
    : `M ${end} ${peakY} H 100`;
  return (
    <svg className="timeline-audio-fade-envelope" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${rise} ${fall}`} />
    </svg>
  );
}

export function TimelineAudioFades({ segment, selected, disabled, clipWidth, waveformVisible, peaks, sourceStart, sourceDuration, sourceAudioDuration, renderWaveform, volume, t, language, onChange, onChangeVolume }) {
  const pointer = useRef(null);
  const [draft, setDraft] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const editable = !disabled && segment.duration > 0 && (waveformVisible || selected);
  const adjustingFade = Boolean(draft);
  const finish = useCallback(() => {
    const gesture = pointer.current;
    if (!gesture) return null;
    pointer.current = null;
    setDraft(null);
    setTooltip(null);
    if (gesture.target.hasPointerCapture(gesture.id)) gesture.target.releasePointerCapture(gesture.id);
    return gesture;
  }, []);
  useEffect(() => {
    if (!editable) {
      finish();
      return undefined;
    }
    if (!adjustingFade) return undefined;
    const cancelPinch = () => finish();
    window.addEventListener("timeline-mobile-pinch-start", cancelPinch);
    return () => window.removeEventListener("timeline-mobile-pinch-start", cancelPinch);
  }, [editable, adjustingFade, finish]);

  const controls = AUDIO_FADE_FIELDS.map((field) => {
    const control = getAudioFadeControl(segment, field);
    const value = draft?.field === field ? draft.value : control.value;
    return { ...control, field, value, percent: segment.duration > 0 ? (value / segment.duration) * 100 : 0 };
  });
  const [fadeIn, fadeOut] = controls.map((control) => control.percent);
  const geometry = fadeEnvelopeGeometry(fadeIn, fadeOut, clipWidth, volume);
  const { start, end, peakY } = geometry;
  const tooltipControl = tooltip && controls.find(({ field }) => field === tooltip.field);
  const pointX = tooltip && tooltip.left + tooltip.width * (tooltip.field === "fadeIn" ? start : end) / 100;
  const pointY = tooltip && tooltip.top + tooltip.height * peakY / 100;
  const tooltipX = tooltip && clamp(pointX, 76, window.innerWidth - 76);
  const tooltipY = tooltip && Math.max(30, tooltip.top - 9);

  function showTooltip(field, target) {
    const clip = target.closest(".audio-clip, .video-clip-audio").getBoundingClientRect();
    setTooltip({ field, left: clip.left, top: clip.top, width: clip.width, height: clip.height });
  }

  return <>
    {renderWaveform ? renderWaveform(fadeIn / 100, fadeOut / 100) : waveformVisible && (
      <WaveformStrip timeline active peaks={peaks} volume={volume} sourceStart={sourceStart}
        sourceDuration={sourceDuration} sourceAudioDuration={sourceAudioDuration}
        fadeInRatio={fadeIn / 100} fadeOutRatio={fadeOut / 100} />
    )}
    {editable && <>
      <TimelineGain segment={segment} volume={volume} t={t} onChange={onChangeVolume} fadePlateau={geometry} />
      <FadeEnvelope fadeIn={fadeIn} fadeOut={fadeOut} start={start} end={end} peakY={peakY} />
    </>}
    {editable && controls.map(({ field, value, max, digits, step }) => (
      <span
        key={field}
        className={`timeline-audio-fade-handle is-${field === "fadeIn" ? "start" : "end"}${draft?.field === field ? " is-adjusting" : ""}`}
        style={{ left: `${field === "fadeIn" ? start : end}%`, top: `${peakY}%` }}
        role="slider"
        tabIndex={0}
        title=""
        aria-label={t(field)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatAudioFadeDuration(value, digits, language)}
        onPointerEnter={(event) => { if (!pointer.current) showTooltip(field, event.currentTarget); }}
        onPointerLeave={() => { if (!pointer.current) setTooltip(null); }}
        onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) showTooltip(field, event.currentTarget); }}
        onBlur={() => { if (!pointer.current) setTooltip(null); }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.button !== 0 || !event.isPrimary || pointer.current || max <= 0) return;
          const target = event.currentTarget;
          const width = target.closest(".audio-clip, .video-clip-audio").getBoundingClientRect().width;
          if (width <= 0) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
          target.setPointerCapture(event.pointerId);
          pointer.current = {
            id: event.pointerId, target, field, startX: event.clientX,
            original: value, next: value, max, digits,
            secondsPerPixel: (field === "fadeIn" ? 1 : -1) * segment.duration / width,
          };
          setDraft({ field, value });
          showTooltip(field, target);
        }}
        onPointerMove={(event) => {
          const gesture = pointer.current;
          if (gesture?.id !== event.pointerId) return;
          const next = gesture.original + (event.clientX - gesture.startX) * gesture.secondsPerPixel;
          gesture.next = clamp(Number(next.toFixed(gesture.digits)), 0, gesture.max);
          setDraft({ field, value: gesture.next });
          showTooltip(field, event.currentTarget);
        }}
        onPointerUp={(event) => {
          if (pointer.current?.id !== event.pointerId) return;
          const gesture = finish();
          if (gesture.next !== gesture.original) onChange(gesture.field, gesture.next);
        }}
        onPointerCancel={(event) => { if (pointer.current?.id === event.pointerId) finish(); }}
        onLostPointerCapture={(event) => { if (pointer.current?.id === event.pointerId) finish(); }}
        onKeyDown={(event) => {
          const { key } = event;
          if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(key)) return;
          if (key === "Escape" && !pointer.current) return;
          event.stopPropagation();
          event.preventDefault();
          if (key === "Escape") {
            finish();
            return;
          }
          if (pointer.current) return;
          const increment = step * (event.shiftKey ? 10 : 1);
          const direction = key === "ArrowUp" || key === "ArrowRight" ? 1 : -1;
          const next = key === "Home" ? 0 : key === "End" ? max : clamp(Number((value + direction * increment).toFixed(digits)), 0, max);
          if (next !== value) onChange(field, next);
          showTooltip(field, event.currentTarget);
        }}
      />
    ))}
    {editable && tooltipControl && createPortal(
      <div className="timeline-audio-fade-tooltip" aria-hidden="true" style={{
        left: tooltipX,
        top: tooltipY,
        "--fade-leader-offset": `${pointX - tooltipX}px`,
        "--fade-leader-height": `${Math.max(0, pointY - tooltipY - 4)}px`,
      }}>
        <span>{t(tooltipControl.field)}</span>
        <strong>{formatAudioFadeDuration(tooltipControl.value, tooltipControl.digits, language)}</strong>
      </div>,
      document.body,
    )}
  </>;
}
