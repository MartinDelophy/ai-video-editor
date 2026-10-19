import { useEffect, useRef, useState } from 'react';
import { CircleNotch, CheckCircle, WarningCircle, Play, Stop } from '@phosphor-icons/react';
import { audioProcessingIdentity, audioProcessingResultPatch, audioProcessingRestorePatch, processAudioClip, speechEnhancementSettings } from '../lib/audioProcessing.js';
import { getSpeechEnhancementCopy } from '../i18nSpeechEnhancement.js';
import { getAudioProcessingCopy } from '../i18nAudioProcessing.js';
import { getDuckingCopy } from '../i18nAudioDucking.js';

export function SpeechEnhancementControls({segment,language,disabled,updateAudioSegment,registerUrl}) {
  const copy=getSpeechEnhancementCopy(language), processing=getAudioProcessingCopy(language), common=getDuckingCopy(language);
  const applied=Boolean(segment.audioProcessing?.speechEnhancement && segment.processingOriginalBlob instanceof Blob);
  const [strength,setStrength]=useState(segment.audioProcessing?.speechEnhancement || 'natural');
  const [job,setJob]=useState(null),[error,setError]=useState(false),[playing,setPlaying]=useState('');
  const controller=useRef(null),latest=useRef({segment,disabled}),player=useRef(null),auditionUrl=useRef('');
  latest.current={segment,disabled};
  const stop=()=>{player.current?.pause();player.current=null;if(auditionUrl.current)URL.revokeObjectURL(auditionUrl.current);auditionUrl.current='';setPlaying('');};
  useEffect(()=>()=>{controller.current?.abort();player.current?.pause();if(auditionUrl.current)URL.revokeObjectURL(auditionUrl.current);},[]);
  const identity=audioProcessingIdentity(segment);
  useEffect(()=>{controller.current?.abort();controller.current=null;stop();setJob(null);setError(false);setStrength(segment.audioProcessing?.speechEnhancement || 'natural');},[segment.id,identity,segment.blob]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(disabled){controller.current?.abort();stop();}},[disabled]);
  const run=async(nextStrength=strength)=>{
    if(disabled || controller.current)return;
    stop();setError(false);
    const abort=new AbortController(),snapshot=segment,expected=audioProcessingIdentity(snapshot);
    controller.current=abort;setJob({phase:'decode',progress:0});setStrength(nextStrength);
    try {
      const result=await processAudioClip(snapshot,speechEnhancementSettings(nextStrength),{language,signal:abort.signal,onProgress:value=>{if(!abort.signal.aborted)setJob(value);}});
      if(abort.signal.aborted || latest.current.disabled || latest.current.segment.blob!==snapshot.blob || audioProcessingIdentity(latest.current.segment)!==expected)return;
      const url=URL.createObjectURL(result.blob);
      const committed=updateAudioSegment(snapshot.id,audioProcessingResultPatch(snapshot,result,url));
      if(committed===false){URL.revokeObjectURL(url);throw new Error('COMMIT_FAILED');}
      registerUrl?.(url);
    } catch(err){if(!abort.signal.aborted && err.name!=='AbortError')setError(true);}
    finally{if(controller.current===abort){controller.current=null;setJob(null);}}
  };
  const restore=()=>{
    controller.current?.abort();controller.current=null;setJob(null);setError(false);stop();
    if(!applied || disabled)return;
    const url=URL.createObjectURL(segment.processingOriginalBlob);
    if(updateAudioSegment(segment.id,audioProcessingRestorePatch(segment,url))===false){URL.revokeObjectURL(url);return;}
    registerUrl?.(url);
  };
  const audition=async(kind)=>{
    if(playing===kind){stop();return;}
    stop();const original=kind==='original';
    const blob=original?segment.processingOriginalBlob:segment.blob;
    if(!(blob instanceof Blob))return;
    const url=URL.createObjectURL(blob),audio=new Audio(url);auditionUrl.current=url;player.current=audio;
    const start=(segment.sourceStart||0)+(original?(segment.processingOriginal?.sourceStart||0):0);
    const end=start+(segment.sourceDuration || segment.duration*(segment.playbackRate||1));
    audio.volume=Math.min(1,segment.volume??1);audio.playbackRate=segment.playbackRate||1;
    audio.onloadedmetadata=()=>{audio.currentTime=start;};
    audio.ontimeupdate=()=>{if(audio.currentTime>=end)stop();};audio.onended=stop;
    audio.onerror=()=>{stop();setError(true);};
    setPlaying(kind);try{await audio.play();}catch{if(player.current===audio){stop();setError(true);}}
  };
  if(!['source','audio'].includes(segment.track)||segment.embeddedVideo||!(segment.blob instanceof Blob))return null;
  const busy=Boolean(job),progress=Math.round(Math.max(0,Math.min(1,job?.progress||0))*100);
  const phase={download:processing.download,decode:processing.decode,denoise:copy.processing,enhance:copy.processing,encode:processing.encode};
  return <section className="audio-ducking-controls speech-enhancement-controls">
    <label className="audio-ducking-toggle"><b>{copy.title}</b><input role="switch" type="checkbox" checked={applied||busy} disabled={disabled} onChange={event=>event.target.checked?void run():restore()}/></label>
    <p>{copy.hint}</p>
    {segment.track==='source'?<p>{processing.sourceRoute}</p>:null}
    <label className="audio-property-row"><span>{common.strength}</span><select value={strength} disabled={disabled||busy} onChange={event=>{const value=event.target.value;setStrength(value);if(applied)void run(value);}}>{['gentle','natural','strong'].map(key=><option key={key} value={key}>{common[key]}</option>)}</select></label>
    {busy||applied||error?<div className={`audio-ducking-status ${error?'is-error':''}`} role="status" aria-live="polite" aria-busy={busy}>
      {busy?<CircleNotch className="spin" size={18}/>:error?<WarningCircle size={18}/>:<CheckCircle size={18}/>}
      <span>{busy?(phase[job.phase]||copy.processing):error?copy.error:copy.ready}</span>{busy&&progress>0?<b>{progress}%</b>:null}
      {busy?<div className={`audio-ducking-progress ${progress===0?'is-indeterminate':''}`} role="progressbar" aria-label={phase[job.phase]||copy.processing} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress>0?progress:undefined}><i style={{width:progress>0?`${progress}%`:'30%'}}/></div>:null}
    </div>:null}
    {applied&&!busy?<div className="speech-enhancement-compare">{['original','enhanced'].map(kind=><button className="panel-secondary" type="button" aria-pressed={playing===kind} disabled={disabled} key={kind} onClick={()=>void audition(kind)}>{playing===kind?<Stop size={14}/>:<Play size={14}/>}<span>{playing===kind?copy.playing:copy[kind]}</span></button>)}</div>:null}
    {error&&!busy?<button className="panel-secondary" disabled={disabled} type="button" onClick={()=>void run()}>{copy.retry}</button>:null}
  </section>;
}
