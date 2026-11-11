import { CaretRight, FilmStrip, Pause, Play, Waveform } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WEBMCP_EXTENDED_COPY } from "../i18nWebMcpExtended.js";
import { loadProjectMediaBlob } from "../lib/projectSnapshot.js";
import { readAudioAssetMetadata } from "../lib/audioAssetMetadata.js";
import { decodeWaveform } from "../lib/media.js";
import { formatClock, formatTime } from "../lib/timeline.js";
import { getVideoTrackFrameAtSourceTime, getVideoTrackFrameSource } from "../lib/videoTrackFrames.js";
import { WaveformStrip } from "./ui.jsx";

const copy = {
  zh: ["配音", "暂无音频"],
  en: ["Voiceover", "No audio"],
  ja: ["ナレーション", "音声なし"],
  ko: ["내레이션", "오디오 없음"],
  es: ["Locución", "Sin audio"],
  fr: ["Voix off", "Aucun audio"],
  de: ["Voiceover", "Kein Audio"],
  pt: ["Narração", "Sem áudio"],
  th: ["เสียงพากย์", "ไม่มีเสียง"],
  vi: ["Lời thoại", "Chưa có âm thanh"],
  ru: ["Озвучка", "Нет аудио"],
  it: ["Voce fuori campo", "Nessun audio"],
  id: ["Sulih suara", "Tidak ada audio"],
};

const metadataCopy = {
  zh: "编码|采样率|声道|平均码率|素材信息|作者|标题|容器|源音频时长|文件大小|单声道|立体声",
  en: "Codec|Sample rate|Channels|Average bitrate|Asset information|Author|Title|Container|Source audio duration|File size|Mono|Stereo",
  ja: "コーデック|サンプルレート|チャンネル|平均ビットレート|素材情報|作者|タイトル|コンテナ|元音声の長さ|ファイルサイズ|モノラル|ステレオ",
  ko: "코덱|샘플링 주파수|채널|평균 비트레이트|소재 정보|작성자|제목|컨테이너|원본 오디오 길이|파일 크기|모노|스테레오",
  es: "Códec|Muestreo|Canales|Tasa media|Información del recurso|Autor|Título|Contenedor|Duración del audio original|Tamaño del archivo|Mono|Estéreo",
  fr: "Codec|Échantillonnage|Canaux|Débit moyen|Infos du média|Auteur|Titre|Conteneur|Durée audio source|Taille du fichier|Mono|Stéréo",
  de: "Codec|Abtastrate|Kanäle|Mittlere Bitrate|Medieninformationen|Autor|Titel|Container|Dauer des Quellaudios|Dateigröße|Mono|Stereo",
  pt: "Codec|Amostragem|Canais|Taxa média|Informações da mídia|Autor|Título|Contêiner|Duração do áudio original|Tamanho do arquivo|Mono|Estéreo",
  th: "ตัวแปลงสัญญาณ|อัตราสุ่ม|ช่องเสียง|บิตเรตเฉลี่ย|ข้อมูลสื่อ|ผู้สร้าง|ชื่อเรื่อง|คอนเทนเนอร์|ความยาวเสียงต้นฉบับ|ขนาดไฟล์|โมโน|สเตอริโอ",
  vi: "Codec|Tần số lấy mẫu|Kênh|Tốc độ bit TB|Thông tin tư liệu|Tác giả|Tiêu đề|Định dạng chứa|Thời lượng âm thanh gốc|Kích thước tệp|Mono|Stereo",
  ru: "Кодек|Частота дискретизации|Каналы|Средний битрейт|Сведения о медиа|Автор|Название|Контейнер|Длительность исходного аудио|Размер файла|Моно|Стерео",
  it: "Codec|Campionamento|Canali|Bitrate medio|Informazioni sul file|Autore|Titolo|Contenitore|Durata audio sorgente|Dimensione del file|Mono|Stereo",
  id: "Kodek|Laju sampel|Kanal|Bitrate rata-rata|Informasi aset|Pembuat|Judul|Kontainer|Durasi audio sumber|Ukuran file|Mono|Stereo",
};

const decodedWaveforms = new WeakMap();

