import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { AudioInspectorTabs } from "./AudioInspectorTabs.jsx";
import { AudioProcessingGraph } from "./AudioProcessingGraph.jsx";
import { useEffect, useRef, useState } from "react";
import { getAudioProcessingCopy } from "../i18nAudioProcessing.js";
import { normalizeAudioProcessing } from "../lib/audioProcessingDsp.js";
import { audioProcessingIdentity, processAudioClip } from "../lib/audioProcessing.js";

export function AudioProcessingPanel({
  segment,
  language,
  disabled,
  updateAudioSegment,
  registerUrl,
}) {
  const copy = getAudioProcessingCopy(language);
  const [tab, setTab] = useState("denoise"),
    [settings, setSettings] = useState(() => normalizeAudioProcessing(segment.audioProcessing)),
    [job, setJob] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState(false);
  const resultElement = useRef(null);
  useEffect(() => {
    if (result)
      resultElement.current?.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
  }, [result]);
  const controller = useRef(null),
    latest = useRef({ segment, disabled });
  latest.current = { segment, disabled };
  useEffect(() => {
    setSettings(normalizeAudioProcessing(segment.audioProcessing));
    setResult(null);
    setError(false);
    return () => controller.current?.abort();
  }, [segment.id, segment.audioProcessing]);
  useEffect(() => {
    if (disabled) controller.current?.abort();
  }, [disabled]);
  const identity = audioProcessingIdentity(segment);
  useEffect(() => {
    controller.current?.abort();
    setResult(null);
  }, [identity, segment.blob]);
  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  const change = (key, value) => {
    setSettings((current) => normalizeAudioProcessing({ ...current, [key]: value }));
    setResult(null);
    setError(false);
  };
  const field = (group, key, label, min, max, step, unit) => (
    <AudioProcessingValue
      key={key}
      label={label}
      value={settings[group][key]}
      min={min}
      max={max}
      step={step}
      unit={unit}
      onCommit={(value) => change(group, { ...settings[group], enabled: true, [key]: value })}
    />
  );
  const canProcess =
    ["audio", "source"].includes(segment.track) &&
    !segment.embeddedVideo &&
    segment.blob instanceof Blob;
  const run = async () => {
    if (controller.current || disabled || !canProcess) return;
    const abort = new AbortController();
    controller.current = abort;
    setError(false);
    setResult(null);
    setJob({ phase: "decode", progress: 0 });
    const identity = audioProcessingIdentity(segment),
      blob = segment.blob;
    try {
      const output = await processAudioClip(segment, settings, {
        language,
        signal: abort.signal,
        onProgress: setJob,
      });
      if (
        abort.signal.aborted ||
        latest.current.disabled ||
        audioProcessingIdentity(latest.current.segment) !== identity ||
        latest.current.segment.blob !== blob
      )
        return;
      setResult({ ...output, url: URL.createObjectURL(output.blob), identity, originalBlob: blob });
    } catch (err) {
      if (err.name !== "AbortError") setError(true);
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setJob(null);
      }
    }
  };
  const apply = () => {
    if (
      !result ||
      disabled ||
      audioProcessingIdentity(segment) !== result.identity ||
      segment.blob !== result.originalBlob
    )
      return;
    const url = URL.createObjectURL(result.blob);
    registerUrl?.(url);
    updateAudioSegment(segment.id, {
      blob: result.blob,
      url,
      sourceStart: 0,
      sourceDuration: result.sourceDuration,
      peaks: result.peaks,
      audioProcessing: result.settings,
      processingOriginalBlob:
        segment.processingOriginalBlob instanceof Blob
          ? segment.processingOriginalBlob
          : segment.blob,
      processingOriginalPeaks: segment.processingOriginalPeaks || segment.peaks,
      processingOriginal: {
        sourceStart: result.originalSourceStart,
        sourceDuration: result.sourceDuration,
      },
      processingRevision: crypto.randomUUID(),
      originalBlob: null,
      originalPeaks: null,
      reversed: false,
    });
    setResult(null);
  };
  const restore = () => {
    if (disabled || !(segment.processingOriginalBlob instanceof Blob)) return;
    const url = URL.createObjectURL(segment.processingOriginalBlob);
    registerUrl?.(url);
    updateAudioSegment(segment.id, {
      blob: segment.processingOriginalBlob,
      url,
      sourceStart: (segment.processingOriginal?.sourceStart || 0) + (segment.sourceStart || 0),
      processingOriginalBlob: null,
      processingOriginal: null,
      audioProcessing: null,
      processingRevision: crypto.randomUUID(),
      peaks: segment.processingOriginalPeaks || [],
      processingOriginalPeaks: null,
    });
    setSettings(normalizeAudioProcessing());
    setResult(null);
  };
  const phase = {
    download: copy.download,
    decode: copy.decode,
    denoise: copy.run,
    enhance: copy.run,
    encode: copy.encode,
  };
  return (
    <div className="audio-processing-panel">
      <AudioInspectorTabs
        items={["denoise", "eq", "compressor", "loudness", "limiter"].map((id) => ({
          id,
          label: copy[id],
        }))}
        value={tab}
        onChange={setTab}
        label={copy.processing}
        previous={copy.previous}
        next={copy.next}
        className="audio-processing-tabs"
      />
      <div className="audio-processing-scroll">
      <fieldset disabled={!!job || disabled || !canProcess} className="audio-processing-fields">
        <div className="audio-processing-section-heading">
          <strong>{copy[tab]}</strong>
          <div>
            <button
              type="button"
              className="audio-processing-reset"
              aria-label={copy.reset}
              title={copy.reset}
              onClick={() => {
                const defaults = normalizeAudioProcessing();
                if (tab === "denoise") {
                  setSettings((current) => ({
                    ...current,
                    engine: defaults.engine,
                    strength: defaults.strength,
                  }));
                  setResult(null);
                  setError(false);
                } else change(tab, defaults[tab]);
              }}
            >
              <ArrowCounterClockwise size={15} />
            </button>
            {tab !== "denoise" ? (
              <label className="audio-processing-switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${copy.enabled} ${copy[tab]}`}
                  checked={settings[tab].enabled}
                  onChange={(event) =>
                    change(tab, { ...settings[tab], enabled: event.target.checked })
                  }
                />
                <span aria-hidden="true" />
              </label>
            ) : null}
          </div>
        </div>
        {tab === "denoise" ? (
          <label className="audio-processing-engine">
            <span>{copy.engine}</span>
            <select
              value={settings.engine}
              onChange={(event) => change("engine", event.target.value)}
            >
              <option value="off">{copy.off}</option>
              <option value="rnnoise">RNNoise · {copy.fast}</option>
              <option value="deepfilter">DeepFilterNet3 · {copy.quality}</option>
            </select>
          </label>
        ) : null}
        <AudioProcessingGraph
          tab={tab}
          settings={settings}
          change={change}
          copy={copy}
          disabled={!!job || disabled || !canProcess}
          peaks={segment.peaks}
          processedPeaks={result?.peaks}
        />
        <div className="audio-processing-values">
          {tab === "denoise" ? (
            <AudioProcessingValue
              label={copy.strength}
              value={Math.round(settings.strength * 100)}
              min={0}
              max={100}
              step={5}
              unit="%"
              onCommit={(value) => change("strength", value / 100)}
            />
          ) : null}
          {tab === "eq"
            ? ["low", "mid", "high"].map((key) => field("eq", key, copy[key], -12, 12, 0.5, "dB"))
            : null}
          {tab === "compressor" ? (
            <>
              {field("compressor", "threshold", copy.threshold, -60, 0, 1, "dB")}
              {field("compressor", "ratio", copy.ratio, 1, 12, 0.5, ":1")}
              {field("compressor", "attack", copy.attack, 1, 100, 1, "ms")}
              {field("compressor", "release", copy.release, 20, 1000, 10, "ms")}
            </>
          ) : null}
          {tab === "loudness" ? field("loudness", "gain", copy.gain, -18, 18, 0.5, "dB") : null}
          {tab === "limiter"
            ? field("limiter", "ceiling", copy.ceiling, -12, 0, 0.5, "dBFS")
            : null}
        </div>
      </fieldset>
      <p className="audio-processing-hint">
        {canProcess ? (segment.track === "source" ? copy.sourceRoute : copy.local) : copy.separate}
      </p>
      {job ? (
        <div className="audio-processing-progress" role="status">
          <span className="voice-generation-spinner" />
          <span>{phase[job.phase] || copy.run}</span>
          <b>{Math.floor(job.progress * 100)}%</b>
          <progress max="1" value={job.progress} />
        </div>
      ) : null}
      {error ? <p role="alert">{copy.failed}</p> : null}
      {result ? (
        <div ref={resultElement} className="audio-processing-result">
          <span>{copy.preview}</span>
          <audio controls src={result.url} />
          {result.peak > 1 ? <p role="status">{copy.clipped}</p> : null}
          <button className="panel-primary" type="button" disabled={disabled} onClick={apply}>
            {copy.apply}
          </button>
        </div>
      ) : null}
      </div>
      <div className="audio-processing-actions">
        <button
          className={job ? "panel-secondary" : "panel-primary"}
          disabled={!job && (disabled || !canProcess)}
          type="button"
          onClick={job ? () => controller.current?.abort() : run}
        >
          {job ? copy.cancel : copy.prepare}
        </button>
        {segment.processingOriginalBlob instanceof Blob ? (
          <button
            className="panel-secondary"
            disabled={disabled || !!job}
            type="button"
            onClick={restore}
          >
            {copy.restore}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AudioProcessingValue({ label, value, min, max, step, unit, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="audio-processing-value">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const number = Number(draft);
            const next =
              draft.trim() && Number.isFinite(number)
                ? Math.max(min, Math.min(max, Math.round(number / step) * step))
                : value;
            setDraft(String(next));
            if (next !== value) onCommit(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <em>{unit}</em>
      </div>
    </label>
  );
}
