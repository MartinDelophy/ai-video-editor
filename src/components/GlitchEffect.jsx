import { useLayoutEffect, useId, useRef } from 'react';
import { normalizeGlitch, updateGlitchFilter } from '../lib/glitchEffect.js';
export function GlitchPreview({ effect, time, targetRef }) {
  const marker = useRef(null);
  const id = `glitch-preview-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useLayoutEffect(() => {
    const target = targetRef ? targetRef.current?.parentElement : marker.current?.parentElement;
    if (!target) return undefined;
    const paint = () => { target.style.filter = updateGlitchFilter(id, effect, time, target.clientWidth, target.clientHeight); };
    paint();
    const observer = new ResizeObserver(paint); observer.observe(target);
    return () => { observer.disconnect(); target.style.filter = ''; document.getElementById(id)?.remove(); };
  }, [id, effect, time, targetRef]);
  return <span ref={marker} style={{ display: "none" }} aria-hidden="true"/>;
}
export function GlitchInspector({ t, segment, onChange }) {
  if (!segment) return <div className="visual-context-empty"><strong>{t('effectSelectClip')}</strong><span>{t('effectSelectClipHint')}</span></div>;
  const effect = normalizeGlitch(segment.glitch);
  const patch = next => onChange(normalizeGlitch({ ...effect, ...next }));
  return <div className="subject-effects-inspector"><section className="click-ripple-controls">
    <header><div><span><strong>{t('glitchTitle')}</strong><small>{t('glitchHint')}</small></span></div><label className="mini-switch"><input aria-label={t('glitchTitle')} type="checkbox" role="switch" checked={effect.enabled} onChange={event => patch({ enabled: event.target.checked })}/><i/></label></header>
    {[['intensity',0,100,1,'%'],['separation',0,100,1,'%'],['frequency',0.2,3,0.1,'Hz'],['duration',0.05,Math.min(0.8,0.8/effect.frequency),0.01,'s'],['scanlines',0,100,1,'%']].map(([key,min,max,step,unit]) => <label className="subject-effect-range" key={key}><span>{t(`glitch_${key}`)}<output>{Number(effect[key].toFixed(2))}{unit}</output></span><input aria-label={t(`glitch_${key}`)} type="range" min={min} max={max} step={step} value={effect[key]} onChange={event => patch({ [key]: Number(event.target.value) })}/></label>)}
    <button className="subject-remove-effect" type="button" onClick={() => patch({ enabled:false })}>{t('effectRemove')}</button>
  </section></div>;
}
