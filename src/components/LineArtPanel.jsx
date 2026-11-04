import { useEffect, useMemo, useRef, useState } from "react";
import { CircleNotch, PencilLine, X } from "@phosphor-icons/react";
import {
  createLineArtRenderer,
  DEFAULT_LINE_ART,
  openLineArtSource,
  renderLineArtAsset,
} from "../lib/lineArt.js";

export function LineArtPanel({ t, segment, localTime = 0, onAssetReady }) {
  const [options, setOptions] = useState(DEFAULT_LINE_ART);
  const [job, setJob] = useState({ running: false, progress: 0, error: "" });
  const [previewError, setPreviewError] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const canvasRef = useRef(null),
    sourceRef = useRef(null),
    rendererRef = useRef(null),
    runRef = useRef(null);
  const currentOptions = useRef(options),
    currentTime = useRef(localTime);
  currentOptions.current = options;
  currentTime.current = localTime;
  const sourceSpec = useMemo(
    () => ({
      src: segment?.src,
      blob: segment?.blob,
      type: segment?.type,
      sourceStart: segment?.sourceStart,
      sourceDuration: segment?.sourceDuration,
      duration: segment?.duration,
      playbackRate: segment?.playbackRate,
      speedCurve: segment?.speedCurve,
    }),
    [
      segment?.src,
      segment?.blob,
      segment?.type,
      segment?.sourceStart,
      segment?.sourceDuration,
      segment?.duration,
      segment?.playbackRate,
      segment?.speedCurve,
    ],
  );
  useEffect(() => {
    const abort = new AbortController();
    setPreviewReady(false);
    setPreviewError(false);
    let source, renderer;
    if (sourceSpec.src)
      void (async () => {
        try {
          source = await openLineArtSource(sourceSpec, abort.signal);
          if (abort.signal.aborted) return;
          renderer = createLineArtRenderer(canvasRef.current, source.width, source.height);
          sourceRef.current = source;
          rendererRef.current = renderer;
          renderer.draw(await source.at(currentTime.current), currentOptions.current);
          if (!abort.signal.aborted) setPreviewReady(true);
        } catch {
          if (!abort.signal.aborted) setPreviewError(true);
        } finally {
          if (abort.signal.aborted) {
            renderer?.dispose();
            source?.dispose();
          }
        }
      })();
    return () => {
      abort.abort();
      sourceRef.current = null;
      rendererRef.current = null;
      renderer?.dispose();
      source?.dispose();
    };
  }, [sourceSpec]);
  useEffect(() => {
    if (!previewReady) return;
    let active = true;
    void sourceRef.current
      ?.at(localTime)
      .then((frame) => {
        if (active && rendererRef.current) rendererRef.current.draw(frame, options);
      })
      .catch(() => {
        if (active) setPreviewError(true);
      });
    return () => {
      active = false;
    };
  }, [options, localTime, previewReady]);
  useEffect(() => () => runRef.current?.abort(), []);
  const generate = async () => {
    if (!segment?.src || runRef.current) return;
    const controller = new AbortController();
    runRef.current = controller;
    const sourceSnapshot = { ...segment },
      settings = { ...options };
    setJob({ running: true, progress: 0, error: "" });
    try {
      const rendered = await renderLineArtAsset({
        segment: sourceSnapshot,
        options: settings,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setJob({ running: true, progress, error: "" });
        },
      });
      if (controller.signal.aborted) return;
      await onAssetReady?.({
        ...rendered,
        generatedBy: "line-art",
        name: `${t("lineArtTitle")} · ${(sourceSnapshot.name || "media").replace(/\.[^.]+$/, "")}.${rendered.type === "image" ? "png" : "webm"}`,
      });
      if (!controller.signal.aborted) setJob({ running: false, progress: 100, error: "" });
    } catch (error) {
      if (!controller.signal.aborted)
        setJob({
          running: false,
          progress: 0,
          error: error?.message?.includes("WebGL") ? t("lineArtUnsupported") : t("lineArtFailed"),
        });
    } finally {
      if (runRef.current === controller) runRef.current = null;
      if (controller.signal.aborted) setJob({ running: false, progress: 0, error: "" });
    }
  };
  return (
    <div className="line-art-panel cinematic-depth-panel">
      <div className="cinematic-depth-hero">
        <span>
          <PencilLine size={22} />
        </span>
        <div>
          <strong>{t("lineArtTitle")}</strong>
          <em>{t("lineArtDescription")}</em>
        </div>
      </div>
      {!segment?.src ? (
        <p>{t("lineArtSelect")}</p>
      ) : (
        <>
          <div
            className="line-art-preview"
            aria-label={t("lineArtPreview")}
            aria-busy={!previewReady && !previewError}
          >
            <canvas ref={canvasRef} hidden={!previewReady || previewError} />
            {!previewReady && !previewError ? (
              <CircleNotch className="is-spinning" size={24} />
            ) : null}
            {previewError ? <p role="alert">{t("lineArtUnsupported")}</p> : null}
          </div>
          <fieldset disabled={job.running} className="line-art-controls">
            <label className="cinematic-depth-range">
              <span>
                <strong>{t("lineArtDetail")}</strong>
                <output>{options.detail}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={options.detail}
                onChange={(e) => setOptions({ ...options, detail: Number(e.target.value) })}
              />
            </label>
            <label className="cinematic-depth-range">
              <span>
                <strong>{t("lineArtThickness")}</strong>
                <output>{options.thickness.toFixed(1)}×</output>
              </span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={options.thickness}
                onChange={(e) => setOptions({ ...options, thickness: Number(e.target.value) })}
              />
            </label>
            <label className="cinematic-depth-toggle">
              <span aria-hidden="true">
                <PencilLine size={17} />
              </span>
              <span>
                <strong>{t("lineArtInvert")}</strong>
              </span>
              <input
                type="checkbox"
                checked={options.inverted}
                onChange={(e) => setOptions({ ...options, inverted: e.target.checked })}
              />
            </label>
          </fieldset>
          {job.running ? (
            <div className="cinematic-depth-progress" role="status">
              <div>
                <span>
                  <CircleNotch size={14} className="is-spinning" />
                  {t("lineArtGenerating")}
                </span>
                <strong>{job.progress}%</strong>
              </div>
              <i>
                <b style={{ width: `${job.progress}%` }} />
              </i>
            </div>
          ) : null}
          {job.error ? (
            <p role="alert" className="line-art-error">
              {job.error}
            </p>
          ) : null}
          <div className="cinematic-depth-actions">
            {job.running ? (
              <button
                className="panel-secondary"
                type="button"
                onClick={() => runRef.current?.abort()}
              >
                <X size={16} />
                {t("cancel")}
              </button>
            ) : (
              <button
                className="panel-primary"
                type="button"
                disabled={!previewReady || previewError}
                onClick={generate}
              >
                <PencilLine size={16} />
                {t("lineArtGenerate")}
              </button>
            )}
          </div>
          <p className="line-art-hint">{t("lineArtAssetHint")}</p>
        </>
      )}
    </div>
  );
}
