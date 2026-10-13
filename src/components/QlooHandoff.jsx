import { useState } from "react";
import { readHandoff, HANDOFF_KEY } from "../qloo/handoff.js";
import { handoffCopy } from "../qloo/handoff-copy.js";
import { getBrowserPlanningClips } from "../lib/browserEditPlan.js";
export function QlooHandoff({ language, visualSegments, agent }) {
  const [handoff, setHandoff] = useState(readHandoff);
  const [duration, setDuration] = useState(
    () => ({ gentle: 12, balanced: 10, punchy: 8 })[handoff?.pace] || 10,
  );
  const t = handoffCopy(language);
  if (!handoff) return null;
  const clips = getBrowserPlanningClips(visualSegments);
  const valid =
    clips.length === 1 &&
    clips[0].trimAllowed &&
    Number.isFinite(duration) &&
    duration >= 0.05 &&
    duration <= 180 &&
    duration < clips[0].duration - 0.000001;
  return (
    <aside
      className="qloo-handoff"
      style={{
        border: "1px solid #8b7cc5",
        borderRadius: 10,
        padding: 12,
        margin: "8px 16px",
        background: "#1c2030",
        color: "#eee",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        zIndex: 2,
      }}
    >
      <strong>
        {t.title} · {handoff.seed}
      </strong>
      <label>
        {t.duration}{" "}
        <input
          aria-label={t.duration}
          type="number"
          min="0.05"
          max="180"
          step="0.05"
          value={duration}
          style={{ width: 80 }}
          onChange={(e) => setDuration(e.target.valueAsNumber)}
        />
      </label>
      <button
        disabled={!valid || agent.working}
        onClick={() => agent.previewQlooTrim(duration, `${t.title}: ${handoff.seed}`)}
      >
        {t.preview}
      </button>
      <button
        onClick={() => {
          sessionStorage.removeItem(HANDOFF_KEY);
          setHandoff(null);
        }}
      >
        {t.close}
      </button>
      <small style={{ flexBasis: "100%" }}>
        {t.note} {!valid && t.need}
      </small>
      {agent.error && <small role="alert">{agent.error}</small>}
    </aside>
  );
}
