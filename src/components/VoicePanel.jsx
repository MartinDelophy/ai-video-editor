import {
  Armchair,
  ArrowsOut,
  Bathtub,
  Bed,
  Buildings,
  CaretDown,
  CaretRight,
  CellSignalFull,
  CellSignalHigh,
  CellSignalLow,
  CellSignalMedium,
  CellSignalNone,
  ChalkboardTeacher,
  CheckCircle,
  Church,
  ClosedCaptioning,
  Coffee,
  CursorClick,
  DoorOpen,
  Drop,
  DownloadSimple,
  Eye,
  EyeSlash,
  ImageSquare,
  Info,
  Link,
  LinkBreak,
  ListBullets,
  Mountains,
  MicrophoneStage,
  OfficeChair,
  Park,
  PersonSimpleRun,
  Plus,
  RadioButton,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Stack,
  Subway,
  Sun,
  Ticket,
  Trash,
  Tree,
  UploadSimple,
  Waveform,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatTime, getSegmentStartTime } from "../lib/timeline.js";
import { decodeWaveform } from "../lib/media.js";
import { cancelOpenVoiceTasks, convertVoiceBlob, extractVoiceEmbedding } from "../lib/openVoiceRuntime.js";
import { LIVE_PORTRAIT_WEB_MODEL } from "../config/livePortrait.js";
import { probeLivePortraitWebEnvironment } from "../lib/livePortraitWeb.js";
import {
  ensureCaptionFontLoaded,
  getCaptionFont,
  getCaptionFontsForLanguage,
  resolveCaptionFontFamily,
  resolveCaptionFontWeight,
} from "../lib/captionFonts.js";
import { getCaptionVoiceSegment } from "../lib/captionVoice.js";
import { findCaptionAudioLinkTarget } from "../lib/captionEditingActions.js";
import { resolveInspectorPanelContext } from "../lib/mobileClipActions.js";
import { normalizeVisualKeyframes } from "../lib/visualEffects.js";
import { AUDIO_SPATIAL_EFFECTS, normalizeAudioSpatialAmount, normalizeAudioSpatialEffect } from "../lib/audioSpatialEffects.js";
import {
  buildVectorDesignPatch,
  getVectorDesignAppearance,
  normalizeVectorDesign,
  recolorVectorBody,
} from "../lib/vectorDesign.js";
import {
  createEditableVectorDocument,
  createVectorPartThumbnail,
  createVectorSelectionBody,
  updateVectorPart,
} from "../lib/vectorDocument.js";
import { MAX_SRT_FILE_BYTES, parseSrt } from "../lib/subtitles.js";
import { AI_MUSIC_COPY, AiMusicGenerator, FavoriteVoicesPanel, HistoryPanel, MyVoicesPanel, VisualEffectsPanel, VoiceSynthesisPanel } from "./panels.jsx";
import { SmartFramePanel } from "./SmartFramePanel.jsx";
import { ClickRippleInspector, SubjectEffectsInspector } from "./SubjectEffectsPanel.jsx";
import { OpticalFlowTrackingPanel } from "./OpticalFlowTrackingPanel.jsx";
import { CinematicDepthPanel } from "./CinematicDepthPanel.jsx";
import { PhotoParallaxPanel } from "./PhotoParallaxPanel.jsx";

const AUDIO_SPATIAL_PRESENTATION = {
  original: { Icon: Waveform, Signal: CellSignalNone },
  bedroom: { Icon: Bed, Signal: CellSignalLow },
  "living-room": { Icon: Armchair, Signal: CellSignalMedium },
  bathroom: { Icon: Bathtub, Signal: CellSignalHigh },
  hall: { Icon: Buildings, Signal: CellSignalHigh },
  corridor: { Icon: DoorOpen, Signal: CellSignalMedium },
  plaza: { Icon: Park, Signal: CellSignalMedium },
  valley: { Icon: Mountains, Signal: CellSignalFull },
  studio: { Icon: MicrophoneStage, Signal: CellSignalLow },
  office: { Icon: OfficeChair, Signal: CellSignalLow },
  cafe: { Icon: Coffee, Signal: CellSignalMedium },
  classroom: { Icon: ChalkboardTeacher, Signal: CellSignalMedium },
  theater: { Icon: Ticket, Signal: CellSignalHigh },
  church: { Icon: Church, Signal: CellSignalFull },
  forest: { Icon: Tree, Signal: CellSignalMedium },
  subway: { Icon: Subway, Signal: CellSignalHigh },
};

function AutoEditReviewDialog({ t, autoEdit }) {
  const { review, job } = autoEdit || {};
  if (!review?.open || typeof document === "undefined") return null;
  const complete = !job.running && review.captions.length > 0;
  return createPortal(
    <div className="auto-edit-review-backdrop" role="presentation">
      <section className="auto-edit-review-dialog" role="dialog" aria-modal="true" aria-label={t("autoEditReviewTitle")}>
        <header className="auto-edit-review-header">
          <div className="auto-edit-review-mark"><Sparkle size={19} weight="fill" /></div>
          <div><span>{t("smartAutoEdit")}</span><h2>{t("autoEditReviewTitle")}</h2></div>
          <div className={`auto-edit-review-status ${complete ? "is-complete" : review.error ? "is-error" : ""}`}><i />{review.error ? t("autoEditReviewFailed") : complete ? t("autoEditReviewReady") : job.phase}</div>
          <button type="button" className="auto-edit-review-close" aria-label={t("close")} onClick={autoEdit.closeReview}><X size={18} /></button>
        </header>

        <div className="auto-edit-review-progress"><span style={{ width: `${job.progress || 0}%` }} /></div>
        <div className="auto-edit-review-body">
          <section className="auto-edit-review-section">
            <div className="auto-edit-review-section-title"><div><span>01</span><strong>{t("autoEditCandidateTitle")}</strong></div><em>{review.candidates.length} {t("autoEditFramesUnit")}</em></div>
            <p>{t("autoEditCandidateHint")}</p>
            {review.candidates.length ? <div className="auto-edit-candidate-grid">{review.candidates.map((candidate, index) => (
              <article className="auto-edit-candidate-card" key={candidate.id}>
                <div><img src={candidate.url} alt={`${t("autoEditCandidateFrame")} ${index + 1}`} /><span>#{String(index + 1).padStart(2, "0")}</span><em>{candidate.aspectRatio}</em><time>{formatTime(candidate.time)}</time></div>
                <footer><span>{t("autoEditVisualChange")}</span><strong>{Math.round(candidate.difference * 100)}%</strong><i><b style={{ width: `${Math.min(100, Math.max(5, candidate.difference * 100))}%` }} /></i></footer>
              </article>
            ))}</div> : <div className="auto-edit-review-loading"><i /><span>{t("autoEditFindingScenes")}</span></div>}
          </section>

          <section className="auto-edit-review-section auto-edit-model-results">
            <div className="auto-edit-review-section-title"><div><span>02</span><strong>{t("autoEditModelResultTitle")}</strong></div><em>{review.captions.length} {t("captionSegmentsUnit")}</em></div>
            <p>{t("autoEditModelResultHint")}</p>
            {review.error ? <div className="auto-edit-review-error"><strong>{t("autoEditReviewFailed")}</strong><span>{review.error}</span></div> : review.segments.length ? <div className="auto-edit-clip-results">{review.segments.map((segment) => {
              const segmentCaptions = review.captions.filter((caption) => caption.visualSegmentId === segment.id);
              const preview = review.candidates.find((candidate) => candidate.segmentId === segment.id);
              return <article className={`auto-edit-clip-result is-${segment.status}`} key={segment.id}>
                <header>{preview ? <img src={preview.url} alt="" /> : null}<div><strong>{segment.name || `${t("autoEditClip")} ${(segment.index ?? 0) + 1}`}</strong><span>{review.candidates.filter((candidate) => candidate.segmentId === segment.id).length} {t("autoEditFramesUnit")}</span></div><em>{t(`autoEditSegmentStatus_${segment.status}`)}</em></header>
                {segment.error ? <p className="auto-edit-clip-error">{segment.error}</p> : segmentCaptions.length ? <><div className="auto-edit-result-list">{segmentCaptions.map((caption, index) => (
                  <article key={caption.id}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{caption.text}</p><time>{formatTime(caption.start)} → {formatTime(caption.end)}</time></div></article>
                ))}</div>{segment.status === "running" ? <div className="auto-edit-clip-pending"><i /><span>{t("autoEditWindowProgress").replace("{current}", segment.windowIndex || 0).replace("{total}", segment.totalWindows || 0)}</span></div> : null}</> : <div className="auto-edit-clip-pending">{segment.status === "running" ? <i /> : null}<span>{segment.status === "running" && segment.totalWindows ? t("autoEditWindowProgress").replace("{current}", segment.windowIndex || 0).replace("{total}", segment.totalWindows) : t(`autoEditSegmentHint_${segment.status}`)}</span></div>}
              </article>;
            })}</div> : <div className="auto-edit-review-loading"><i /><span>{job.running ? job.phase : t("autoEditWaitingForModel")}</span></div>}
          </section>
        </div>
        <footer className="auto-edit-review-actions">
          <div><strong>{complete ? t("autoEditReviewSummaryReady") : t("autoEditReviewSummaryRunning")}</strong><span>{t("autoEditReviewSummaryHint")}</span></div>
          <button type="button" className="panel-secondary" onClick={autoEdit.closeReview}>{job.running ? t("cancel") : t("close")}</button>
          <button type="button" className="auto-edit-apply" disabled={!complete} onClick={autoEdit.applyCaptions}><Sparkle size={16} weight="fill" />{t("autoEditApplyCaptions")}</button>
        </footer>
      </section>
    </div>, document.body,
  );
}

function AutoEditPanel({ t, hasVisual, autoEdit }) {
  const availability = autoEdit?.support?.availability || "unknown";
  const ready = availability === "available" || availability === "downloadable" || availability === "downloading";
  const downloadProgress = Math.max(0, Math.min(100, Number(autoEdit?.support?.progress) || 0));
  const isPreparingSupport = availability === "downloading" && Number.isFinite(autoEdit?.support?.progress);
  const showDownloadDetails = isPreparingSupport || autoEdit?.support?.stalled;
  const downloadRows = [
    ["prompt", t("autoEditPromptModel")],
    ...(autoEdit?.support?.promptLanguage !== autoEdit?.support?.language ? [["translation", t("autoEditTranslationModel")]] : []),
  ].map(([id, label]) => ({ id, label, ...(autoEdit?.support?.downloads?.[id] || { progress: 0, state: "downloading", attempt: 1 }) }));
  const getDownloadStateLabel = (download) => download.state === "complete"
    ? t("autoEditDownloadComplete")
    : download.state === "stalled" ? t("autoEditDownloadStalled")
      : `${download.progress > 0 ? t("autoEditDownloadActive") : t("autoEditDownloadWaiting")}${download.attempt > 1 ? ` · ${t("autoEditDownloadAttempt").replace("{attempt}", download.attempt)}` : ""}`;
  const supportActionLabel = availability === "downloading"
    ? `${t("autoEditDownloadingModel")}${downloadProgress ? ` ${downloadProgress}%` : ""}`
    : availability === "downloadable" ? t(autoEdit?.support?.stalled ? "autoEditRetryDownload" : "autoEditDownloadModel") : t("autoEditCheckSupport");
  return (<>
    <div className="auto-edit-panel">
      <section className="auto-edit-intro"><Scissors size={28} weight="duotone" /><div><strong>{t("autoEditCreateTitle")}</strong><span>{t("autoEditCreateDesc")}</span></div></section>
      <section className="auto-edit-status-card">
        <div><span>{t("autoEditBrowserModel")}</span><strong className={`auto-edit-availability is-${availability}`}>{t(`autoEditStatus_${availability}`)}</strong></div>
        <p>{t("autoEditPrivacyHint")}</p>
        {availability === "available"
          ? <div className="auto-edit-model-ready" role="status"><CheckCircle size={17} weight="fill" /><span>{t("autoEditModelReady")}</span></div>
          : <button className="panel-secondary" type="button" disabled={autoEdit?.job?.running || availability === "checking" || isPreparingSupport} onClick={availability === "downloadable" || availability === "downloading" ? autoEdit?.prepareSupport : autoEdit?.checkSupport}>{supportActionLabel}</button>}
        {showDownloadDetails ? <div className="auto-edit-model-downloads" aria-live="polite">
          {downloadRows.map((download) => <div className={`auto-edit-model-download is-${download.state}`} key={download.id}>
            <div><span>{download.label}</span><span className="auto-edit-model-download-meta"><small>{getDownloadStateLabel(download)}</small><strong>{download.progress}%</strong></span></div>
            <progress max="100" value={download.progress} aria-label={`${download.label} ${download.progress}%`} />
          </div>)}
          <div className="auto-edit-download-total"><span>{t("autoEditDownloadTotal")}</span><strong>{downloadProgress}%</strong></div>
          {autoEdit?.support?.stalled ? <p className="auto-edit-download-warning">{t("autoEditDownloadStalledHint")}</p> : null}
        </div> : null}
      </section>
      <div className="auto-edit-flow"><span>1</span><p><strong>{t("autoEditStepScenes")}</strong><small>{t("autoEditStepScenesHint")}</small></p><span>2</span><p><strong>{t("autoEditStepCaptions")}</strong><small>{t("autoEditStepCaptionsHint")}</small></p><span>3</span><p><strong>{t("autoEditStepTimeline")}</strong><small>{t("autoEditStepTimelineHint")}</small></p></div>
      {autoEdit?.job?.running ? <div className="auto-edit-progress"><div><span>{autoEdit.job.phase}</span><strong>{autoEdit.job.progress}%</strong></div><progress max="100" value={autoEdit.job.progress} /><button className="panel-secondary" type="button" onClick={autoEdit.cancel}>{t("cancel")}</button></div> : null}
      <button className="auto-edit-generate" type="button" disabled={!hasVisual || !ready || autoEdit?.job?.running} onClick={autoEdit?.run}>
        <span className="auto-edit-generate-icon"><Sparkle size={17} weight="fill" /></span>
        <span><strong>{hasVisual ? t("autoEditGenerate") : t("autoEditNeedsVisual")}</strong><small>{hasVisual ? t("autoEditGenerateHint") : t("autoEditNeedsVisualHint")}</small></span>
        <span className="auto-edit-generate-arrow">→</span>
      </button>
    </div>
    <AutoEditReviewDialog t={t} autoEdit={autoEdit} />
  </>);
}

