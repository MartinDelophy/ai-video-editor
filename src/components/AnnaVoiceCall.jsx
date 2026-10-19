import { runVoiceFastAction } from '../lib/annaVoiceFastActions.js';
import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneDisconnect, Microphone, MicrophoneSlash, Stop } from '@phosphor-icons/react';
import { getVoiceCallCopy, getVoiceFastReplyCopy } from '../i18nAnnaVoiceCall.js';
import { openAnnaVoiceSession } from '../lib/annaVoiceSession.js';
import { runAnnaChatCut } from '../lib/annaChatCut.js';

const GENERATION = new Set(['timeline_ai_process', 'timeline_image_generate', 'timeline_video_generate', 'timeline_animation_generate']);
export function AnnaVoiceCall({ language, projectId, editor, inspectMedia }) {
  const copy = getVoiceCallCopy(language);
  const [state, setState] = useState('idle');
  const [levels, setLevels] = useState(() => Array(17).fill(0));
  const [muted, setMuted] = useState(false), [partial, setPartial] = useState('');
  const [messages, setMessages] = useState([]), [pending, setPending] = useState('');
  const session = useRef(null), lifetime = useRef(null), turn = useRef(null), history = useRef([]);
  const live = useRef({ editor, inspectMedia, language, copy });
  live.current = { editor, inspectMedia, language, copy };
  const end = () => {
    lifetime.current?.abort(); lifetime.current = null;
    turn.current?.abort(); turn.current = null;
    session.current?.close(); session.current = null;
  };
  useEffect(() => { setState('idle'); setPending(''); setPartial(''); return () => end(); }, [language, projectId]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { end(); setState('idle'); setPending(''); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const run = async (instruction, confirmed = false) => {
    if (!session.current || turn.current) return;
    const controller = new AbortController(); turn.current = controller;
    setPartial(''); setPending(''); setLevels(Array(17).fill(0)); setState('working');
    const current = live.current;
    const user = { role: 'user', text: instruction };
    if (!confirmed) setMessages(items => [...items.slice(-7), user]);
    try {
      const fast = confirmed ? null : await runVoiceFastAction({instruction,editor:current.editor,copy:{...getVoiceFastReplyCopy(current.language),done:current.copy.done},signal:controller.signal});
      const result = fast || await runAnnaChatCut({ instruction, history: history.current, voice: true,
        tools: current.editor.tools(), language: current.language, signal: controller.signal,
        inspectMedia: current.inspectMedia, autoApply: true,
        execute: (name, input, options) => {
          if (!confirmed && GENERATION.has(name)) { const error = new Error('Confirmation required'); error.code = 'VOICE_CONFIRM'; throw error; }
          return live.current.editor.execute(name, input, options);
        }, onAssets: ids => current.editor.commitAiAssets?.(ids),
      });
      if (controller.signal.aborted) return;
      if (result.review) current.editor.showReview(result.review);
      const text = result.review?.status === 'pending' ? [result.text, current.copy.review].filter(Boolean).join(' ') : result.text || current.copy.done;
      const assistant = { role: 'assistant', text, edit: result.review };
      history.current = [...history.current.slice(-6), user, assistant];
      setMessages(items => [...items.slice(-7), assistant]);
      await session.current?.say(text);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.code === 'VOICE_CONFIRM') { setPending(instruction); setState('pending'); }
      else { setState('error'); setMessages(items => [...items.slice(-7), { role: 'assistant', text: current.copy.error }]); }
      session.current?.resume();
    } finally { if (turn.current === controller) turn.current = null; }
  };
  const runRef = useRef(run); runRef.current = run;
  const start = async () => {
    end(); setLevels(Array(17).fill(0)); setMuted(false); setPartial(''); setPending(''); setState('connecting');
    history.current = []; setMessages([]);
    const controller = new AbortController(); lifetime.current = controller;
    try {
      const handle = await openAnnaVoiceSession({ language, signal: controller.signal,
        onLevel: level => { if (!controller.signal.aborted) setLevels(items=>[...items.slice(1),level]); },
        onPartial: setPartial, onFinal: text => runRef.current(text),
        onSpeaking: speaking => { if (!controller.signal.aborted) setState(previous => speaking ? 'speaking' : ['pending', 'error'].includes(previous) ? previous : 'listening'); },
        onEnded: () => { end(); setState('idle'); },
        onError: () => { end(); setState('error'); },
      });
      if (controller.signal.aborted) { handle.close(); return; }
      session.current = handle; setState('listening');
    } catch { if (!controller.signal.aborted) { end(); setState('error'); } }
  };
  const connected = Boolean(session.current);
  const active = state !== 'idle';
  const status = muted && connected ? copy.muted : copy[state] || copy.start;
  const caption = state === 'error' ? copy.error : pending ? copy.confirmHint : partial || messages.at(-1)?.text || ''; 
  return <div className={`anna-voice-call ${active ? 'is-expanded' : ''}`}>
    {!active ? <button type="button" className="anna-call-trigger" aria-label={copy.title} title={copy.title} onClick={start}><Phone size={20} /></button> : <section className={`anna-call-inline is-${state} ${muted ? 'is-muted' : ''}`} aria-label={copy.title}>
      <div className="anna-call-wave" aria-hidden="true">{levels.map((level,index)=><span key={index} style={{height: `${3 + (muted ? 0 : level) * 21}px`}} />)}</div>
      <div className="anna-call-inline-copy" role="status" aria-live="polite"><span>{status}</span>{caption && <p title={caption}>{caption}</p>}</div>
      {pending && <button className="anna-call-inline-confirm" type="button" onClick={() => run(pending,true)}>{copy.confirm}</button>}
      {connected && <>
        <button type="button" aria-label={muted ? copy.unmute : copy.mute} title={muted ? copy.unmute : copy.mute} aria-pressed={muted} onClick={() => { session.current?.setMuted(!muted); setMuted(!muted); setLevels(Array(17).fill(0)); }}>{muted ? <MicrophoneSlash size={17}/> : <Microphone size={17}/>}</button>
        <button type="button" aria-label={copy.interrupt} title={copy.interrupt} disabled={state !== 'working' && state !== 'speaking' && !pending} onClick={() => { turn.current?.abort(); turn.current=null; setPending(''); setLevels(Array(17).fill(0)); session.current?.interrupt().catch(() => { end(); setState('error'); }); }}><Stop size={16}/></button>
      </>}
      {!connected && state === 'error' && <button type="button" aria-label={copy.start} title={copy.start} onClick={start}><Phone size={17}/></button>}
      <button className="anna-call-hangup" type="button" aria-label={copy.end} title={copy.end} onClick={() => { end(); setState('idle'); setPending(''); setPartial(''); setLevels(Array(17).fill(0)); }}><PhoneDisconnect size={18}/></button>
    </section>}
  </div>;
}
