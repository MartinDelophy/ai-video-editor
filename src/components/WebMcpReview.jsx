import { ArrowCounterClockwise, CheckCircle, CircleNotch, Robot, X } from "@phosphor-icons/react";
import "./WebMcpReview.css";

const TRACK_LABELS = { visuals: "trackVisuals", overlays: "trackOverlays", audio: "trackAudio", captions: "trackCaptions", stickers: "trackStickers", music: "trackMusic", markers: "trackMarkers" };
const FIELD_LABELS = {
  name: "fieldName", title: "fieldName", text: "fieldText", script: "fieldText", note: "fieldNote", notes: "fieldNote", description: "fieldNote",
  time: "fieldStart", start: "fieldStart", end: "fieldEnd", rangeEnd: "fieldEnd", endTime: "fieldEnd", duration: "fieldDuration",
  sourceStart: "fieldSourceStart", sourceDuration: "fieldSourceDuration", volume: "fieldVolume", fadeIn: "fieldFadeIn", fadeOut: "fieldFadeOut",
  muted: "fieldMuted", playbackRate: "fieldSpeed", layer: "fieldLayer", lane: "fieldLayer", type: "fieldType", color: "fieldColor", hidden: "fieldHidden",
  audioSegmentId: "fieldLinkedAudio", rememberedAudioSegmentId: "fieldLinkedAudio", sourceAudioLinked: "fieldLinkedAudio", detachedAudioSegmentId: "fieldLinkedAudio",
  sourceAudioDisabled: "fieldMuted", sourceAudioUnmapped: "fieldLinkedAudio",
  sourceAudioMappings: "fieldSourceAudio", sourceAudioMutedClipIds: "fieldSourceAudio", sourceAudioMutedById: "fieldSourceAudio",
  ratioId: "fieldRatio", fitMode: "fieldFit", trackVisibility: "fieldVisibility", trackLocks: "fieldLocks", enabled: "fieldEnabled",
  reversed: "fieldReverse", reverse: "fieldReverse", position: "fieldPosition", x: "fieldX", y: "fieldY", scale: "fieldScale",
  rotation: "fieldRotation", opacity: "fieldOpacity", baseTransform: "fieldPosition", style: "fieldStyle", styleOverride: "fieldStyle",
  fontSize: "fieldFontSize", positionOverride: "fieldPosition", keyframes: "fieldKeyframes", propertyKeyframes: "fieldKeyframes",
};
const TIME_FIELDS = new Set(["time", "start", "end", "rangeEnd", "endTime", "duration", "sourceStart", "sourceDuration", "fadeIn", "fadeOut"]);
const SUMMARY_FIELDS = ["type", "text", "note", "notes", "start", "time", "end", "endTime", "duration", "sourceStart", "sourceDuration", "volume", "fadeIn", "fadeOut", "muted", "layer", "lane", "baseTransform", "audioSegmentId", "sourceAudioDisabled", "sourceAudioUnmapped", "color"];
// Raw media and runtime metadata must never reach a review value. Text, names,
// and marker notes are deliberately rendered as React text, never as markup.
const PRIVATE_FIELDS = /^(?:blob|src|url|file|path|archivePath|integrity|archiveMediaId|assetId|originalAssetId|thumbnail.*|poster.*|waveform.*|media.*|cache.*|.*token|.*credential|.*secret)$/i;
const ENUM_LABELS = {
  type: { video: "mediaVideo", image: "mediaImage", audio: "mediaAudio", marker: "markerPoint", chapter: "markerChapter", range: "markerRange", note: "markerNote" },
  color: { cyan: "colorCyan", amber: "colorAmber", violet: "colorViolet", rose: "colorRose", green: "colorGreen" },
  fitMode: { cover: "fitCover", contain: "fitContain" },
};
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function fieldInfo(field) {
  if (field === "sourceAudioDisabled" || field === "sourceAudioUnmapped") return { field, track: "fieldSourceAudio" };
  if (field === "captionsEnabled") return { field: "enabled", track: "trackCaptions" };
  const global = /^(music|sourceAudio)(Name|Start|Duration|Volume|FadeIn|FadeOut|Muted)$/.exec(field);
  return global ? { field: global[2][0].toLowerCase() + global[2].slice(1), track: global[1] === "music" ? "trackMusic" : "fieldSourceAudio" } : { field };
}

function entityFor(preview, track, id, phase) {
  const changes = preview.diff?.tracks?.[track];
  const direct = phase === "before" ? changes?.removedEntries : changes?.addedEntries;
  return preview.entities?.[phase]?.[track]?.find((item) => item.id === id) || direct?.find((item) => item.id === id) || { id };
}