function AudioClipDetails({ clip, thumbnailClip = clip, playing, currentTime, onPlay, picker, mainVisualLabel, language, t }) {
  const [resolvedMedia, setResolvedMedia] = useState(null);
  const mediaSource = clip.projectMedia?.bindings?.blob ? clip.projectMedia : clip.src || clip.url;
  useEffect(() => {
    if (clip.blob || clip.preparing || !mediaSource) return;
    const controller = new AbortController();
    const item = typeof mediaSource === "string" ? { src: mediaSource } : { projectMedia: mediaSource };
    void loadProjectMediaBlob(item, "blob", controller.signal).then(blob => {
      if (!controller.signal.aborted) setResolvedMedia({ source: mediaSource, blob });
    }).catch(() => {});
    return () => controller.abort();
  }, [clip.blob, clip.preparing, mediaSource]);
  const metadataBlob = clip.blob || (resolvedMedia?.source === mediaSource ? resolvedMedia?.blob : null);
  const waveformBlob = clip.compatibilityAudioBlob || metadataBlob;
  const savedPeaks = clip.peaks;
  const [waveform, setWaveform] = useState(null);
  useEffect(() => {
    if (savedPeaks?.length || clip.preparing || !(waveformBlob instanceof Blob)) return;
    let current = true;
    let job = decodedWaveforms.get(waveformBlob);
    if (!job) {
      job = decodeWaveform(waveformBlob, 96).catch(() => null);
      decodedWaveforms.set(waveformBlob, job);
    }
    void job.then(data => { if (current) setWaveform({ blob: waveformBlob, data }); });
    return () => { current = false; };
  }, [waveformBlob, savedPeaks, clip.preparing]);

  const decoded = waveform?.blob === waveformBlob ? waveform.data : null;
  const thumbnail = getVideoTrackFrameSource(getVideoTrackFrameAtSourceTime(
    thumbnailClip.trackFrames, thumbnailClip.sourceStart || 0, thumbnailClip.trackFrameDuration || thumbnailClip.sourceDuration,
  )) || thumbnailClip.thumbnail;
  const [metadataResult, setMetadataResult] = useState(null);
  useEffect(() => {
    if (!(metadataBlob instanceof Blob) || clip.preparing) return;
    let current = true;
    void readAudioAssetMetadata(metadataBlob).then(data => {
      if (current) setMetadataResult({ blob: metadataBlob, data });
    });
    return () => { current = false; };
  }, [metadataBlob, clip.preparing]);

  const metadata = metadataResult?.blob === metadataBlob ? metadataResult?.data : null;
  const [codecLabel, sampleRateLabel, channelsLabel, bitrateLabel, informationLabel,
    authorLabel, titleLabel, containerLabel, sourceDurationLabel, fileSizeLabel, mono, stereo] =
    (metadataCopy[language] || metadataCopy.en).split("|");
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const stats = [
    [codecLabel, metadata?.codec],
    [sampleRateLabel, metadata?.sampleRate > 0 ? number.format(metadata.sampleRate / 1000) + " kHz" : null],
    [channelsLabel, metadata?.channels === 1 ? mono : metadata?.channels === 2 ? stereo : metadata?.channels],
    [bitrateLabel, metadata?.bitrate > 0
      ? (metadata.sampledBitrate ? "≈ " : "") + number.format(Math.round(metadata.bitrate / 1000)) + " kb/s" : null],
  ];
  const details = [
    [authorLabel, metadata?.author],
    [titleLabel, metadata?.title],
    [containerLabel, metadata?.container],
    [sourceDurationLabel, metadata?.duration > 0 ? formatTime(metadata.duration) : null],
    [fileSizeLabel, metadataBlob instanceof Blob
      ? metadataBlob.size >= 1000000 ? number.format(metadataBlob.size / 1000000) + " MB"
        : number.format(metadataBlob.size / 1000) + " kB" : null],
  ];
  const peaks = savedPeaks?.length ? savedPeaks : decoded?.peaks;
  const duration = clip.duration || 0;
  const elapsed = Math.min(duration, Math.max(0, currentTime - (clip.start || 0)));
  const played = duration > 0 ? elapsed / duration : 0;
  const timeLabel = time => duration < 5 ? formatTime(time) : formatClock(time);
  return <>
    <div className={`audio-workspace-clip ${picker ? "is-selectable" : ""}`}>
      {thumbnail ? <img src={thumbnail} alt="" /> : <span className="audio-workspace-icon">
        {thumbnailClip.type === "video" ? <FilmStrip size={23} /> : <Waveform size={23} />}
      </span>}
      <div>
        <strong title={clip.name}>{clip.name || t(clip.track === "music" ? "bgm" : "sourceAudio")}</strong>
        <small>
          {clip.visualTrack === "image" ? <b>{mainVisualLabel}</b> : null}
          {timeLabel(duration)}
        </small>
      </div>
      {picker ? <><CaretRight size={16} aria-hidden="true" />{picker}</> : null}
    </div>
    <dl className="audio-workspace-stats">
      {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}
    </dl>
    <div className="audio-workspace-preview">
      <button className="panel-secondary" type="button" aria-label={t(playing ? "pause" : "play")} disabled={!duration || clip.preparing} onClick={onPlay}>
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
      </button>
      <div className="audio-workspace-waveform">
        <div className="audio-workspace-ruler">
          {[0, 1, 2, 3, 4].map(step => <span key={step}>{timeLabel(duration * step / 4)}</span>)}
        </div>
        {peaks?.length ? <div className="audio-workspace-waveform-progress" style={{ "--audio-workspace-played": `${played * 100}%` }}>
          <WaveformStrip peaks={peaks} sourceStart={clip.sourceStart}
            sourceDuration={clip.sourceDuration || duration * (clip.playbackRate || 1)}
            sourceAudioDuration={savedPeaks?.length ? clip.peaksDuration || 0 : decoded?.duration} />
          {played > 0 && played < 1 ? <span className="audio-workspace-waveform-playhead" aria-hidden="true" /> : null}
        </div> : null}
      </div>
    </div>
    <section className="audio-workspace-information">
      <h3>{informationLabel}</h3>
      <dl>
        {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}
      </dl>
    </section>
  </>;
}

