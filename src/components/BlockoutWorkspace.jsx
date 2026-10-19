import { BlockoutTimeline } from "./BlockoutTimeline.jsx";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Cube,
  ArrowCounterClockwise,
  ArrowClockwise,
  Plus,
  Cursor,
  ArrowsOutCardinal,
  ArrowsClockwise,
  ArrowsOut,
  Camera,
  User,
  Package,
  DownloadSimple,
  SpinnerGap,
  CaretDown,
} from "@phosphor-icons/react";
import { BLOCKOUT_COPY } from "../i18nBlockout.js";
import {
  createBlockoutScene,
  getBlockoutShot,
  getBlockoutMotions,
  applyBlockoutEdits,
} from "../lib/blockoutScene.js";
import { createBlockoutViewport } from "../lib/blockoutViewport.js";
import { BlockoutChat } from "./BlockoutChat.jsx";
import "./BlockoutWorkspace.css";
export function BlockoutWorkspace({ language = "zh", projectId = "local", anna = false, onClose }) {
  const c = BLOCKOUT_COPY[language] || BLOCKOUT_COPY.en,
    key = `timeline-blockout-v2:${projectId}`;
  const [scene, setScene] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value?.objects && value?.shots ? value : createBlockoutScene();
    } catch {
      return createBlockoutScene();
    }
  });
  const [selected, setSelected] = useState(""),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [view, setView] = useState("layout"),
    [mode, setMode] = useState("translate"),
    [tab, setTab] = useState("transform"),
    [error, setError] = useState(""),
    [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [exportOpen, setExportOpen] = useState(false),
    [exportProgress, setExportProgress] = useState(null);
  const host = useRef(null),
    engine = useRef(null),
    current = useRef(scene);
  current.current = scene;
  const commit = (next) => {
    setHistory((items) => [...items.slice(-29), current.current]);
    setFuture([]);
    setScene(next);
    setPlaying(false);
    engine.current?.play(false);
  };
  const edit = (operations) => {
    try {
      commit(applyBlockoutEdits(current.current, operations));
      setError("");
    } catch {
      setError(c.failed);
    }
  };
  useEffect(() => {
    try {
      host.current?.closest(".blockout-workspace")?.focus();
      engine.current = createBlockoutViewport(host.current, {
        onSelect: setSelected,
        onTransform: (id, patch) => edit([{ type: "update", id, ...patch }]),
        onTime: (value, isPlaying) => {
          setTime(value);
          setPlaying(isPlaying);
        },
        onError: () => setError(c.failed),
      });
      engine.current.update(current.current);
    } catch {
      setError(c.failed);
    }
    return () => {
      engine.current?.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    engine.current?.update(scene);
    try {
      localStorage.setItem(key, JSON.stringify(scene));
    } catch {
      /* Keep unsaved scene editable. */
    }
  }, [scene, key]);
  useEffect(() => {
    engine.current?.select(selected);
  }, [selected]);
  const activeShot = getBlockoutShot(scene, time);
  const selectedObject =
    scene.objects.find((o) => o.id === selected) ||
    (selected === "camera"
      ? {
          id: "camera",
          kind: "camera",
          position: activeShot.position,
          target: activeShot.target,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        }
      : null);
  const object =
    selectedObject?.kind === "camera"
      ? { ...selectedObject, position: activeShot.position, target: activeShot.target }
      : selectedObject;
  const name = (o) =>
    `${c[o.kind === "actor" ? "actor" : o.kind === "camera" ? "camera" : "prop"]} ${o.kind === "actor" ? o.name : ""}`;
  const actorMotions =
    object?.kind === "actor"
      ? getBlockoutMotions(scene).filter((item) => item.objectId === object.id)
      : [];
  const selectedMotion =
    actorMotions.find((item) => time >= item.start && time < item.end) || actorMotions.at(-1);
  const seek = (value) => {
    setTime(value);
    engine.current?.seek(value);
  };
  const togglePlay = () => {
    if (time >= scene.duration) seek(0);
    setPlaying(!playing);
    engine.current?.play(!playing);
  };
  const changeView = (value) => {
    setView(value);
    engine.current?.preview(value === "preview");
  };
  const undo = () => {
    if (!history.length) return;
    setFuture((items) => [scene, ...items]);
    setScene(history.at(-1));
    setHistory((items) => items.slice(0, -1));
    setPlaying(false);
    engine.current?.play(false);
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((items) => [...items, scene]);
    setScene(future[0]);
    setFuture((items) => items.slice(1));
    setPlaying(false);
    engine.current?.play(false);
  };
  const exportAbort = useRef(null);
  useEffect(() => () => exportAbort.current?.abort(), []);
  const exportVideo = async () => {
    setExportOpen(false);
    setError("");
    setExportProgress(0);
    setPlaying(false);
    engine.current?.play(false);
    const controller = new AbortController();
    exportAbort.current = controller;
    try {
      const blob = await engine.current.exportVideo({
        signal: controller.signal,
        onProgress: setExportProgress,
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "blockout-video.webm";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (error.name !== "AbortError") setError(c.failed);
    } finally {
      exportAbort.current = null;
      setExportProgress(null);
    }
  };
  const exportProject = () => {
    setExportOpen(false);
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ format: "timeline-studio-blockout", version: 1, scene }, null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "blockout-scene.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section
      className="blockout-workspace"
      aria-label={c.title}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          if (exportOpen) setExportOpen(false);
          else if (exportProgress !== null) exportAbort.current?.abort();
          else onClose();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <header className="bo-top">
        <button onClick={onClose}>
          <ArrowLeft size={18} />
          {c.back}
        </button>
        <b>
          <Cube size={20} />
          {c.title}
        </b>
        <span>{c.project}</span>
        <div className="bo-top-actions">
          <button aria-label={c.undo} disabled={!history.length} onClick={undo}>
            <ArrowCounterClockwise size={19} />
          </button>
          <button aria-label={c.redo} disabled={!future.length} onClick={redo}>
            <ArrowClockwise size={19} />
          </button>
          <div className="bo-export-menu">
            <button
              className="bo-primary"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((value) => !value)}
            >
              <DownloadSimple size={17} />
              {c.export}
              <CaretDown size={15} />
            </button>
            {exportOpen && (
              <>
                <button
                  className="bo-export-dismiss"
                  aria-label={c.cancel}
                  onClick={() => setExportOpen(false)}
                />
                <div className="bo-export-options">
                  <button onClick={exportProject}>{c.exportProject}</button>
                  <button disabled={!scene.objects.length} onClick={() => void exportVideo()}>
                    {c.exportVideo}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <BlockoutChat
        language={language}
        projectId={projectId}
        anna={anna}
        scene={scene}
        onCommit={commit}
        onUndo={undo}
        error={error}
        onError={setError}
        onClose={onClose}
      />
      {exportProgress !== null && (
        <div className="bo-export-overlay" role="status">
          <div>
            <SpinnerGap className="spin" size={24} />
            <b>{c.exporting}</b>
            <span>{Math.round(exportProgress * 100)}%</span>
            <progress max="1" value={exportProgress} />
            <button onClick={() => exportAbort.current?.abort()}>{c.cancel}</button>
          </div>
        </div>
      )}
      <div className="bo-editor">
        <div className="bo-viewport">
          <div ref={host} className="bo-canvas" />
          <div className="bo-modes">
            {["layout", "animation", "preview"].map((v) => (
              <button className={view === v ? "active" : ""} key={v} onClick={() => changeView(v)}>
                {c[v]}
              </button>
            ))}
          </div>
          <div className="bo-tools">
            {[
              ["translate", ArrowsOutCardinal, "position"],
              ["rotate", ArrowsClockwise, "rotation"],
              ["scale", ArrowsOut, "scale"],
            ].map(([v, Icon, label]) => (
              <button
                key={v}
                aria-label={c[label]}
                className={mode === v ? "active" : ""}
                disabled={playing || time > 0 || view === "preview"}
                onClick={() => {
                  setMode(v);
                  engine.current?.setMode(v);
                }}
              >
                <Icon size={18} />
                {c[label]}
              </button>
            ))}
            <button onClick={() => engine.current?.reset()} aria-label={c.reset}>
              <Cursor size={18} />
            </button>
          </div>
          {scene.objects.length > 0 && (
            <span className="bo-view-label">
              {c.camera} / {c.scene}
            </span>
          )}
        </div>
        <BlockoutTimeline
          scene={scene}
          time={time}
          playing={playing}
          view={view}
          c={c}
          onSeek={seek}
          onPlay={togglePlay}
          onEdit={edit}
          onSelect={(id, section) => {
            setSelected(id);
            if (section) setTab(section);
          }}
        />
      </div>
      <aside className="bo-inspector">
        <header>
          {c.objects}
          <button
            aria-label={c.add}
            onClick={() => edit([{ type: "add", kind: "actor", position: [0, 0, 1] }])}
          >
            <Plus size={17} />
          </button>
        </header>
        <div className="bo-object-list">
          {scene.objects.map((o) => (
            <button
              className={selected === o.id ? "active" : ""}
              key={o.id}
              onClick={() => setSelected(o.id)}
            >
              {o.kind === "actor" ? (
                <User size={17} />
              ) : o.kind === "camera" ? (
                <Camera size={17} />
              ) : (
                <Package size={17} />
              )}
              <span>{name(o)}</span>
            </button>
          ))}
        </div>
        <div className="bo-properties">
          <nav>
            {["transform", "action", "voice"].map((v) => (
              <button className={tab === v ? "active" : ""} key={v} onClick={() => setTab(v)}>
                {c[v]}
              </button>
            ))}
          </nav>
          {object &&
            tab === "transform" &&
            (object.kind === "camera" ? ["position"] : ["position", "rotation", "scale"]).map(
              (field) => (
                <fieldset key={field} disabled={playing || (time > 0 && object.kind !== "camera")}>
                  <legend>{c[field]}</legend>
                  {["X", "Y", "Z"].map((axis, i) => (
                    <label key={axis}>
                      <span className={`axis-${axis}`}>{axis}</span>
                      <input
                        aria-label={`${c[field]} ${axis}`}
                        type="number"
                        step={field === "rotation" ? 5 : 0.1}
                        min={field === "scale" ? 0.1 : field === "rotation" ? -36000 : -100}
                        max={field === "rotation" ? 36000 : 100}
                        value={object[field][i]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (!Number.isFinite(value)) return;
                          const vector = [...object[field]];
                          vector[i] = value;
                          edit(
                            object.kind === "camera"
                              ? [
                                  {
                                    type: "camera",
                                    id: activeShot.id,
                                    position: vector,
                                    target: activeShot.target,
                                  },
                                ]
                              : [{ type: "update", id: object.id, [field]: vector }],
                          );
                        }}
                      />
                    </label>
                  ))}
                </fieldset>
              ),
            )}
          {object && ["actor", "camera"].includes(object.kind) && tab === "action" && (
            <fieldset disabled={playing}>
              <legend>
                {c.position} · {c.action}
              </legend>
              {["X", "Y", "Z"].map((axis, i) => (
                <label key={axis}>
                  <span>{axis}</span>
                  <input
                    aria-label={`${c.action} ${axis}`}
                    type="number"
                    step=".1"
                    value={(selectedMotion?.to || object.target || object.position)[i]}
                    onChange={(e) => {
                      const target = [...(selectedMotion?.to || object.target || object.position)];
                      target[i] = Number(e.target.value);
                      edit(
                        object.kind === "camera"
                          ? [
                              {
                                type: "camera",
                                id: activeShot.id,
                                position: activeShot.position,
                                target,
                              },
                            ]
                          : [
                              {
                                ...(selectedMotion || {
                                  id: `walk-${object.id}`,
                                  objectId: object.id,
                                  kind: "move",
                                  start: 0,
                                  end: Math.min(4, scene.duration),
                                  from: object.position,
                                }),
                                type: "motion",
                                to: target,
                              },
                            ],
                      );
                    }}
                  />
                </label>
              ))}
            </fieldset>
          )}
          {tab === "voice" && <p>{c.later}</p>}
        </div>
      </aside>
    </section>
  );
}