function ReviewValue({ value, field, t, time, number, depth = 0 }) {
  if (value === null || value === undefined || value === "") return <span className="webmcp-review-empty">{t("valueEmpty")}</span>;
  if (typeof value === "boolean") {
    const enabled = field === "sourceAudioUnmapped" ? !value : value;
    return t(enabled ? "valueYes" : "valueNo");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return t("valueEmpty");
    if (TIME_FIELDS.has(field)) return time(value);
    if (field === "lane") return number(value + 1);
    if (field === "volume" || field === "opacity") return `${number(value * 100)}%`;
    if (field === "playbackRate") return `${number(value)}×`;
    return number(value);
  }
  if (typeof value === "string") return ENUM_LABELS[field]?.[value] ? t(ENUM_LABELS[field][value]) : value;
  // Compact summaries keep large keyframe/word arrays and nested metadata out
  // of the panel while making the affected property and item count explicit.
  if (Array.isArray(value)) return t("valueItems", { count: value.length });
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => !PRIVATE_FIELDS.test(key));
    if (depth >= 2 || entries.length > 12) return t("valueProperties", { count: entries.length });
    return <span className="webmcp-review-object">{entries.map(([key, entry]) => <span key={key}><span className="webmcp-review-object-label">{t(FIELD_LABELS[key] || TRACK_LABELS[key] || "fieldOther", { field: key })}: </span><ReviewValue value={entry} field={key} t={t} time={time} number={number} depth={depth + 1} /></span>)}</span>;
  }
  return t("valueEmpty");
}

function FieldChange({ field, before, after, status = "modified", t, time, number }) {
  if (PRIVATE_FIELDS.test(field)) return null;
  const info = fieldInfo(field);
  const label = t(FIELD_LABELS[info.field] || "fieldOther", { field: info.field });
  return (
    <div className="webmcp-review-field">
      <dt>{info.track ? `${t(info.track)} · ` : ""}{label}</dt>
      <dd>
        {status !== "added" ? <span className="webmcp-review-before"><span className="webmcp-review-sr-only">{t("valueBefore")}: </span><ReviewValue value={before} field={info.field} t={t} time={time} number={number} /></span> : null}
        {status === "modified" ? <span className="webmcp-review-arrow" aria-hidden="true">→</span> : null}
        {status !== "removed" ? <span className="webmcp-review-after"><span className="webmcp-review-sr-only">{t("valueAfter")}: </span><ReviewValue value={after} field={info.field} t={t} time={time} number={number} /></span> : null}
      </dd>
    </div>
  );
}

function EntityChange({ id, before, after, fields, status, t, time, number }) {
  const entity = after || before || {};
  const visibleFields = (fields || SUMMARY_FIELDS.filter((field) => Object.hasOwn(entity, field))).filter((field) => !PRIVATE_FIELDS.test(field));
  return (
    <li>
      <div className="webmcp-review-item-heading"><span className="webmcp-review-name" title={entity.name || entity.title || id}>{entity.name || entity.title || id}</span><span className={`webmcp-review-badge webmcp-review-badge-${status}`}>{t(`change${status[0].toUpperCase()}${status.slice(1)}`)}</span></div>
      {visibleFields.length ? <dl className="webmcp-review-fields">{visibleFields.map((field) => <FieldChange key={field} field={field} before={before?.[field]} after={after?.[field]} status={status} t={t} time={time} number={number} />)}</dl> : null}
    </li>
  );
}

