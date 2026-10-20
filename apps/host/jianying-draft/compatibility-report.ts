import type { DraftTargetProfile, ExportIssue, ExportReport } from "./draft-types.ts";

export type ExportReportCategory = "mapped" | "degraded" | "unsupported" | "blocked";

export function createExportReport(target: DraftTargetProfile): ExportReport {
  return {
    status: "editable-pass",
    target,
    mapped: [],
    degraded: [],
    unsupported: [],
    blocked: [],
    skipped: [],
  };
}

export function addExportIssue(report: ExportReport, category: ExportReportCategory,
  issue: Omit<ExportIssue, "targetProfile">) {
  const value = { ...issue, targetProfile: report.target.id };
  report[category].push(value);
  if (category !== "mapped") report.skipped.push(value);
  report.status = report.blocked.length
    ? "blocked"
    : report.degraded.length || report.unsupported.length
      ? "editable-with-degradation"
      : "editable-pass";
  return value;
}