function VectorDesignRange({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="vector-design-range">
      <span>{label}<output>{value}{suffix}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

const VECTOR_PART_LABEL_KEYS = {
  text: ["vectorPartText", "文字"],
  rectangle: ["vectorPartRectangle", "矩形"],
  rectangleGroup: ["vectorPartRectangleGroup", "矩形组合"],
  circle: ["vectorPartCircle", "圆形"],
  pointGroup: ["vectorPartPointGroup", "圆点组合"],
  line: ["vectorPartLine", "线条"],
  lineGroup: ["vectorPartLineGroup", "线条组合"],
  textGroup: ["vectorPartTextGroup", "文字组合"],
  group: ["vectorPartGroup", "图形组合"],
  shape: ["vectorPartShape", "图形"],
};

function getVectorPartLabel(part, t) {
  if (part?.name) return part.name;
  const [key, fallback] = VECTOR_PART_LABEL_KEYS[part?.kind] || VECTOR_PART_LABEL_KEYS.shape;
  return `${t(key, fallback)} ${Number(part?.index || 0) + 1}`;
}

function VectorPartAction({ icon, title, hint, active, disabled = false, onClick, children }) {
  return (
    <div className={`vector-part-action ${active ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}>
      <button type="button" disabled={disabled} aria-expanded={active} onClick={onClick}>
        <i>{icon}</i>
        <span><strong>{title}</strong><small>{hint}</small></span>
        {active ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>
      {active && !disabled ? <div className="vector-part-action-body">{children}</div> : null}
    </div>
  );
}

function VectorDesignDialog({ t, segment, onApply, onClose }) {
  const [initialState] = useState(() => {
    const design = normalizeVectorDesign(segment.vectorDesign);
    const hydrated = buildVectorDesignPatch(segment, design);
    return {
      design,
      document: createEditableVectorDocument(hydrated.vectorBody || ""),
    };
  });
  const initialDocument = initialState.document;
  const initialDesign = initialState.design;
  const [draftBody, setDraftBody] = useState(initialDocument.body);
  const [draft, setDraft] = useState(initialDesign);
  const documentState = useMemo(() => createEditableVectorDocument(draftBody), [draftBody]);
  const [selectedPartId, setSelectedPartId] = useState(() => initialDocument.parts[0]?.id || "");
  const [openAction, setOpenAction] = useState("");
  const [professionalOpen, setProfessionalOpen] = useState(false);
  const previewRef = useRef(null);
  const [previewViewBox, setPreviewViewBox] = useState("0 0 1200 1200");
  const update = (patch) => setDraft((current) => normalizeVectorDesign({ ...current, ...patch }));
  const appearance = getVectorDesignAppearance(draft);
  const selectedPart = documentState.parts.find((part) => part.id === selectedPartId) || documentState.parts[0] || null;
  const hasChanges = draftBody !== initialDocument.body || JSON.stringify(draft) !== JSON.stringify(initialDesign);
  const activeStep = hasChanges ? 2 : selectedPart ? 1 : 0;
  const previewBody = useMemo(() => createVectorSelectionBody(
    recolorVectorBody(documentState.body, draft, segment.vectorColorSlots),
    selectedPart?.id,
  ), [documentState.body, draft, segment.vectorColorSlots, selectedPart?.id]);

  useEffect(() => {
    if (selectedPart || !documentState.parts.length) return;
    setSelectedPartId(documentState.parts[0].id);
  }, [documentState.parts, selectedPart]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const bounds = preview.getBBox?.();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      setPreviewViewBox("0 0 1200 1200");
      return;
    }
    const padding = Math.max(bounds.width, bounds.height) * 0.1;
    setPreviewViewBox([
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2,
    ].join(" "));
  }, [previewBody]);

  const updateSelectedPart = (patch) => {
    if (!selectedPart) return;
    const next = updateVectorPart(documentState.body, selectedPart.id, patch);
    setDraftBody(next.body);
  };

  const handleCanvasPartSelection = (event) => {
    const target = event.target?.closest?.("[data-vector-part-id]");
    const id = target?.getAttribute?.("data-vector-part-id");
    if (id) setSelectedPartId(id);
  };

  const handleCanvasKeyDown = (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const target = event.target?.closest?.("[data-vector-part-id]");
    const id = target?.getAttribute?.("data-vector-part-id");
    if (!id) return;
    event.preventDefault();
    setSelectedPartId(id);
  };

  const toggleAction = (id) => setOpenAction((current) => current === id ? "" : id);
  const resetAll = () => {
    setDraftBody(initialDocument.body);
    setDraft(initialDesign);
    setSelectedPartId(initialDocument.parts[0]?.id || "");
    setOpenAction("");
    setProfessionalOpen(false);
  };

  return createPortal(
    <div className="vector-design-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="vector-design-dialog" role="dialog" aria-modal="true" aria-labelledby="vector-design-title">
        <header>
          <div><span>{t("vectorAdvancedKicker", "矢量设计")}</span><h2 id="vector-design-title">{t("vectorAdvancedTitle", "高级矢量设计")}</h2></div>
          <button type="button" aria-label={t("close", "关闭")} onClick={onClose}><X size={18} /></button>
        </header>
        <nav className="vector-design-steps" aria-label={t("vectorDesignSteps", "编辑步骤")}>
          {[
            [t("vectorStepSelect", "选择部分"), CursorClick],
            [t("vectorStepAdjust", "调整样式"), SlidersHorizontal],
            [t("vectorStepFinish", "完成"), CheckCircle],
          ].map(([label, Icon], index) => (
            <div className={`${activeStep === index ? "is-active" : ""} ${activeStep > index ? "is-complete" : ""}`} key={label}>
              <i>{activeStep > index ? <CheckCircle size={17} weight="fill" /> : <Icon size={16} />}</i>
              <strong>{index + 1}</strong>
              <span>{label}</span>
            </div>
          ))}
        </nav>
        <div className="vector-design-layout">
          <div className="vector-design-stage">
            <svg
              ref={previewRef}
              className="vector-design-svg"
              viewBox={previewViewBox}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={t("vectorCanvasLabel", "可选择图形部分的矢量预览")}
              onClick={handleCanvasPartSelection}
              onKeyDown={handleCanvasKeyDown}
              style={{ filter: appearance.filter, opacity: appearance.opacity, mixBlendMode: appearance.cssBlendMode }}
              dangerouslySetInnerHTML={{ __html: previewBody }}
            />
            <div className="vector-design-stage-hint"><CursorClick size={15} /><span>{t("vectorCanvasHint", "点击画布或图层，选择要编辑的部分")}</span></div>
          </div>
          <aside className="vector-parts-panel">
            <div className="vector-parts-heading">
              <div><strong>{t("vectorPartsTitle", "图形部分")}</strong><span>{t("vectorPartsDetected", "已自动识别")}</span></div>
              <Info size={15} />
            </div>
            <p>{t("vectorPartsHint", "每个图形会根据实际结构显示不同部分")}</p>
            {documentState.parts.length ? (
              <div className="vector-parts-list" role="listbox" aria-label={t("vectorPartsTitle", "图形部分")}>
                {documentState.parts.map((part) => {
                  const active = part.id === selectedPart?.id;
                  const label = getVectorPartLabel(part, t);
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? "is-active" : ""}
                      onClick={() => setSelectedPartId(part.id)}
                      key={part.id}
                    >
                      <img src={createVectorPartThumbnail(documentState.body, part.id)} alt="" />
                      <span>
                        <strong>{label}</strong>
                        <small>{part.count > 1
                          ? t("vectorPartItems", "{count} items").replace("{count}", part.count)
                          : t("vectorPartSingle", "1 个元素")}</small>
                      </span>
                      {active ? <i /> : <CaretRight size={15} />}
                    </button>
                  );
                })}
              </div>
            ) : <div className="vector-parts-empty">{t("vectorPartsUnavailable", "这个图形暂时只能进行整体调整")}</div>}
          </aside>
          <div className="vector-design-controls">
            <div className="vector-selected-heading">
              <span>{t("vectorEditQuestion", "你想修改什么？")}</span>
              <strong>{selectedPart ? getVectorPartLabel(selectedPart, t) : t("vectorWholeGraphic", "整个图形")}</strong>
            </div>
            {selectedPart ? <>
              <VectorPartAction
                icon={<Drop size={20} weight="duotone" />}
                title={t("vectorActionColor", "换颜色")}
                hint={t("vectorActionColorHint", "更改这个部分的颜色")}
                active={openAction === "color"}
                disabled={!selectedPart.supportsColor}
                onClick={() => toggleAction("color")}
              >
                <div className="vector-part-color-editor">
                  <input aria-label={t("vectorActionColor", "换颜色")} type="color" value={selectedPart.color} onChange={(event) => updateSelectedPart({ color: event.target.value })} />
                  {["#35ead9", "#4d96ff", "#ff5f65", "#ffde59", "#f5fbff"].map((color) => (
                    <button type="button" aria-label={color} style={{ "--vector-swatch": color }} onClick={() => updateSelectedPart({ color })} key={color} />
                  ))}
                </div>
              </VectorPartAction>
              <VectorPartAction
                icon={<SlidersHorizontal size={20} />}
                title={t("vectorActionThickness", "调整粗细")}
                hint={selectedPart.supportsStroke ? t("vectorActionThicknessHint", "让线条更粗或更细") : t("vectorActionUnavailable", "这个部分没有可调整的线条")}
                active={openAction === "stroke"}
                disabled={!selectedPart.supportsStroke}
                onClick={() => toggleAction("stroke")}
              >
                <VectorDesignRange label={t("vectorOutlineWidth", "轮廓宽度")} value={selectedPart.strokeWidth} min="1" max="120" suffix="px" onChange={(value) => updateSelectedPart({ strokeWidth: value })} />
              </VectorPartAction>
              <VectorPartAction
                icon={<ArrowsOut size={20} />}
                title={t("vectorActionTransform", "移动与缩放")}
                hint={t("vectorActionTransformHint", "调整位置、大小或方向")}
                active={openAction === "transform"}
                onClick={() => toggleAction("transform")}
              >
                <div className="vector-part-transform-grid">
                  <label><span>X</span><input type="number" value={selectedPart.translateX} onChange={(event) => updateSelectedPart({ translateX: event.target.value })} /></label>
                  <label><span>Y</span><input type="number" value={selectedPart.translateY} onChange={(event) => updateSelectedPart({ translateY: event.target.value })} /></label>
                  <label className="is-wide"><span>{t("vectorScale", "大小")}</span><input type="range" min=".1" max="3" step=".05" value={selectedPart.scale} onChange={(event) => updateSelectedPart({ scale: event.target.value })} /><output>{Math.round(selectedPart.scale * 100)}%</output></label>
                </div>
              </VectorPartAction>
              <VectorPartAction
                icon={<Sun size={20} />}
                title={t("vectorActionShadow", "添加阴影")}
                hint={t("vectorActionShadowHint", "为这个部分增加层次")}
                active={openAction === "shadow"}
                onClick={() => toggleAction("shadow")}
              >
                <button type="button" className={`vector-part-shadow-toggle ${selectedPart.shadowEnabled ? "is-active" : ""}`} aria-pressed={selectedPart.shadowEnabled} onClick={() => updateSelectedPart({ shadowEnabled: !selectedPart.shadowEnabled })}>
                  {selectedPart.shadowEnabled ? t("enabled", "已开启") : t("disabled", "已关闭")}
                </button>
              </VectorPartAction>
            </> : null}

            <section className={`vector-professional-options ${professionalOpen ? "is-open" : ""}`}>
              <button type="button" aria-expanded={professionalOpen} onClick={() => setProfessionalOpen((value) => !value)}>
                <span><Stack size={17} /><strong>{t("vectorProfessionalOptions", "显示专业选项")}</strong></span>
                {professionalOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
              </button>
              <small>{t("vectorProfessionalHint", "渐变、整体外观与精度控制")}</small>
              {professionalOpen ? <div className="vector-professional-body">
                <div className="vector-design-mode">
                  <button type="button" className={!draft.paletteEnabled ? "is-active" : ""} onClick={() => update({ paletteEnabled: false })}>{t("vectorOriginalColors", "原始配色")}</button>
                  <button type="button" className={draft.paletteEnabled ? "is-active" : ""} onClick={() => update({ paletteEnabled: true })}>{t("vectorCustomPalette", "自定义配色")}</button>
                </div>
                <div className="vector-design-colors">
                  {[
                    ["primary", t("vectorPrimaryColor", "主色")],
                    ["secondary", t("vectorSecondaryColor", "辅色")],
                    ["accent", t("vectorAccentColor", "强调色")],
                  ].map(([key, label]) => (
                    <label key={key}><span>{label}</span><input type="color" value={draft[key]} onChange={(event) => update({ paletteEnabled: true, [key]: event.target.value })} /></label>
                  ))}
                </div>
                <VectorDesignRange label={t("vectorOpacity", "透明度")} value={Math.round(draft.opacity * 100)} min="0" max="100" suffix="%" onChange={(value) => update({ opacity: value / 100 })} />
                <VectorDesignRange label={t("vectorSaturation", "饱和度")} value={draft.saturation} min="0" max="240" suffix="%" onChange={(value) => update({ saturation: value })} />
                <VectorDesignRange label={t("vectorBrightness", "亮度")} value={draft.brightness} min="20" max="200" suffix="%" onChange={(value) => update({ brightness: value })} />
                <VectorDesignRange label={t("vectorContrast", "对比度")} value={draft.contrast} min="20" max="200" suffix="%" onChange={(value) => update({ contrast: value })} />
                <label className="vector-design-select"><span>{t("vectorBlendMode", "混合模式")}</span><select value={draft.blendMode} onChange={(event) => update({ blendMode: event.target.value })}>
                  <option value="source-over">{t("vectorBlendNormal", "正常")}</option>
                  <option value="multiply">{t("vectorBlendMultiply", "正片叠底")}</option>
                  <option value="screen">{t("vectorBlendScreen", "滤色")}</option>
                  <option value="overlay">{t("vectorBlendOverlay", "叠加")}</option>
                </select></label>
              </div> : null}
            </section>
            <div className="vector-design-reassurance"><ShieldCheck size={16} /><span>{t("vectorReversibleHint", "不会破坏原始图形，随时可以重置")}</span></div>
          </div>
        </div>
        <footer>
          <button type="button" className="panel-secondary" disabled={!hasChanges} onClick={resetAll}>{t("resetAll", "重置所有")}</button>
          <span />
          <button type="button" className="panel-secondary" onClick={onClose}>{t("cancel", "取消")}</button>
          <button type="button" className="vector-design-apply" onClick={() => onApply({ design: draft, body: documentState.body })}>{t("apply", "应用")}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function VectorControls({ t, segment, onUpdate }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const design = normalizeVectorDesign(segment.vectorDesign);
  const commit = (patch) => {
    const next = normalizeVectorDesign({ ...design, ...patch });
    onUpdate(buildVectorDesignPatch(segment, next));
  };
  return (
    <>
      <section className="vector-overlay-quick">
        <div className="vector-overlay-quick-title"><div><strong>{t("vectorQuickStyle", "矢量样式")}</strong><span>{t("vectorQuickStyleHint", "常用属性即时生效")}</span></div><Sparkle size={17} weight="duotone" /></div>
        <div className="vector-design-mode">
          <button type="button" className={!design.paletteEnabled ? "is-active" : ""} onClick={() => commit({ paletteEnabled: false })}>{t("vectorOriginalColors", "原始配色")}</button>
          <button type="button" className={design.paletteEnabled ? "is-active" : ""} onClick={() => commit({ paletteEnabled: true })}>{t("vectorCustomPalette", "自定义配色")}</button>
        </div>
        <div className="vector-overlay-inline-colors">
          <label>
            <span>{t("vectorPrimaryColor", "主色")}</span>
            <span className="vector-color-value">
              <code>{design.primary.toUpperCase()}</code>
              <span className="vector-color-swatch" style={{ "--vector-quick-color": design.primary }}>
                <input aria-label={t("vectorPrimaryColor", "主色")} type="color" value={design.primary} onChange={(event) => commit({ paletteEnabled: true, primary: event.target.value })} />
              </span>
            </span>
          </label>
          <label><span>{t("vectorOpacity", "透明度")}</span><input type="range" min="0" max="1" step="0.01" value={design.opacity} onChange={(event) => commit({ opacity: event.target.value })} /><output>{Math.round(design.opacity * 100)}%</output></label>
        </div>
        <button type="button" className="vector-advanced-open" onClick={() => setAdvancedOpen(true)}><Sparkle size={15} />{t("vectorOpenAdvanced", "高级设计…")}</button>
      </section>
      {advancedOpen ? <VectorDesignDialog
        t={t}
        segment={segment}
        onClose={() => setAdvancedOpen(false)}
        onApply={({ design, body }) => {
          onUpdate(buildVectorDesignPatch({
            ...segment,
            id: "",
            assetId: "",
            vectorBody: body,
            vectorColorSlots: null,
          }, design));
          setAdvancedOpen(false);
        }}
      /> : null}
    </>
  );
}

function CaptionContextPanel({
  t,
  captionSegments,
  selectedCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  currentSegmentIndex,
  captionTargetDuration,
  updateCaptionSegmentText,
  toggleCaptionSegmentHidden,
  deleteCaptionSegment,
  seekTo,
  sourceAudioBlob,
  generateCaptionsFromSourceAudio,
  isGeneratingCaptions,
  automaticCaptionProgress,
  importCaptionSegments,
  addCaptionSegment,
  alignCaptionToAudio,
  linkCaptionAudio,
  unlinkCaptionAudio,
  audioSegments,
}) {
  const srtInputRef = useRef(null);
  const focusNewCaptionRef = useRef(false);
  const [pendingSrt, setPendingSrt] = useState(null);
  const selectedIndex = Math.max(
    0,
    captionSegments.findIndex((segment) => segment.id === selectedCaptionSegment?.id),
  );
  const selectedStart = captionSegments.length
    ? getSegmentStartTime(captionSegments, selectedIndex, captionTargetDuration)
    : 0;
  const linkedAudioSegment = audioSegments.find((segment) => segment.id === selectedCaptionSegment?.audioSegmentId);
  const relinkTarget = findCaptionAudioLinkTarget(selectedCaptionSegment, audioSegments);

  useEffect(() => {
    if (!focusNewCaptionRef.current || !selectedCaptionSegment) return;
    focusNewCaptionRef.current = false;
    const frame = requestAnimationFrame(() => document.getElementById("caption-context-input")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [selectedCaptionSegment]);

  function handleAddCaption() {
    focusNewCaptionRef.current = true;
    addCaptionSegment();
  }

  async function handleSrtFile(file) {
    if (!file) return;
    try {
      if (file.size > MAX_SRT_FILE_BYTES) throw new Error(t("srtFileTooLarge"));
      const result = parseSrt(await file.text());
      if (!result.captions.length) throw new Error(t("srtNoValidCaptions"));
      if (captionSegments.length) setPendingSrt(result);
      else importCaptionSegments(result.captions, "replace", result.skipped);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("srtImportFailed"));
    }
  }

  function applyPendingSrt(mode) {
    if (!pendingSrt) return;
    importCaptionSegments(pendingSrt.captions, mode, pendingSrt.skipped);
    setPendingSrt(null);
  }

  return (
    <div className="caption-context-panel">
      <label className="field-label" htmlFor="caption-context-input">
        {t("captionScriptLabel", "字幕文案")}
      </label>
      {selectedCaptionSegment ? (
        <div className="script-box caption-sync-box">
          <textarea
            id="caption-context-input"
            value={selectedCaptionSegment.text}
            onChange={(event) => updateCaptionSegmentText(selectedCaptionSegment.id, event.target.value)}
          />
          <div className="script-meta">
            <button type="button" onClick={() => seekTo(selectedStart)}>
              <ClosedCaptioning size={14} />
              {formatTime(selectedStart)}
            </button>
            <span>{selectedCaptionSegment.text.length} / 500</span>
          </div>
        </div>
      ) : (
        <div className="caption-context-empty">
          <ClosedCaptioning size={28} weight="duotone" />
          <strong>{t("noCaptionSegments")}</strong>
          <span>{t("captionEmptyHint", "字幕片段可拖动到字幕轨道，并在这里同步编辑。")}</span>
          <div className="caption-empty-actions">
            <button className="caption-add-button" type="button" onClick={handleAddCaption}>
              <Plus size={16} weight="bold" />{t("addCaption")}
            </button>
            <button className="caption-empty-import" type="button" onClick={() => srtInputRef.current?.click()}>
              <UploadSimple size={15} />{t("importSrt")}
            </button>
          </div>
        </div>
      )}

      {selectedCaptionSegment ? (
        <section className={`caption-audio-link ${linkedAudioSegment ? "is-linked" : ""}`} data-testid="caption-audio-link">
          <div>
            <span>{linkedAudioSegment ? <Link size={16} /> : <LinkBreak size={16} />}</span>
            <div>
              <strong>{linkedAudioSegment ? t("captionLinkedAudio") : t("captionAudioNotLinked")}</strong>
              <em>{linkedAudioSegment
                ? `${linkedAudioSegment.name || t("audioClip")} · ${formatTime(linkedAudioSegment.duration)}`
                : relinkTarget ? t("captionAudioRelinkHint") : t("captionAudioUnavailable")}</em>
            </div>
          </div>
          <div className="caption-audio-link-actions">
            {linkedAudioSegment ? <>
              <button type="button" onClick={() => alignCaptionToAudio(selectedCaptionSegment.id)}>{t("captionAlignToAudio")}</button>
              <button type="button" className="is-unlink" onClick={() => unlinkCaptionAudio(selectedCaptionSegment.id)}>{t("captionUnlinkAudio")}</button>
            </> : (
              <button type="button" disabled={!relinkTarget} onClick={() => linkCaptionAudio(selectedCaptionSegment.id)}>{t("captionLinkAudio")}</button>
            )}
          </div>
        </section>
      ) : null}

      <div className="caption-context-actions">
        <button
          className="panel-secondary"
          type="button"
          disabled={!selectedCaptionSegment}
          onClick={() => selectedCaptionSegment && toggleCaptionSegmentHidden(selectedCaptionSegment.id)}
        >
          {selectedCaptionSegment?.hidden ? <Eye size={15} /> : <EyeSlash size={15} />}
          {selectedCaptionSegment?.hidden ? t("showCurrentCaption") : t("hideCurrentCaption", "隐藏当前字幕")}
        </button>
        <button
          className="panel-danger"
          type="button"
          disabled={!selectedCaptionSegment}
          onClick={() => selectedCaptionSegment && deleteCaptionSegment(selectedCaptionSegment.id)}
        >
          <Trash size={15} />
          {t("deleteCurrentCaption")}
        </button>
      </div>

      {!captionSegments.length ? (
        <button
          className="audio-entry-card caption-entry-card"
          type="button"
          disabled={!sourceAudioBlob || isGeneratingCaptions}
          onClick={generateCaptionsFromSourceAudio}
        >
          <ClosedCaptioning size={24} weight="duotone" />
          <span>
            <strong>{isGeneratingCaptions ? t("autoCaptionsRunning") : t("autoCaptionsTitle")}</strong>
            <em>{sourceAudioBlob ? t("autoCaptionsDesc") : t("autoCaptionsNeedsSource")}</em>
          </span>
          {isGeneratingCaptions ? (
            <span className="inline-progress" aria-hidden="true">
              <span style={{ width: `${automaticCaptionProgress}%` }} />
            </span>
          ) : null}
        </button>
      ) : null}

      <div className="caption-context-heading">
        <span><ListBullets size={16} />{t("captionList", "字幕列表")}</span>
        {captionSegments.length ? (
          <>
            <button className="caption-add-inline" type="button" onClick={handleAddCaption}>
              <Plus size={14} weight="bold" />{t("addCaption")}
            </button>
            <button className="caption-import-button" type="button" onClick={() => srtInputRef.current?.click()}>
              <UploadSimple size={14} />{t("importSrt")}
            </button>
          </>
        ) : null}
        <input
          ref={srtInputRef}
          className="sr-only"
          type="file"
          accept=".srt,application/x-subrip,text/plain"
          data-testid="srt-file-input"
          onChange={(event) => {
            handleSrtFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {pendingSrt ? createPortal(
        <div className="srt-import-backdrop" role="presentation">
          <section className="srt-import-dialog" role="dialog" aria-modal="true" aria-label={t("srtConflictTitle")}>
            <strong>{t("srtConflictTitle")}</strong>
            <p>{t("srtConflictDescription").replace("{count}", pendingSrt.captions.length)}</p>
            <div>
              <button className="panel-secondary" type="button" onClick={() => setPendingSrt(null)}>{t("cancel")}</button>
              <button className="panel-secondary" type="button" onClick={() => applyPendingSrt("append")}>{t("appendSrt")}</button>
              <button className="auto-edit-apply" type="button" onClick={() => applyPendingSrt("replace")}>{t("replaceSrt")}</button>
            </div>
          </section>
        </div>, document.body,
      ) : null}
      <div className="caption-context-list">
        {captionSegments.length ? (
          captionSegments.map((segment, index) => (
            <button
              type="button"
              className={`${index === currentSegmentIndex ? "is-current" : ""} ${
                segment.id === selectedSegmentId ? "is-selected" : ""
              } ${segment.hidden ? "is-hidden" : ""}`}
              key={segment.id}
              onClick={() => {
                setSelectedSegmentId(segment.id);
                seekTo(getSegmentStartTime(captionSegments, index, captionTargetDuration));
              }}
            >
              <span>{segment.text}</span>
              <em>{formatTime(getSegmentStartTime(captionSegments, index, captionTargetDuration))}</em>
            </button>
          ))
        ) : (
          <div className="empty-state">{t("noCaptionSegments")}</div>
        )}
      </div>
    </div>
  );
}

function AudioVoiceColorSection({ t, segment, voiceProfiles = [], onAssetReady, onApply, onRestore }) {
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderStreamRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const [profileId, setProfileId] = useState(voiceProfiles[0]?.id || "");
  const [reference, setReference] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [recording, setRecording] = useState(false);
  const [job, setJob] = useState({ state: "idle", progress: 0, phase: "", error: "" });
  const [result, setResult] = useState(null);
  const [applied, setApplied] = useState(Boolean(segment.voiceColorOriginalBlob));
  const resultUrl = useMemo(() => result?.blob ? URL.createObjectURL(result.blob) : "", [result]);
  const selectedProfile = voiceProfiles.find((profile) => profile.id === profileId) || null;

  useEffect(() => {
    if (!profileId && voiceProfiles[0]?.id) setProfileId(voiceProfiles[0].id);
  }, [profileId, voiceProfiles]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);
  useEffect(() => () => recorderStreamRef.current?.getTracks?.().forEach((track) => track.stop()), []);
  useEffect(() => setApplied(Boolean(segment.voiceColorOriginalBlob)), [segment.id, segment.voiceColorOriginalBlob]);

  const chooseReference = (blob, name, sourceKind) => {
    setReference({ blob, name, sourceKind }); setProfileId(""); setAuthorized(false); setResult(null); setJob({ state: "idle", progress: 0, phase: "", error: "" });
  };
  const toggleRecording = async () => {
    if (recording) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); recorderChunksRef.current = []; recorderStreamRef.current = stream; recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop()); recorderStreamRef.current = null; recorderRef.current = null; setRecording(false);
        if (blob.size) chooseReference(blob, t("voiceColorRecordedReference", "录制参考声音"), "recording");
      };
      recorder.start(250); setRecording(true);
    } catch {
      setJob({ state: "error", progress: 0, phase: "", error: t("recordingPermissionDenied") });
    }
  };
  const runConversion = async () => {
    if (!segment?.blob || (!selectedProfile?.embedding && (!reference?.blob || !authorized))) return;
    setJob({ state: "running", progress: 3, phase: t("voiceColorPreparing", "准备音色"), error: "" }); setResult(null);
    try {
      const embedding = selectedProfile?.embedding || await extractVoiceEmbedding(reference.blob, (event) => setJob((current) => ({ ...current, progress: Math.min(35, Math.round((event.progress || 0) * 0.35)), phase: event.phase || t("cloneEncoding", "提取音色") })));
      const blob = await convertVoiceBlob(segment.blob, embedding, {
        onProgress: (event) => setJob((current) => ({ ...current, progress: 35 + Math.round((event.progress || 0) * 0.65), phase: event.phase || t("voiceColorConverting", "迁移音色") })),
      });
      const decoded = await decodeWaveform(blob, 96);
      const profileName = selectedProfile?.name || reference?.name?.replace(/\.[^.]+$/, "") || t("myCloneVoice", "克隆音色");
      const asset = await onAssetReady?.({ blob, decoded, profileName, sourceName: segment.name, sourceSegment: segment });
      setResult({ blob, decoded, profileName, assetId: asset?.id || "" });
      setJob({ state: "ready", progress: 100, phase: t("voiceColorReady", "音色迁移完成"), error: "" });
    } catch (error) {
      if (error?.name === "AbortError") return setJob({ state: "idle", progress: 0, phase: "", error: "" });
      setJob({ state: "error", progress: 0, phase: "", error: error instanceof Error ? error.message : t("voiceColorFailed", "音色迁移失败") });
    }
  };
  const cancel = () => { cancelOpenVoiceTasks(); setJob({ state: "idle", progress: 0, phase: "", error: "" }); };
  const applyResult = () => {
    if (!result) return;
    const didApply = onApply?.({ ...result, segment });
    if (didApply !== false) setApplied(true);
  };
  const restoreOriginal = () => {
    const didRestore = onRestore?.(segment);
    if (didRestore !== false) setApplied(false);
  };

  return <div className="audio-voice-color-section">
    <input ref={fileInputRef} hidden type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseReference(file, file.name, "upload"); event.target.value = ""; }} />
    <div className="voice-color-source"><span>{t("voiceColorSource", "当前源音频")}</span><strong>{segment.name || t("audioClip")}</strong><em>{formatTime(segment.duration)}</em></div>
    <div className="voice-color-target">
      <strong className="voice-color-target-label">{t("voiceColorTarget", "目标音色")}</strong>
      {voiceProfiles.length ? <div className="voice-color-profile-grid">
        {voiceProfiles.map((profile) => <button type="button" className={profileId === profile.id ? "is-selected" : ""} key={profile.id} onClick={() => { setProfileId(profile.id); setReference(null); setAuthorized(false); setResult(null); }}><Waveform size={16} weight="duotone" /><span>{profile.name}</span><CheckCircle size={14} weight={profileId === profile.id ? "fill" : "regular"} /></button>)}
      </div> : <p className="voice-color-empty-target">{t("voiceColorChooseTemporary", "上传或录制参考声音")}</p>}
      <div className="voice-color-reference-actions"><button type="button" onClick={() => fileInputRef.current?.click()}><UploadSimple size={16} />{t("uploadVoice", "上传声音")}</button><button type="button" className={recording ? "is-recording" : ""} onClick={toggleRecording}><Waveform size={16} />{recording ? t("stopRecording") : t("recordVoice")}</button></div>
      {reference ? <div className="voice-color-reference"><strong>{reference.name}</strong><span>{t("voiceColorTemporaryReference", "仅用于本次音色迁移")}</span></div> : null}
      {reference ? <label className="clone-consent"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} /><span>{t("cloneConsent")}</span></label> : null}
    </div>
    {job.state === "running" ? <div className="voice-generation-loading voice-color-progress" role="status"><i className="voice-generation-spinner" /><div><strong>{job.phase}</strong><span>{t("cloneLocalHint", "声音只在当前浏览器中处理")}</span></div><em>{job.progress}%</em><div className="progress-track"><span style={{ width: `${job.progress}%` }} /></div></div> : null}
    {job.error ? <div className="clone-inline-error">{job.error}</div> : null}
    {resultUrl ? <div className="voice-color-result"><span><CheckCircle size={17} weight="fill" /><strong>{t("voiceColorSavedToAssets", "结果已保存到我的素材")}</strong></span><audio controls preload="metadata" src={resultUrl} /></div> : null}
    <div className="voice-color-actions">
      {job.state === "running" ? <button type="button" onClick={cancel}>{t("cancel")}</button> : <button type="button" disabled={!selectedProfile?.embedding && (!reference?.blob || !authorized)} onClick={runConversion}>{result ? t("voiceColorRetry", "重新转换") : t("voiceColorPreview", "试听迁移")}</button>}
      <button type="button" className={`is-primary ${applied ? "is-applied" : ""}`} disabled={!result || applied} onClick={applyResult}>{applied ? t("voiceColorApplied", "已替换") : t("voiceColorReplaceClip", "替换当前片段")}</button>
    </div>
    {applied || segment.voiceColorOriginalBlob ? <button className="voice-color-restore" type="button" onClick={restoreOriginal}>{t("voiceColorRestoreOriginal", "恢复原始声音")}</button> : null}
  </div>;
}

function AudioClipContextPanel({ t, segment, updateAudioSegment, toggleAudioSegmentReverse, deleteAudioSegment, downloadBlob, requestedSection = "", voiceProfiles, onVoiceColorAssetReady, onApplyVoiceColor, onRestoreVoiceColor }) {
  const [activeTab, setActiveTab] = useState("audio");
  const isVoiceClip = segment.track === "audio";
  const canVoiceColor = segment.track !== "music" && Boolean(segment.blob);
  const canSpatial = true;
  const shownTab = requestedSection === "spatial" ? "spatial" : requestedSection === "voice-color" ? "voice-color" : requestedSection === "fade" ? "fade" : requestedSection === "audio" ? "audio" : activeTab;
  const canFade = segment.track !== "source";
  useEffect(() => {
    if (["audio", "fade", "spatial", "voice-color"].includes(requestedSection)) setActiveTab(requestedSection);
  }, [requestedSection, segment.id]);
  const tabCount = 1 + Number(canFade) + Number(canSpatial) + Number(canVoiceColor);
  return (
    <div className="audio-clip-context-panel">
      {!requestedSection && (canFade || canSpatial || canVoiceColor) ? <div className={`audio-context-tabs has-${tabCount}-tabs`} role="tablist" aria-label={t("audioClipProperties")}>
        <button className={shownTab === "audio" ? "is-active" : ""} type="button" role="tab" aria-selected={shownTab === "audio"} onClick={() => setActiveTab("audio")}>{t("mobileClipAudio")}</button>
        {canFade ? <button className={shownTab === "fade" ? "is-active" : ""} type="button" role="tab" aria-selected={shownTab === "fade"} onClick={() => setActiveTab("fade")}>{t("mobileClipFade")}</button> : null}
        {canSpatial ? <button className={shownTab === "spatial" ? "is-active" : ""} type="button" role="tab" aria-selected={shownTab === "spatial"} onClick={() => setActiveTab("spatial")}>{t("audioSpaceTab")}</button> : null}
        {canVoiceColor ? <button className={shownTab === "voice-color" ? "is-active" : ""} type="button" role="tab" aria-selected={shownTab === "voice-color"} onClick={() => setActiveTab("voice-color")}>{t("voiceColorTab", "音色")}</button> : null}
      </div> : null}
      {shownTab === "audio" ? <div className="audio-context-section">
        {segment.canChangeStart !== false ? <label className="audio-property-row">
          <span>{t("audioClipStart")}</span>
          <input type="number" min="0" step="0.1" value={Number(segment.start.toFixed(1))} onChange={(event) => updateAudioSegment(segment.id, { start: Math.max(0, Number(event.target.value) || 0) })} />
        </label> : null}
        <label className="audio-property-slider">
          <span><b>{t("volume")}</b><em>{Math.round((segment.volume ?? 1) * 100)}%</em></span>
          <input type="range" min="0" max="4" step="0.01" value={segment.volume ?? 1} onChange={(event) => updateAudioSegment(segment.id, { volume: Number(event.target.value) })} />
        </label>
        {segment.canChangeSpeed !== false ? <div className="audio-property-slider">
          <span><b>{t("visualSpeed")}</b><em>{(segment.playbackRate ?? 1).toFixed((segment.playbackRate ?? 1) % 1 ? 2 : 0)}×</em></span>
          <div className="visual-speed-presets" aria-label={t("visualSpeed")}>
            {[0.5, 1, 1.5, 2, 3, 4].map((rate) => (
              <button type="button" className={Math.abs((segment.playbackRate ?? 1) - rate) < 0.001 ? "is-active" : ""} key={rate} onClick={() => updateAudioSegment(segment.id, { playbackRate: rate })}>{rate}×</button>
            ))}
          </div>
          <input aria-label={t("visualSpeed")} type="range" min="0.25" max="4" step="0.05" value={segment.playbackRate ?? 1} onChange={(event) => updateAudioSegment(segment.id, { playbackRate: Number(event.target.value) })} />
        </div> : null}
      </div> : null}
      {shownTab === "fade" && canFade ? <div className="audio-context-section audio-fade-section">
        <p>{t("audioFadeHint")}</p>
        <label className="audio-property-slider">
          <span><b>{t("fadeIn")}</b><em>{(segment.fadeIn ?? 0).toFixed(1)}s</em></span>
          <input aria-label={t("fadeIn")} type="range" min="0" max={Math.min(3, segment.duration / 2)} step="0.1" value={segment.fadeIn ?? 0} onChange={(event) => updateAudioSegment(segment.id, { fadeIn: Number(event.target.value) })} />
        </label>
        <label className="audio-property-slider">
          <span><b>{t("fadeOut")}</b><em>{(segment.fadeOut ?? 0).toFixed(1)}s</em></span>
          <input aria-label={t("fadeOut")} type="range" min="0" max={Math.min(3, segment.duration / 2)} step="0.1" value={segment.fadeOut ?? 0} onChange={(event) => updateAudioSegment(segment.id, { fadeOut: Number(event.target.value) })} />
        </label>
      </div> : null}
      {shownTab === "spatial" && canSpatial ? <div className="audio-context-section audio-spatial-section">
        <p>{t("audioSpaceHint")}</p>
        <div className="audio-spatial-picker">
          <div className="audio-spatial-grid" role="radiogroup" aria-label={t("audioSpaceTab")}>
            {AUDIO_SPATIAL_EFFECTS.map((preset) => {
              const selected = normalizeAudioSpatialEffect(segment.spatialEffect) === preset.id;
              const { Icon, Signal } = AUDIO_SPATIAL_PRESENTATION[preset.id] || AUDIO_SPATIAL_PRESENTATION.original;
              return <button type="button" role="radio" aria-checked={selected} className={selected ? "is-active" : ""} key={preset.id} onClick={() => updateAudioSegment(segment.id, { spatialEffect: preset.id })}>
                <RadioButton className="audio-spatial-radio" size={15} weight={selected ? "fill" : "regular"} aria-hidden="true" />
                <Icon className="audio-spatial-scene-icon" size={18} weight="duotone" aria-hidden="true" />
                <span>{t(preset.labelKey)}</span>
                <Signal className="audio-spatial-signal" size={18} weight="fill" aria-hidden="true" />
              </button>;
            })}
          </div>
          {normalizeAudioSpatialEffect(segment.spatialEffect) !== "original" ? <label className="audio-property-slider audio-spatial-strength">
            <span><b>{t("audioSpaceStrength")}</b><em>{Math.round(normalizeAudioSpatialAmount(segment.spatialAmount) * 100)}%</em></span>
            <input aria-label={t("audioSpaceStrength")} type="range" min="0" max="1" step="0.01" value={normalizeAudioSpatialAmount(segment.spatialAmount)} onChange={(event) => updateAudioSegment(segment.id, { spatialAmount: Number(event.target.value) })} />
          </label> : null}
        </div>
      </div> : null}
      {shownTab === "voice-color" && canVoiceColor ? <AudioVoiceColorSection t={t} segment={segment} voiceProfiles={voiceProfiles} onAssetReady={onVoiceColorAssetReady} onApply={onApplyVoiceColor} onRestore={onRestoreVoiceColor} /> : null}
      {shownTab === "audio" ? <div className="audio-context-actions">
        {isVoiceClip ? <button className={`panel-secondary ${segment.reversed ? "is-active" : ""}`} type="button" disabled={segment.reversing} onClick={() => toggleAudioSegmentReverse(segment.id)}>
          {segment.reversing ? t("audioReversing") : segment.reversed ? t("audioReverseRestore") : t("audioReverse")}
        </button> : null}
        <button className="panel-secondary" type="button" onClick={() => downloadBlob(segment.blob, `${segment.name || "audio"}.wav`)}>{t("downloadAudioClip")}</button>
        <button className="panel-secondary is-danger" type="button" onClick={() => deleteAudioSegment(segment.id)}><Trash size={15} />{t("deleteAudioClip")}</button>
      </div> : null}
    </div>
  );
}

function StickerContextPanel({ t, segment, updateStickerSegment, deleteStickerSegment }) {
  if (!segment) return null;
  const round = (value) => Math.round(value * 100) / 100;
  const updateNumber = (key, value, min, max) => updateStickerSegment({
    [key]: round(Math.max(min, Math.min(max, Number(value) || 0))),
  });
  const fields = [
    ["x", t("stickerHorizontalPosition"), 0, 100, "%"],
    ["y", t("stickerVerticalPosition"), 0, 100, "%"],
    ["scale", t("stickerScale"), 0.2, 3, "x"],
    ["rotation", t("stickerRotation"), -180, 180, "°"],
  ];
  return (
    <div className="sticker-properties-panel">
      <div className="sticker-properties-preview"><img src={segment.src} alt="" /></div>
      <div className="sticker-property-grid">
        {fields.map(([key, label, min, max, unit]) => (
          <label key={key}>{label}<input type="number" min={min} max={max} step="0.01" value={round(Number.isFinite(segment[key]) ? segment[key] : key === "scale" ? 1 : key === "x" ? 82 : key === "y" ? 20 : 0)} onChange={(event) => updateNumber(key, event.target.value, min, max)} />{unit ? null : null}</label>
        ))}
      </div>
      <label className="sticker-property-field">
        <div><span>{t("stickerOpacity")}</span><strong>{Math.round((Number.isFinite(segment.opacity) ? segment.opacity : 1) * 100)}%</strong></div>
        <input type="range" min="0" max="1" step="0.01" value={Number.isFinite(segment.opacity) ? segment.opacity : 1} onChange={(event) => updateNumber("opacity", event.target.value, 0, 1)} />
      </label>
      <button className="sticker-delete-button" type="button" onClick={deleteStickerSegment}><Trash size={14} />{t("deleteSticker")}</button>
    </div>
  );
}

function DigitalHumanContextPanel({ t, hasVisual, visualType, audioBlob, audioDuration, captionSegments, selectedVoice, avatarJob, generateAvatarAcceptanceFrame }) {
  const hasPortrait = hasVisual && visualType === "image";
  const [probeState, setProbeState] = useState("idle");
  const [probeResult, setProbeResult] = useState(null);
  const [avatarQuality, setAvatarQuality] = useState("preview");

  const runProbe = async () => {
    setProbeState("running");
    try {
      setProbeResult(await probeLivePortraitWebEnvironment());
      setProbeState("done");
    } catch (error) {
      setProbeResult({ readyForPorting: false, checks: [{ id: "runtime", state: "failed", detail: error instanceof Error ? error.message : String(error) }] });
      setProbeState("done");
    }
  };

  return (
    <div className="avatar-context-panel">
      <div className="avatar-context-hero">
        <span><Waveform size={21} weight="duotone" /></span>
        <div><small>{t("avatarKicker")}</small><strong>{t("avatarLipSyncTitle")}</strong><em>{t("avatarLipSyncDescription")}</em></div>
      </div>
      <div className="avatar-input-list">
        <div className={hasPortrait ? "is-ready" : ""}><CheckCircle size={17} weight="fill" /><span><strong>{t("avatarPortrait")}</strong><em>{hasPortrait ? t("avatarCurrentPortrait") : t("avatarNeedsPortrait")}</em></span></div>
        <div className={audioBlob ? "is-ready" : ""}><Waveform size={17} weight="duotone" /><span><strong>{t("avatarAudio")}</strong><em>{audioBlob ? `${selectedVoice?.name ?? "AI"} · ${audioDuration.toFixed(1)}s` : t("avatarNeedsAudio")}</em></span></div>
        <div className={captionSegments.length ? "is-ready" : ""}><ClosedCaptioning size={17} weight="duotone" /><span><strong>{t("avatarLipSyncSource")}</strong><em>{captionSegments.length ? `${captionSegments.length} ${t("captionSegmentsUnit")} · ${t("avatarCaptionSync")}` : t("avatarNeedsCaptions")}</em></span></div>
      </div>
      <div className="avatar-sync-mode"><span>{t("avatarModelSource")}</span><strong>{LIVE_PORTRAIT_WEB_MODEL.id}</strong></div>
      <div className="avatar-quality-picker" aria-label={t("avatarQuality")}>
        <button type="button" className={avatarQuality === "preview" ? "is-active" : ""} onClick={() => setAvatarQuality("preview")}>
          <strong>{t("avatarQualityPreview")}</strong><em>{t("avatarQualityPreviewHint")}</em>
        </button>
        <button type="button" className={avatarQuality === "quality" ? "is-active" : ""} onClick={() => setAvatarQuality("quality")}>
          <strong>{t("avatarQualityFull")}</strong><em>{t("avatarQualityFullHint")}</em>
        </button>
      </div>
      <p className="avatar-context-note">{t("avatarGenerationNote")}</p>
      <div className="avatar-porting-stages" aria-label={t("avatarPortingStatus")}>
        <div className="is-done"><span>1</span><strong>{t("avatarStagePinned")}</strong></div>
        <div className="is-done"><span>2</span><strong>{t("avatarStageGrid")}</strong></div>
        <div className="is-done"><span>3</span><strong>{t("avatarStageAudio")}</strong></div>
      </div>
      {probeResult ? (
        <div className="avatar-probe-results">
          {probeResult.checks.map((check) => <div className={`is-${check.state}`} key={check.id}><span />{check.detail}</div>)}
        </div>
      ) : null}
      <button className="panel-secondary avatar-probe-button" type="button" disabled={probeState === "running"} onClick={runProbe}>
        {probeState === "running" ? t("avatarChecking") : t("avatarCheck")}
      </button>
      {avatarJob?.running || avatarJob?.progress > 0 || avatarJob?.phase ? (
        <div className="avatar-generation-progress" aria-live="polite">
          <div><span>{avatarJob.phase || t("avatarGenerating")}</span><strong>{avatarJob.progress}%</strong></div>
          <i><b style={{ width: `${avatarJob.progress}%` }} /></i>
        </div>
      ) : null}
      <button
        className="panel-primary avatar-generate-button"
        type="button"
        disabled={!hasPortrait || avatarJob?.running}
        onClick={() => generateAvatarAcceptanceFrame(avatarQuality)}
      >
        <PersonSimpleRun size={17} weight="duotone" />
        {avatarJob?.running ? t("avatarGenerating") : t("avatarGenerate")}
      </button>
    </div>
  );
}

function FaceSwapContextPanel({ t, hasVisual, visualType, faceSwap }) {
  const inputRef = useRef(null);
  const [consented, setConsented] = useState(false);
  const targetReady = hasVisual && ["image", "video"].includes(visualType);
  const running = Boolean(faceSwap?.job?.running);
  return (
    <div className="face-swap-context-panel">
      <div className="avatar-context-hero face-swap-hero">
        <span><PersonSimpleRun size={21} weight="duotone" /></span>
        <div>
          <small>{t("faceSwapKicker")}</small>
          <strong>{t("faceSwapTitle")}</strong>
          <em>{t("faceSwapDescription")}</em>
        </div>
      </div>

      <section className={`face-swap-source-card ${faceSwap?.source ? "is-ready" : ""}`}>
        <div className="face-swap-source-preview">
          {faceSwap?.source?.url
            ? <img src={faceSwap.source.url} alt={t("faceSwapSource")} />
            : <PersonSimpleRun size={26} weight="duotone" />}
        </div>
        <div>
          <strong>{t("faceSwapSource")}</strong>
          <em>{faceSwap?.source?.name || t("faceSwapSourceHint")}</em>
        </div>
        <button type="button" className="panel-secondary" disabled={running} onClick={() => inputRef.current?.click()}>
          <UploadSimple size={14} />{faceSwap?.source ? t("faceSwapReplace") : t("faceSwapUpload")}
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) faceSwap?.setSourceFile(file);
            event.target.value = "";
          }}
        />
      </section>

      <div className={`face-swap-target-card ${targetReady ? "is-ready" : ""}`}>
        <CheckCircle size={17} weight={targetReady ? "fill" : "regular"} />
        <span>
          <strong>{t("faceSwapTarget")}</strong>
          <em>{targetReady ? t(visualType === "video" ? "faceSwapCurrentVideo" : "faceSwapCurrentImage") : t("faceSwapNeedsTarget")}</em>
        </span>
      </div>

      <div className="avatar-sync-mode">
        <span>{t("avatarModelSource")}</span>
        <strong>MobileFaceSwap 224 · WebGPU</strong>
      </div>

      <p className="avatar-context-note">{t("faceSwapLocalNote")}</p>
      <label className="face-swap-consent">
        <input type="checkbox" checked={consented} disabled={running} onChange={(event) => setConsented(event.target.checked)} />
        <span>{t("faceSwapConsent")}</span>
      </label>

      {faceSwap?.job?.stage !== "idle" && faceSwap?.job?.phase ? (
        <div className="avatar-generation-progress" aria-live="polite">
          <div>
            <span>{faceSwap.job.stage === "setup" ? t("faceSwapModelSetup") : t("faceSwapGeneration")}</span>
            <strong>{faceSwap.job.progress}%</strong>
          </div>
          <i><b style={{ width: `${faceSwap.job.progress}%` }} /></i>
          <small>{faceSwap.job.phase}</small>
        </div>
      ) : null}
      {faceSwap?.job?.error ? (
        <div className="face-swap-error" role="alert">
          <strong>{t("faceSwapFailed")}</strong>
          <span>{faceSwap.job.error}</span>
        </div>
      ) : null}
      {faceSwap?.lastResult ? (
        <div className="face-swap-result">
          <span>
            <strong>{t("faceSwapResultReady")}</strong>
            <em>{faceSwap.lastResult.name}</em>
          </span>
          <button className="panel-secondary" type="button" onClick={faceSwap.downloadResult}>
            <DownloadSimple size={15} />{t("faceSwapDownloadResult")}
          </button>
        </div>
      ) : null}

      <div className="face-swap-actions">
        {running ? (
          <button className="panel-secondary" type="button" onClick={faceSwap.cancel}>
            <X size={15} />{t("cancel")}
          </button>
        ) : null}
        <button
          className="panel-primary avatar-generate-button"
          type="button"
          disabled={!faceSwap?.source || !targetReady || !consented || running}
          onClick={faceSwap?.generate}
        >
          <PersonSimpleRun size={17} weight="duotone" />
          {running ? t("faceSwapGenerating") : t("faceSwapGenerate")}
        </button>
      </div>
    </div>
  );
}

function AvatarContextPanel(props) {
  return <DigitalHumanContextPanel {...props} />;
}

function CaptionFontSheet({
  t,
  language,
  captionStyle,
  setCaptionStyle,
  selectedCaptionSegment,
  setCaptionSegments,
  captionSegments,
}) {
  const [fontStatus, setFontStatus] = useState("");
  const [loadingFontId, setLoadingFontId] = useState("");
  const languageOptions = useMemo(() => getCaptionFontsForLanguage(language), [language]);
  const selectedFontId = selectedCaptionSegment?.fontId || captionStyle?.fontId || "default";
  const options = useMemo(() => {
    if (languageOptions.some((font) => font.id === selectedFontId)) return languageOptions;
    const current = getCaptionFont(selectedFontId);
    return [languageOptions[0], current, ...languageOptions.slice(1)]
      .filter((font, index, items) => font && items.findIndex((candidate) => candidate.id === font.id) === index);
  }, [languageOptions, selectedFontId]);

  useEffect(() => {
    let canceled = false;
    if (selectedFontId === "default") {
      setFontStatus("");
      setLoadingFontId("");
      return undefined;
    }
    setFontStatus("loading");
    setLoadingFontId(selectedFontId);
    ensureCaptionFontLoaded(selectedFontId, selectedCaptionSegment?.text || "")
      .then(() => {
        if (!canceled) setFontStatus("ready");
      })
      .catch(() => {
        if (!canceled) setFontStatus("failed");
      })
      .finally(() => {
        if (!canceled) setLoadingFontId("");
      });
    return () => {
      canceled = true;
    };
  }, [selectedCaptionSegment?.text, selectedFontId]);

  const selectFont = async (fontId) => {
    if (selectedCaptionSegment?.id) {
      setCaptionSegments?.((items) => items.map((segment) => (
        segment.id === selectedCaptionSegment.id ? { ...segment, fontId } : segment
      )));
    } else {
      setCaptionStyle?.((style) => ({ ...style, fontId }));
    }
    if (fontId === "default") {
      setFontStatus("ready");
      setLoadingFontId("");
      return;
    }
    setFontStatus("loading");
    setLoadingFontId(fontId);
    try {
      await ensureCaptionFontLoaded(
        fontId,
        selectedCaptionSegment?.text || captionSegments.map((segment) => segment.text || "").join(" "),
      );
      setFontStatus("ready");
    } catch {
      setFontStatus("failed");
    } finally {
      setLoadingFontId("");
    }
  };

  return (
    <section className="mobile-caption-font-sheet" aria-label={t("captionFont")}>
      <p>{t("captionFontHint")}</p>
      <div className="mobile-caption-font-grid">
        {options.map((font) => {
          const selected = font.id === selectedFontId;
          const loading = font.id === loadingFontId;
          return (
            <button
              type="button"
              className={selected ? "is-selected" : ""}
              aria-pressed={selected}
              disabled={loading}
              key={font.id}
              onClick={() => selectFont(font.id)}
            >
              <span
                className="mobile-caption-font-sample"
                style={{
                  fontFamily: resolveCaptionFontFamily(font.id),
                  fontWeight: resolveCaptionFontWeight(font.id),
                }}
              >
                {font.sample}
              </span>
              <strong>{font.id === "default" ? t("captionFontDefault") : font.label}</strong>
              {selected && !loading ? <CheckCircle size={17} weight="fill" /> : null}
              {loading ? <i className="mobile-caption-font-loading" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {fontStatus ? (
        <small className={`caption-font-status is-${fontStatus}`}>
          {t(fontStatus === "loading"
            ? "captionFontLoading"
            : fontStatus === "failed"
              ? "captionFontFailed"
              : "captionFontReady")}
        </small>
      ) : null}
    </section>
  );
}

export function VoicePanel({
  t,
  activeTool,
  captionVoiceFocusRequest = 0,
  status,
  statusText,
  voiceTab,
  setVoiceTab,
  script,
  updateScript,
  selectedVoiceId,
  setSelectedVoiceId,
  selectedVoice,
  filteredVoices,
  voiceFilter,
  setVoiceFilter,
  showVoiceFilter,
  setShowVoiceFilter,
  speed,
  setSpeed,
  volume,
  setVolume,
  progressPercent,
  audioBlob,
  generateVoiceover,
  downloadBlob,
  favoriteVoiceIds,
  setFavoriteVoiceIds,
  voiceProfiles,
  addVoiceProfile,
  removeVoiceProfile,
  toggleVoiceProfileFavorite,
  selectedVoiceProfileId,
  setSelectedVoiceProfileId,
  recordedVoices,
  recordingState,
  recordingElapsed,
  startVoiceRecording,
  stopVoiceRecording,
  historyItems,
  useHistoryItem,
  setHistoryItems,
  notify,
  audioUrl,
  audioRef,
  audioSegments,
  audioSegmentRefs,
  sourceAudioRef,
  musicRef,
  sourceAudioUrl,
  musicUrl,
  captionSegments,
  selectedCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  currentSegmentIndex,
  captionTargetDuration,
  updateCaptionSegmentText,
  toggleCaptionSegmentHidden,
  deleteCaptionSegment,
  importCaptionSegments,
  addCaptionSegment,
  currentTime = 0,
  seekTo,
  sourceAudioBlob,
  sourceAudioLinked,
  generateCaptionsFromSourceAudio,
  isGeneratingCaptions,
  automaticCaptionProgress,
  avatarPanelOpen,
  smartMode = "auto-edit",
  aiMusic,
  autoEdit,
  uiLanguage,
  captionStyle,
  setCaptionStyle,
  setCaptionSegments,
  smartFrame,
  analyzeCurrentVisual,
  analyzeEffectVisual,
  hasVisual,
  visualType,
  audioDuration,
  avatarJob,
  generateAvatarAcceptanceFrame,
  selectedTrack,
  selectedAudioSegment,
  selectedTrackAudioSegment,
  mobileInspectorOrigin = "",
  mobileInspectorSection = "",
  onCloseMobileInspector,
  updateSelectedTrackAudioSegment,
  deleteSelectedTrackAudioSegment,
  updateAudioSegment,
  toggleAudioSegmentReverse,
  deleteAudioSegment,
  onVoiceColorAssetReady,
  onApplyVoiceColor,
  onRestoreVoiceColor,
  selectedVisualSegment,
  selectedStickerSegment,
  updateStickerSegment,
  deleteStickerSegment,
  visualLocalTime,
  visualTimelineStart = 0,
  updateSelectedVisualEffects,
  miganRepair,
  hdRestoration,
  smartDenoise,
  onPreviewAnimation,
  selectedFilterId,
  setSelectedFilterId,
  trOption,
  selectedVisualOverlay,
  updateVisualOverlaySegment,
  updateVisualOverlayEffects,
  setVisualCanvasEditMode,
  deleteVisualOverlay,
  applyVisualOverlayPreset,
  alignCaptionToAudio,
  linkCaptionAudio,
  unlinkCaptionAudio,
  effectSegment,
  effectAnalysis,
  effectRunning,
  effectProgress,
  effectPhase,
  effectsPanelMode = "outline",
  updateSelectedSubjectEffect,
  updateSelectedClickRipple,
  removeSelectedSubjectEffect,
  faceSwap,
  cinematicDepth,
  updateSelectedCinematicDepth,
  photoParallaxDepth,
  updateSelectedPhotoParallax,
  onOpticalFlowAssetReady,
}) {
  const [captionPanelTab, setCaptionPanelTab] = useState("caption");
  const panelRef = useRef(null);
  const panelContext = resolveInspectorPanelContext({
    origin: mobileInspectorOrigin,
    activeTool,
    selectedTrack,
  });
  const isCaptionContext = panelContext === "caption";
  const isSmartContext = panelContext === "smart";
  const isEffectsContext = panelContext === "effects" || mobileInspectorSection === "effects";
  const isAvatarContext = isSmartContext && smartMode === "avatar" && avatarPanelOpen;
  const isSmartAutoContext = isSmartContext && smartMode === "auto-edit";
  const isSmartFrameContext = isSmartContext && smartMode === "smart-frame";
  const isAiMusicContext = isSmartContext && smartMode === "ai-music";
  const isFaceSwapContext = isEffectsContext && effectsPanelMode === "face-swap";
  const isOpticalFlowContext = isEffectsContext && effectsPanelMode === "vector-tracking";
  const isCinematicDepthContext = isEffectsContext && effectsPanelMode === "cinematic-depth";
  const isPhotoParallaxContext = isEffectsContext && effectsPanelMode === "photo-parallax";
  const isClickRippleContext = isEffectsContext && effectsPanelMode === "click-ripple";
  const audioPropertySegment = selectedTrack === "audio" ? selectedAudioSegment : selectedTrackAudioSegment;
  const isAudioClipContext = panelContext === "audio" && (
    Boolean(selectedTrack === "audio" && selectedAudioSegment)
    || Boolean(["source", "music"].includes(selectedTrack) && audioPropertySegment)
  );
  const isVisualContext = panelContext === "visual" && !isEffectsContext;
  const isStickerContext = panelContext === "sticker" && Boolean(selectedStickerSegment);
  const isOverlayContext = panelContext === "overlay" && Boolean(selectedVisualOverlay);
  const isVectorOverlay = isOverlayContext && (
    selectedVisualOverlay.kind === "vector"
    || Boolean(selectedVisualOverlay.vectorBody)
    || String(selectedVisualOverlay.assetId || "").startsWith("vector-")
  );
  const isVectorVisual = isVisualContext && (
    selectedVisualSegment?.kind === "vector"
    || Boolean(selectedVisualSegment?.vectorBody)
    || String(selectedVisualSegment?.assetId || "").startsWith("vector-")
  );
  const vectorOverlayAppearance = getVectorDesignAppearance(selectedVisualOverlay?.vectorDesign);
  const visualOverlayLocalTime = Math.max(0, Math.min(
    selectedVisualOverlay?.duration ?? 0,
    currentTime - (selectedVisualOverlay?.start ?? 0),
  ));
  const selectedCaptionAudioSegment = getCaptionVoiceSegment(audioSegments, selectedCaptionSegment);
  const localizedStatusText = statusText?.startsWith?.("tts") ? t(statusText) : statusText;
  const focusedSectionTitle = {
    transform: t("visualTabTransform"),
    mask: t("visualTabMask"),
    filters: t("visualTabEffects"),
    animation: t("visualTabAnimation"),
    speed: t("visualTabSpeed"),
    vector: t("vectorProperties", "矢量"),
    timing: t("overlayTiming", "层级与时长"),
    repair: t("repairTab"),
    caption: t("caption"),
    font: t("captionFont"),
    voice: t("aiVoice"),
    audio: t("mobileClipAudio"),
    fade: t("mobileClipFade"),
    spatial: t("audioSpaceTab"),
    "voice-color": t("voiceColorTab", "音色"),
    sticker: t("stickerProperties"),
    effects: t("effects"),
    outline: t("effectOutline"),
    background: t("effectBackground"),
    edge: t("effectEdgeCleanup"),
  }[mobileInspectorSection];
  const title = focusedSectionTitle || (isFaceSwapContext ? t("faceSwapTitle") : isOpticalFlowContext ? t("effectVectorTracking") : isCinematicDepthContext ? t("depthTitle") : isPhotoParallaxContext ? t("parallaxTitle") : isEffectsContext ? t("effectProperties") : isAiMusicContext ? (AI_MUSIC_COPY[uiLanguage] || AI_MUSIC_COPY.en).title : isSmartAutoContext ? t("smartAutoEdit") : isSmartFrameContext ? t("smartFrame") : isAvatarContext ? t("avatarTitle") : isVectorOverlay || isVectorVisual ? t("vectorProperties", "矢量图形") : isOverlayContext ? t("pictureInPicture", "画中画") : isStickerContext ? t("stickerProperties") : isVisualContext ? t("visualPanelTitle") : isCaptionContext ? t("caption") : isAudioClipContext ? t("audioClipProperties") : t("aiVoice"));
  const panelStatusText = isFaceSwapContext
    ? faceSwap?.job?.running ? `${faceSwap.job.progress}%` : hasVisual ? t("smartVisualReady") : t("smartWaitingVisual")
    : isOpticalFlowContext ? t("effectFlowExperimental")
    : isCinematicDepthContext ? cinematicDepth?.job?.running
      ? `${Math.round(cinematicDepth.job.progress || 0)}%`
      : cinematicDepth?.record?.complete ? t("depthAnalysisComplete") : t("depthAnalysisNeeded")
    : isPhotoParallaxContext ? photoParallaxDepth?.job?.running
      ? `${Math.round(photoParallaxDepth.job.progress || 0)}%`
      : photoParallaxDepth?.record?.complete ? t("parallaxLayersReady") : t("depthAnalysisNeeded")
    : isEffectsContext ? (effectRunning
    ? `${Math.round(effectProgress || 0)}%`
    : effectAnalysis?.complete
      ? t(effectAnalysis?.targetKind === "object" ? "effectObjectAnalysisComplete" : "effectAnalysisComplete")
      : effectAnalysis
        ? t("effectAnalysisPartial")
        : t(effectAnalysis?.targetKind === "object" ? "effectObjectAnalysisNeeded" : "effectAnalysisNeeded")) : isAiMusicContext ? (aiMusic?.job?.state === "running" ? `${Math.round((aiMusic.job.progress || 0) * 100)}%` : aiMusic?.job?.state === "complete" ? t("complete") : t("modelReady")) : isSmartAutoContext ? t(`autoEditStatus_${autoEdit?.support?.availability || "unknown"}`) : isSmartFrameContext ? (hasVisual ? t("smartVisualReady") : t("smartWaitingVisual")) : isCaptionContext
    ? captionSegments.length
      ? `${captionSegments.length} ${t("captionSegmentsUnit", "条字幕")}`
      : t("noCaptionSegments")
    : isStickerContext
      ? `${selectedStickerSegment.start.toFixed(2)}s · ${selectedStickerSegment.duration.toFixed(2)}s`
    : isOverlayContext
      ? `${selectedVisualOverlay.start.toFixed(2)}s · ${selectedVisualOverlay.duration.toFixed(2)}s · L${selectedVisualOverlay.layer || 1}`
    : isVisualContext
      ? selectedVisualSegment
        ? `${visualLocalTime.toFixed(2)}s · ${normalizeVisualKeyframes(selectedVisualSegment.keyframes).length} ${t("visualFrames")}`
        : t("visualSelectClip")
    : isAvatarContext
      ? t("avatarPortingStatus")
    : isAudioClipContext
      ? `${formatTime(audioPropertySegment.duration)} · ${audioPropertySegment.start.toFixed(1)}s`
    : statusText === "模型待命"
      ? t("modelReady")
    : localizedStatusText;

  useEffect(() => {
    if (!captionVoiceFocusRequest || !isCaptionContext) return;
    setCaptionPanelTab("voice");
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panelRef.current?.querySelector(".voice-header")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [captionVoiceFocusRequest, isCaptionContext]);

  useEffect(() => {
    if (!isCaptionContext) return;
    if (mobileInspectorSection === "voice") setCaptionPanelTab("voice");
    if (mobileInspectorSection === "caption" || mobileInspectorSection === "font") setCaptionPanelTab("caption");
  }, [isCaptionContext, mobileInspectorSection]);

  useEffect(() => {
    panelRef.current?.querySelector(".voice-tab-body")?.scrollTo({ top: 0 });
  }, [activeTool, smartMode]);

  return (
    <aside ref={panelRef} className={`voice-panel ${isCaptionContext ? "is-caption-context" : ""} ${isAvatarContext ? "is-avatar-context" : ""} ${isAudioClipContext ? "is-audio-clip-context" : ""} ${isStickerContext ? "is-sticker-context" : ""} ${isVisualContext ? "is-visual-context" : ""} ${isEffectsContext ? "is-effects-context" : ""} ${isVectorOverlay ? "is-vector-overlay-context" : ""} ${mobileInspectorSection ? "is-focused-mobile-section" : ""}`}>
      {mobileInspectorSection ? <header className="focused-mobile-sheet-header"><strong>{title}</strong><button type="button" aria-label={t("close", "关闭")} onClick={onCloseMobileInspector}><X size={20} /></button></header> : null}
      <div className="panel-title-row">
        <h1>{title}</h1>
        {isVisualContext && !selectedVisualSegment ? null : (
          <span className={`status-pill ${isCaptionContext ? "done" : status}`}>
            {panelStatusText}
          </span>
        )}
      </div>

      {!isSmartContext && !isEffectsContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && !isOverlayContext ? (
        <div className="tabs compact">
          {[
            ["synthesis", t("voiceSynthesis")],
            ["mine", t("myVoices")],
            ["favorites", t("favoriteVoicesTab", "收藏声音")],
            ["history", t("history")],
          ].map(([id, label]) => (
            <button
              className={voiceTab === id ? "is-active" : ""}
              type="button"
              key={id}
              onClick={() => setVoiceTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {isCaptionContext && !mobileInspectorSection ? (
        <div className="tabs compact caption-context-tabs" role="tablist" aria-label={t("captionTools", "字幕工具")}>
          <button
            className={captionPanelTab === "caption" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={captionPanelTab === "caption"}
            onClick={() => setCaptionPanelTab("caption")}
          >
            {t("caption", "字幕")}
          </button>
          <button
            className={captionPanelTab === "voice" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={captionPanelTab === "voice"}
            onClick={() => setCaptionPanelTab("voice")}
          >
            {t("aiVoice", "AI 配音")}
          </button>
        </div>
      ) : null}

      <div className={`voice-tab-body ${isVisualContext && !selectedVisualSegment ? "is-empty-visual-context" : ""}`}>
        {isEffectsContext && !isFaceSwapContext && !isOpticalFlowContext && !isCinematicDepthContext && !isPhotoParallaxContext && !isClickRippleContext ? <SubjectEffectsInspector
          t={t}
          segment={effectSegment}
          analysis={effectAnalysis}
          running={effectRunning}
          progress={effectProgress}
          phase={effectPhase}
          onChange={updateSelectedSubjectEffect}
          onAnalyze={analyzeEffectVisual || analyzeCurrentVisual}
          onRemove={removeSelectedSubjectEffect}
          singleSection={mobileInspectorSection}
        /> : null}
        {isClickRippleContext ? <ClickRippleInspector t={t} segment={effectSegment} onChange={updateSelectedClickRipple} /> : null}
        {isFaceSwapContext ? <FaceSwapContextPanel t={t} hasVisual={hasVisual} visualType={visualType} faceSwap={faceSwap} /> : null}
        {isOpticalFlowContext ? <OpticalFlowTrackingPanel
          t={t}
          segment={effectSegment}
          localTime={visualLocalTime}
          onAssetReady={onOpticalFlowAssetReady}
        /> : null}
        {isCinematicDepthContext ? <CinematicDepthPanel
          t={t}
          segment={effectSegment}
          analysis={cinematicDepth?.record}
          job={cinematicDepth?.job}
          onAnalyze={cinematicDepth?.analyze}
          onCancel={cinematicDepth?.cancel}
          onChange={updateSelectedCinematicDepth}
        /> : null}
        {isPhotoParallaxContext ? <PhotoParallaxPanel
          t={t}
          segment={effectSegment}
          analysis={photoParallaxDepth?.record}
          job={photoParallaxDepth?.job}
          onAnalyze={photoParallaxDepth?.analyze}
          onCancel={photoParallaxDepth?.cancel}
          onChange={updateSelectedPhotoParallax}
        /> : null}
        {isSmartAutoContext ? <AutoEditPanel t={t} hasVisual={hasVisual} language={uiLanguage} autoEdit={autoEdit} /> : null}
        {isSmartFrameContext ? <SmartFramePanel t={t} smartFrame={smartFrame} /> : null}
        {isAiMusicContext ? <AiMusicGenerator language={uiLanguage} music={aiMusic} embedded /> : null}
        {isStickerContext ? <StickerContextPanel t={t} segment={selectedStickerSegment} updateStickerSegment={updateStickerSegment} deleteStickerSegment={deleteStickerSegment} /> : null}
        {isOverlayContext ? <div className="visual-overlay-inspector">
          {!mobileInspectorSection ? <div className={`sticker-properties-preview ${isVectorOverlay ? "is-vector" : ""}`}>{selectedVisualOverlay.type === "video" ? <video src={selectedVisualOverlay.src} muted playsInline /> : <img src={selectedVisualOverlay.src} alt="" style={isVectorOverlay ? { filter: vectorOverlayAppearance.filter, opacity: vectorOverlayAppearance.opacity, mixBlendMode: vectorOverlayAppearance.cssBlendMode } : undefined} />}</div> : null}
          <VisualEffectsPanel
            contextMode
            mode="overlay"
            t={t}
            segment={selectedVisualOverlay}
            localTime={visualOverlayLocalTime}
            onChange={updateVisualOverlayEffects}
            onSeek={(time) => seekTo((selectedVisualOverlay.start || 0) + time)}
            selectedFilterId={selectedVisualOverlay.filterId || "none"}
            trOption={trOption}
            onSelectFilter={(id) => updateVisualOverlayEffects?.({ filterId: id })}
            onCanvasEditModeChange={setVisualCanvasEditMode}
            vectorEditor={isVectorOverlay ? <VectorControls t={t} segment={selectedVisualOverlay} onUpdate={updateVisualOverlaySegment} /> : null}
            onApplyPreset={applyVisualOverlayPreset}
            onDelete={deleteVisualOverlay}
            requestedTab={mobileInspectorSection}
            singleSection={mobileInspectorSection}
          />
        </div> : null}
        {isVisualContext && selectedVisualSegment ? (
          <VisualEffectsPanel
            contextMode
            t={t}
            segment={selectedVisualSegment}
            localTime={visualLocalTime}
            onChange={updateSelectedVisualEffects}
            onPreviewAnimation={onPreviewAnimation}
            onSeek={(time) => seekTo(visualTimelineStart + time)}
            selectedFilterId={selectedVisualSegment.filterId ?? selectedFilterId}
            trOption={trOption}
            onSelectFilter={(id) => {
              setSelectedFilterId(id);
              updateSelectedVisualEffects?.({ filterId: id });
              notify(t("effectApplied"));
            }}
            onCanvasEditModeChange={setVisualCanvasEditMode}
            sourceAudioLinked={sourceAudioLinked}
            miganRepair={miganRepair}
            hdRestoration={hdRestoration}
            smartDenoise={smartDenoise}
            requestedTab={mobileInspectorSection}
            singleSection={mobileInspectorSection}
            vectorEditor={isVectorVisual ? <VectorControls t={t} segment={selectedVisualSegment} onUpdate={(patch) => updateSelectedVisualEffects?.({ vectorPatch: patch })} /> : null}
          />
        ) : null}
        {isVisualContext && !selectedVisualSegment ? (
          <div className="visual-context-empty">
            <ImageSquare size={30} weight="duotone" />
            <strong>{t("visualSelectClip")}</strong>
          </div>
        ) : null}
        {isCaptionContext && captionPanelTab === "caption" && mobileInspectorSection === "font" ? (
          <CaptionFontSheet
            t={t}
            language={uiLanguage}
            captionStyle={captionStyle}
            setCaptionStyle={setCaptionStyle}
            selectedCaptionSegment={selectedCaptionSegment}
            setCaptionSegments={setCaptionSegments}
            captionSegments={captionSegments}
          />
        ) : null}
        {isCaptionContext && captionPanelTab === "caption" && mobileInspectorSection !== "font" ? (
          <CaptionContextPanel
            t={t}
            captionSegments={captionSegments}
            selectedCaptionSegment={selectedCaptionSegment}
            selectedSegmentId={selectedSegmentId}
            setSelectedSegmentId={setSelectedSegmentId}
            currentSegmentIndex={currentSegmentIndex}
            captionTargetDuration={captionTargetDuration}
            updateCaptionSegmentText={updateCaptionSegmentText}
            toggleCaptionSegmentHidden={toggleCaptionSegmentHidden}
            deleteCaptionSegment={deleteCaptionSegment}
            importCaptionSegments={importCaptionSegments}
            addCaptionSegment={addCaptionSegment}
            alignCaptionToAudio={alignCaptionToAudio}
            linkCaptionAudio={linkCaptionAudio}
            unlinkCaptionAudio={unlinkCaptionAudio}
            audioSegments={audioSegments}
            seekTo={seekTo}
            sourceAudioBlob={sourceAudioBlob}
            generateCaptionsFromSourceAudio={generateCaptionsFromSourceAudio}
            isGeneratingCaptions={isGeneratingCaptions}
            automaticCaptionProgress={automaticCaptionProgress}
          />
        ) : null}

        {isCaptionContext && captionPanelTab === "voice" ? (
          <div className="caption-voice-panel">
            <p className="caption-voice-hint">
              {selectedCaptionSegment
                ? t("captionVoiceHint", "仅为当前选中的字幕片段生成配音，并自动对齐到片段起点。")
                : t("captionVoiceEmptyHint", "请先在时间线中选择一个字幕片段。")}
            </p>
            <VoiceSynthesisPanel
              script={selectedCaptionSegment?.text ?? ""}
              updateScript={(text) => selectedCaptionSegment && updateCaptionSegmentText(selectedCaptionSegment.id, text)}
              selectedVoiceId={selectedVoiceId}
              setSelectedVoiceId={setSelectedVoiceId}
              selectedVoice={selectedVoice}
              filteredVoices={filteredVoices}
              voiceFilter={voiceFilter}
              setVoiceFilter={setVoiceFilter}
              showVoiceFilter={showVoiceFilter}
              setShowVoiceFilter={setShowVoiceFilter}
              speed={speed}
              setSpeed={setSpeed}
              volume={volume}
              setVolume={setVolume}
              status={status}
              statusText={localizedStatusText}
              progressPercent={progressPercent}
              audioBlob={selectedCaptionAudioSegment?.blob ?? null}
              audioUrl={selectedCaptionAudioSegment?.url ?? ""}
              generateVoiceover={() => selectedCaptionSegment && generateVoiceover(selectedCaptionSegment)}
              downloadBlob={downloadBlob}
              favoriteVoiceIds={favoriteVoiceIds}
              setFavoriteVoiceIds={setFavoriteVoiceIds}
              voiceProfiles={voiceProfiles}
              selectedVoiceProfileId={selectedVoiceProfileId}
              setSelectedVoiceProfileId={setSelectedVoiceProfileId}
              toggleVoiceProfileFavorite={toggleVoiceProfileFavorite}
              selectedVoiceProfile={voiceProfiles.find((profile) => profile.id === selectedVoiceProfileId)}
              clearSelectedVoiceProfile={() => setSelectedVoiceProfileId("")}
              t={t}
            />
          </div>
        ) : null}

        {isAvatarContext ? <AvatarContextPanel t={t} hasVisual={hasVisual} visualType={visualType} audioBlob={audioBlob} audioDuration={audioDuration} captionSegments={captionSegments} selectedVoice={selectedVoice} avatarJob={avatarJob} generateAvatarAcceptanceFrame={generateAvatarAcceptanceFrame} /> : null}

        {isAudioClipContext ? <AudioClipContextPanel t={t} segment={{ ...audioPropertySegment, id: audioPropertySegment.id || audioPropertySegment.segmentId, track: audioPropertySegment.track || selectedTrack }} updateAudioSegment={selectedTrack === "audio" ? updateAudioSegment : updateSelectedTrackAudioSegment} toggleAudioSegmentReverse={toggleAudioSegmentReverse} deleteAudioSegment={selectedTrack === "audio" ? deleteAudioSegment : deleteSelectedTrackAudioSegment} downloadBlob={downloadBlob} requestedSection={mobileInspectorSection} voiceProfiles={voiceProfiles} onVoiceColorAssetReady={onVoiceColorAssetReady} onApplyVoiceColor={onApplyVoiceColor} onRestoreVoiceColor={onRestoreVoiceColor} /> : null}

        {!isSmartContext && !isEffectsContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && !isOverlayContext && voiceTab === "synthesis" ? (
          <VoiceSynthesisPanel
            script={script}
            updateScript={updateScript}
            selectedVoiceId={selectedVoiceId}
            setSelectedVoiceId={setSelectedVoiceId}
            selectedVoice={selectedVoice}
            filteredVoices={filteredVoices}
            voiceFilter={voiceFilter}
            setVoiceFilter={setVoiceFilter}
            showVoiceFilter={showVoiceFilter}
            setShowVoiceFilter={setShowVoiceFilter}
            speed={speed}
            setSpeed={setSpeed}
            volume={volume}
            setVolume={setVolume}
            status={status}
            statusText={localizedStatusText}
            progressPercent={progressPercent}
            audioBlob={audioBlob}
            audioUrl={audioUrl}
            generateVoiceover={generateVoiceover}
            downloadBlob={downloadBlob}
            favoriteVoiceIds={favoriteVoiceIds}
            setFavoriteVoiceIds={setFavoriteVoiceIds}
            voiceProfiles={voiceProfiles}
            selectedVoiceProfileId={selectedVoiceProfileId}
            setSelectedVoiceProfileId={setSelectedVoiceProfileId}
            toggleVoiceProfileFavorite={toggleVoiceProfileFavorite}
            selectedVoiceProfile={voiceProfiles.find((profile) => profile.id === selectedVoiceProfileId)}
            clearSelectedVoiceProfile={() => setSelectedVoiceProfileId("")}
            t={t}
          />
        ) : null}

        {!isSmartContext && !isEffectsContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && !isOverlayContext && voiceTab === "mine" ? (
          <MyVoicesPanel
            notify={notify}
            t={t}
            selectedVoice={selectedVoice}
            voiceProfiles={voiceProfiles}
            addVoiceProfile={addVoiceProfile}
            removeVoiceProfile={removeVoiceProfile}
            toggleVoiceProfileFavorite={toggleVoiceProfileFavorite}
            selectedVoiceProfileId={selectedVoiceProfileId}
            setSelectedVoiceProfileId={setSelectedVoiceProfileId}
            recordedVoices={recordedVoices}
            recordingState={recordingState}
            recordingElapsed={recordingElapsed}
            startVoiceRecording={startVoiceRecording}
            stopVoiceRecording={stopVoiceRecording}
            downloadBlob={downloadBlob}
          />
        ) : null}

        {!isSmartContext && !isEffectsContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && !isOverlayContext && voiceTab === "favorites" ? (
          <FavoriteVoicesPanel
            favoriteVoiceIds={favoriteVoiceIds}
            setFavoriteVoiceIds={setFavoriteVoiceIds}
            selectedVoiceId={selectedVoiceId}
            setSelectedVoiceId={setSelectedVoiceId}
            voiceProfiles={voiceProfiles}
            selectedVoiceProfileId={selectedVoiceProfileId}
            setSelectedVoiceProfileId={setSelectedVoiceProfileId}
            toggleVoiceProfileFavorite={toggleVoiceProfileFavorite}
            notify={notify}
            t={t}
          />
        ) : null}

        {!isSmartContext && !isEffectsContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && !isOverlayContext && voiceTab === "history" ? (
          <HistoryPanel
            historyItems={historyItems}
            useHistoryItem={useHistoryItem}
            setHistoryItems={setHistoryItems}
            downloadBlob={downloadBlob}
            t={t}
          />
        ) : null}
      </div>

      {audioSegments.map((segment) => (
        <audio
          key={`${segment.id}:${segment.url}`}
          ref={(node) => {
            if (node) audioSegmentRefs.current.set(segment.id, node);
            else audioSegmentRefs.current.delete(segment.id);
            if (segment.id === audioSegments.at(-1)?.id) audioRef.current = node;
          }}
          src={segment.url}
        />
      ))}
      {sourceAudioUrl ? (
        <audio
          key={sourceAudioUrl}
          data-track="source-audio"
          ref={sourceAudioRef}
          src={sourceAudioUrl}
        />
      ) : null}
      {musicUrl ? (
        <audio
          ref={musicRef}
          src={musicUrl}
        />
      ) : null}
    </aside>
  );
}
