import { useEffect, useRef } from 'react';
import { drawDriftingHalo, normalizeDriftingHalo } from '../lib/driftingHaloEffect.js';

export function DriftingHaloOverlay({ effect, time }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const paint = () => {
      const box = { width: canvas.clientWidth, height: canvas.clientHeight };
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.round(box.width * scale);
      canvas.height = Math.round(box.height * scale);
      drawDriftingHalo(canvas.getContext('2d'), canvas.width, canvas.height, effect, time);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [effect, time]);
  if (!effect?.enabled) return null;
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

export function DriftingHaloInspector({ t, segment, onChange }) {
  if (!segment) return <div className="visual-context-empty"><strong>{t('effectSelectClip')}</strong><span>{t('effectSelectClipHint')}</span></div>;
  const effect = normalizeDriftingHalo(segment.driftingHalo);
  const patch = (next) => onChange(normalizeDriftingHalo({ ...effect, ...next }));
  return <div className="subject-effects-inspector"><section className="click-ripple-controls">
    <header><div><span><strong>{t('haloTitle')}</strong><small>{t('haloHint')}</small></span></div><label className="mini-switch"><input aria-label={t('haloTitle')} type="checkbox" checked={effect.enabled} onChange={event => patch({ enabled: event.target.checked })} /><i /></label></header>
    {[
      ['size', 5, 60, 1, '%'], ['duration', 1, 20, 0.1, 's'], ['speed', -360, 360, 5, '°/s'],
      ['height', 0, 100, 1, '%'], ['tilt', 0, 75, 1, '°'], ['glow', 0, 1, 0.01, '%'],
    ].map(([key, min, max, step, unit]) => <label className="subject-effect-range" key={key}><span>{t(`halo_${key}`)}<output>{key === 'glow' ? Math.round(effect[key] * 100) : effect[key]}{unit}</output></span><input aria-label={t(`halo_${key}`)} type="range" min={min} max={max} step={step} value={effect[key]} onChange={event => patch({ [key]: Number(event.target.value) })} /></label>)}
    <label className="click-ripple-color-row"><span>{t('halo_color')}</span><input aria-label={t('halo_color')} type="color" value={effect.color} onChange={event => patch({ color: event.target.value })} /></label>
    <button className="subject-remove-effect" type="button" onClick={() => patch({ enabled: false })}>{t('effectRemove')}</button>
  </section></div>;
}
