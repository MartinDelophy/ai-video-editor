import { useEffect, useEffectEvent, useRef, useState } from "react";

const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 54;
const LEVELS = 128;
const COLORS = ["#ff697a", "#70eb9f", "#70b8ff"];

export function ColorGradeScope({ t, getSource }) {
  const canvasRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const readSource = useEffectEvent(() => getSource?.());

  useEffect(() => {
    if (!open) return;
    const sample = document.createElement("canvas");
    sample.width = SAMPLE_WIDTH;
    sample.height = SAMPLE_HEIGHT;
    const input = sample.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    const output = canvasRef.current?.getContext("2d");
    if (!input || !output || !("filter" in input)) return;
    const { width, height } = output.canvas;
    const counts = new Uint8Array(SAMPLE_WIDTH * 3 * LEVELS);
    let lastSource;
    let lastUrl;
    let lastTime;
    let lastFilter;

    function sampleFrame() {
      const source = readSource();
      const isVideo = source instanceof HTMLVideoElement;
      const ready = isVideo ? source.readyState >= 2 && !source.seeking && !source.__timelineFramePending : source?.complete && source.naturalWidth;
      if (!ready) {
        if (source?.seeking && source === lastSource && source.currentSrc === lastUrl) return;
        lastSource = null;
        output.clearRect(0, 0, width, height);
        setHasFrame(false);
        return;
      }
      const url = source.currentSrc;
      const time = isVideo ? source.currentTime : 0;
      const filter = source.style.filter || "none";
      if (source === lastSource && url === lastUrl && time === lastTime && filter === lastFilter) return;
      lastSource = source;
      lastUrl = url;
      lastTime = time;
      lastFilter = filter;

      try {
        input.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        input.filter = filter;
        input.imageSmoothingEnabled = false;
        input.drawImage(source, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        const pixels = input.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
        counts.fill(0);
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] < 128) continue;
          const x = (index / 4) % SAMPLE_WIDTH;
          for (let channel = 0; channel < 3; channel++) {
            counts[(channel * SAMPLE_WIDTH + x) * LEVELS + (pixels[index + channel] >> 1)]++;
          }
        }
      } catch {
        // A source that cannot be sampled must never leave another shot's scope visible.
        sample.width = SAMPLE_WIDTH; // Reset origin cleanliness for the next source.
        output.clearRect(0, 0, width, height);
        setHasFrame(false);
        return;
      }

      output.clearRect(0, 0, width, height);
      output.fillStyle = "#35444e";
      for (const y of [0, height / 4, height / 2, height * 3 / 4, height - 1]) {
        output.fillRect(0, y, width, 1);
      }
      const plotWidth = width / 3;
      for (let channel = 0; channel < 3; channel++) {
        if (channel) output.fillRect(plotWidth * channel, 0, 1, height);
      }
      const step = plotWidth / SAMPLE_WIDTH;
      for (let channel = 0; channel < 3; channel++) {
        output.fillStyle = COLORS[channel];
        for (let x = 0; x < SAMPLE_WIDTH; x++) {
          for (let level = 0; level < LEVELS; level++) {
            const count = counts[(channel * SAMPLE_WIDTH + x) * LEVELS + level];
            if (!count) continue;
            output.globalAlpha = Math.min(1, 0.28 + Math.sqrt(count) * 0.19);
            output.fillRect(plotWidth * channel + x * step, (LEVELS - 1 - level) * (height - 1) / (LEVELS - 1), Math.ceil(step), 1);
          }
        }
      }
      output.globalAlpha = 1;
      setHasFrame(true);
    }

    sampleFrame();
    const timer = window.setInterval(sampleFrame, 125);
    return () => window.clearInterval(timer);
  }, [open]);

  return (
    <details className="color-grade-scope" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t("colorScopeTitle")}</summary>
      {open && <div className="color-grade-scope-body">
        <p>{t("colorScopeDescription")}</p>
        <div className="color-grade-scope-plot">
          <div className="color-grade-scope-scale" aria-hidden="true"><span>255</span><span>128</span><span>0</span></div>
          <canvas ref={canvasRef} width={288} height={128} role="img" aria-label={t("colorScopeTitle")} />
          {!hasFrame && <span className="color-grade-scope-empty">{t("colorScopeUnavailable")}</span>}
        </div>
        <div className="color-grade-scope-channels" aria-hidden="true">{["R", "G", "B"].map((label, index) => <span key={label} style={{ color: COLORS[index] }}>{label}</span>)}</div>
      </div>}
    </details>
  );
}
