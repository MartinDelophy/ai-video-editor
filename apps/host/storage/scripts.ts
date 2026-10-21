import { HostError } from "../sessions.ts";
import type { ProjectFiles } from "./files.ts";
import { assetRecord } from "./assets.ts";
import { analysisRecord, rawAnalysisRecord } from "./analysis-records.ts";
import { classificationRecord, scriptRecord, scriptWrite, scriptDigest, scriptSource, validScriptContent, type ScriptDraft, type ScriptSource } from "./script-records.ts";
import { emptyRoots, encodeId, referenceKey, type Manifest, type ObjectReference, type Save } from "./records.ts";
import { writeObject } from "./objects.ts";
import { inspectMedia } from "./media.ts";

export async function readScriptObject(files: ProjectFiles, current: Manifest | null, ref: ObjectReference) {
  const object = current?.objects.find(item => referenceKey(item) === referenceKey(ref));
  if (!object) throw new HostError("REFERENCE_INVALID", 409, "The script source is not retained in this project.");
  return JSON.parse((await files.read(object.path)).toString("utf8"));
}

export async function listScriptSources(files: ProjectFiles, current: Manifest | null) {
  const items: ScriptSource[] = [];
  for (const ref of current?.roots.analyses ?? []) {
    const parsed = analysisRecord.safeParse(await readScriptObject(files, current, ref));
    if (!parsed.success) continue;
    const analysis = parsed.data;
    const raw = analysis.format === "material-analysis" ? analysis : rawAnalysisRecord.parse(await readScriptObject(files, current, analysis.rawRef));
    if (!current?.roots.assets.some(ref => ref.entityId === raw.basis.assetRef.entityId && ref.revision === raw.basis.assetRef.revision)) continue;
    const asset = assetRecord.parse(await readScriptObject(files, current, raw.basis.assetRef));
    const ranges = analysis.format === "material-analysis-correction" && analysis.correction.intervals.length ?
      analysis.correction.intervals : raw.basis.capability === "scene" ? raw.output.scenes.map(scene => ({ range: scene.range,
        text: "", labels: [], visualNotes: "" })) : [{ range: raw.basis.range,
        text: analysis.format === "material-analysis-correction" ? analysis.correction.text : raw.output.text,
        labels: [], visualNotes: raw.output.samples.map(item => item.description || item.detections.map(value => value.label).join(", ")).join("\n") }];
    for (const [index, range] of ranges.entries()) items.push(scriptSource.parse({ sourceId: `${analysis.analysisId}:${analysis.revision}:${index}`,
      assetRef: raw.basis.assetRef, mediaRef: raw.basis.mediaRef, analysisRef: ref, range: range.range,
      kind: asset.kind, capability: raw.basis.capability, originalText: range.text, visualNotes: range.visualNotes, labels: range.labels }));
  }
  for (const ref of current?.roots.assets ?? []) {
    if (items.some(source => source.assetRef.entityId === ref.entityId)) continue;
    const asset = assetRecord.parse(await readScriptObject(files, current, ref));
    const media = current?.objects.find(object => referenceKey(object) === referenceKey(asset.mediaRef));
    if (!media) throw new HostError("REFERENCE_INVALID", 409, "A registered source has no media object.");
    const inspected = await inspectMedia(files, media.path, media.sizeBytes, true);
    items.push(scriptSource.parse({ sourceId: `unanalysed:${asset.assetId}`, assetRef: ref, mediaRef: asset.mediaRef,
      analysisRef: null, range: { sourceStartSeconds: 0, sourceEndSeconds: inspected.durationSeconds }, kind: asset.kind,
      capability: "unanalysed", originalText: "", visualNotes: "", labels: [] }));
  }
  return items;
}

