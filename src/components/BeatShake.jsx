import { normalizeBeatShake } from '../lib/beatShakeEffect.js';
export function BeatShakeInspector({ t, segment, onChange }) {
  if (!segment) return <div className="visual-context-empty"><strong>{t('effectSelectClip')}</strong><span>{t('effectSelectClipHint')}</span></div>;
  const effect = normalizeBeatShake(segment.beatShake);
  const patch = next => onChange(normalizeBeatShake({ ...effect,...next }));
  return <div className="subject-effects-inspector"><section className="click-ripple-controls">
    <header><div><span><strong>{t('shakeTitle')}</strong><small>{t('shakeHint')}</small></span></div><label className="mini-switch"><input aria-label={t('shakeTitle')} type="checkbox" role="switch" checked={effect.enabled} onChange={event=>patch({enabled:event.target.checked})}/><i/></label></header>
    <label className="click-ripple-meter-row"><span>{t('shake_direction')}</span><select aria-label={t('shake_direction')} value={effect.direction} onChange={event=>patch({direction:event.target.value})}>{['zoom','horizontal','vertical','rotation'].map(direction=><option key={direction} value={direction}>{t(`shake_${direction}`)}</option>)}</select></label>
    {[['bpm',40,240,1,'BPM'],['intensity',0,100,1,'%'],['decay',10,90,1,'%'],['offset',0,2,0.01,'s']].map(([key,min,max,step,unit])=><label className="subject-effect-range" key={key}><span>{t(`shake_${key}`)}<output>{effect[key]}{unit}</output></span><input aria-label={t(`shake_${key}`)} type="range" min={min} max={max} step={step} value={effect[key]} onChange={event=>patch({[key]:Number(event.target.value)})}/></label>)}
    <button className="subject-remove-effect" type="button" onClick={()=>patch({enabled:false})}>{t('effectRemove')}</button>
  </section></div>;
}
