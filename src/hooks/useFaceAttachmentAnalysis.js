import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFaceAttachment,
  faceAnalysisKey,
  isFaceEffect,
  invalidateFaceAttachmentAnalysis,
} from "../lib/faceAttachmentAnalysis.js";

export function useFaceAttachmentAnalysis({ clips, segments, setClips, currentTime = 0 }) {
  const [jobs, setJobs] = useState({}),
    [retryVersion, retry] = useState(0);
  const [previews, setPreviews] = useState({});
  const running = useRef(new Map()),
    failed = useRef(new Map()),
    latest = useRef({ clips, segments });
  latest.current = { clips, segments, currentTime };
  useEffect(() => {
    const desired = new Map(
      clips
        .filter(isFaceEffect)
        .map((clip) => [clip.id, { clip, key: faceAnalysisKey(clip, segments) }]),
    );
    for (const [id, job] of running.current)
      if (desired.get(id)?.key !== job.key) {
        job.controller.abort();
        running.current.delete(id);
      }
    for (const [id, { clip, key }] of desired) {
      if (
        (clip.faceAnalysis?.key === key && clip.faceAnalysis.complete) ||
        running.current.has(id) ||
        failed.current.get(id) === key ||
        !segments.some((segment) => segment.src)
      )
        continue;
      const controller = new AbortController();
      running.current.set(id, { key, controller });
      setJobs((current) => ({ ...current, [id]: { state: "analyzing", progress: 0 } }));
      analyzeFaceAttachment(clip, segments, {
        signal: controller.signal,
        priorityTime: latest.current.currentTime,
        onPreview: (analysis) => {
          if (controller.signal.aborted) return;
          setPreviews((current) => ({ ...current, [id]: analysis }));
        },
        onProgress: (progress) => {
          if (!controller.signal.aborted)
            setJobs((current) =>
              current[id]?.progress === progress
                ? current
                : { ...current, [id]: { state: "analyzing", progress } },
            );
        },
      })
        .then((analysis) => {
          if (controller.signal.aborted) return;
          setClips((current) =>
            current.map((item) =>
              item.id === id && faceAnalysisKey(item, latest.current.segments) === key
                ? { ...item, faceAnalysis: analysis }
                : item,
            ),
          );
          setJobs((current) => ({
            ...current,
            [id]: { state: analysis.found ? "ready" : "noFace", progress: 100 },
          }));
        })
        .catch((error) => {
          if (controller.signal.aborted || error.name === "AbortError") return;
          console.error("Face attachment analysis failed", error.cause || error);
          failed.current.set(id, key);
          setJobs((current) => ({ ...current, [id]: { state: "error", progress: 0 } }));
        })
        .finally(() => {
          if (running.current.get(id)?.controller === controller) running.current.delete(id);
          setPreviews((current) => {
            if (current[id]?.key !== key || running.current.has(id)) return current;
            const next = { ...current };
            delete next[id];
            return next;
          });
        });
    }
  }, [clips, segments, setClips, retryVersion]);
  useEffect(() => {
    const jobs = running.current;
    return () => {
      for (const job of jobs.values()) job.controller.abort();
      jobs.clear();
    };
  }, []);
  const previewClips = useMemo(() => {
    if (!Object.keys(previews).length) return clips;
    return clips.map((clip) =>
      previews[clip.id]?.key === faceAnalysisKey(clip, segments)
        ? { ...clip, faceAnalysis: previews[clip.id] }
        : clip,
    );
  }, [clips, segments, previews]);
  return {
    jobs,
    previewClips,
    retry: (id) => {
      const clip = latest.current.clips.find((item) => item.id === id);
      if (clip) invalidateFaceAttachmentAnalysis(clip, latest.current.segments);
      failed.current.delete(id);
      running.current.get(id)?.controller.abort();
      running.current.delete(id);
      setClips((items) =>
        items.map((item) => (item.id === id ? { ...item, faceAnalysis: null } : item)),
      );
      retry((value) => value + 1);
    },
    cancel: (id) => {
      const job = running.current.get(id);
      if (job) {
        failed.current.set(id, job.key);
        job.controller.abort();
        running.current.delete(id);
      }
      setJobs((current) => ({ ...current, [id]: { state: "cancelled", progress: 0 } }));
    },
  };
}
