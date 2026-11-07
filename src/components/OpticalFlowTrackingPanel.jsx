import {
  ArrowCounterClockwise,
  BezierCurve,
  CheckCircle,
  CircleNotch,
  Flask,
  Pause,
  Play,
  Pulse,
  VectorThree,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { encodeAvatarFrames } from "../lib/editorRuntime.js";
import { createVideoTrackFramesFromBlobs } from "../lib/media.js";
import { formatTime } from "../lib/timeline.js";

const TRACK_COLORS = ["#49f4df", "#8d7bff", "#ffbf5f", "#47a8ff", "#f477ff"];

function drawArrow(context, startX, startY, endX, endY, color, opacity = 1) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const head = 4.5;
  context.save();
  context.globalAlpha = opacity;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - head * Math.cos(angle - Math.PI / 6), endY - head * Math.sin(angle - Math.PI / 6));
  context.lineTo(endX - head * Math.cos(angle + Math.PI / 6), endY - head * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
  context.restore();
}

function drawFlowVisualization(context, canvas, image, result, frame, density, trailLength) {
  const scaleX = canvas.width / result.width;
  const scaleY = canvas.height / result.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(3,8,12,.36)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.strokeStyle = "rgba(91,247,229,.08)";
  context.lineWidth = 1;
  const gridSize = 32;
  for (let x = gridSize; x < canvas.width; x += gridSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = gridSize; y < canvas.height; y += gridSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  context.restore();

  const stride = density === "sparse" ? 3 : density === "dense" ? 1 : 2;
  frame.vectors.forEach((vector, index) => {
    if (index % stride) return;
    const x = vector.x * scaleX;
    const y = vector.y * scaleY;
    const vectorScale = 3.2;
    drawArrow(
      context,
      x,
      y,
      x + vector.dx * scaleX * vectorScale,
      y + vector.dy * scaleY * vectorScale,
      "#55f3e1",
      0.32 + vector.confidence * 0.68,
    );
  });

  frame.cohorts.forEach((cohort, cohortIndex) => {
    const color = TRACK_COLORS[cohortIndex % TRACK_COLORS.length];
    const x = cohort.box.xmin * canvas.width;
    const y = cohort.box.ymin * canvas.height;
    const boxWidth = (cohort.box.xmax - cohort.box.xmin) * canvas.width;
    const boxHeight = (cohort.box.ymax - cohort.box.ymin) * canvas.height;
    context.save();
    context.strokeStyle = color;
    context.fillStyle = `${color}18`;
    context.lineWidth = 1.5;
    context.setLineDash([5, 4]);
    context.fillRect(x, y, boxWidth, boxHeight);
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.setLineDash([]);
    drawArrow(
      context,
      x + boxWidth / 2,
      y + boxHeight / 2,
      x + boxWidth / 2 + cohort.dx * scaleX * 7,
      y + boxHeight / 2 + cohort.dy * scaleY * 7,
      color,
      0.95,
    );
    context.restore();
  });

  const timecode = formatTime(frame.time || 0);
  context.save();
  context.font = `700 ${Math.max(12, Math.round(canvas.width / 54))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const timecodePadding = Math.max(8, Math.round(canvas.width / 80));
  const timecodeHeight = Math.max(28, Math.round(canvas.height / 11));
  const timecodeWidth = context.measureText(timecode).width + timecodePadding * 2;
  const timecodeX = canvas.width - timecodeWidth - Math.max(12, Math.round(canvas.width / 64));
  const timecodeY = Math.max(12, Math.round(canvas.height / 30));
  context.fillStyle = "rgba(3,10,13,.78)";
  context.fillRect(timecodeX, timecodeY, timecodeWidth, timecodeHeight);
  context.fillStyle = "#55f3e1";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(timecode, timecodeX + timecodeWidth / 2, timecodeY + timecodeHeight / 2);
  context.restore();

  frame.trajectories.forEach((track, trackIndex) => {
    const points = track.points.slice(-trailLength);
    if (points.length < 2) return;
    const color = TRACK_COLORS[trackIndex % TRACK_COLORS.length];
    context.save();
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 9;
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    points.forEach((point, pointIndex) => {
      const x = point.x * scaleX;
      const y = point.y * scaleY;
      if (!pointIndex) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    const last = points.at(-1);
    context.fillStyle = color;
    context.beginPath();
    context.arc(last.x * scaleX, last.y * scaleY, 4.2, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(4,10,14,.84)";
    context.font = "700 9px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(trackIndex + 1), last.x * scaleX, last.y * scaleY);
    context.restore();
  });
}

async function loadFlowFrameImage(src, signal) {
  if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
  const image = new Image();
  image.src = src;
  await new Promise((resolve, reject) => {
    const abort = () => reject(signal?.reason || new DOMException("Aborted", "AbortError"));
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("Optical-flow frame could not be decoded.")), { once: true });
    signal?.addEventListener("abort", abort, { once: true });
  });
  return image;
}

async function renderOpticalFlowAsset({ result, density, trailLength, signal, onProgress }) {
  const width = Math.max(640, Number(result.renderWidth) || result.width);
  const height = Math.max(360, Number(result.renderHeight) || Math.round(width * result.height / result.width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Optical-flow result canvas could not be created.");
  const frameBlobs = [];
  for (let index = 0; index < result.frames.length; index += 1) {
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    const frame = result.frames[index];
    const image = await loadFlowFrameImage(frame.image, signal);
    drawFlowVisualization(context, canvas, image, result, frame, density, trailLength);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (nextBlob) => nextBlob ? resolve(nextBlob) : reject(new Error("Optical-flow result frame could not be encoded.")),
      "image/jpeg",
      0.9,
    ));
    frameBlobs.push(blob);
    onProgress?.(0.45 * ((index + 1) / result.frames.length));
  }
  const keyframeTimes = result.frames.map((frame) => frame.time);
  const [blob, trackFrames] = await Promise.all([
    encodeAvatarFrames(frameBlobs, width, height, result.sampleRate, keyframeTimes, result.duration, {
      signal,
      onProgress: (value) => onProgress?.(0.45 + value * 0.55),
    }),
    createVideoTrackFramesFromBlobs(frameBlobs, {
      duration: result.duration,
      width,
      height,
      signal,
    }),
  ]);
  return { blob, trackFrames, width, height };
}

function FlowCanvas({ result, frameIndex, density, trailLength }) {
  const canvasRef = useRef(null);
  const imageCacheRef = useRef(new Map());
  const frame = result?.frames?.[frameIndex] || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !result) return undefined;
    let canceled = false;
    const imageCache = imageCacheRef.current;
    let image = imageCache.get(frame.image);
    if (!image) {
      image = new Image();
      image.src = frame.image;
      imageCache.set(frame.image, image);
    }
    const render = () => {
      if (canceled) return;
      const context = canvas.getContext("2d");
      drawFlowVisualization(context, canvas, image, result, frame, density, trailLength);
    };
    if (image.complete) render();
    else image.addEventListener("load", render, { once: true });
    return () => {
      canceled = true;
      image.removeEventListener("load", render);
    };
  }, [density, frame, result, trailLength]);

  return <canvas ref={canvasRef} className="optical-flow-canvas" width="640" height="360" />;
}

function Metric({ label, value, unit = "" }) {
  return (
    <div className="optical-flow-metric">
      <span>{label}</span>
      <strong>{value}<small>{unit}</small></strong>
    </div>
  );
}

export function OpticalFlowTrackingPanel({ t, segment, localTime = 0, onAssetReady }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [frameProgress, setFrameProgress] = useState({ frame: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [sampleRate, setSampleRate] = useState(6);
  const [density, setDensity] = useState("balanced");
  const [trailLength, setTrailLength] = useState(12);
  const controllerRef = useRef(null);
  const isVideo = segment?.type === "video";
  const phaseLabel = {
    detecting: t("effectFlowPhaseDetecting"),
    decoding: t("effectFlowPhaseDecoding"),
    flow: t("effectFlowPhaseCalculating"),
    trajectories: t("effectFlowPhaseAggregating"),
    encoding: t("effectFlowPhaseEncoding"),
  }[phase] || t("effectFlowReadyHint");
  const summary = result?.summary;
  const currentFrame = result?.frames?.[frameIndex];
  const directionLabel = useMemo(() => {
    const angle = Number(summary?.dominantAngle);
    if (!Number.isFinite(angle)) return "—";
    if (angle >= 337.5 || angle < 22.5) return `→ ${angle}°`;
    if (angle < 67.5) return `↘ ${angle}°`;
    if (angle < 112.5) return `↓ ${angle}°`;
    if (angle < 157.5) return `↙ ${angle}°`;
    if (angle < 202.5) return `← ${angle}°`;
    if (angle < 247.5) return `↖ ${angle}°`;
    if (angle < 292.5) return `↑ ${angle}°`;
    return `↗ ${angle}°`;
  }, [summary?.dominantAngle]);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus("idle");
    setProgress(0);
    setPhase("");
    setResult(null);
    setError("");
    setFrameIndex(0);
  }, [segment?.id, segment?.src]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!playing || status !== "complete" || !result?.frames?.length) return undefined;
    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % result.frames.length);
    }, Math.max(90, Math.round(1000 / Math.max(3, result.sampleRate))));
    return () => window.clearInterval(interval);
  }, [playing, result, status]);

  const runAnalysis = async () => {
    if (!isVideo || !segment?.src) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("running");
    setProgress(0);
    setPhase("decoding");
    setResult(null);
    setError("");
    setFrameIndex(0);
    try {
      const playbackRate = Math.max(0.25, Number(segment.playbackRate) || 1);
      const safeLocalTime = Math.max(0, Math.min(Number(segment.duration) || 0, Number(localTime) || 0));
      const availableTimelineDuration = Math.max(0.5, (Number(segment.duration) || 0.5) - safeLocalTime);
      const analysisWindow = Math.min(availableTimelineDuration, Math.max(2, 41 / sampleRate));
      const { analyzeOpticalFlowVideo } = await import("../lib/opticalFlowTracking.js");
      const nextResult = await analyzeOpticalFlowVideo({
        src: segment.src,
        sourceStart: Math.max(0, Number(segment.sourceStart) || 0) + safeLocalTime * playbackRate,
        duration: analysisWindow,
        playbackRate,
        sampleRate,
        signal: controller.signal,
        onProgress: (next) => {
          setProgress(Math.round(next.progress * 0.92));
          setPhase(next.phase);
          setFrameProgress({ frame: next.frame, total: next.total });
        },
      });
      if (controller.signal.aborted) return;
      setResult(nextResult);
      setFrameIndex(Math.min(1, nextResult.frames.length - 1));
      setPlaying(true);
      setProgress(92);
      setPhase("encoding");
      const rendered = await renderOpticalFlowAsset({
        result: nextResult,
        density,
        trailLength,
        signal: controller.signal,
        onProgress: (value) => setProgress(92 + Math.round(value * 8)),
      });
      if (controller.signal.aborted) return;
      await onAssetReady?.({
        type: "video",
        name: `optical-flow-${new Date().toISOString().replaceAll(":", "-").replace(/\..+$/, "")}.webm`,
        meta: `${rendered.width} x ${rendered.height} · Optical Flow · ${nextResult.sampleRate} fps · ${nextResult.summary.cohortCount} cohorts`,
        blob: rendered.blob,
        duration: nextResult.duration,
        width: rendered.width,
        height: rendered.height,
        trackFrames: rendered.trackFrames,
        trackFrameDuration: nextResult.duration,
        generatedBy: "optical-flow-tracking",
        diagnostics: {
          detector: nextResult.detector,
          sampleRate: nextResult.sampleRate,
          vectors: nextResult.summary.vectorCount,
          cohorts: nextResult.summary.cohortCount,
          dominantAngle: nextResult.summary.dominantAngle,
          stability: nextResult.summary.stability,
          timelineFrames: rendered.trackFrames.length,
        },
      });
      setProgress(100);
      setPhase("encoding");
      setStatus("complete");
    } catch (analysisError) {
      if (analysisError?.name === "AbortError") {
        setStatus("idle");
        setProgress(0);
        return;
      }
      setStatus("error");
      setError(analysisError?.message === "NO_SEMANTIC_MOTION_COHORT"
        ? t("effectFlowNoSemanticCohort")
        : analysisError?.message || t("effectFlowFailed"));
    }
  };

  const cancelAnalysis = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  };

  return (
    <div className="optical-flow-inspector">
      <section className="optical-flow-lab-heading">
        <span><Flask size={18} weight="duotone" /></span>
        <div>
          <small>{t("effectFlowLabKicker")}</small>
          <strong>{t("effectFlowLabTitle")}</strong>
          <p>{t("effectFlowLabHint")}</p>
        </div>
        <em>{status === "complete" ? t("effectFlowExperimentComplete") : t("effectFlowExperimental")}</em>
      </section>

      <section className={`optical-flow-stage is-${status}`}>
        {result ? (
          <FlowCanvas result={result} frameIndex={frameIndex} density={density} trailLength={trailLength} />
        ) : segment?.src ? (
          <video className="optical-flow-source-preview" src={segment.src} muted playsInline preload="metadata" />
        ) : (
          <div className="optical-flow-no-source"><VectorThree size={34} /><span>{t("effectSelectClip")}</span></div>
        )}
        <div className="optical-flow-stage-grid" />
        <div className="optical-flow-stage-label">
          <span><i />{status === "running" ? t("effectFlowLiveAnalysis") : status === "complete" ? t("effectFlowTrajectoryView") : t("effectFlowSourceReady")}</span>
          <time>{formatTime(currentFrame?.time || 0)}</time>
        </div>
        {status === "running" ? (
          <div className="optical-flow-stage-progress">
            <span>{phaseLabel}</span>
            <strong>{progress}%</strong>
            <i><b style={{ width: `${progress}%` }} /></i>
            <small>{frameProgress.frame} / {frameProgress.total} {t("effectFramesProcessed")}</small>
          </div>
        ) : null}
        {status === "complete" ? (
          <div className="optical-flow-stage-controls">
            <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}</button>
            <input
              type="range"
              min="0"
              max={Math.max(0, result.frames.length - 1)}
              value={frameIndex}
              onChange={(event) => {
                setPlaying(false);
                setFrameIndex(Number(event.target.value));
              }}
            />
          </div>
        ) : null}
      </section>

      {summary ? (
        <section className="optical-flow-metrics" aria-label={t("effectFlowExperimentData")}>
          <Metric label={t("effectFlowVectors")} value={summary.vectorCount} />
          <Metric label={t("effectFlowCohorts")} value={summary.cohortCount} />
          <Metric label={t("effectFlowDirection")} value={directionLabel} />
          <Metric label={t("effectFlowStability")} value={summary.stability} unit="%" />
        </section>
      ) : null}

      <section className="optical-flow-settings">
        <header><Pulse size={16} /><span><strong>{t("effectFlowSampling")}</strong><small>{result?.detector ? `${result.detector.modelId} · ${result.detector.detections} ${t("effectFlowSemanticCandidates")}` : t("effectFlowSamplingHint")}</small></span></header>
        <div className="optical-flow-segmented">
          {[4, 6, 8].map((rate) => (
            <button
              type="button"
              className={sampleRate === rate ? "is-active" : ""}
              disabled={status === "running"}
              onClick={() => setSampleRate(rate)}
              key={rate}
            >
              {rate} fps
            </button>
          ))}
        </div>
        <label>
          <span>{t("effectFlowVectorDensity")}<output>{t(`effectFlowDensity_${density}`)}</output></span>
          <input
            type="range"
            min="0"
            max="2"
            value={{ sparse: 0, balanced: 1, dense: 2 }[density]}
            onChange={(event) => setDensity(["sparse", "balanced", "dense"][Number(event.target.value)])}
          />
        </label>
        <label>
          <span>{t("effectFlowTrailPersistence")}<output>{trailLength}</output></span>
          <input type="range" min="4" max="18" value={trailLength} onChange={(event) => setTrailLength(Number(event.target.value))} />
        </label>
      </section>

      {!isVideo ? <div className="optical-flow-note"><BezierCurve size={18} /><span><strong>{t("effectFlowVideoOnly")}</strong>{t("effectFlowVideoOnlyHint")}</span></div> : null}
      {error ? <div className="optical-flow-error" role="alert"><X size={16} /><span>{error}</span></div> : null}

      <div className="optical-flow-actions">
        {status === "running" ? (
          <button className="panel-secondary" type="button" onClick={cancelAnalysis}><X size={16} />{t("effectCancelAnalysis")}</button>
        ) : (
          <button className="optical-flow-run" type="button" disabled={!isVideo} onClick={runAnalysis}>
            {status === "complete" ? <ArrowCounterClockwise size={17} /> : status === "error" ? <ArrowCounterClockwise size={17} /> : <Flask size={17} weight="fill" />}
            {status === "complete" ? t("effectFlowRunAgain") : t("effectFlowRun")}
          </button>
        )}
        {status === "complete" ? <span><CheckCircle size={15} weight="fill" />{t("effectFlowLocalComplete")}</span> : null}
        {status === "running" ? <span><CircleNotch size={15} className="spin" />{t("effectFlowBrowserLocal")}</span> : null}
      </div>
    </div>
  );
}
