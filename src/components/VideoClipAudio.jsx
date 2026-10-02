import { useEffect, useMemo, useRef, useState } from "react";
import { getVideoAudioWaveform } from "../lib/videoAudioWaveform.js";
import { getVisualSourceTime } from "../lib/visualEffects.js";
import { TimelineGain } from "./TimelineGain.jsx";
import "./VideoClipAudio.css";
import { observeViewportCanvas } from "../lib/viewportCanvas.js";

export function VideoClipAudio({ segment, disabled, muted, onChange, t }) {
  const [waveform, setWaveform] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);
  const blob = segment.compatibilityAudioBlob || segment.blob;
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setWaveform(null);
    getVideoAudioWaveform(blob).then((result) => {
      if (!canceled) { setWaveform(result); setLoading(false); }
    });
    return () => { canceled = true; };
  }, [blob]);
  const timing = useMemo(() => ({ duration: segment.duration, sourceStart: segment.sourceStart, sourceDuration: segment.sourceDuration, playbackRate: segment.playbackRate, speedCurve: segment.speedCurve }), [segment.duration, segment.sourceStart, segment.sourceDuration, segment.playbackRate, segment.speedCurve]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return undefined;
    return observeViewportCanvas(canvas, ({ context, width, height, offset, fullWidth }) => {
      context.fillStyle = muted ? "#647a7c" : "#27b6b4";
      const count = Math.min(2048, Math.max(1, Math.floor(width / 3)));
      const gain = muted ? 0 : Math.max(0, Math.min(4, segment.volume ?? 1));
      for (let i = 0; i < count; i += 1) {
        const start = getVisualSourceTime(timing, (offset + i / count * width) / fullWidth * timing.duration);
        const end = getVisualSourceTime(timing, (offset + (i + 1) / count * width) / fullWidth * timing.duration);
        const first = Math.max(0, Math.floor(start / waveform.duration * waveform.peaks.length));
        const last = Math.min(waveform.peaks.length - 1, Math.floor(end / waveform.duration * waveform.peaks.length));
        let peak = 0;
        for (let j = first; j <= last; j += 1) peak = Math.max(peak, waveform.peaks[j]);
        const amplitude = Math.min(1, peak * gain) * (height - 3);
        context.fillStyle = muted ? "#647a7c" : "#27b6b4";
        if (amplitude <= 0) continue;
        const barWidth = Math.max(1, width / count - 1);
        context.save();
        context.beginPath();
        context.roundRect(i * width / count, height - amplitude, barWidth, amplitude, Math.min(barWidth / 2, amplitude / 2));
        context.clip();
        context.fillRect(i * width / count, height - amplitude, barWidth, amplitude);
        if (peak * gain > 1) {
          context.fillStyle = "#ff6355";
          context.fillRect(i * width / count, height - amplitude, barWidth, Math.min(amplitude, Math.max(6, amplitude * 0.28)));
        }
        context.restore();
      }
    });
  }, [waveform, timing, segment.volume, muted]);
  return <div className={`video-clip-audio ${muted ? "is-muted" : ""}`}>
    <canvas ref={canvasRef} aria-hidden="true" />
    {loading || !waveform ? <span className="video-clip-audio-status">{t(loading ? "videoWaveformLoading" : "videoWaveformUnavailable")}</span> : null}
    <TimelineGain volume={segment.volume ?? 1} disabled={disabled || muted} onChange={onChange} t={t} compact />
  </div>;
}
