import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildEnglishMusicPrompt,
  createAiMusicFileName,
  translateMusicDescriptionToEnglish,
} from "../lib/aiMusicPrompt.js";
import { repeatPcm16WavAtBestBoundary } from "../lib/aiMusicLoop.js";
import { decodeWaveform } from "../lib/media.js";
import { getModelSourcePreference } from "../lib/modelSources.js";
import { waitForModelCacheServiceWorker } from "../lib/serviceWorker.js";

export function useAiMusicGeneration({
  activeLanguage,
  imageUrlRefs,
  setActiveTool,
  setMediaTab,
  setSelectedLibraryAssetId,
  setUserAssets,
}) {
  const workerRef = useRef(null);
  const attemptRef = useRef(0);
  const [job, setJob] = useState({ state: "idle", progress: 0, phase: "", error: "" });

  const cancel = useCallback(() => {
    attemptRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setJob({ state: "idle", progress: 0, phase: "", error: "" });
  }, []);

  useEffect(() => cancel, [cancel]);

  const generate = useCallback(
    async (selection) => {
      const attempt = ++attemptRef.current;
      setJob({ state: "running", progress: 0.64, phase: "translating", error: "" });
      let prompt;
      try {
        const descriptionEnglish = await translateMusicDescriptionToEnglish(
          selection.description || "",
          activeLanguage,
        );
        if (attempt !== attemptRef.current) return;
        prompt = buildEnglishMusicPrompt({ ...selection, descriptionEnglish });
      } catch (error) {
        if (attempt !== attemptRef.current) return;
        setJob({ state: "error", progress: 0, phase: "", error: error?.message || String(error) });
        return;
      }
      await navigator.storage?.persist?.().catch(() => false);
      // The model cache is owned by the service worker. On a first-page visit,
      // wait until it controls the page so the initial parallel download is
      // persisted instead of falling through as an uncached worker fetch.
      await waitForModelCacheServiceWorker();
      if (attempt !== attemptRef.current) return;
      const worker =
        workerRef.current ??
        new Worker(new URL("../workers/ai-music.worker.js", import.meta.url), { type: "module" });
      const warmRuntime = Boolean(workerRef.current);
      workerRef.current = worker;
      setJob({
        state: "running",
        progress: warmRuntime ? 0.64 : 0.01,
        phase: warmRuntime ? "conditioning" : "checking",
        error: "",
      });
      worker.onmessage = async ({ data }) => {
        if (attempt !== attemptRef.current || workerRef.current !== worker) return;
        if (data.type === "progress") {
          setJob((current) => ({ ...current, progress: data.progress, phase: data.phase }));
          return;
        }
        if (data.type === "error") {
          worker.terminate();
          workerRef.current = null;
          const cacheWriteFailed = String(data.message || "").startsWith(
            "AI_MUSIC_CACHE_WRITE_FAILED",
          );
          setJob({
            state: "error",
            progress: 0,
            phase: "",
            error: cacheWriteFailed
              ? String(activeLanguage).toLowerCase().startsWith("zh")
                ? `模型下载或本地缓存失败（${String(data.message).split(": ").at(-1)}），请重试。`
                : `Model download or local caching failed (${String(data.message).split(": ").at(-1)}). Try again.`
              : data.message,
          });
          return;
        }
        if (data.type !== "complete") return;
        const requestedSeconds = Number(selection.seconds) || 30;
        const wav = requestedSeconds > 60 ? repeatPcm16WavAtBestBoundary(data.wav, 2, 5) : data.wav;
        const blob = new Blob([wav], { type: "audio/wav" });
        const src = URL.createObjectURL(blob);
        imageUrlRefs.current.add(src);
        let decoded;
        try {
          decoded = await decodeWaveform(blob, 96);
        } catch {
          URL.revokeObjectURL(src);
          imageUrlRefs.current.delete(src);
          if (attempt === attemptRef.current)
            setJob({
              state: "error",
              progress: 0,
              phase: "",
              error:
                {
                  zh: "无法读取生成的音频，请重试。",
                  en: "Cannot decode generated audio. Please retry.",
                  ja: "生成音声を読み込めません。再試行してください。",
                  ko: "생성 음성을 읽을 수 없습니다. 다시 시도하세요.",
                  es: "No se puede leer el audio generado. Reinténtalo.",
                  fr: "Impossible de lire le son généré. Réessayez.",
                  de: "Erzeugtes Audio kann nicht gelesen werden. Erneut versuchen.",
                  pt: "Não foi possível ler o áudio gerado. Tente novamente.",
                  it: "Impossibile leggere l’audio generato. Riprova.",
                  id: "Audio yang dibuat tidak dapat dibaca. Coba lagi.",
                  ru: "Не удалось прочитать созданное аудио. Повторите попытку.",
                  vi: "Không thể đọc âm thanh đã tạo. Hãy thử lại.",
                  th: "ไม่สามารถอ่านเสียงที่สร้างได้ โปรดลองอีกครั้ง",
                }[activeLanguage] || "Cannot decode generated audio. Please retry.",
            });
          return;
        }
        if (attempt !== attemptRef.current || workerRef.current !== worker) {
          URL.revokeObjectURL(src);
          imageUrlRefs.current.delete(src);
          return;
        }
        const asset = {
          id: crypto.randomUUID(),
          type: "audio",
          kind: "music",
          name: createAiMusicFileName(selection),
          meta: `AI music · ${decoded.duration.toFixed(1)}s`,
          src,
          previewSrc: src,
          blob,
          duration: decoded.duration,
          peaks: decoded.peaks,
          provider: "Stable Audio 3 Small · ONNX",
          generated: true,
          prompt,
        };
        setUserAssets((current) => [asset, ...current]);
        setSelectedLibraryAssetId(asset.id);
        setActiveTool("media");
        setMediaTab("mine");
        setJob({ state: "complete", progress: 1, phase: "complete", error: "" });
      };
      worker.onerror = (event) => {
        if (attempt !== attemptRef.current || workerRef.current !== worker) return;
        worker.terminate();
        workerRef.current = null;
        setJob({
          state: "error",
          progress: 0,
          phase: "",
          error: event.message || "Music generation failed.",
        });
      };
      worker.postMessage({
        type: "generate",
        prompt,
        seconds: (Number(selection.seconds) || 30) / (Number(selection.seconds) > 60 ? 2 : 1),
        steps: 8,
        seed: Math.floor(Math.random() * 0x7fffffff),
        modelSourcePreference: getModelSourcePreference(activeLanguage),
      });
    },
    [
      activeLanguage,
      imageUrlRefs,
      setActiveTool,
      setMediaTab,
      setSelectedLibraryAssetId,
      setUserAssets,
    ],
  );

  return { job, generate, cancel };
}
