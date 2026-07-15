import { useState } from "react";

import { DEFAULT_TIMELINE_DURATION_SECONDS, VOICES } from "../config/editor.js";

export function useAudioTrackState() {
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICES[0].id);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [audioSegments, setAudioSegments] = useState([]);
  const [selectedAudioSegmentId, setSelectedAudioSegmentId] = useState("");
  const [timelineHorizon, setTimelineHorizon] = useState(DEFAULT_TIMELINE_DURATION_SECONDS);
  const [musicBlob, setMusicBlob] = useState(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicPeaks, setMusicPeaks] = useState([]);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [sourceAudioBlob, setSourceAudioBlob] = useState(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState("");
  const [sourceAudioName, setSourceAudioName] = useState("");
  const [sourceAudioDuration, setSourceAudioDuration] = useState(0);
  const [sourceAudioPeaks, setSourceAudioPeaks] = useState([]);
  const [sourceAudioVolume, setSourceAudioVolume] = useState(1);
  const [sourceAudioStart, setSourceAudioStart] = useState(0);
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState(["zh_CN-xiao_ya-medium"]);
  const [historyItems, setHistoryItems] = useState([]);
  const [recordedVoices, setRecordedVoices] = useState([]);
  const [recordingState, setRecordingState] = useState("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  return {
    audioSegments, favoriteVoiceIds, historyItems, musicBlob, musicDuration, musicName,
    musicPeaks, musicUrl, musicVolume, recordedVoices, recordingElapsed, recordingState,
    selectedAudioSegmentId, selectedVoiceId, setAudioSegments, setFavoriteVoiceIds,
    setHistoryItems, setMusicBlob, setMusicDuration, setMusicName, setMusicPeaks,
    setMusicUrl, setMusicVolume, setRecordedVoices, setRecordingElapsed,
    setRecordingState, setSelectedAudioSegmentId, setSelectedVoiceId, setSourceAudioBlob,
    setSourceAudioDuration, setSourceAudioName, setSourceAudioPeaks, setSourceAudioStart,
    setSourceAudioUrl, setSourceAudioVolume, setSpeed, setTimelineHorizon, setVolume,
    sourceAudioBlob, sourceAudioDuration, sourceAudioName, sourceAudioPeaks,
    sourceAudioStart, sourceAudioUrl, sourceAudioVolume, speed, timelineHorizon, volume,
  };
}
