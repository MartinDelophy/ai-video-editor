import { useEffect, useRef, useState } from "react";
import {
  connectAnna,
  getAnnaConnectionState,
  isAnnaEdition,
  loadAnnaProject,
  normalizeAnnaError,
  probeAnnaCompatibility,
  requestAnnaEditPlan,
  saveAnnaProject,
  storeAnnaFile,
  downloadAnnaFile,
  subscribeAnnaConnection,
  listAnnaFiles,
  deleteAnnaFile,
  recoverAnnaProjectReference,
  validateAnnaFileDescriptor,
  reconnectAnna,
} from "../lib/annaRuntime.js";
import { ANNA_CLOUD_TRANSFERS_VERIFIED, annaLocalComputeReason, checkAnnaLocalCompute } from "../lib/annaCapabilities.js";
import {
  annaProjectFingerprint,
  buildAnnaTimelineReview,
  getAnnaPlanningAssets,
} from "../lib/annaEditPlan.js";
import { useAnnaSession } from "./useAnnaSession.js";
import { annaSessionFingerprint } from "../lib/annaProjectSession.js";
import { useAnnaDraft } from "./useAnnaDraft.js";
import { createAnnaTranslator } from "../i18nAnna.js";

export function useAnnaEditor(deps) {
  const latest = useRef(deps);
  latest.current = deps;
  const t = createAnnaTranslator(deps.language);
  const [connection, setConnection] = useState(getAnnaConnectionState);
  const [instruction, setInstruction] = useState("");
  const [review, setReview] = useState(null);
  const [job, setJob] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState(null);
  const [exported, setExported] = useState(null);
  const [localCompute, setLocalCompute] = useState({ status: "checking" });
  const [cloudFiles, setCloudFiles] = useState({ files: [], nextCursor: null, loaded: false });
  const [savedFile, setSavedFile] = useState(null);
  const retryRef = useRef(null);
  const computeGeneration = useRef(0);
  const abortRef = useRef(null);
  const exportUrlRef = useRef("");
  const attachmentUrlsRef = useRef([]);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const snapshot = deps.getProjectSnapshot();
  const hasProjectContent = ["visualSegments", "visualOverlaySegments", "audioSegments", "captionSegments", "stickerSegments", "musicSegments", "timelineMarkers"]
    .some((key) => snapshot[key]?.length) || deps.hasMusic || deps.hasSourceAudio || snapshot.audioDuration > 0;
  const draft = useAnnaDraft({
    enabled: isAnnaEdition,
    createArchive: deps.createArchive,
    importProject: deps.importProject,
    hasContent: hasProjectContent,
    externalBusy: Boolean(job || deps.exporting || deps.projectImportProgress),
    getFingerprint: () => annaProjectFingerprint(latest.current.getProjectSnapshot(), latest.current.rippleEditing, latest.current.visualSegments),
  });
  const sessionInput = isAnnaEdition ? deps.getSessionInput() : null;
  const session = useAnnaSession({
    enabled: isAnnaEdition,
    fingerprint: isAnnaEdition ? annaSessionFingerprint(sessionInput) : "",
    hasContent: hasProjectContent || Boolean(sessionInput?.userAssets?.length || sessionInput?.historyItems?.length || sessionInput?.recordedVoices?.length || snapshot.script?.trim()),
    capture: deps.captureSession, restoreProject: deps.restoreSession, getIntent: deps.getProjectIntent, newProject: deps.newProject,
    externalBusy: Boolean(job || deps.exporting || draft.busy || deps.projectImportProgress),
    isExternallyBusy: () => Boolean(busyRef.current || latest.current.exporting || latest.current.isProjectImporting?.() || draft.isBusy()),
  });
  const checkLocalCompute = async () => {
    const generation = ++computeGeneration.current;
    setLocalCompute({ status: "checking" });
    const result = await checkAnnaLocalCompute();
    if (mounted.current && generation === computeGeneration.current) setLocalCompute(result);
  };
  useEffect(() => {
    mounted.current = true;
    if (!isAnnaEdition) return undefined;
    const unsubscribe = subscribeAnnaConnection(setConnection);
    connectAnna().catch(() => {});
    checkLocalCompute();
    return () => {
      mounted.current = false;
      computeGeneration.current += 1;
      unsubscribe();
      abortRef.current?.abort();
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const execute = async (kind, task) => {
    if (busyRef.current || latest.current.exporting || latest.current.isProjectImporting?.() || draft.isBusy?.() || !isAnnaEdition) return false;
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setJob(kind);
    setError(null);
    setNotice("");
    retryRef.current = null;
    try {
      await task(controller.signal);
      return true;
    } catch (failure) {
      if (mounted.current) {
        const normalized = normalizeAnnaError(failure);
        // A cancelled/timed-out remote mutation may still have completed.
        // Keep recovery information visible instead of discarding that state.
        if (normalized.code !== "cancelled" || normalized.details?.remoteMayContinue) setError(normalized);
        let recoveryFile = null;
        if (normalized.details?.savedFile && normalized.details.fileState === "stored") {
          try {
            recoveryFile = validateAnnaFileDescriptor(normalized.details.savedFile);
            setSavedFile(recoveryFile);
          } catch { /* Ignore invalid recovery handles. */ }
        }
        if (recoveryFile?.kind === "projects" && normalized.details.stage === "save_reference") retryRef.current = () => recoverReference(recoveryFile);
        else if (!["deleting-file", "planning"].includes(kind)) retryRef.current = () => execute(kind, task);
      }
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setJob("");
    }
  };
  const generate = () =>
    execute("planning", async (signal) => {
      const current = latest.current;
      const project = current.getProjectSnapshot();
      const fingerprint = annaProjectFingerprint(
        project,
        current.rippleEditing,
        current.visualSegments,
      );
      setReview(null);
      if (project.trackLocks.image) throw Object.assign(new Error(), { code: "ANNA_TRACK_LOCKED" });
      const result = await requestAnnaEditPlan({
        instruction,
        assets: getAnnaPlanningAssets(current.visualSegments),
        language: current.language,
        signal,
      });
      if (signal.aborted || !mounted.current) return;
      if (
        fingerprint !==
        annaProjectFingerprint(
          latest.current.getProjectSnapshot(),
          latest.current.rippleEditing,
          latest.current.visualSegments,
        )
      )
        throw Object.assign(new Error(), { code: "ANNA_STALE_PLAN" });
      setReview(
        buildAnnaTimelineReview(project, result, {
          visualSegments: current.visualSegments,
          rippleEditing: current.rippleEditing,
          hasMusic: current.hasMusic,
          hasSourceAudio: current.hasSourceAudio,
        }),
      );
    });
  const apply = () => {
    if (!review || busyRef.current || latest.current.exporting || latest.current.isProjectImporting?.() || draft.isBusy?.()) return;
    const current = latest.current;
    if (
      review.fingerprint !==
      annaProjectFingerprint(
        current.getProjectSnapshot(),
        current.rippleEditing,
        current.visualSegments,
      )
    ) {
      setError({ code: "ANNA_STALE_PLAN" });
      return;
    }
    if (!review.hasChanges) {
      setError({ code: "ANNA_NO_CHANGES" });
      return;
    }
    try {
      current.applyReview(review);
      setReview(null);
      setError(null);
      setNotice("applied");
    } catch (failure) { setError(normalizeAnnaError(failure)); }
  };
  const render = (options = {}) =>
    execute("rendering", async () => {
      let videoArtifact = null;
      const attachments = [];
      const result = await latest.current.renderVideo({
        ...options,
        // Anna's video preview/storage contract always expects an MP4, even
        // when the shared export menu was last used for an audio-only file.
        settings: { ...latest.current.exportSettings, ...options.settings, mediaType: "video", codec: "h264" },
        onArtifact: async (blob, name) => {
          if (name.endsWith(".mp4")) videoArtifact = { blob, name };
          else attachments.push({ blob, name });
        },
      });
      if (["canceled", "cancelled"].includes(result?.status)) throw Object.assign(new Error(), { code: "cancelled" });
      if (result?.status !== "success" || result.extension !== "mp4" || !videoArtifact)
        throw Object.assign(new Error(), { code: result?.errorCode === "ANNA_SOURCE_AUDIO_UNAVAILABLE" ? result.errorCode : "ANNA_EXPORT_FAILED" });
      if (!mounted.current) return;
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      const downloadableAttachments = attachments.map((item) => ({
        ...item,
        url: URL.createObjectURL(item.blob),
      }));
      attachmentUrlsRef.current = downloadableAttachments.map((item) => item.url);
      exportUrlRef.current = URL.createObjectURL(videoArtifact.blob);
      setExported({
        ...videoArtifact,
        url: exportUrlRef.current,
        byteSize: videoArtifact.blob.size,
        attachments: downloadableAttachments,
      });
      setNotice("exportReady");
    });
  const requireCloudTransfer = () => {
    if (!ANNA_CLOUD_TRANSFERS_VERIFIED) throw Object.assign(new Error(), { code: "cloud_unverified" });
  };
  const refreshFiles = (more = false) => execute("listing-files", async (signal) => {
    const page = await listAnnaFiles({ cursor: more ? cloudFiles.nextCursor : undefined, signal });
    if (!mounted.current) return;
    setCloudFiles((current) => ({
      files: [...new Map([...(more ? current.files : []), ...page.files].map((file) => [file.path, file])).values()],
      nextCursor: page.nextCursor, loaded: true,
    }));
  });
  const removeCloudFile = (file) => execute("deleting-file", async (signal) => {
    setSavedFile((current) => current?.path === file.path ? null : current);
    await deleteAnnaFile({ file, allowCurrent: true, signal });
    if (!mounted.current) return;
    setCloudFiles((current) => ({ ...current, files: current.files.filter((item) => item.path !== file.path) }));
    setSavedFile((current) => current?.path === file.path ? null : current);
    setNotice("deleted");
  });
  const recoverReference = (file = savedFile) => execute("repair-reference", async (signal) => {
    if (!file) return;
    setSavedFile((current) => current?.path === file.path ? null : current);
    await recoverAnnaProjectReference({ file, signal });
    if (mounted.current) { setSavedFile(null); setNotice("referenceSaved"); }
  });
  return {
    enabled: isAnnaEdition,
    t,
    connection,
    instruction,
    setInstruction,
    review,
    job,
    error,
    notice,
    report,
    exported,
    draft,
    session,
    localCompute,
    localComputeReason: annaLocalComputeReason(localCompute),
    checkLocalCompute,
    cloudTransfersAvailable: ANNA_CLOUD_TRANSFERS_VERIFIED,
    cloudFiles,
    savedFile,
    refreshFiles,
    removeCloudFile,
    recoverReference,
    retry: retryRef.current ? () => retryRef.current?.() : null,
    planningAssets: getAnnaPlanningAssets(deps.visualSegments),
    hasVisual: deps.visualSegments.length > 0,
    exporting: deps.exporting,
    stale: Boolean(
      review &&
      review.fingerprint !==
        annaProjectFingerprint(deps.getProjectSnapshot(), deps.rippleEditing, deps.visualSegments),
    ),
    generate,
    apply,
    render,
    connect: () => execute("connecting", (signal) => reconnectAnna({ signal })),
    stop: () => {
      abortRef.current?.abort();
      setNotice("stopHint");
    },
    check: () =>
      execute("checking", async (signal) => {
        setReport(null);
        const result = await probeAnnaCompatibility({ signal });
        if (mounted.current) {
          setReport(result);
          const wasm = result.checks.find((item) => item.id === "wasm");
          if (wasm) setLocalCompute({ status: wasm.status });
        }
      }),
    saveCloud: () =>
      execute("saving", async (signal) => {
        requireCloudTransfer();
        const blob = await latest.current.createArchive();
        await saveAnnaProject({ blob, signal });
        if (mounted.current) { setSavedFile(null); setNotice("cloudSaved"); }
      }),
    restoreCloud: () =>
      execute("restoring", async (signal) => {
        requireCloudTransfer();
        const before = annaProjectFingerprint(latest.current.getProjectSnapshot(), latest.current.rippleEditing, latest.current.visualSegments);
        const saved = await loadAnnaProject({ signal });
        if (!saved) {
          setNotice("noDraft");
          return;
        }
        if (signal.aborted || !mounted.current) return;
        if (before !== annaProjectFingerprint(latest.current.getProjectSnapshot(), latest.current.rippleEditing, latest.current.visualSegments))
          throw Object.assign(new Error(), { code: "project_changed" });
        if (!(await draft.prepareRestore({ allowExternalBusy: true })))
          throw Object.assign(new Error(), { code: "backup_failed" });
        if (!(await latest.current.importProject(saved.file, {
          beforeCommit: () => mounted.current && !signal.aborted && before === annaProjectFingerprint(latest.current.getProjectSnapshot(), latest.current.rippleEditing, latest.current.visualSegments),
        }))) {
          const changed = before !== annaProjectFingerprint(latest.current.getProjectSnapshot(), latest.current.rippleEditing, latest.current.visualSegments);
          throw Object.assign(new Error(), { code: changed ? "project_changed" : "invalid_file" });
        }
        if (mounted.current) setNotice("restored");
      }),
    downloadThroughHost: () =>
      execute("saving", async (signal) => {
        requireCloudTransfer();
        if (!exported) return;
        const stored = await storeAnnaFile({ blob: exported.blob, name: exported.name, signal });
        await downloadAnnaFile({ path: stored.path, filename: exported.name, signal });
      }),
  };
}