export function WebMcpReview({ agent, language }) {
  const { t, view, working, error, stale } = agent;
  if (!view) return null;
  const applied = view.status === "applied";
  const preview = view.preview;
  const locale = String(language || "en").replaceAll("_", "-");
  const number = (value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const time = (seconds) => new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 2 }).format(seconds);
  const changedRows = (preview.rows || []).filter((row) => row.changed && !row.added && (row.reordered || row.trimmed));
  const rowsById = new Map(changedRows.map((row) => [row.id, row]));
  const trackChanges = Object.entries(preview.diff?.tracks || {}).map(([track, changes]) => {
    const added = (changes.added || []).map((entry) => typeof entry === "string" ? entityFor(preview, track, entry, "after") : entry);
    const removed = (changes.removed || []).map((entry) => typeof entry === "string" ? entityFor(preview, track, entry, "before") : entry);
    const modified = (changes.modified || []).map((entry) => ({
      ...entry,
      before: { ...entityFor(preview, track, entry.id, "before"), ...entry.before },
      after: { ...entityFor(preview, track, entry.id, "after"), ...entry.after },
      fields: (entry.fields || []).filter((field) => !PRIVATE_FIELDS.test(field) && !(track === "visuals" && rowsById.get(entry.id)?.trimmed && ["sourceStart", "sourceDuration", "duration"].includes(field))),
    })).filter((entry) => entry.fields.length);
    const reordered = (changes.orderAfter || []).filter((id, index) => (changes.orderBefore || []).includes(id) && changes.orderBefore.indexOf(id) !== index && !(track === "visuals" && rowsById.get(id)?.reordered));
    return { track, changes, added, removed, modified, reordered };
  }).filter(({ added, removed, modified, reordered }) => added.length || removed.length || modified.length || reordered.length);
  const projectFields = (preview.diff?.projectFields || []).filter(({ field }) => !PRIVATE_FIELDS.test(field));
  const markers = preview.diff?.markers;
  const hasMarkers = markers && (markers.added?.length || markers.removed?.length || markers.modified?.length);
  const valueProps = { t, time, number };
  return (
    <aside className="webmcp-review" aria-label={t("panelTitle")}>
      <header>
        <Robot size={19} weight="duotone" aria-hidden="true" />
        <strong>{t("panelTitle")}</strong>
        <button type="button" className="webmcp-review-close" aria-label={t("close")} onClick={agent.dismiss} disabled={working}><X size={17} /></button>
      </header>
      <div className="webmcp-review-body">
        <p className={applied ? "webmcp-review-success" : "webmcp-review-status"} role="status">
          {applied ? <CheckCircle size={16} aria-hidden="true" /> : null}{t(applied ? "applied" : "pending")}
        </p>
        {view.summary ? <p className="webmcp-review-summary">{view.summary}</p> : null}
        {Number.isFinite(preview.beforeDuration) && Number.isFinite(preview.afterDuration) ? <p className="webmcp-review-duration">{t("duration", { before: time(preview.beforeDuration), after: time(preview.afterDuration) })}</p> : null}
        {changedRows.length ? <section className="webmcp-review-section">
          <h3>{t("trackVisuals")}</h3>
          <ol className="webmcp-review-clips" aria-label={t("changes", { count: changedRows.length })}>
            {changedRows.map((row) => (
              <li key={row.id}>
                <span className="webmcp-review-name">{row.name || row.id}</span>
                <span className="webmcp-review-detail">
                  {row.reordered ? <span>{t("order")}: {row.beforeIndex + 1} → {row.index + 1}</span> : null}
                  {row.trimmed ? entityFor(preview, "visuals", row.id, "after").type === "image"
                    ? <span>{t("fieldDuration")}: {time(row.beforeDuration)} → {time(row.duration)}</span>
                    : <span>{t("trim")}: {time(row.beforeSourceStart)}–{time(row.beforeSourceStart + row.beforeDuration)} → {time(row.sourceStart)}–{time(row.sourceStart + row.duration)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section> : null}
        {trackChanges.map(({ track, changes, added, removed, modified, reordered }) => <section className="webmcp-review-section" key={track}>
          <h3>{t(TRACK_LABELS[track] || "fieldOther", { field: track })}</h3>
          <ul className="webmcp-review-clips">
            {removed.map((entry) => <EntityChange key={`remove-${entry.id}`} id={entry.id} before={entry} status="removed" {...valueProps} />)}
            {added.map((entry) => <EntityChange key={`add-${entry.id}`} id={entry.id} after={entry} status="added" {...valueProps} />)}
            {modified.map((entry) => <EntityChange key={`modify-${entry.id}`} {...entry} status="modified" {...valueProps} />)}
            {reordered.map((id) => <li key={`order-${id}`}><span className="webmcp-review-name">{entityFor(preview, track, id, "after").name || id}</span><span className="webmcp-review-detail">{t("order")}: {changes.orderBefore.indexOf(id) + 1} → {changes.orderAfter.indexOf(id) + 1}</span></li>)}
          </ul>
        </section>)}
        {hasMarkers ? <section className="webmcp-review-section">
          <h3>{t("trackMarkers")}</h3>
          <ul className="webmcp-review-clips">
            {(markers.removed || []).map((entry) => <EntityChange key={`remove-${entry.id}`} id={entry.id} before={entry} status="removed" {...valueProps} />)}
            {(markers.added || []).map((entry) => <EntityChange key={`add-${entry.id}`} id={entry.id} after={entry} status="added" {...valueProps} />)}
            {(markers.modified || []).map((entry) => <EntityChange key={`modify-${entry.id}`} {...entry} status="modified" {...valueProps} />)}
          </ul>
        </section> : null}
        {projectFields.length ? <section className="webmcp-review-section"><h3>{t("projectSettings")}</h3><dl className="webmcp-review-fields">{projectFields.filter(({ before, after }) => !equal(before, after)).map((entry) => <FieldChange key={entry.field} {...entry} {...valueProps} />)}</dl></section> : null}
        {!preview.hasChanges ? <p className="webmcp-review-status">{t("noChanges")}</p> : null}
        {error || stale ? <p className="webmcp-review-error" role="alert">{error || t("stale")}</p> : null}
      </div>
      <footer>
        <button type="button" className="panel-secondary" onClick={agent.dismiss} disabled={working}>{t(applied ? "close" : "dismiss")}</button>
        {applied ? (
          <button type="button" className="panel-secondary" onClick={agent.undo} disabled={working || !agent.canUndo}><ArrowCounterClockwise size={15} />{t("undo")}</button>
        ) : (
          <button type="button" className="panel-primary" onClick={agent.apply} disabled={working || stale || !preview.hasChanges}>
            {working ? <CircleNotch size={15} className="webmcp-review-spinner" /> : null}{t("apply")}
          </button>
        )}
      </footer>
    </aside>
  );
}