export function AudioWorkspace({ language, t, selected, fallback, visualChoices, voiceovers, onSelect, onSelectVoice, children, onImport, onPlay, playing, currentTime }) {
  const [voiceLabel, noAudio] = copy[language] || copy.en;
  const mainVisualLabel = (WEBMCP_EXTENDED_COPY[language] || WEBMCP_EXTENDED_COPY.en).trackVisuals;
  const clip = selected || fallback;
  const scrollBodyRef = useRef(null);
  const hasClip = Boolean(clip);
  const selectedClipKey = selected ? `${selected.track}:${selected.id}` : "";
  useLayoutEffect(() => {
    if (scrollBodyRef.current) scrollBodyRef.current.scrollTop = 0;
  }, [hasClip, selectedClipKey]);
  const isVoice = Boolean(clip?.isVoice);
  const picture = clip?.visualId ? visualChoices.find(item => item.id === clip.visualId && item.track === clip.visualTrack) : null;
  const picker = !isVoice && visualChoices.length > 1 ? <select aria-label={t("sourceAudio")} value={picture ? `${picture.track}:${picture.id}` : ""}
        onChange={event => { const choice = visualChoices.find(item => `${item.track}:${item.id}` === event.target.value); if (choice) onSelect(choice); }}>
        <option value="" disabled>{t("sourceAudio")}</option>
        {visualChoices.map(item => <option key={`${item.track}:${item.id}`} value={`${item.track}:${item.id}`}>{item.name || t("sourceAudio")} · {formatTime(item.start)}</option>)}
      </select> : isVoice && voiceovers.length > 1 ? <select aria-label={voiceLabel} value={clip?.id || ""} onChange={event => onSelectVoice(event.target.value)}>
        {voiceovers.map(item => <option key={item.id} value={item.id}>{item.name || voiceLabel} · {formatTime(item.start)}</option>)}
      </select> : null;
  return <div className="tool-panel audio-tool-panel audio-workspace mobile-panel-scroll-body">
    <div className="audio-workspace-heading">
      <h2>{t("audioPanel")}</h2>
    </div>
    <div className="audio-workspace-body" ref={scrollBodyRef}>
      {clip ? <AudioClipDetails key={`${clip.track}:${clip.id}`} clip={clip} thumbnailClip={picture || clip} playing={playing} picker={picker}
        language={language} mainVisualLabel={mainVisualLabel} t={t} currentTime={currentTime} onPlay={() => onPlay(clip)}
      /> : <div className="audio-workspace-empty">
        <Waveform size={22} aria-hidden="true" />
        <strong>{noAudio}</strong>
        <button className="panel-secondary" type="button" onClick={onImport}>{t("upload")}</button>
      </div>}
      {children}
    </div>
  </div>;
}
