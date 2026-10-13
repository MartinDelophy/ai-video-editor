import { directorCopy } from "./director-copy.js";
import { useState, useRef, useEffect } from "react";
import { copy, languages } from "./copy.js";
import "./style.css";
async function api(path, body, signal) {
  const response = await fetch(`/api/qloo/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "REQUEST_FAILED");
  return data;
}
function Audience({ label, t, selected, onSelect, disabled }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function search(e) {
    e.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(false);
    setResults(null);
    try {
      const r = await api("search", { query }, controller.signal);
      if (!Array.isArray(r.data.results)) throw new Error("INVALID_RESPONSE");
      if (!controller.signal.aborted)
        setResults(
          r.data.results.filter(
            (x) => typeof x.entity_id === "string" && typeof x.name === "string",
          ),
        );
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="audience">
      <div className="eyebrow">
        {t.audience} {label}
      </div>
      <h2>{selected?.name || t.choose}</h2>
      {selected ? (
        <div className="selected">
          <span>{selected.disambiguation || selected.types?.join(" · ")}</span>
          <button disabled={disabled} onClick={() => onSelect(null)}>
            {t.remove}
          </button>
        </div>
      ) : (
        <form onSubmit={search}>
          <label htmlFor={`search-${label}`}>{t.search}</label>
          <div className="search">
            <input
              id={`search-${label}`}
              value={query}
              maxLength={120}
              onChange={(e) => {
                pending.current?.abort();
                setBusy(false);
                setQuery(e.target.value);
                setResults(null);
                setError(false);
              }}
              placeholder={label === "A" ? "Spirited Away" : "John Wick"}
            />
            <button disabled={busy || !query.trim() || disabled}>
              {busy ? t.loading : t.search}
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{t.error}</p>}
      {!selected && results?.length === 0 && <p>{t.empty}</p>}
      {!selected &&
        results?.map((x) => (
          <button
            className="result"
            key={x.entity_id}
            disabled={disabled}
            onClick={() => {
              pending.current?.abort();
              setResults(null);
              onSelect(x);
            }}
          >
            <strong>{x.name}</strong>
            <small>{x.disambiguation || x.types?.join(" · ")}</small>
          </button>
        ))}
    </section>
  );
}
function Evidence({ value, t, label }) {
  const entities = value.data.results?.entities;
  if (!Array.isArray(entities)) return <p role="alert">{t.error}</p>;
  return (
    <section className="evidence">
      <div className="eyebrow">
        {t.audience} {label} · {t.evidence}
      </div>
      {!entities.length && <p>{t.empty}</p>}
      {entities.map((x, i) => (
        <article key={x.entity_id}>
          <span className="rank">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3>{x.name}</h3>
            <p>{x.properties?.genres?.join(" · ")}</p>
            <small>
              {t.affinity}: {Number.isFinite(x.query?.affinity) ? x.query.affinity.toFixed(3) : "—"}
            </small>
          </div>
        </article>
      ))}
      <details>
        <summary>{t.request}</summary>
        <pre>
          {JSON.stringify(
            { source: value.source, retrievedAt: value.retrievedAt, request: value.request },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
function App() {
  const [language, setLanguage] = useState("zh");
  const t = copy(language);
  const d = directorCopy(language);
  const [brief, setBrief] = useState("");
  const [plans, setPlans] = useState(null);
  const [seeds, setSeeds] = useState([null, null]);
  const [evidence, setEvidence] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [configured, setConfigured] = useState(null);
  const pending = useRef(null);
  useEffect(() => {
    const c = new AbortController();
    api("status", null, c.signal)
      .then((x) => setConfigured(x.configured))
      .catch(() => {
        if (!c.signal.aborted) setConfigured(false);
      });
    return () => {
      c.abort();
      pending.current?.abort();
    };
  }, []);
  function select(index, value) {
    pending.current?.abort();
    setBusy(false);
    setEvidence(null);
    setPlans(null);
    setError(false);
    setSeeds((previous) => previous.map((x, i) => (i === index ? value : x)));
  }
  async function compare() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setEvidence(null);
    setPlans(null);
    setError(false);
    try {
      const result = await Promise.all(
        seeds.map((seed) =>
          api("insights", { entityIds: [seed.entity_id], type: "movie" }, controller.signal),
        ),
      );
      if (!controller.signal.aborted) setEvidence(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function generate() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setPlans(null);
    setError(false);
    try {
      const result = [];
      for (const seed of seeds)
        result.push(
          await api(
            "direct",
            { entityIds: [seed.entity_id], type: "movie", brief, language },
            controller.signal,
          ),
        );
      if (!controller.signal.aborted) {
        setPlans(result);
        setEvidence(result.map((x) => x.evidence));
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <main lang={language}>
      <nav>
        <a href="/">Timeline Studio</a>
        <label>
          {t.language}
          <select
            value={language}
            onChange={(e) => {
              pending.current?.abort();
              setBusy(false);
              setPlans(null);
              setLanguage(e.target.value);
            }}
          >
            {Object.entries(languages).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <a href="/">{t.editor} ↗</a>
      </nav>
      <header>
        <div className="eyebrow">TIMELINE STUDIO / QLOO</div>
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
        <span className={`status ${configured ? "ok" : ""}`}>
          {configured === null ? t.loading : configured ? t.configured : t.missing}
        </span>
      </header>
      <div className="columns">
        {seeds.map((selected, i) => (
          <Audience
            key={i}
            label={i ? "B" : "A"}
            t={t}
            selected={selected}
            onSelect={(value) => select(i, value)}
            disabled={busy}
          />
        ))}
      </div>
      <div className="action">
        <button
          className="primary"
          onClick={compare}
          disabled={busy || !seeds.every(Boolean) || !configured}
        >
          {busy ? t.loading : t.compare} →
        </button>
        <p>{t.notice}</p>
      </div>
      <section className="brief">
        <label htmlFor="brief">{d.brief}</label>
        <textarea
          id="brief"
          value={brief}
          maxLength={1600}
          disabled={busy}
          onChange={(e) => {
            setBrief(e.target.value);
            setPlans(null);
          }}
        />
        <button
          onClick={generate}
          disabled={busy || !brief.trim() || !seeds.every(Boolean) || !configured}
        >
          {busy ? t.loading : d.generate}
        </button>
      </section>
      {plans && (
        <div className="columns">
          {plans.map((value, i) => (
            <section className="evidence" key={i}>
              <div className="eyebrow">
                {t.audience} {i ? "B" : "A"} · {d.inference}
              </div>
              {["hook", "pacing", "visuals", "audio"].map((key) => (
                <article key={key}>
                  <div>
                    <h3>{d[key]}</h3>
                    <p>{value.plan[key]}</p>
                  </div>
                </article>
              ))}
              {value.plan.rationale.map((r, j) => (
                <article key={j}>
                  <div>
                    <strong>
                      {
                        value.evidence.data.results.entities.find((x) => x.entity_id === r.entityId)
                          ?.name
                      }
                    </strong>
                    <p>{r.inference}</p>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
      {error && <p role="alert">{t.error}</p>}
      {evidence && (
        <div className="columns">
          {evidence.map((value, i) => (
            <Evidence key={i} value={value} t={t} label={i ? "B" : "A"} />
          ))}
        </div>
      )}
    </main>
  );
}
export default App;
