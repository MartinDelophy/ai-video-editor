import { useEffect, useRef } from "react";
import { audioEqResponse } from "../lib/audioProcessingDsp.js";
const W = 400,
  H = 190,
  L = 38,
  R = 378,
  T = 18,
  B = 154;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, step) => Math.round(v / step) * step;
const xDb = (db) => L + ((db + 60) / 60) * (R - L),
  yDb = (db) => B - ((db + 60) / 60) * (B - T);
const xHz = (hz) => L + (Math.log(hz / 20) / Math.log(1000)) * (R - L),
  yGain = (gain) => (T + B) / 2 - ((gain / 18) * (B - T)) / 2;
function controls(tab, settings) {
  if (tab === "eq")
    return ["low", "mid", "high"].map((key, i) => ({
      key,
      x: xHz([120, 2500, 8000][i]),
      y: yGain(audioEqResponse(settings.eq, [120, 2500, 8000][i])),
    }));
  if (tab === "compressor")
    return [
      {
        key: "threshold",
        x: xDb(settings.compressor.threshold),
        y: yDb(settings.compressor.threshold),
      },
      {
        key: "ratio",
        x: xDb(0),
        y: yDb(settings.compressor.threshold * (1 - 1 / settings.compressor.ratio)),
      },
    ];
  if (tab === "loudness")
    return [{ key: "gain", x: xDb(-24), y: yDb(-24 + settings.loudness.gain) }];
  if (tab === "limiter")
    return [{ key: "ceiling", x: xDb(settings.limiter.ceiling), y: yDb(settings.limiter.ceiling) }];
  return [{ key: "strength", x: L + settings.strength * (R - L), y: B }];
}
export function AudioProcessingGraph({
  tab,
  settings,
  change,
  copy,
  disabled,
  peaks = [],
  processedPeaks,
}) {
  const canvas = useRef(null),
    drag = useRef(null),
    latest = useRef(null);
  latest.current = { tab, settings, change, disabled };
  useEffect(() => {
    const node = canvas.current;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      node.width = Math.round(node.clientWidth * dpr);
      node.height = Math.round(((node.clientWidth * H) / W) * dpr);
      const ctx = node.getContext("2d");
      ctx.scale(node.width / W, node.height / H);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#80959e";
      const line = (points, color, width = 1) => {
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      const cyan = disabled ? "#61777b" : "#4ee4d5";
      if (tab === "denoise") {
        const waveform = (values, color) => {
          if (!values?.length) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          values.forEach((value, i) => {
            const x = L + (i / Math.max(1, values.length - 1)) * (R - L),
              height = clamp(value, 0, 1) * 44;
            ctx.beginPath();
            ctx.moveTo(x, 74 - height);
            ctx.lineTo(x, 74 + height);
            ctx.stroke();
          });
        };
        line(
          [
            [L, 74],
            [R, 74],
          ],
          "#23343c",
        );
        waveform(peaks, "#667f88");
        waveform(processedPeaks, cyan);
        ctx.fillText(copy.original, L, 14);
        if (processedPeaks) {
          ctx.fillStyle = cyan;
          ctx.textAlign = "right";
          ctx.fillText(copy.processed, R, 14);
          ctx.textAlign = "left";
        }
        line(
          [
            [L, B],
            [R, B],
          ],
          "#30474e",
          4,
        );
        line(
          [
            [L, B],
            [L + settings.strength * (R - L), B],
          ],
          cyan,
          4,
        );
        ctx.fillStyle = "#80959e";
        ctx.fillText("0%", L, 180);
        ctx.textAlign = "right";
        ctx.fillText("100%", R, 180);
        ctx.textAlign = "left";
      } else if (tab === "eq") {
        for (const gain of [-12, 0, 12]) {
          line(
            [
              [L, yGain(gain)],
              [R, yGain(gain)],
            ],
            gain === 0 ? "#3a5159" : "#22343b",
          );
          ctx.fillText(`${gain > 0 ? "+" : ""}${gain}`, 6, yGain(gain) + 3);
        }
        for (const hz of [20, 100, 1000, 10000, 20000]) {
          line(
            [
              [xHz(hz), T],
              [xHz(hz), B],
            ],
            "#203139",
          );
          ctx.textAlign = "center";
          ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : String(hz), xHz(hz), 180);
        }
        ctx.textAlign = "left";
        line(
          Array.from({ length: 181 }, (_, i) => {
            const hz = 20 * 1000 ** (i / 180);
            return [xHz(hz), yGain(clamp(audioEqResponse(settings.eq, hz), -18, 18))];
          }),
          cyan,
          2.5,
        );
      } else {
        for (const db of [-60, -36, -12, 0]) {
          line(
            [
              [xDb(db), T],
              [xDb(db), B],
            ],
            "#203139",
          );
          line(
            [
              [L, yDb(db)],
              [R, yDb(db)],
            ],
            "#203139",
          );
          ctx.textAlign = "right";
          ctx.fillText(String(db), L - 7, yDb(db) + 3);
          ctx.textAlign = "center";
          ctx.fillText(String(db), xDb(db), 171);
        }
        ctx.textAlign = "left";
        ctx.fillText(`${copy.output} · dB`, L, 10);
        ctx.textAlign = "right";
        ctx.fillText(`${copy.input} · dB`, R, 188);
        ctx.textAlign = "left";
        ctx.setLineDash([4, 4]);
        line(
          [
            [L, B],
            [R, T],
          ],
          "#62737a",
        );
        ctx.setLineDash([]);
        line(
          Array.from({ length: 181 }, (_, i) => {
            const input = -60 + i / 3;
            let output = input;
            if (tab === "compressor") {
              const { threshold, ratio } = settings.compressor;
              output = input - Math.max(0, input - threshold) * (1 - 1 / ratio);
            }
            if (tab === "loudness") output = input + settings.loudness.gain;
            if (tab === "limiter") output = Math.min(input, settings.limiter.ceiling);
            return [xDb(input), yDb(clamp(output, -60, 0))];
          }),
          cyan,
          2.5,
        );
      }
      for (const point of controls(tab, settings)) {
        ctx.beginPath();
        ctx.arc(point.x, clamp(point.y, T, B), 7, 0, 2 * Math.PI);
        ctx.fillStyle = "#10282d";
        ctx.fill();
        ctx.strokeStyle = cyan;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(point.x, clamp(point.y, T, B), 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = cyan;
        ctx.fill();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab, settings, copy, disabled, peaks, processedPeaks]);
  const position = (event) => {
    const box = canvas.current.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * W,
      y: ((event.clientY - box.top) / box.height) * H,
    };
  };
  const move = (event) => {
    const state = latest.current;
    if (!drag.current || state.disabled) return;
    const p = position(event),
      key = drag.current;
    let value;
    if (state.tab === "eq") {
      const hz = { low: 120, mid: 2500, high: 8000 }[key];
      const target = (((T + B) / 2 - p.y) / ((B - T) / 2)) * 18;
      value = round(
        clamp(state.settings.eq[key] + target - audioEqResponse(state.settings.eq, hz), -12, 12),
        0.5,
      );
    }
    if (state.tab === "compressor")
      value =
        key === "threshold"
          ? round(clamp(((p.x - L) / (R - L)) * 60 - 60, -60, 0), 1)
          : round(
              clamp(
                -state.settings.compressor.threshold /
                  Math.max(
                    0.1,
                    ((B - p.y) / (B - T)) * 60 - 60 - state.settings.compressor.threshold,
                  ),
                1,
                12,
              ),
              0.5,
            );
    if (state.tab === "loudness")
      value = round(clamp(((B - p.y) / (B - T)) * 60 - 60 + 24, -18, 18), 0.5);
    if (state.tab === "limiter") value = round(clamp(((B - p.y) / (B - T)) * 60 - 60, -12, 0), 0.5);
    if (state.tab === "denoise") value = round(clamp((p.x - L) / (R - L), 0, 1), 0.05);
    state.change(
      state.tab === "denoise" ? "strength" : state.tab,
      state.tab === "denoise"
        ? value
        : { ...state.settings[state.tab], enabled: true, [key]: value },
    );
  };
  return (
    <div className={`audio-processing-graph ${disabled ? "is-disabled" : ""}`}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${copy[tab]} · ${copy.visualHint}`}
        onPointerDown={(event) => {
          if (disabled) return;
          const p = position(event),
            points = controls(tab, settings);
          const closest = points.reduce((a, b) =>
            Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b,
          );
          if (Math.hypot(closest.x - p.x, closest.y - p.y) > 32) return;
          drag.current = closest.key;
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      />
      <small>{copy.visualHint}</small>
    </div>
  );
}
