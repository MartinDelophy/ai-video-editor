import { useEffect, useRef } from "react";
import {
  buildDuckingEnvelope,
  clearDucking,
  normalizeAutoDuck,
  publishDucking,
  speechIntervals,
} from "../lib/audioDucking.js";
import { analyzeVideoPauses, createVideoPauseWorker } from "../lib/sileroVad.js";
const blobIds = new WeakMap();
let serial = 0;
function blobKey(blob) {
  if (!blob || typeof blob !== "object") return "";
  if (!blobIds.has(blob)) blobIds.set(blob, ++serial);
  return blobIds.get(blob);
}
export function useAudioDucking(clips, language) {
  const latest = useRef(clips);
  latest.current = clips;
  const cache = useRef(new Map());
  const workerRef = useRef(null);
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );
  const signature = JSON.stringify(
    clips.map((c) => [
      c.id,
      blobKey(c.blob),
      c.start,
      c.duration,
      c.sourceStart,
      c.sourceDuration,
      c.playbackRate,
      c.speedCurve,
      c.muted,
      c.volume,
      c.detectSpeech,
      c.autoDuck,
      c.reverse,
      c.reversed,
    ]),
  );
  useEffect(() => {
    const controller = new AbortController(),
      snapshot = latest.current;
    let running = false;
    const targets = snapshot.filter((c) => normalizeAutoDuck(c.autoDuck).enabled);
    clearDucking();
    if (!targets.length) return () => controller.abort();
    const update = (entry) => targets.forEach((c) => publishDucking(c.id, entry));
    update({ status: "analyzing", progress: 0 });
    (async () => {
      const sources = snapshot.filter(
        (c) =>
          c.detectSpeech &&
          !c.muted &&
          Number(c.volume ?? 1) > 0 &&
          c.blob instanceof Blob &&
          targets.some(
            (target) =>
              target.id !== c.id &&
              target.start < c.start + c.duration + 0.9 &&
              target.start + target.duration > c.start - 0.08,
          ),
      );
      const detected = [];
      for (let i = 0; i < sources.length; i++) {
        controller.signal.throwIfAborted();
        const clip = sources[i];
        if (clip.reverse || clip.reversed) throw new Error("Reversed speech unsupported");
        const key = JSON.stringify([
          blobKey(clip.blob),
          Number(clip.sourceStart) || 0,
          clip.sourceDuration || clip.duration * (clip.playbackRate || 1),
        ]);
        let probabilities = cache.current.get(key);
        if (!probabilities) {
          workerRef.current ??= createVideoPauseWorker();
          running = true;
          try {
            probabilities = await analyzeVideoPauses(
              {
                ...clip,
                duration:
                  (clip.sourceDuration || clip.duration * (clip.playbackRate || 1)) /
                  (clip.playbackRate || 1),
              },
              {
                language,
                worker: workerRef.current,
                signal: controller.signal,
                onProgress: (value, phase) => {
                  if (!controller.signal.aborted)
                    update({
                      status: "analyzing",
                      phase,
                      progress: Math.round(((i + value) / Math.max(1, sources.length)) * 100),
                    });
                },
              },
            );
          } catch (error) {
            if (error.code === "pauseNoAudio") probabilities = new Float32Array();
            else throw error;
          } finally {
            running = false;
          }
          if (cache.current.size >= 24) cache.current.delete(cache.current.keys().next().value);
          cache.current.set(key, probabilities);
        }
        detected.push({ id: clip.id, intervals: speechIntervals(probabilities, clip) });
      }
      controller.signal.throwIfAborted();
      for (const target of targets)
        publishDucking(target.id, {
          status: "ready",
          progress: 100,
          points: buildDuckingEnvelope(
            detected
              .filter((source) => source.id !== target.id)
              .flatMap((source) => source.intervals),
            target,
          ),
        });
    })().catch((error) => {
      if (!controller.signal.aborted)
        update({ status: "error", progress: 0, code: error.code || "analysis" });
    });
    return () => {
      if (running) {
        workerRef.current?.terminate();
        workerRef.current = null;
      }
      controller.abort();
      clearDucking();
    };
  }, [signature, language]);
}
