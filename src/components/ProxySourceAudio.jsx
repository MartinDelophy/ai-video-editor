import { useEffect, useRef } from "react";
import { requestTimelineMediaPlay, setTimelineAudioGain } from "../lib/editorRuntime.js";
import { getVisualPlaybackRateAtTime, getVisualSourceTime } from "../lib/visualEffects.js";
import { cancelVideoProxy } from "../lib/videoProxy.js";

/** Keep the original audio clock and AAC priming; the proxy contains video only. */
export function ProxySourceAudio({ source, segment, videoRef, localTime, isPlaying, muted }) {
  const audioRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) video.__timelineProxyAudioPending = false;
    };
  }, [source, videoRef]);
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;
    let pendingFrame = 0;
    const audible = !muted && (segment?.volume ?? 1) > 0;
    const sync = () => {
      const requested = isPlaying && audible && !video.ended;
      const pictureReady = video.readyState >= 2 && !video.seeking && !video.__timelineFramePending;
      const expected =
        requested && pictureReady ? video.currentTime : getVisualSourceTime(segment, localTime);
      const rate = getVisualPlaybackRateAtTime(segment, localTime);
      if (audio.playbackRate !== rate) audio.playbackRate = rate;
      audio.preservesPitch = true;
      setTimelineAudioGain(
        audio,
        segment?.volume ?? 1,
        segment?.spatialEffect,
        segment?.spatialAmount,
      );
      const misaligned = Math.abs(audio.currentTime - expected) > Math.max(0.04, 0.02 * rate);
      if (!requested || !pictureReady || audio.readyState < 3 || audio.seeking || misaligned) {
        video.__timelineProxyAudioPending = requested;
        if (requested && !video.paused) video.pause();
        if (isPlaying && !audible && pictureReady) requestTimelineMediaPlay(video);
        audio.pause();
        if (requested && !pendingFrame)
          pendingFrame = requestAnimationFrame(() => {
            pendingFrame = 0;
            sync();
          });
        if (
          audio.readyState >= 1 &&
          !audio.seeking &&
          Math.abs(audio.currentTime - expected) > 0.002
        )
          audio.currentTime = Math.max(0, expected);
        return;
      }
      video.__timelineProxyAudioPending = false;
      requestTimelineMediaPlay(audio);
      requestTimelineMediaPlay(video);
    };
    const pause = () => audio.pause();
    const wait = () => {
      if (isPlaying && audible) {
        video.__timelineProxyAudioPending = true;
        video.pause();
      }
      audio.pause();
    };
    const events = ["playing", "play", "seeked", "timeupdate", "ratechange", "canplay"];
    const pauses = ["seeking", "waiting", "pause", "emptied", "ended"];
    const audioEvents = ["loadedmetadata", "canplay", "seeked"];
    events.forEach((name) => video.addEventListener(name, sync));
    pauses.forEach((name) => video.addEventListener(name, pause));
    audioEvents.forEach((name) => audio.addEventListener(name, sync));
    audio.addEventListener("waiting", wait);
    sync();
    return () => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      events.forEach((name) => video.removeEventListener(name, sync));
      pauses.forEach((name) => video.removeEventListener(name, pause));
      audioEvents.forEach((name) => audio.removeEventListener(name, sync));
      audio.removeEventListener("waiting", wait);
    };
  }, [source, segment, videoRef, localTime, isPlaying, muted]);
  return (
    <audio
      ref={audioRef}
      src={source}
      crossOrigin="anonymous"
      preload="auto"
      muted={muted}
      onError={() => cancelVideoProxy(source)}
    />
  );
}
