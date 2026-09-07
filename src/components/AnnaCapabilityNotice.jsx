import "./AnnaEditPanel.css";

/** Do not mount inference controls until their required local runtime works. */
export function AnnaModelGate({ anna, children }) {
  if (!anna?.enabled || !anna.localComputeReason) return children;
  return <section className="anna-capability-notice" role="status">
    <strong>{anna.t("capabilityUnavailable")}</strong>
    <p>{anna.t(anna.localComputeReason)}</p>
    <p>{anna.t("localEditingAvailable")}</p>
    <button type="button" className="panel-secondary" disabled={anna.localCompute.status === "checking"} onClick={anna.checkLocalCompute}>{anna.t("retry")}</button>
  </section>;
}
