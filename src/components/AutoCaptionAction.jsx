import { ClosedCaptioning, SpinnerGap } from '@phosphor-icons/react';
import { isAnnaEdition } from '../lib/annaRuntime.js';
import { getAnnaCaptionServiceCopy, getCaptionJobCopy } from '../i18nAnnaTranscription.js';

export function AutoCaptionAction({ language, t, available, running, progress, onStart, onCancel }) {
  const copy = getCaptionJobCopy(language);
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  if (!running) return <button className="audio-entry-card caption-entry-card" type="button" disabled={!available} onClick={onStart}>
    <ClosedCaptioning size={24} weight="duotone" />
    <span><strong>{t('autoCaptionsTitle')}</strong><em>{available ? isAnnaEdition ? getAnnaCaptionServiceCopy(language) : t('autoCaptionsDesc') : t('autoCaptionsNeedsSource')}</em></span>
  </button>;
  return <section className="caption-recognition-job" aria-busy="true" aria-label={t('autoCaptionsRunning')}>
    <div className="caption-job-header"><SpinnerGap size={20} className="caption-job-spinner" /><strong>{copy[0]}</strong><output>{percent}%</output></div>
    <div className="caption-job-progress" role="progressbar" aria-label={t('autoCaptionsRunning')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:`${percent}%`}} /></div>
    <div className="caption-job-footer"><span role="status">{percent < 5 ? copy[1] : percent >= 95 ? copy[2] : isAnnaEdition ? 'Anna ASR' : copy[0]}</span><button type="button" onClick={onCancel}>{copy[3]}</button></div>
  </section>;
}
