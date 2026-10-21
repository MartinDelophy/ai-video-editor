import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { analysisRecord, analysisRef, rawAnalysisRecord } from "./analysis-records.ts";
import { readAnalysisObject } from "./analyses.ts";
import { referenceKey, type Manifest } from "./records.ts";
import { semanticSourceDigest, type SemanticSourceUnit } from "./semantic-records.ts";
import type { z } from "zod";

export async function loadSemanticSource(files: ProjectFiles, current: Manifest | null,
  sourceRef: z.infer<typeof analysisRef>, requireCurrent = false) {
  if (requireCurrent && !current?.roots.analyses.some(ref => referenceKey(ref) === referenceKey(sourceRef))) {
    throw new HostError("REFERENCE_STALE", 409, "The selected speech analysis revision changed.");
  }
  const source = analysisRecord.parse(await readAnalysisObject(files, current, sourceRef));
  const raw = source.format === "material-analysis" ? source : rawAnalysisRecord.parse(await readAnalysisObject(files, current, source.rawRef));
  if (raw.basis.capability !== "speech") throw new HostError("REFERENCE_INVALID", 409, "Semantic analysis requires a saved speech analysis.");
  let sourceKind: "words" | "intervals" | "text", units: SemanticSourceUnit[];
  if (source.format === "material-analysis-correction" && source.correction.intervals.some(item => item.text.trim())) {
    sourceKind = "intervals";
    units = source.correction.intervals.filter(item => item.text.trim()).map((item, unitIndex) => ({ unitIndex, range: item.range, text: item.text }));
  } else if (source.format === "material-analysis" && source.output.words.some(item => item.text.trim())) {
    sourceKind = "words";
    units = source.output.words.filter(item => item.text.trim()).map((item, unitIndex) => ({ unitIndex,
      range: { sourceStartSeconds: item.sourceStartSeconds, sourceEndSeconds: item.sourceEndSeconds }, text: item.text }));
  } else {
    const text = source.format === "material-analysis-correction" ? source.correction.text : source.output.text;
    sourceKind = "text";
    units = text.trim() ? [{ unitIndex: 0, range: raw.basis.range, text }] : [];
  }
  if (!units.length) throw new HostError("NO_SPEECH_CONTENT", 409, "This speech analysis has no usable spoken text to summarize.");
  let previousEnd = raw.basis.range.sourceStartSeconds;
  for (const [unitIndex, unit] of units.entries()) {
    if (unit.unitIndex !== unitIndex || unit.range.sourceStartSeconds < previousEnd ||
        unit.range.sourceEndSeconds < unit.range.sourceStartSeconds || unit.range.sourceEndSeconds > raw.basis.range.sourceEndSeconds) {
      throw new HostError("REFERENCE_INVALID", 409, "The speech evidence ranges are not ordered within the analyzed source.");
    }
    previousEnd = unit.range.sourceEndSeconds;
  }
  return { source, raw, sourceKind, units, sourceDigest: semanticSourceDigest(sourceRef, units) };
}
