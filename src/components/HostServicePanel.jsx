import { MaterialWorkspace } from "./MaterialWorkspace.jsx";
import { materialText } from "../i18nMaterial.js";
import { useRef, useState, useSyncExternalStore } from "react";
import { hostText, hostErrorText } from "../i18nHost.js";
import { Popover } from "./ui.jsx";

export function HostServicePanel({ client, completeProject, execution, isBusy, language }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const anchor = useRef(null);
  const currentBusy = useRef(isBusy);
  currentBusy.current = isBusy;
  const ht = (key) => hostText(language, key);
  const connected = snapshot.connection === "connected";
  const busy = isBusy();
  const status = ht(connected ? "connected" : snapshot.connection === "expired" ? "expired" : snapshot.connection === "draining" ? "stopping" : "disconnected");
  return <><div className="menu-anchor" ref={anchor}>
    <button type="button" className="ghost-action" aria-expanded={open} title={`${ht("service")}: ${status}`} onClick={() => setOpen(!open)}>
      {ht("service")}{connected ? "" : " !"}
    </button>
    {open ? <Popover anchorRef={anchor} onClose={() => setOpen(false)} closeLabel={ht("close")}>
      <div className="menu-list" style={{ minWidth: 280, maxWidth: "80vw" }}>
        <p role="status">{status}</p>
        {completeProject?.projectId ? <button type="button" disabled={!connected || pending} onClick={() => { setOpen(false); setWorkspaceOpen(true); }}>{materialText(language, "workspace")}</button> : null}
        {error || snapshot.error ? <p role="alert">{hostErrorText(language, error)}</p> : null}
        <button type="button" disabled={pending || ["expired", "draining"].includes(snapshot.connection)} onClick={async () => {
          setPending(true); setError(null);
          try { await client.refresh(); } catch (failure) { setError(failure); }
          finally { setPending(false); }
        }}>{ht("refresh")}</button>
        <button type="button" disabled={pending || busy || !connected} onClick={async (event) => {
          setPending(true); setError(null);
          try { await client.stop(event.nativeEvent, () => currentBusy.current(), ht("stopConfirm")); }
          catch (failure) { setError(failure); }
          finally { setPending(false); }
        }}>{ht("stop")}</button>
        {busy ? <small>{ht("wait")}</small> : null}
      </div>
    </Popover> : null}
  </div>{workspaceOpen && completeProject?.projectId ? <MaterialWorkspace key={completeProject.projectId} project={completeProject} execution={execution} language={language} onClose={() => setWorkspaceOpen(false)} /> : null}</>;
}
