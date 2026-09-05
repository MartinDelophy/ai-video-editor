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
} from "../lib/annaRuntime.js";
import {
  annaProjectFingerprint,
  buildAnnaTimelineReview,
  getAnnaPlanningAssets,
} from "../lib/annaEditPlan.js";
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
  const abortRef = useRef(null);
  const exportUrlRef = useRef("");
  const attachmentUrlsRef = useRef([]);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const draft = useAnnaDraft({
    enabled: isAnnaEdition,
    createArchive: deps.createArchive,
    importProject: deps.importProject,
    hasContent: deps.visualSegments.length > 0,
  });
  useEffect(() => {
    mounted.current = true;
    if (!isAnnaEdition) return undefined;
    const unsubscribe = subscribeAnnaConnection(setConnection);
    connectAnna().catch(() => {});
    return () => {
      mounted.current = false;
      unsubscribe();
      abortRef.current?.abort();
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const execute = async (kind, task) => {
    if (busyRef.current || !isAnnaEdition) return;
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setJob(kind);
    setError(null);
    setNotice("");
    try {
      await task(controller.signal);
    } catch (failure) {
      if (mounted.current) {
        const normalized = normalizeAnnaError(failure);
        if (normalized.code !== "cancelled") setError(normalized);
      }
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
    if (!review || busyRef.current) return;
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
    current.applyReview(review);
    setReview(null);
    setError(null);
    setNotice("applied");
  };
  const render = (options = {}) =>
    execute("rendering", async () => {
      let videoArtifact = null;
      const attachments = [];
      const result = await latest.current.renderVideo({
        ...options,
        settings: { ...latest.current.exportSettings, ...options.settings, codec: "h264" },
        onArtifact: async (blob, name) => {
          if (name.endsWith(".mp4")) videoArtifact = { blob, name };
          else attachments.push({ blob, name });
        },
      });
      if (result?.status !== "success" || result.extension !== "mp4" || !videoArtifact)
        throw Object.assign(new Error(), { code: "ANNA_EXPORT_FAILED" });
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
    connect: () => execute("connecting", (signal) => connectAnna({ signal })),
    stop: () => {
      abortRef.current?.abort();
      setNotice("stopHint");
    },
    check: () =>
      execute("checking", async (signal) => {
        setReport(null);
        const result = await probeAnnaCompatibility({ signal });
        if (mounted.current) setReport(result);
      }),
    saveCloud: () =>
      execute("saving", async (signal) => {
        const blob = await latest.current.createArchive();
        await saveAnnaProject({ blob, signal });
        if (mounted.current) setNotice("saved");
      }),
    restoreCloud: () =>
      execute("restoring", async (signal) => {
        const saved = await loadAnnaProject({ signal });
        if (!saved) {
          setNotice("noDraft");
          return;
        }
        if (signal.aborted || !mounted.current) return;
        if (!(await latest.current.importProject(saved.file)))
          throw Object.assign(new Error(), { code: "invalid_file" });
        if (mounted.current) setNotice("restored");
      }),
    downloadThroughHost: () =>
      execute("saving", async (signal) => {
        if (!exported) return;
        const stored = await storeAnnaFile({ blob: exported.blob, name: exported.name, signal });
        await downloadAnnaFile({ path: stored.path, filename: exported.name, signal });
      }),
  };
}