export async function validateScriptSources(files: ProjectFiles, current: Manifest | null, draft: ScriptDraft, latest = false) {
  if (!validScriptContent(draft)) throw new HostError("REFERENCE_INVALID", 409, "Script segments or quotations differ from their source evidence.");
  for (const source of draft.sources) {
    const asset = assetRecord.parse(await readScriptObject(files, current, source.assetRef));
    if (referenceKey(asset.mediaRef) !== referenceKey(source.mediaRef) || asset.kind !== source.kind ||
        (asset.kind === "image" ? source.range.sourceStartSeconds !== 0 || source.range.sourceEndSeconds !== 0 :
          source.range.sourceEndSeconds <= source.range.sourceStartSeconds)) throw new HostError("REFERENCE_INVALID", 409, "Invalid script media range.");
    if (latest && !current?.roots.assets.some(ref => referenceKey(ref) === referenceKey(source.assetRef))) {
      throw new HostError("REFERENCE_STALE", 409, "A script source was changed or removed; review the sources again.");
    }
    if (!source.analysisRef) {
      if (source.capability !== "unanalysed" || source.originalText !== "" || source.visualNotes !== "" || source.labels.length) {
        throw new HostError("REFERENCE_INVALID", 409, "Unanalysed media cannot supply recognised text.");
      }
      const media = current?.objects.find(item => referenceKey(item) === referenceKey(source.mediaRef));
      if (!media) throw new HostError("REFERENCE_INVALID", 409, "Source media is missing.");
      const inspected = await inspectMedia(files, media.path, media.sizeBytes, true);
      if (source.range.sourceEndSeconds > inspected.durationSeconds!) throw new HostError("REFERENCE_INVALID", 409, "Source range exceeds the media duration.");
      continue;
    }
    const analysis = analysisRecord.parse(await readScriptObject(files, current, source.analysisRef));
    const raw = analysis.format === "material-analysis" ? analysis : rawAnalysisRecord.parse(await readScriptObject(files, current, analysis.rawRef));
    if (referenceKey(raw.basis.assetRef) !== referenceKey(source.assetRef) || referenceKey(raw.basis.mediaRef) !== referenceKey(source.mediaRef) ||
        source.capability !== raw.basis.capability || source.range.sourceStartSeconds < raw.basis.range.sourceStartSeconds ||
        source.range.sourceEndSeconds > raw.basis.range.sourceEndSeconds ||
        (latest && !current?.roots.analyses.some(ref => referenceKey(ref) === referenceKey(source.analysisRef!)))) {
      throw new HostError("REFERENCE_STALE", 409, "The selected analysis or source range changed.");
    }
    const whole = source.range.sourceStartSeconds === raw.basis.range.sourceStartSeconds && source.range.sourceEndSeconds === raw.basis.range.sourceEndSeconds;
    const intervals = analysis.format === "material-analysis-correction" ? analysis.correction.intervals.filter(item =>
      item.range.sourceStartSeconds === source.range.sourceStartSeconds && item.range.sourceEndSeconds === source.range.sourceEndSeconds) : [];
    const words = raw.output.words.filter(word => word.sourceStartSeconds >= source.range.sourceStartSeconds && word.sourceEndSeconds <= source.range.sourceEndSeconds);
    const expected = raw.basis.capability === "scene" ? "" :
      analysis.format === "material-analysis-correction" ? (intervals.length ? intervals.map(item => item.text).join("\n") : whole ? analysis.correction.text : "") :
        whole ? raw.output.text : words.map(word => word.text).join("");
    if (source.originalText !== expected || (!whole && analysis.format === "material-analysis-correction" && !intervals.length)) {
      throw new HostError("REFERENCE_INVALID", 409, "Original words must come from the exact saved analysis range.");
    }
    const visualNotes = raw.basis.capability === "scene" ? "" :
      analysis.format === "material-analysis-correction" && intervals.length ? intervals.map(item => item.visualNotes).join("\n") :
        raw.output.samples.filter(item => item.sourceTimeSeconds >= source.range.sourceStartSeconds && item.sourceTimeSeconds <= source.range.sourceEndSeconds)
          .map(item => item.description || item.detections.map(value => value.label).join(", ")).join("\n");
    const labels = raw.basis.capability === "scene" ? [] : analysis.format === "material-analysis-correction" ? intervals.flatMap(item => item.labels) : [];
    if (source.visualNotes !== visualNotes || JSON.stringify(source.labels) !== JSON.stringify(labels)) {
      throw new HostError("REFERENCE_INVALID", 409, "Source descriptions must come from the saved analysis. Edit classification or script suggestions separately.");
    }
  }
}

export function prepareScript(files: ProjectFiles, projectId: string) {
  return async (current: Manifest | null, save: Save) => {
    const input = scriptWrite.parse(save.request);
    const previous = current?.roots.scripts.find(ref => ref.entityId === input.scriptId);
    if ((previous?.revision ?? 0) !== input.expectedRevision) throw new HostError("REVISION_CONFLICT", 409, "The script revision changed.");
    await validateScriptSources(files, current, input.draft, true);
    const digest = scriptDigest(input.draft);
    if (input.confirmDigest !== null) {
      if (!previous || input.confirmDigest !== digest) throw new HostError("REFERENCE_STALE", 409, "Save and review this exact draft before confirming.");
      const saved = scriptRecord.parse(await readScriptObject(files, current, previous));
      if (saved.digest !== digest) throw new HostError("REFERENCE_STALE", 409, "Only a persisted script revision can be confirmed.");
    }
    const revision = input.expectedRevision + 1;
    const classificationId = encodeId(`script-classification:${input.scriptId}`);
    const classificationRef = { kind: "analysis" as const, entityId: classificationId, revision };
    const classification = classificationRecord.parse({ schemaVersion: 1, format: "script-classification", projectId,
      analysisId: classificationId, revision, sources: input.draft.sources, items: input.draft.content.classifications, createdAt: input.createdAt });
    const classifiedObject = await writeObject(files, classificationRef, `data/analyses/${encodeId(classificationId)}/${revision}.json`, classification);
    const record = scriptRecord.parse({ schemaVersion: 1, format: "review-script", projectId, scriptId: input.scriptId, revision,
      previousRef: previous ?? null, classificationRef, draft: input.draft, digest,
      confirmed: input.confirmDigest === null ? null : { revision, digest, at: input.createdAt }, createdAt: input.createdAt });
    const reference = { kind: "script" as const, entityId: record.scriptId, revision };
    const object = await writeObject(files, reference, `data/scripts/${encodeId(record.scriptId)}/${revision}.json`, record);
    const roots = structuredClone(current?.roots ?? emptyRoots());
    roots.scripts = [...roots.scripts.filter(ref => ref.entityId !== record.scriptId), reference];
    return { roots, objects: [...(current?.objects ?? []), object, classifiedObject], editorSnapshotId: current?.editorSnapshotId ?? null,
      editorSequence: current?.editorSequence ?? null };
  };
}

export async function listScripts(files: ProjectFiles, current: Manifest | null) {
  return Promise.all((current?.roots.scripts ?? []).map(async ref => scriptRecord.parse(await readScriptObject(files, current, ref))));
}
