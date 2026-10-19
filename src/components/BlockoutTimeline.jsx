import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  User,
  Play,
  Pause,
  Plus,
  TextAlignLeft,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import {
  applyBlockoutEdits,
  getBlockoutMotions,
  getBlockoutScriptIndex,
  getBlockoutShot,
} from "../lib/blockoutScene.js";
import "./BlockoutTimeline.css";
export function BlockoutTimeline({
  scene,
  time,
  playing,
  view,
  c,
  onSeek,
  onPlay,
  onEdit,
  onSelect,
}) {
  const script = scene.script || [],
    active = getBlockoutScriptIndex(script, time),
    activeRef = useRef(null);
  const motions = useMemo(() => getBlockoutMotions(scene), [scene]);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    const node = activeRef.current,
      container = node?.parentElement;
    if (node && container)
      container.scrollTo({
        left: node.offsetLeft - (container.clientWidth - node.offsetWidth) / 2,
        behavior:
          playing && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto",
      });
  }, [active, playing]);
  const begin = () => {
    setDraft(script.map((item) => ({ ...item })));
    setError("");
    setEditing((value) => !value);
  };
  const changeText = (value) => {
    const lines = value.split("\n").slice(0, 200);
    setDraft((items) =>
      lines.map((text, index) => ({
        text,
        start:
          items.length === lines.length
            ? items[index].start
            : (index * scene.duration) / lines.length,
        end:
          items.length === lines.length
            ? items[index].end
            : ((index + 1) * scene.duration) / lines.length,
      })),
    );
  };
  const save = (event) => {
    event.preventDefault();
    const segments = draft.filter((item) => item.text.trim());
    const operation = { type: "script.replace", segments };
    try {
      applyBlockoutEdits(scene, [operation]);
      onEdit([operation]);
      setEditing(false);
      setError("");
    } catch {
      setError(c.scriptInvalid);
    }
  };
  const splitShot = () => {
    const shot = getBlockoutShot(scene, time);
    const at =
      time > shot.start + 0.2 && time < shot.end - 0.2 ? time : (shot.start + shot.end) / 2;
    if (shot.end - shot.start < 0.2) return;
    onEdit([
      { type: "shot", ...shot, end: at },
      { ...shot, type: "shot", id: crypto.randomUUID(), start: at },
    ]);
  };
  const actors = scene.objects.filter((object) => object.kind === "actor");
  const geometry = (item) => ({
    left: `${(item.start / scene.duration) * 100}%`,
    width: `${((item.end - item.start) / scene.duration) * 100}%`,
  });
  return (
    <div className="bo-timeline bo-story-timeline">
      <header>
        <span>
          {c.chapter} / {c.scene}
        </span>
        <button aria-label={playing ? c.pause : c.play} onClick={onPlay}>
          {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
        </button>
        <time>
          {time.toFixed(2)} / {scene.duration.toFixed(2)}s
        </time>
        <input
          aria-label={c.shots}
          type="range"
          min="0"
          max={scene.duration}
          step={1 / 24}
          value={time}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <button aria-label={c.addShot} onClick={splitShot}>
          <Plus size={15} />
        </button>
        <button className={editing ? "active" : ""} onClick={begin}>
          <TextAlignLeft size={16} />
          {c.script}
        </button>
      </header>
      <section className="bo-script-follow" aria-label={c.script}>
        {script.length ? (
          <>
            <button
              aria-label={c.previousScript}
              disabled={active <= 0}
              onClick={() => onSeek(script[active - 1].start)}
            >
              <CaretLeft size={15} />
            </button>
            <div className="bo-script-carousel">
              {script.map((segment, index) => (
                <button
                  ref={index === active ? activeRef : null}
                  aria-current={index === active ? "step" : undefined}
                  className={index === active ? "active" : ""}
                  key={segment.id}
                  onClick={() => onSeek(segment.start)}
                >
                  <small>
                    {segment.start.toFixed(2)}–{segment.end.toFixed(2)}s
                  </small>
                  <span>{segment.text}</span>
                </button>
              ))}
            </div>
            <button
              aria-label={c.nextScript}
              disabled={active >= script.length - 1}
              onClick={() => onSeek(script[Math.max(0, active + 1)].start)}
            >
              <CaretRight size={15} />
            </button>
          </>
        ) : (
          <button className="bo-script-empty" onClick={begin}>
            {c.scriptEmpty}
          </button>
        )}
        {script.length > 0 && active < 0 && <small className="bo-script-gap">{c.scriptGap}</small>}
      </section>
      {editing && (
        <form className="bo-script-editor" onSubmit={save}>
          <p>{c.scriptHint}</p>
          <textarea
            aria-label={c.scriptText}
            value={draft.map((item) => item.text).join("\n")}
            onChange={(e) => changeText(e.target.value)}
            rows={3}
          />
          <div className="bo-script-timings">
            {draft.map((segment, index) => (
              <div key={index}>
                <span>
                  {index + 1}. {segment.text || c.scriptText}
                </span>
                <input
                  aria-label={`${c.startTime} ${index + 1}`}
                  type="number"
                  min="0"
                  max={scene.duration}
                  step=".01"
                  value={Number(segment.start.toFixed(2))}
                  onChange={(e) =>
                    setDraft((items) =>
                      items.map((item, i) =>
                        i === index ? { ...item, start: Number(e.target.value) } : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`${c.endTime} ${index + 1}`}
                  type="number"
                  min="0"
                  max={scene.duration}
                  step=".01"
                  value={Number(segment.end.toFixed(2))}
                  onChange={(e) =>
                    setDraft((items) =>
                      items.map((item, i) =>
                        i === index ? { ...item, end: Number(e.target.value) } : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="bo-error">
              {error}
            </p>
          )}
          <div className="bo-script-editor-actions">
            <button className="bo-primary">{c.saveScript}</button>
            <button type="button" onClick={() => setEditing(false)}>
              {c.cancel}
            </button>
          </div>
        </form>
      )}
      <div className="bo-sequence-lanes">
        <div className="bo-time-ruler">
          <span />
          <div>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i}>{((scene.duration * i) / 4).toFixed(1)}s</span>
            ))}
          </div>
        </div>
        <div className="bo-sequence-row">
          <b>
            <Camera size={15} />
            {c.shots}
          </b>
          <div>
            {scene.shots.map((shot, index) => (
              <button
                style={geometry(shot)}
                key={shot.id}
                className={getBlockoutShot(scene, time).id === shot.id ? "active" : ""}
                onClick={() => {
                  onSeek(shot.start);
                  onSelect("camera", "transform");
                }}
                title={`${shot.start.toFixed(2)}–${shot.end.toFixed(2)}s`}
              >
                <Camera size={15} />
                {shot.label || `S${String(index + 1).padStart(2, "0")}`}
              </button>
            ))}
          </div>
        </div>
        {actors.map((actor, index) => (
          <div className="bo-sequence-row bo-actor-lane" key={actor.id}>
            <b>
              <User size={15} />
              {c.actor} {actor.name}
            </b>
            <div>
              {motions
                .filter((item) => item.objectId === actor.id)
                .map((motion) => (
                  <button
                    key={motion.id}
                    style={geometry(motion)}
                    className={`${index % 2 ? "is-violet" : ""} ${time >= motion.start && time < motion.end ? "is-playing" : ""}`}
                    onClick={() => {
                      onSeek(motion.start);
                      onSelect(actor.id, "action");
                    }}
                    title={`${motion.start.toFixed(2)}–${motion.end.toFixed(2)}s`}
                  >
                    {motion.label || c.action}
                  </button>
                ))}
            </div>
          </div>
        ))}
        <div className="bo-sequence-row bo-camera-lane">
          <b>
            <Camera size={15} />
            {c.camera}
          </b>
          <div>
            {scene.shots.map((shot, index) => (
              <button
                key={shot.id}
                style={geometry(shot)}
                className={getBlockoutShot(scene, time).id === shot.id ? "is-playing" : ""}
                onClick={() => {
                  onSeek(shot.start);
                  onSelect("camera", "transform");
                }}
              >
                {shot.label || `${c.camera} ${index + 1}`}
              </button>
            ))}
          </div>
        </div>
        <div
          className="bo-sequence-playhead"
          style={{ left: `calc(116px + (100% - 116px) * ${time / scene.duration})` }}
        />
      </div>
      {view === "animation" && (
        <div className="bo-animation-row">
          <User size={16} />
          {c.actorActions}
          <input
            aria-label={c.action}
            type="range"
            min="3"
            max="120"
            value={scene.duration}
            onChange={(e) => onEdit([{ type: "duration", seconds: Number(e.target.value) }])}
          />
          {scene.duration}s
        </div>
      )}
    </div>
  );
}
