import { useCallback, useRef, useState } from "react";

import { DEFAULT_TIMELINE_DURATION_SECONDS, VOICES } from "../config/editor.js";

export function useAudioTrackState() {
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICES[0].id);
  const [speed, setSpeed] = useState(VOICES[0].defaultSpeed ?? 1);
  const [volume, setVolume] = useState(1);
  const [audioSegments, setAudioSegmentsState] = useState([]);
  const audioSegmentsRef = useRef(audioSegments);
  const generatedVoiceEndRef = useRef(0);
  audioSegmentsRef.current = audioSegments;
  const setAudioSegments = useCallback((update) => {
    setAudioSegmentsState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      audioSegmentsRef.current = next;
      return next;
    });
  }, []);
  const [selectedAudioSegmentId, setSelectedAudioSegmentId] = useState("");
  const [timelineHorizon, setTimelineHorizon] = useState(DEFAULT_TIMELINE_DURATION_SECONDS);
  const [musicBlob, setMusicBlob] = useState(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicStart, setMusicStart] = useState(0);
  const [musicPeaks, setMusicPeaks] = useState([]);
  const [musicSegments, setMusicSegments] = useState([]);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [sourceAudioBlob, setSourceAudioBlob] = useState(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState("");
  const [sourceAudioName, setSourceAudioName] = useState("");
  const [sourceAudioDuration, setSourceAudioDuration] = useState(0);
  const [sourceAudioPeaks, setSourceAudioPeaks] = useState([]);
  const [sourceAudioVolume, setSourceAudioVolume] = useState(1);
  const [sourceAudioSpatialEffect, setSourceAudioSpatialEffect] = useState("original");
  const [sourceAudioAutoDuck, setSourceAudioAutoDuck] = useState(null);
  const [sourceAudioSpatialAmount, setSourceAudioSpatialAmount] = useState(1);
  const [sourceAudioStart, setSourceAudioStart] = useState(0);
  const [sourceAudioAssetId, setSourceAudioAssetId] = useState("");
  const [sourceAudioLinked, setSourceAudioLinked] = useState(true);
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState(["zh_f_qinglan"]);
  const [historyItems, setHistoryItems] = useState([]);
  const [recordedVoices, setRecordedVoices] = useState([]);
  const [recordingState, setRecordingState] = useState("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  return {
    audioSegments, audioSegmentsRef, favoriteVoiceIds, generatedVoiceEndRef, historyItems, musicBlob, musicDuration, musicName,
    musicPeaks, musicSegments, musicStart, musicUrl, musicVolume, recordedVoices, recordingElapsed, recordingState,
    selectedAudioSegmentId, selectedVoiceId, setAudioSegments, setFavoriteVoiceIds,
    setHistoryItems, setMusicBlob, setMusicDuration, setMusicName, setMusicPeaks, setMusicSegments,
    setMusicStart, setMusicUrl, setMusicVolume, setRecordedVoices, setRecordingElapsed,
    setRecordingState, setSelectedAudioSegmentId, setSelectedVoiceId, setSourceAudioBlob,
    setSourceAudioAssetId, setSourceAudioDuration, setSourceAudioLinked, setSourceAudioName, setSourceAudioPeaks, setSourceAudioStart,
    setSourceAudioUrl, setSourceAudioVolume, setSourceAudioSpatialEffect, setSourceAudioSpatialAmount, setSourceAudioAutoDuck, setSpeed, setTimelineHorizon, setVolume,
    sourceAudioAssetId, sourceAudioBlob, sourceAudioDuration, sourceAudioLinked, sourceAudioName, sourceAudioPeaks,
    sourceAudioStart, sourceAudioUrl, sourceAudioVolume, sourceAudioSpatialEffect, sourceAudioSpatialAmount, sourceAudioAutoDuck, speed, timelineHorizon, volume,
  };
}
