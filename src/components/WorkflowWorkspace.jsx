import { Component, lazy, Suspense, useMemo, useState } from "react";
import { ArrowLeft, ArrowClockwise, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { loadWorkflowModule } from "../lib/workflowImport.js";
import { WORKFLOW_COPY } from "../i18nWorkflow.js";
import "./WorkflowWorkspace.css";

const loaders = {
  canvas: () => import("./CanvasWorkspace.jsx").then((module) => ({ default: module.CanvasWorkspace })),
  storyboard: () => import("./StoryboardWorkspace.jsx").then((module) => ({ default: module.StoryboardWorkspace })),
  blockout: () => import("./BlockoutWorkspace.jsx").then((module) => ({ default: module.BlockoutWorkspace })),
};

export class WorkflowBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.warn("Workflow workspace failed", error?.name || "Error"); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function WorkflowState({ language, failed = false, onRetry, onClose }) {
  const c = WORKFLOW_COPY[language] || WORKFLOW_COPY.en;
  return <section className="workflow-load-state" aria-label={c.workflow}>
    <div role={failed ? "alert" : "status"}>
      {failed ? <WarningCircle size={30} /> : <SpinnerGap size={30} className="workflow-load-spinner" />}
      <strong>{failed ? c.workflowLoadFailed : c.workflowLoading}</strong>
      {failed && <p>{c.workflowLoadHelp}</p>}
      <nav>
        <button type="button" onClick={onClose}><ArrowLeft size={17} />{c.workflowBack}</button>
        {failed && <button type="button" className="workflow-load-retry" onClick={onRetry}><ArrowClockwise size={17} />{c.workflowRetry}</button>}
      </nav>
    </div>
  </section>;
}

export function WorkflowWorkspace({ kind, language, onClose, ...props }) {
  const [attempt, setAttempt] = useState(0);
  const Workspace = useMemo(() => lazy(() => loadWorkflowModule(loaders[kind], kind, attempt)), [kind, attempt]);
  return <WorkflowBoundary key={`${kind}:${attempt}`} fallback={<WorkflowState language={language} failed onClose={onClose} onRetry={() => setAttempt((value) => value + 1)} />}>
    <Suspense fallback={<WorkflowState language={language} onClose={onClose} />}>
      <Workspace {...props} language={language} onClose={onClose} />
    </Suspense>
  </WorkflowBoundary>;
}
