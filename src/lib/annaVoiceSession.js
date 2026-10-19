import { connectAnna } from './annaRuntime.js';

/** Host-owned realtime ASR/TTS, with a serial, half-duplex editor turn. */
export async function openAnnaVoiceSession({ language, signal, onPartial, onFinal, onSpeaking, onEnded, onError, onLevel, connect = connectAnna }) {
  const runtime = await connect({ signal });
  let session, closed = false, blocked = true, muted = false, ttsFinished = false;
  const check = () => { if (closed || signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const player = runtime.audio.player({ sampleRate: 24000 });
  const mic = runtime.audio.mic({ sampleRate: 16000, onChunk: (pcm, samples) => {
    if (!closed && !blocked && !muted) {
      if (samples?.length) { let energy=0; for(let i=0;i<samples.length;i++) energy+=samples[i]*samples[i]; onLevel?.(Math.min(1,Math.sqrt(energy/samples.length)*8)); }
      session?.sendAudio(pcm);
    }
  }, onError: error => { close(); onError(error); } });
  const subscriptions = [];
  const close = () => {
    if (closed) return;
    closed = true;
    mic.stop(); player.destroy(); onLevel?.(0);
    subscriptions.forEach(unsubscribe => unsubscribe?.());
    signal?.removeEventListener('abort', close);
    session?.end().catch(() => {});
  };
  signal?.addEventListener('abort', close, { once: true });
  const listen = () => { if (closed) return; blocked = false; mic.setMuted(muted); onSpeaking(false); };
  player.onPlaybackEnd = () => { if (ttsFinished) listen(); };
  try {
    check();
    mic.setMuted(true);
    await mic.start();
    if (closed || signal?.aborted) { mic.stop(); throw new DOMException('Cancelled', 'AbortError'); }
    session = await runtime.audio.session({ llm: 'none', language, maxDurationSec: 600 });
    if (closed || signal?.aborted) { await session.end().catch(() => {}); throw new DOMException('Cancelled', 'AbortError'); }
    player.configure(session.audioConfig);
    const on = (name, fn) => subscriptions.push(session.on(name, event => { if (!closed) fn(event); }));
    on('asr_partial', event => { if (!blocked && !muted) onPartial(event.text || ''); });
    on('asr_final', event => {
      const text = (event.text || '').trim();
      if (!blocked && !muted && text) { blocked = true; mic.setMuted(true); onFinal(text); }
    });
    on('tts_audio', event => {
      player.enqueue(event.audio);
      if (session.audioConfig?.format === 'pcm' && event.audio) {
        const bytes=atob(event.audio); let energy=0,count=0;
        for(let i=0;i+1<bytes.length;i+=16) { const raw=bytes.charCodeAt(i)|(bytes.charCodeAt(i+1)<<8); const sample=(raw>32767?raw-65536:raw)/32768; energy+=sample*sample;count++; }
        onLevel?.(Math.min(1,Math.sqrt(energy/Math.max(1,count))*8));
      }
    });
    on('tts_done', () => { ttsFinished = true; player.flush(); if (!player.isPlaying) listen(); });
    on('interrupted', () => { player.stop(); listen(); });
    on('asr_paused', () => { if (!blocked) listen(); });
    on('ended', () => { close(); onEnded(); });
    on('error', event => { close(); onError(event); });
    listen();
    return {
      close, models: session.models,
      setMuted(value) { muted = value; mic.setMuted(blocked || muted); },
      async interrupt() { player.stop(); await session.interrupt(); listen(); },
      resume: listen,
      async say(text) {
        check(); blocked = true; ttsFinished = false; mic.setMuted(true); onSpeaking(true);
        try { await session.say(String(text).slice(0, 1000)); } catch (error) { listen(); throw error; }
      },
      setContext(text) { return session.setContext(String(text).slice(0, 4000)); },
    };
  } catch (error) { close(); throw error; }
}
