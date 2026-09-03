import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CloudArrowUp,
  ClosedCaptioning,
  Diamond,
  DownloadSimple,
  FrameCorners,
  MicrophoneStage,
  MusicNote,
  MagicWand,
  Pause,
  Palette,
  PlayCircle,
  Plus,
  PersonSimpleRun,
  Scan,
  Scissors,
  Trash,
  Waveform,
  X,
} from "@phosphor-icons/react";

import {
  FILTER_OPTIONS,
  SAMPLE_IMAGE,
  STICKERS,
  STICKER_CATEGORIES,
  STICKER_PAGE_SIZE,
  VOICES,
} from "../config/editor.js";
import { APP_LANGUAGES } from "../i18n.js";
import { AI_MUSIC_PRESETS, buildEnglishMusicPrompt } from "../lib/aiMusicPrompt.js";
import {
  ensureCaptionFontLoaded,
  getCaptionFont,
  getCaptionFontsForLanguage,
  resolveCaptionStyleForSegment,
} from "../lib/captionFonts.js";
import {
  applyCaptionPresetToStyle,
  buildCaptionPresetSnapshot,
  BUILTIN_CAPTION_STYLE_PRESETS,
  CAPTION_VISUAL_STYLE_KEYS,
  getCaptionStylePreset,
  resolveCaptionSizeForSegment,
} from "../lib/captionStyles.js";
import {
  detectGeminiNanoVectorSupport,
  generateVectorWithGeminiNano,
} from "../lib/geminiNanoVector.js";
import { getRemoteAssetBlob } from "../lib/remoteAssetCache.js";
import { downloadBlob as downloadMediaBlob } from "../lib/media.js";
import { releasePointerActivatedFocus } from "../lib/editorShortcuts.js";
import { formatClock, formatTime, getSegmentStartTime } from "../lib/timeline.js";
import { VECTOR_CATEGORIES } from "../lib/vectorAssets.js";
import { hasVisualPropertyKeyframe, normalizeVisualKeyframes, resolveVisualTransform } from "../lib/visualEffects.js";
import {
  DEFAULT_VISUAL_SPEED_CURVE_POINTS,
  getVisualSpeedCurveRateAtProgress,
  normalizeVisualSpeedCurve,
  VISUAL_SPEED_STAGE_KEYS,
} from "../lib/visualSpeedCurve.js";
import { DEFAULT_VISUAL_ANIMATION_DURATION, normalizeVisualClipAnimation, VISUAL_CLIP_ANIMATION_OPTIONS } from "../lib/visualClipAnimations.js";
import { getVisualPropertyTabIds } from "../lib/visualPropertyTabs.js";
import { COLOR_GRADE_KEYFRAME_KEYS, DEFAULT_COLOR_GRADE, getColorGradeProperty, normalizeColorGrade, resolveColorGrade } from "../lib/colorGrade.js";
import { Popover } from "./ui.jsx";
import { SubjectEffectsWorkspace } from "./SubjectEffectsPanel.jsx";
import { convertVoiceBlob, extractVoiceEmbedding, OPENVOICE_EMBEDDING_VERSION } from "../lib/openVoiceRuntime.js";
import { getVoiceCloneTestSentence, synthesizeBaseVoice } from "../lib/baseVoiceSynthesis.js";

export function LanguageIntro({ t, closing, onChoose }) {
  return (
    <div className={`language-intro ${closing ? "is-closing" : ""}`} role="dialog" aria-modal="true">
      <div className="language-intro-card">
        <div className="language-intro-preview" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="language-intro-heading">
          <img src="/icons/timeline-studio-icon.svg" alt="" />
          <span>
            <strong>Timeline Studio</strong>
            <small>{t("languageKicker")}</small>
          </span>
        </div>
        <h1>
          <span className="language-title-en">Choose interface language</span>
          <span className="language-title-local">{t("languageTitle")}</span>
        </h1>
        <span className="language-intro-copy">
          <strong>Pick a language. This choice will be saved for next time.</strong>
          <span>{t("languageSubtitle")}</span>
        </span>
        <div className="language-grid">
          {APP_LANGUAGES.map((language) => (
            <button type="button" key={language.id} onClick={() => onChoose(language.id)}>
              <strong>{language.nativeName}</strong>
              <span>{language.hint}</span>
            </button>
          ))}
        </div>
        <small className="language-intro-footnote">{t("languageSaved")}</small>
      </div>
    </div>
  );
}

export function MediaPanel({
  t,
  mediaTab,
  setMediaTab,
  isDragging,
  setIsDragging,
  fileInputRef,
  handleFiles,
  selectedLibraryAssetId,
  builtInAssets,
  libraryType,
  libraryQuery,
  setLibraryQuery,
  selectLibraryType,
  libraryStatus,
  libraryError,
  libraryProvider,
  assetDownloadStates,
  prefetchLibraryAsset,
  userAssets,
  deleteUserAsset,
  draggedAssetId,
  handleAssetPointerDown,
  handleAssetClick,
  applyAssetToTrack,
  closeMobilePanel,
  mobilePanelOpen,
  language = "en",
  onGeneratedVector,
  onOpenAiMusic,
}) {
  const assets = mediaTab === "library" ? builtInAssets : userAssets;
  const [vectorCategory, setVectorCategory] = useState("all");
  const visibleAssets = libraryType === "vector" && vectorCategory !== "all"
    ? assets.filter((asset) => asset.category === vectorCategory)
    : assets;
  const selectedAsset = [...userAssets, ...builtInAssets].find((asset) => asset.id === selectedLibraryAssetId) ?? null;
  const assetIntentTimerRef = useRef(null);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [aiVectorOpen, setAiVectorOpen] = useState(false);

  useEffect(() => {
    if (!previewAsset) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setPreviewAsset(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset]);

  const openAssetPreview = (event, asset) => {
    handleAssetClick(event, asset);
    if (window.matchMedia?.("(max-width: 760px)").matches) return;
    if (!event.defaultPrevented) setPreviewAsset(asset);
  };
  const addSelectedAsset = async (track) => {
    if (!selectedAsset) return;
    await applyAssetToTrack?.(selectedAsset, track);
    closeMobilePanel?.();
  };
  const renderAssetList = (items, { deletable = false, prepend = null } = {}) => (
    <div
      className={`asset-list ${mediaTab === "upload" ? "upload-assets" : ""}`}
      aria-label={libraryStatus === "loading" && mediaTab === "library" ? t("libraryLoading") : undefined}
      aria-busy={libraryStatus === "loading" && mediaTab === "library" ? "true" : undefined}
    >
      {prepend}
      {libraryStatus === "loading" && mediaTab === "library" ? (
        <LibraryLoadingGrid />
      ) : items.length ? (
        items.map((asset) => (
          <div
            className={`asset-row-wrap ${draggedAssetId === asset.id ? "is-dragging" : ""}`}
            key={asset.id}
          >
            <button
              type="button"
              className="asset-row-button"
              onPointerDown={(event) => handleAssetPointerDown(event, asset)}
              onPointerEnter={() => {
                if (mediaTab !== "library") return;
                clearTimeout(assetIntentTimerRef.current);
                assetIntentTimerRef.current = setTimeout(() => void prefetchLibraryAsset?.(asset), 180);
              }}
              onPointerLeave={() => clearTimeout(assetIntentTimerRef.current)}
              onClick={(event) => openAssetPreview(event, asset)}
            >
              <AssetRow asset={asset} selected={asset.id === selectedLibraryAssetId} t={t} downloadState={assetDownloadStates?.[asset.id]} />
            </button>
            {deletable ? (
              <button
                className="asset-delete"
                type="button"
                aria-label={t("deleteAsset")}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteUserAsset(asset);
                }}
              >
                <Trash size={15} />
              </button>
            ) : null}
          </div>
        ))
      ) : (
        <div className="empty-state">{mediaTab === "library" ? (libraryError || t("libraryEmpty")) : t("emptyAssets")}</div>
      )}
    </div>
  );

  return (
    <>
      <div className="tabs">
        {[
          ["upload", t("uploadTab")],
          ["library", t("libraryTab")],
          ["mine", t("mineTab")],
        ].map(([id, label]) => (
          <button className={mediaTab === id ? "is-active" : ""} type="button" key={id} onClick={() => setMediaTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {mediaTab === "upload" ? (
        <>
          <button
            className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
            type="button"
            onClick={(event) => {
              fileInputRef.current?.click();
              releasePointerActivatedFocus(event);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <CloudArrowUp size={42} />
            <strong>{t("uploadDropTitle")}</strong>
            <span>{t("uploadSupport")}</span>
          </button>
          {renderAssetList(userAssets, { deletable: true })}
        </>
      ) : mediaTab === "library" ? (
        <>
          <LibraryTypeTabs t={t} activeType={libraryType} onSelect={selectLibraryType} />
          <form className="library-search" onSubmit={(event) => event.preventDefault()}>
            <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder={t(libraryType === "vector" ? "librarySearchVectorPlaceholder" : libraryType === "audio" ? "librarySearchMusicPlaceholder" : "librarySearchPlaceholder")} aria-label={t(libraryType === "vector" ? "librarySearchVectorPlaceholder" : libraryType === "audio" ? "librarySearchMusicPlaceholder" : "librarySearchPlaceholder")} />
          </form>
          {libraryType === "vector" ? (
            <div className="vector-category-row" role="group" aria-label={t("vectorCategories", "矢量素材分类")}>
              {VECTOR_CATEGORIES.map((category) => (
                <button
                  type="button"
                  className={vectorCategory === category.id ? "is-active" : ""}
                  aria-pressed={vectorCategory === category.id}
                  key={category.id}
                  onClick={() => setVectorCategory(category.id)}
                >
                  {t(category.labelKey, category.fallback)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="library-provider">{t("libraryProvidedBy")} <strong>{libraryProvider}</strong></div>
          {renderAssetList(visibleAssets, {
            prepend: libraryType === "audio" ? (
              <AiMusicLibraryCard
                language={language}
                onClick={onOpenAiMusic}
              />
            ) : libraryType === "vector" && vectorCategory === "all" ? (
              <AiVectorDesignCard
                language={language}
                onClick={() => setAiVectorOpen(true)}
              />
            ) : null,
          })}
        </>
      ) : (
        renderAssetList(assets, { deletable: mediaTab === "mine" })
      )}

      {selectedAsset && mobilePanelOpen ? createPortal((
        <div className="mobile-asset-actions" aria-label={t("mobileAssetActions")}>
          <span><strong>{selectedAsset.name}</strong><small>{t("mobileAssetSelected")}</small></span>
          {selectedAsset.type === "audio" ? (
            <div>
              <button type="button" className={selectedAsset.kind === "music" ? "" : "is-secondary"} onClick={() => void addSelectedAsset("music")}>{t("mobileAddToMusic")}</button>
              {selectedAsset.kind !== "music" ? (
                <button type="button" onClick={() => void addSelectedAsset("audio")}>{t("mobileAddToVoice")}</button>
              ) : null}
            </div>
          ) : (
            <div>
              <button type="button" className="is-secondary" onClick={() => void addSelectedAsset("overlay")}>{t("dropAsOverlay")}</button>
              <button type="button" onClick={() => void addSelectedAsset("image")}>{t("mobileAddToMainTrack")}</button>
            </div>
          )}
        </div>
      ), document.body) : null}

      {previewAsset ? createPortal(
        <AssetPreviewDialog asset={previewAsset} t={t} onClose={() => setPreviewAsset(null)} />,
        document.body,
      ) : null}

      {aiVectorOpen ? createPortal(
        <AiVectorDesignDialog
          language={language}
          onClose={() => setAiVectorOpen(false)}
          onGenerated={(asset) => {
            onGeneratedVector?.(asset);
            setAiVectorOpen(false);
          }}
        />,
        document.body,
      ) : null}
    </>
  );
}

const AI_VECTOR_COPY = {
  zh: {
    cardTitle: "AI 设计",
    cardHint: "Gemini Nano · 浏览器本地生成",
    cardMeta: "描述需求，生成可编辑 SVG",
    kicker: "本地 AI 矢量设计",
    title: "用 Gemini Nano 设计矢量图",
    intro: "描述你需要的图形。提示词与生成过程都留在浏览器中。",
    prompt: "设计需求",
    placeholder: "例如：青绿色科技感纸飞机图标，线条简洁，透明背景",
    checking: "正在检测浏览器与模型…",
    detecting: "正在识别设计需求的输入语言",
    translating: "正在将设计需求翻译成英文",
    translationDownloading: "正在下载本地翻译语言包",
    translationUnsupported: "当前浏览器无法将此界面语言翻译成英文",
    ready: "模型已就绪，可以本地生成",
    downloadable: "支持本地生成，首次使用会准备英文翻译包和 Gemini Nano 模型",
    downloading: "正在下载并准备模型",
    generating: "Gemini Nano 正在设计 SVG",
    validating: "正在解析并安全校验矢量图",
    unsupported: "当前浏览器不支持内置 Gemini Nano",
    unsupportedHint: "请使用支持 Prompt API 的桌面版 Chrome 或 Edge，并确认设备满足本地模型要求。",
    localNote: "首次模型下载需要网络，之后可从浏览器本地使用。",
    generate: "生成矢量图",
    downloadGenerate: "下载模型并生成",
    cancel: "取消",
    close: "关闭",
    failed: "这次没有生成可用的 SVG，请修改描述后重试。",
  },
  en: {
    cardTitle: "AI design", cardHint: "Gemini Nano · On-device", cardMeta: "Describe it, get editable SVG",
    kicker: "Local AI vector design", title: "Design a vector with Gemini Nano", intro: "Describe the graphic you need. Your prompt and generation stay in the browser.",
    prompt: "Design request", placeholder: "e.g. A clean teal paper-plane icon with a transparent background",
    checking: "Checking browser and model…", detecting: "Detecting the design request language", ready: "Model ready for local generation", downloadable: "Local generation is supported; English translation and Gemini Nano resources are prepared on first use",
    translating: "Translating the design request into English", translationDownloading: "Downloading the local translation language pack", translationUnsupported: "This browser cannot translate the selected interface language into English",
    downloading: "Downloading and preparing the model", generating: "Gemini Nano is designing the SVG", validating: "Parsing and safely validating the vector",
    unsupported: "Built-in Gemini Nano is not supported in this browser", unsupportedHint: "Use a Prompt API-capable desktop Chrome or Edge browser on a supported device.",
    localNote: "The first model download needs a network connection. Later runs use the browser-local model.", generate: "Generate vector",
    downloadGenerate: "Download model & generate", cancel: "Cancel", close: "Close", failed: "No usable SVG was generated. Adjust the description and try again.",
  },
  ja: {
    cardTitle: "AIデザイン", cardHint: "Gemini Nano・端末内", cardMeta: "説明から編集可能なSVGを生成", kicker: "ローカルAIベクターデザイン",
    title: "Gemini Nanoでベクターをデザイン", intro: "必要なグラフィックを説明してください。処理はブラウザ内で完結します。", prompt: "デザイン要件",
    placeholder: "例：透明背景のシンプルな青緑色の紙飛行機アイコン", checking: "ブラウザとモデルを確認中…", detecting: "入力言語を識別中", ready: "ローカル生成の準備ができました",
    translating: "デザイン要件を英語に翻訳中", translationDownloading: "翻訳言語パックをダウンロード中", translationUnsupported: "この言語から英語への翻訳は利用できません",
    downloadable: "ローカル生成に対応。初回に英語翻訳パックとモデルを準備します", downloading: "モデルをダウンロードして準備中", generating: "SVGをデザイン中",
    validating: "ベクターを解析・安全確認中", unsupported: "このブラウザは内蔵Gemini Nanoに対応していません", unsupportedHint: "Prompt API対応のデスクトップ版ChromeまたはEdgeを使用してください。",
    localNote: "初回ダウンロードにはネット接続が必要です。", generate: "ベクターを生成", downloadGenerate: "モデルを取得して生成", cancel: "キャンセル", close: "閉じる", failed: "有効なSVGを生成できませんでした。要件を調整してください。",
  },
  ko: {
    cardTitle: "AI 디자인", cardHint: "Gemini Nano · 기기 내", cardMeta: "설명으로 편집 가능한 SVG 생성", kicker: "로컬 AI 벡터 디자인",
    title: "Gemini Nano로 벡터 디자인", intro: "필요한 그래픽을 설명하세요. 생성은 브라우저 안에서 처리됩니다.", prompt: "디자인 요청",
    placeholder: "예: 투명 배경의 깔끔한 청록색 종이비행기 아이콘", checking: "브라우저와 모델 확인 중…", detecting: "입력 언어 감지 중", ready: "로컬 생성 준비 완료",
    translating: "디자인 요청을 영어로 번역 중", translationDownloading: "번역 언어 팩 다운로드 중", translationUnsupported: "이 언어를 영어로 번역할 수 없습니다",
    downloadable: "로컬 생성을 지원합니다. 처음 사용 시 영어 번역 팩과 모델을 준비합니다", downloading: "모델 다운로드 및 준비 중", generating: "SVG 디자인 중", validating: "벡터 구문 분석 및 안전 검사 중",
    unsupported: "이 브라우저는 내장 Gemini Nano를 지원하지 않습니다", unsupportedHint: "Prompt API를 지원하는 데스크톱 Chrome 또는 Edge를 사용하세요.",
    localNote: "첫 모델 다운로드에는 네트워크가 필요합니다.", generate: "벡터 생성", downloadGenerate: "모델 다운로드 후 생성", cancel: "취소", close: "닫기", failed: "사용 가능한 SVG를 생성하지 못했습니다. 설명을 수정해 보세요.",
  },
  es: {
    cardTitle: "Diseño IA", cardHint: "Gemini Nano · En el dispositivo", cardMeta: "Describe y crea un SVG editable", kicker: "Diseño vectorial con IA local",
    title: "Diseña un vector con Gemini Nano", intro: "Describe el gráfico. La solicitud y la generación permanecen en el navegador.", prompt: "Solicitud de diseño",
    placeholder: "Ej.: icono limpio de avión de papel turquesa con fondo transparente", checking: "Comprobando navegador y modelo…", detecting: "Detectando el idioma de la solicitud", ready: "Modelo listo para generar localmente",
    translating: "Traduciendo la solicitud al inglés", translationDownloading: "Descargando el paquete de traducción local", translationUnsupported: "No se puede traducir este idioma al inglés en el navegador",
    downloadable: "Compatible; la traducción al inglés y el modelo se preparan en el primer uso", downloading: "Descargando y preparando el modelo", generating: "Diseñando el SVG", validating: "Analizando y validando el vector",
    unsupported: "Este navegador no admite Gemini Nano integrado", unsupportedHint: "Usa Chrome o Edge de escritorio compatible con Prompt API.", localNote: "La primera descarga requiere conexión.",
    generate: "Generar vector", downloadGenerate: "Descargar modelo y generar", cancel: "Cancelar", close: "Cerrar", failed: "No se generó un SVG válido. Ajusta la descripción.",
  },
  fr: {
    cardTitle: "Design IA", cardHint: "Gemini Nano · Sur l’appareil", cardMeta: "Décrivez, obtenez un SVG modifiable", kicker: "Design vectoriel IA local",
    title: "Créer un vecteur avec Gemini Nano", intro: "Décrivez le visuel. La requête et la génération restent dans le navigateur.", prompt: "Demande de design",
    placeholder: "Ex. : icône d’avion en papier turquoise, fond transparent", checking: "Vérification du navigateur et du modèle…", detecting: "Détection de la langue de la demande", ready: "Modèle prêt pour la génération locale",
    translating: "Traduction de la demande en anglais", translationDownloading: "Téléchargement du pack de traduction local", translationUnsupported: "La traduction de cette langue vers l’anglais n’est pas disponible",
    downloadable: "Compatible ; la traduction anglaise et le modèle seront préparés au premier usage", downloading: "Téléchargement et préparation du modèle", generating: "Création du SVG", validating: "Analyse et validation du vecteur",
    unsupported: "Gemini Nano intégré n’est pas pris en charge", unsupportedHint: "Utilisez Chrome ou Edge sur ordinateur avec la Prompt API.", localNote: "Le premier téléchargement nécessite une connexion.",
    generate: "Générer le vecteur", downloadGenerate: "Télécharger et générer", cancel: "Annuler", close: "Fermer", failed: "Aucun SVG valide n’a été généré. Modifiez la description.",
  },
  de: {
    cardTitle: "KI-Design", cardHint: "Gemini Nano · Lokal", cardMeta: "Beschreiben und editierbares SVG erhalten", kicker: "Lokales KI-Vektordesign",
    title: "Vektor mit Gemini Nano gestalten", intro: "Beschreibe die gewünschte Grafik. Eingabe und Generierung bleiben im Browser.", prompt: "Designwunsch",
    placeholder: "z. B. klares türkisfarbenes Papierflieger-Icon, transparenter Hintergrund", checking: "Browser und Modell werden geprüft…", detecting: "Eingabesprache wird erkannt", ready: "Modell ist lokal einsatzbereit",
    translating: "Designwunsch wird ins Englische übersetzt", translationDownloading: "Lokales Übersetzungspaket wird geladen", translationUnsupported: "Diese Sprache kann im Browser nicht ins Englische übersetzt werden",
    downloadable: "Unterstützt; Englisch-Übersetzung und Modell werden bei der ersten Nutzung vorbereitet", downloading: "Modell wird geladen und vorbereitet", generating: "SVG wird gestaltet", validating: "Vektor wird geprüft",
    unsupported: "Integriertes Gemini Nano wird nicht unterstützt", unsupportedHint: "Nutze einen Prompt-API-fähigen Desktop-Browser Chrome oder Edge.", localNote: "Der erste Download benötigt eine Verbindung.",
    generate: "Vektor generieren", downloadGenerate: "Modell laden & generieren", cancel: "Abbrechen", close: "Schließen", failed: "Kein gültiges SVG erzeugt. Bitte Beschreibung anpassen.",
  },
  pt: {
    cardTitle: "Design com IA", cardHint: "Gemini Nano · No dispositivo", cardMeta: "Descreva e obtenha SVG editável", kicker: "Design vetorial com IA local",
    title: "Crie um vetor com Gemini Nano", intro: "Descreva o gráfico. O pedido e a geração ficam no navegador.", prompt: "Pedido de design",
    placeholder: "Ex.: ícone limpo de avião de papel verde-água, fundo transparente", checking: "Verificando navegador e modelo…", detecting: "Detectando o idioma do pedido", ready: "Modelo pronto para geração local",
    translating: "Traduzindo o pedido para inglês", translationDownloading: "Baixando o pacote de tradução local", translationUnsupported: "O navegador não pode traduzir este idioma para inglês",
    downloadable: "Compatível; a tradução para inglês e o modelo serão preparados no primeiro uso", downloading: "Baixando e preparando o modelo", generating: "Criando o SVG", validating: "Analisando e validando o vetor",
    unsupported: "Gemini Nano integrado não é compatível", unsupportedHint: "Use Chrome ou Edge para desktop com Prompt API.", localNote: "O primeiro download precisa de conexão.",
    generate: "Gerar vetor", downloadGenerate: "Baixar modelo e gerar", cancel: "Cancelar", close: "Fechar", failed: "Nenhum SVG válido foi gerado. Ajuste a descrição.",
  },
  th: {
    cardTitle: "ออกแบบด้วย AI", cardHint: "Gemini Nano · บนอุปกรณ์", cardMeta: "อธิบายเพื่อสร้าง SVG ที่แก้ไขได้", kicker: "ออกแบบเวกเตอร์ด้วย AI ในเครื่อง",
    title: "ออกแบบเวกเตอร์ด้วย Gemini Nano", intro: "อธิบายกราฟิกที่ต้องการ ข้อมูลและการสร้างจะอยู่ในเบราว์เซอร์", prompt: "ความต้องการ",
    placeholder: "เช่น ไอคอนเครื่องบินกระดาษสีเขียวอมฟ้า พื้นหลังโปร่งใส", checking: "กำลังตรวจสอบเบราว์เซอร์และโมเดล…", detecting: "กำลังตรวจจับภาษาที่ป้อน", ready: "โมเดลพร้อมสร้างในเครื่อง",
    translating: "กำลังแปลความต้องการเป็นภาษาอังกฤษ", translationDownloading: "กำลังดาวน์โหลดชุดภาษาแปลในเครื่อง", translationUnsupported: "เบราว์เซอร์แปลภาษานี้เป็นอังกฤษไม่ได้",
    downloadable: "รองรับ โดยจะเตรียมชุดแปลอังกฤษและโมเดลเมื่อใช้ครั้งแรก", downloading: "กำลังดาวน์โหลดและเตรียมโมเดล", generating: "กำลังออกแบบ SVG", validating: "กำลังตรวจสอบเวกเตอร์",
    unsupported: "เบราว์เซอร์นี้ไม่รองรับ Gemini Nano ในตัว", unsupportedHint: "ใช้ Chrome หรือ Edge บนเดสก์ท็อปที่รองรับ Prompt API", localNote: "การดาวน์โหลดครั้งแรกต้องใช้อินเทอร์เน็ต",
    generate: "สร้างเวกเตอร์", downloadGenerate: "ดาวน์โหลดและสร้าง", cancel: "ยกเลิก", close: "ปิด", failed: "สร้าง SVG ที่ใช้ได้ไม่สำเร็จ โปรดแก้คำอธิบาย",
  },
  vi: {
    cardTitle: "Thiết kế AI", cardHint: "Gemini Nano · Trên thiết bị", cardMeta: "Mô tả để tạo SVG có thể chỉnh sửa", kicker: "Thiết kế vector AI cục bộ",
    title: "Thiết kế vector bằng Gemini Nano", intro: "Mô tả hình bạn cần. Yêu cầu và quá trình tạo nằm trong trình duyệt.", prompt: "Yêu cầu thiết kế",
    placeholder: "VD: biểu tượng máy bay giấy xanh ngọc, nền trong suốt", checking: "Đang kiểm tra trình duyệt và mô hình…", detecting: "Đang nhận diện ngôn ngữ nhập", ready: "Mô hình sẵn sàng tạo cục bộ",
    translating: "Đang dịch yêu cầu sang tiếng Anh", translationDownloading: "Đang tải gói dịch cục bộ", translationUnsupported: "Trình duyệt không thể dịch ngôn ngữ này sang tiếng Anh",
    downloadable: "Được hỗ trợ; gói dịch tiếng Anh và mô hình sẽ được chuẩn bị ở lần dùng đầu", downloading: "Đang tải và chuẩn bị mô hình", generating: "Đang thiết kế SVG", validating: "Đang phân tích và xác thực vector",
    unsupported: "Trình duyệt không hỗ trợ Gemini Nano tích hợp", unsupportedHint: "Dùng Chrome hoặc Edge máy tính có Prompt API.", localNote: "Lần tải đầu cần kết nối mạng.",
    generate: "Tạo vector", downloadGenerate: "Tải mô hình và tạo", cancel: "Hủy", close: "Đóng", failed: "Không tạo được SVG hợp lệ. Hãy điều chỉnh mô tả.",
  },
  ru: {
    cardTitle: "ИИ-дизайн", cardHint: "Gemini Nano · На устройстве", cardMeta: "Описание → редактируемый SVG", kicker: "Локальный ИИ-дизайн вектора",
    title: "Создать вектор с Gemini Nano", intro: "Опишите нужную графику. Запрос и генерация остаются в браузере.", prompt: "Задача",
    placeholder: "Например: лаконичная бирюзовая иконка бумажного самолёта, прозрачный фон", checking: "Проверяем браузер и модель…", detecting: "Определяем язык запроса", ready: "Модель готова к локальной генерации",
    translating: "Переводим задачу на английский", translationDownloading: "Загружаем локальный языковой пакет", translationUnsupported: "Браузер не может перевести этот язык на английский",
    downloadable: "Поддерживается; при первом запуске будут подготовлены перевод на английский и модель", downloading: "Загрузка и подготовка модели", generating: "Создание SVG", validating: "Разбор и безопасная проверка вектора",
    unsupported: "Встроенный Gemini Nano не поддерживается", unsupportedHint: "Используйте настольный Chrome или Edge с Prompt API.", localNote: "Для первой загрузки нужна сеть.",
    generate: "Создать вектор", downloadGenerate: "Загрузить и создать", cancel: "Отмена", close: "Закрыть", failed: "Не удалось получить корректный SVG. Измените описание.",
  },
  it: {
    cardTitle: "Design AI", cardHint: "Gemini Nano · Sul dispositivo", cardMeta: "Descrivi e ottieni un SVG modificabile", kicker: "Design vettoriale AI locale",
    title: "Crea un vettore con Gemini Nano", intro: "Descrivi la grafica necessaria. La richiesta e la generazione restano nel browser.", prompt: "Richiesta di design", placeholder: "Es.: icona pulita di un aeroplanino turchese con sfondo trasparente",
    checking: "Controllo del browser e del modello…", detecting: "Rilevamento della lingua della richiesta", translating: "Traduzione della richiesta in inglese", translationDownloading: "Download del pacchetto di traduzione locale", translationUnsupported: "Il browser non può tradurre questa lingua in inglese", ready: "Modello pronto per la generazione locale",
    downloadable: "Generazione locale supportata; traduzione inglese e modello vengono preparati al primo utilizzo", downloading: "Download e preparazione del modello", generating: "Gemini Nano sta creando l’SVG", validating: "Analisi e convalida sicura del vettore", unsupported: "Gemini Nano integrato non è supportato in questo browser", unsupportedHint: "Usa Chrome o Edge desktop con supporto alla Prompt API.", localNote: "Il primo download richiede una connessione di rete.",
    generate: "Genera vettore", downloadGenerate: "Scarica il modello e genera", cancel: "Annulla", close: "Chiudi", failed: "Non è stato generato un SVG valido. Modifica la descrizione e riprova.",
  },
  id: {
    cardTitle: "Desain AI", cardHint: "Gemini Nano · Di perangkat", cardMeta: "Jelaskan dan dapatkan SVG yang dapat diedit", kicker: "Desain vektor AI lokal",
    title: "Buat vektor dengan Gemini Nano", intro: "Jelaskan grafis yang Anda perlukan. Permintaan dan proses pembuatan tetap di browser.", prompt: "Permintaan desain", placeholder: "Contoh: ikon pesawat kertas berwarna toska dengan latar transparan",
    checking: "Memeriksa browser dan model…", detecting: "Mendeteksi bahasa permintaan", translating: "Menerjemahkan permintaan ke bahasa Inggris", translationDownloading: "Mengunduh paket terjemahan lokal", translationUnsupported: "Browser tidak dapat menerjemahkan bahasa ini ke bahasa Inggris", ready: "Model siap untuk pembuatan lokal",
    downloadable: "Pembuatan lokal didukung; terjemahan Inggris dan model disiapkan saat pertama digunakan", downloading: "Mengunduh dan menyiapkan model", generating: "Gemini Nano sedang membuat SVG", validating: "Mengurai dan memvalidasi vektor dengan aman", unsupported: "Gemini Nano bawaan tidak didukung di browser ini", unsupportedHint: "Gunakan Chrome atau Edge desktop yang mendukung Prompt API.", localNote: "Pengunduhan pertama memerlukan koneksi internet.",
    generate: "Buat vektor", downloadGenerate: "Unduh model dan buat", cancel: "Batal", close: "Tutup", failed: "SVG yang valid tidak berhasil dibuat. Ubah deskripsi lalu coba lagi.",
  },
};

function AiVectorDesignCard({ language, onClick }) {
  const copy = AI_VECTOR_COPY[language] || AI_VECTOR_COPY.en;
  return (
    <button className="ai-vector-card" type="button" onClick={onClick}>
      <span className="ai-vector-card-art" aria-hidden="true">
        <MagicWand size={34} weight="duotone" />
        <i>AI</i>
      </span>
      <span><strong>{copy.cardTitle}</strong><small>{copy.cardHint}</small></span>
    </button>
  );
}

function AiVectorDesignDialog({ language, onClose, onGenerated }) {
  const copy = AI_VECTOR_COPY[language] || AI_VECTOR_COPY.en;
  const [request, setRequest] = useState("");
  const [availability, setAvailability] = useState("checking");
  const [phase, setPhase] = useState("checking");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [translationUnavailable, setTranslationUnavailable] = useState(false);
  const [translationAvailability, setTranslationAvailability] = useState("available");
  const abortRef = useRef(null);
  const running = ["detectingLanguage", "translationDownloading", "translating", "downloading", "model", "generating", "validating"].includes(phase);

  useEffect(() => {
    let active = true;
    void detectGeminiNanoVectorSupport(globalThis, language).then((result) => {
      if (!active) return;
      setAvailability(result.availability);
      setTranslationAvailability(result.translationAvailability || "available");
      setTranslationUnavailable(result.detectorAvailability === "unavailable" || result.translationAvailability === "unavailable");
      setPhase(result.supported ? "idle" : "unsupported");
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [language]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, running]);

  const startGeneration = async () => {
    if (!request.trim() || running || availability === "unavailable") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setProgress(0);
    setPhase(availability === "available" ? "model" : "downloading");
    try {
      const asset = await generateVectorWithGeminiNano({
        request,
        sourceLanguage: language,
        signal: controller.signal,
        onLanguageDetectionDownloadProgress: (value) => {
          setPhase("detectingLanguage");
          setProgress(Math.round(value * 100));
        },
        onTranslationDownloadProgress: (value) => {
          setPhase("translationDownloading");
          setProgress(Math.round(value * 100));
        },
        onDownloadProgress: (value) => {
          setPhase("downloading");
          setProgress(Math.round(value * 100));
        },
        onPhaseChange: setPhase,
      });
      onGenerated(asset);
    } catch (generationError) {
      if (generationError?.name === "AbortError") {
        setPhase("idle");
        return;
      }
      const errorCode = String(generationError?.message || "");
      setError(/TRANSLAT|LANGUAGE_DETECTOR/.test(errorCode) ? copy.translationUnsupported : copy.failed);
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  };

  const requiresDownload = availability !== "available" || translationAvailability !== "available";
  const statusText = phase === "checking" ? copy.checking
    : phase === "unsupported" ? (translationUnavailable ? copy.translationUnsupported : copy.unsupported)
      : phase === "detectingLanguage" ? copy.detecting
      : phase === "translationDownloading" ? copy.translationDownloading
        : phase === "translating" ? copy.translating
      : phase === "downloading" || phase === "model" ? copy.downloading
        : phase === "generating" ? copy.generating
          : phase === "validating" ? copy.validating
            : !requiresDownload ? copy.ready
              : copy.downloadable;

  return (
    <div className="ai-vector-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !running) onClose();
    }}>
      <section className="ai-vector-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-vector-title">
        <header>
          <span className="ai-vector-dialog-icon"><MagicWand size={23} weight="duotone" /></span>
          <div><small>{copy.kicker}</small><h2 id="ai-vector-title">{copy.title}</h2></div>
          <button type="button" onClick={onClose} disabled={running} aria-label={copy.close}><X size={18} /></button>
        </header>
        <div className="ai-vector-dialog-body">
          <p>{copy.intro}</p>
          <label>{copy.prompt}<textarea autoFocus rows="5" value={request} disabled={running || phase === "unsupported"} placeholder={copy.placeholder} onChange={(event) => setRequest(event.target.value)} /></label>
          <div className={`ai-vector-runtime is-${phase}`}>
            <span>{phase === "idle" && availability === "available" ? <Check size={16} weight="bold" /> : <MagicWand size={16} />}</span>
            <div><strong>{statusText}</strong><small>{phase === "unsupported" && !translationUnavailable ? copy.unsupportedHint : copy.localNote}</small></div>
          </div>
          {running ? (
            <div className="ai-vector-progress" aria-label={statusText}>
              <span style={{ width: phase === "detectingLanguage" ? `${Math.max(4, progress || 8)}%` : phase === "translationDownloading" ? `${Math.max(4, progress)}%` : phase === "translating" ? "18%" : phase === "downloading" ? `${Math.max(4, progress)}%` : phase === "model" ? "32%" : phase === "generating" ? "72%" : "92%" }} />
            </div>
          ) : null}
          {error ? <p className="ai-vector-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <button type="button" className="is-secondary" onClick={() => {
            if (running) abortRef.current?.abort();
            else onClose();
          }}>{copy.cancel}</button>
          <button type="button" className="is-primary" disabled={!request.trim() || phase === "checking" || phase === "unsupported" || running} onClick={() => void startGeneration()}>
            <MagicWand size={16} weight="fill" />
            {requiresDownload ? copy.downloadGenerate : copy.generate}
          </button>
        </footer>
      </section>
    </div>
  );
}

function LibraryTypeTabs({ t, activeType, onSelect }) {
  const viewportRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setEdges({
      left: viewport.scrollLeft > 2,
      right: viewport.scrollLeft < maxScroll - 2,
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(viewport);
    viewport.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updateEdges);
    };
  }, [updateEdges]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const active = viewport?.querySelector('[aria-selected="true"]');
    if (viewport && active) {
      const viewportRect = viewport.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      if (activeRect.left < viewportRect.left + 4) {
        viewport.scrollTo({ left: Math.max(0, viewport.scrollLeft + activeRect.left - viewportRect.left - 4), behavior: "smooth" });
      } else if (activeRect.right > viewportRect.right - 4) {
        viewport.scrollTo({ left: Math.min(maxScroll, viewport.scrollLeft + activeRect.right - viewportRect.right + 4), behavior: "smooth" });
      }
    }
    const timer = setTimeout(updateEdges, 220);
    return () => clearTimeout(timer);
  }, [activeType, updateEdges]);

  const scroll = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const target = Math.max(0, Math.min(maxScroll, viewport.scrollLeft + direction * Math.max(120, viewport.clientWidth * 0.72)));
    viewport.scrollTo({ left: target, behavior: "smooth" });
  };

  const showForwardArrow = edges.right;
  const showBackArrow = !showForwardArrow && edges.left;

  return (
    <div className={`library-type-tabs-shell ${edges.left ? "has-left-shadow" : ""} ${edges.right ? "has-right-shadow" : ""}`}>
      {showBackArrow ? (
        <button
          className="library-type-arrow is-left"
          type="button"
          aria-label={t("scrollTabsLeft")}
          onClick={() => scroll(-1)}
        >
          <CaretLeft size={16} weight="bold" />
        </button>
      ) : null}
      <div className="library-type-tabs" role="tablist" aria-label={t("libraryMediaType")} ref={viewportRef}>
        {["image", "video", "audio", "vector"].map((type) => (
          <button type="button" role="tab" aria-selected={activeType === type} className={activeType === type ? "is-active" : ""} key={type} onClick={() => onSelect(type)}>
            {t(`library${type[0].toUpperCase()}${type.slice(1)}`)}
          </button>
        ))}
      </div>
      {showForwardArrow ? (
        <button
          className="library-type-arrow is-right"
          type="button"
          aria-label={t("scrollTabsRight")}
          onClick={() => scroll(1)}
        >
          <CaretRight size={16} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}

export const AI_MUSIC_COPY = {
  zh: { title: "AI 音乐", hint: "本地音乐生成", description: "音乐描述", descriptionPlaceholder: "例如：雨夜咖啡店里安静忧郁的爵士钢琴", style: "风格", mood: "氛围", instrument: "主乐器", duration: "时长", bpm: "速度", generate: "生成音乐", cancel: "取消", first: "模型仅首次下载。", modelSetup: "模型准备", modelReady: "模型已就绪", musicGeneration: "音乐生成", waitingToGenerate: "等待生成", checking: "检查缓存", download: "并行下载", repairing: "并行下载", cache: "加载缓存", initializing: "初始化模型", translating: "翻译描述", conditioning: "理解描述", generating: "正在生成", decoding: "合成音频", complete: "已添加到 My assets", english: "高级：模型提示词" },
  en: { title: "AI music", hint: "Local music", description: "Describe your music", descriptionPlaceholder: "e.g. melancholic jazz piano in a rainy café", style: "Style", mood: "Mood", instrument: "Lead", duration: "Length", bpm: "Tempo", generate: "Generate music", cancel: "Cancel", first: "The model downloads once.", modelSetup: "Model setup", modelReady: "Model ready", musicGeneration: "Music generation", waitingToGenerate: "Waiting", checking: "Checking cache", download: "Parallel download", repairing: "Parallel download", cache: "Loading cache", initializing: "Initializing model", translating: "Translating", conditioning: "Reading prompt", generating: "Generating", decoding: "Decoding audio", complete: "Added to My assets", english: "Advanced: model prompt" },
  ja: { title: "AI音楽", hint: "ローカル音楽生成", description: "作りたい音楽を説明", descriptionPlaceholder: "例：雨のカフェで流れる切ないジャズピアノ", style: "スタイル", mood: "雰囲気", instrument: "主な楽器", duration: "長さ", bpm: "テンポ", generate: "音楽を生成", cancel: "キャンセル", first: "モデルは初回のみダウンロードされます。", modelSetup: "モデル準備", modelReady: "モデル準備完了", musicGeneration: "音楽生成", waitingToGenerate: "待機中", checking: "キャッシュを確認中", download: "並列ダウンロード", repairing: "並列ダウンロード", cache: "キャッシュを読み込み中", initializing: "モデルを初期化中", translating: "説明を翻訳中", conditioning: "説明を解析中", generating: "生成中", decoding: "音声を合成中", complete: "マイ素材に追加しました", english: "詳細：モデル用プロンプト" },
  ko: { title: "AI 음악", hint: "로컬 음악 생성", description: "원하는 음악 설명", descriptionPlaceholder: "예: 비 오는 카페의 아련한 재즈 피아노", style: "스타일", mood: "분위기", instrument: "주요 악기", duration: "길이", bpm: "템포", generate: "음악 생성", cancel: "취소", first: "모델은 처음 한 번만 다운로드됩니다.", modelSetup: "모델 준비", modelReady: "모델 준비 완료", musicGeneration: "음악 생성", waitingToGenerate: "대기 중", checking: "캐시 확인 중", download: "병렬 다운로드", repairing: "병렬 다운로드", cache: "캐시 불러오는 중", initializing: "모델 초기화 중", translating: "설명 번역 중", conditioning: "설명 분석 중", generating: "생성 중", decoding: "오디오 합성 중", complete: "내 에셋에 추가됨", english: "고급: 모델 프롬프트" },
  es: { title: "Música con IA", hint: "Música local", description: "Describe tu música", descriptionPlaceholder: "Ej.: piano de jazz melancólico en un café lluvioso", style: "Estilo", mood: "Ambiente", instrument: "Instrumento", duration: "Duración", bpm: "Tempo", generate: "Generar música", cancel: "Cancelar", first: "El modelo solo se descarga la primera vez.", modelSetup: "Preparación del modelo", modelReady: "Modelo listo", musicGeneration: "Generación de música", waitingToGenerate: "En espera", checking: "Comprobando caché", download: "Descarga en paralelo", repairing: "Descarga en paralelo", cache: "Cargando caché", initializing: "Inicializando modelo", translating: "Traduciendo", conditioning: "Interpretando descripción", generating: "Generando", decoding: "Procesando audio", complete: "Añadido a Mis recursos", english: "Avanzado: prompt del modelo" },
  fr: { title: "Musique IA", hint: "Musique locale", description: "Décrivez votre musique", descriptionPlaceholder: "Ex. : piano jazz mélancolique dans un café pluvieux", style: "Style", mood: "Ambiance", instrument: "Instrument", duration: "Durée", bpm: "Tempo", generate: "Générer la musique", cancel: "Annuler", first: "Le modèle n’est téléchargé qu’une fois.", modelSetup: "Préparation du modèle", modelReady: "Modèle prêt", musicGeneration: "Génération musicale", waitingToGenerate: "En attente", checking: "Vérification du cache", download: "Téléchargement parallèle", repairing: "Téléchargement parallèle", cache: "Chargement du cache", initializing: "Initialisation du modèle", translating: "Traduction", conditioning: "Analyse de la description", generating: "Génération", decoding: "Création de l’audio", complete: "Ajouté à Mes ressources", english: "Avancé : prompt du modèle" },
  de: { title: "KI-Musik", hint: "Lokale Musik", description: "Beschreibe deine Musik", descriptionPlaceholder: "z. B. melancholisches Jazzpiano in einem verregneten Café", style: "Stil", mood: "Stimmung", instrument: "Leitinstrument", duration: "Länge", bpm: "Tempo", generate: "Musik generieren", cancel: "Abbrechen", first: "Das Modell wird nur einmal heruntergeladen.", modelSetup: "Modell einrichten", modelReady: "Modell bereit", musicGeneration: "Musik generieren", waitingToGenerate: "Wartet", checking: "Cache wird geprüft", download: "Paralleler Download", repairing: "Paralleler Download", cache: "Cache wird geladen", initializing: "Modell wird initialisiert", translating: "Wird übersetzt", conditioning: "Beschreibung wird gelesen", generating: "Wird generiert", decoding: "Audio wird erstellt", complete: "Zu Meine Medien hinzugefügt", english: "Erweitert: Modell-Prompt" },
  pt: { title: "Música com IA", hint: "Música local", description: "Descreva sua música", descriptionPlaceholder: "Ex.: piano de jazz melancólico em um café chuvoso", style: "Estilo", mood: "Clima", instrument: "Instrumento", duration: "Duração", bpm: "Tempo", generate: "Gerar música", cancel: "Cancelar", first: "O modelo é baixado apenas na primeira vez.", modelSetup: "Preparação do modelo", modelReady: "Modelo pronto", musicGeneration: "Geração de música", waitingToGenerate: "Aguardando", checking: "Verificando cache", download: "Download paralelo", repairing: "Download paralelo", cache: "Carregando cache", initializing: "Inicializando modelo", translating: "Traduzindo", conditioning: "Interpretando descrição", generating: "Gerando", decoding: "Processando áudio", complete: "Adicionado aos Meus recursos", english: "Avançado: prompt do modelo" },
  th: { title: "เพลง AI", hint: "สร้างเพลงในเครื่อง", description: "อธิบายเพลงที่ต้องการ", descriptionPlaceholder: "เช่น เปียโนแจ๊สเศร้า ๆ ในคาเฟ่ยามฝนตก", style: "สไตล์", mood: "อารมณ์", instrument: "เครื่องดนตรีหลัก", duration: "ความยาว", bpm: "จังหวะ", generate: "สร้างเพลง", cancel: "ยกเลิก", first: "ดาวน์โหลดโมเดลเฉพาะครั้งแรกเท่านั้น", modelSetup: "เตรียมโมเดล", modelReady: "โมเดลพร้อมแล้ว", musicGeneration: "สร้างเพลง", waitingToGenerate: "กำลังรอ", checking: "กำลังตรวจสอบแคช", download: "ดาวน์โหลดพร้อมกัน", repairing: "ดาวน์โหลดพร้อมกัน", cache: "กำลังโหลดแคช", initializing: "กำลังเริ่มต้นโมเดล", translating: "กำลังแปล", conditioning: "กำลังวิเคราะห์คำอธิบาย", generating: "กำลังสร้าง", decoding: "กำลังประมวลผลเสียง", complete: "เพิ่มในสื่อของฉันแล้ว", english: "ขั้นสูง: พรอมต์ของโมเดล" },
  vi: { title: "Nhạc AI", hint: "Tạo nhạc cục bộ", description: "Mô tả bản nhạc", descriptionPlaceholder: "Ví dụ: piano jazz buồn trong quán cà phê ngày mưa", style: "Phong cách", mood: "Cảm xúc", instrument: "Nhạc cụ chính", duration: "Độ dài", bpm: "Nhịp độ", generate: "Tạo nhạc", cancel: "Hủy", first: "Mô hình chỉ được tải xuống một lần.", modelSetup: "Chuẩn bị mô hình", modelReady: "Mô hình đã sẵn sàng", musicGeneration: "Tạo nhạc", waitingToGenerate: "Đang chờ", checking: "Đang kiểm tra bộ nhớ đệm", download: "Tải song song", repairing: "Tải song song", cache: "Đang tải bộ nhớ đệm", initializing: "Đang khởi tạo mô hình", translating: "Đang dịch", conditioning: "Đang đọc mô tả", generating: "Đang tạo", decoding: "Đang xử lý âm thanh", complete: "Đã thêm vào Tài nguyên của tôi", english: "Nâng cao: prompt mô hình" },
  ru: { title: "ИИ-музыка", hint: "Локальная музыка", description: "Опишите музыку", descriptionPlaceholder: "Например: меланхоличное джазовое пианино в дождливом кафе", style: "Стиль", mood: "Настроение", instrument: "Ведущий инструмент", duration: "Длительность", bpm: "Темп", generate: "Создать музыку", cancel: "Отмена", first: "Модель загружается только один раз.", modelSetup: "Подготовка модели", modelReady: "Модель готова", musicGeneration: "Создание музыки", waitingToGenerate: "Ожидание", checking: "Проверка кеша", download: "Параллельная загрузка", repairing: "Параллельная загрузка", cache: "Загрузка кеша", initializing: "Инициализация модели", translating: "Перевод", conditioning: "Анализ описания", generating: "Создание", decoding: "Обработка аудио", complete: "Добавлено в Мои материалы", english: "Дополнительно: промпт модели" },
  it: { title: "Musica AI", hint: "Musica locale", description: "Descrivi la musica", descriptionPlaceholder: "Es.: pianoforte jazz malinconico in un caffè sotto la pioggia", style: "Stile", mood: "Atmosfera", instrument: "Strumento principale", duration: "Durata", bpm: "Tempo", generate: "Genera musica", cancel: "Annulla", first: "Il modello viene scaricato una sola volta.", modelSetup: "Preparazione modello", modelReady: "Modello pronto", musicGeneration: "Generazione musica", waitingToGenerate: "In attesa", checking: "Controllo cache", download: "Download parallelo", repairing: "Download parallelo", cache: "Caricamento cache", initializing: "Inizializzazione modello", translating: "Traduzione", conditioning: "Analisi descrizione", generating: "Generazione", decoding: "Elaborazione audio", complete: "Aggiunto ai miei contenuti", english: "Avanzate: prompt del modello" },
  id: { title: "Musik AI", hint: "Musik lokal", description: "Jelaskan musik Anda", descriptionPlaceholder: "Contoh: piano jazz melankolis di kafe saat hujan", style: "Gaya", mood: "Suasana", instrument: "Instrumen utama", duration: "Durasi", bpm: "Tempo", generate: "Buat musik", cancel: "Batal", first: "Model hanya diunduh satu kali.", modelSetup: "Penyiapan model", modelReady: "Model siap", musicGeneration: "Pembuatan musik", waitingToGenerate: "Menunggu", checking: "Memeriksa cache", download: "Unduh paralel", repairing: "Unduh paralel", cache: "Memuat cache", initializing: "Menginisialisasi model", translating: "Menerjemahkan", conditioning: "Memahami deskripsi", generating: "Membuat", decoding: "Memproses audio", complete: "Ditambahkan ke Aset saya", english: "Lanjutan: prompt model" },
};

function AiMusicLibraryCard({ language, onClick }) {
  const copy = AI_MUSIC_COPY[language] || AI_MUSIC_COPY.en;
  return (
    <button className="ai-vector-card ai-music-library-card" type="button" onClick={onClick}>
      <span className="ai-vector-card-art" aria-hidden="true">
        <MusicNote size={35} weight="duotone" />
        <i>AI</i>
      </span>
      <span><strong>{copy.title}</strong><small>{copy.hint}</small></span>
    </button>
  );
}
const AI_OPTION_LABELS = {
  zh: { cinematic: "电影感", lofi: "Lo-fi", ambient: "氛围", electronic: "电子", orchestral: "管弦", uplifting: "振奋", calm: "平静", dreamy: "梦幻", dramatic: "戏剧性", dark: "暗黑", piano: "钢琴", guitar: "木吉他", synth: "合成器", strings: "弦乐", drums: "鼓组" },
  ja: { cinematic: "シネマティック", lofi: "Lo-fi", ambient: "アンビエント", electronic: "エレクトロニック", orchestral: "オーケストラ", uplifting: "高揚感", calm: "穏やか", dreamy: "夢幻的", dramatic: "ドラマチック", dark: "ダーク", piano: "ピアノ", guitar: "ギター", synth: "シンセ", strings: "弦楽器", drums: "ドラム" },
  ko: { cinematic: "시네마틱", lofi: "Lo-fi", ambient: "앰비언트", electronic: "일렉트로닉", orchestral: "오케스트라", uplifting: "활기찬", calm: "차분한", dreamy: "몽환적인", dramatic: "드라마틱", dark: "어두운", piano: "피아노", guitar: "기타", synth: "신시사이저", strings: "현악기", drums: "드럼" },
  es: { cinematic: "Cinemático", lofi: "Lo-fi", ambient: "Ambiental", electronic: "Electrónico", orchestral: "Orquestal", uplifting: "Inspirador", calm: "Tranquilo", dreamy: "Soñador", dramatic: "Dramático", dark: "Oscuro", piano: "Piano", guitar: "Guitarra", synth: "Sintetizador", strings: "Cuerdas", drums: "Batería" },
  fr: { cinematic: "Cinématique", lofi: "Lo-fi", ambient: "Ambient", electronic: "Électronique", orchestral: "Orchestral", uplifting: "Entraînant", calm: "Calme", dreamy: "Rêveur", dramatic: "Dramatique", dark: "Sombre", piano: "Piano", guitar: "Guitare", synth: "Synthétiseur", strings: "Cordes", drums: "Batterie" },
  de: { cinematic: "Cineastisch", lofi: "Lo-fi", ambient: "Ambient", electronic: "Elektronisch", orchestral: "Orchestral", uplifting: "Aufmunternd", calm: "Ruhig", dreamy: "Verträumt", dramatic: "Dramatisch", dark: "Düster", piano: "Klavier", guitar: "Gitarre", synth: "Synthesizer", strings: "Streicher", drums: "Schlagzeug" },
  pt: { cinematic: "Cinemático", lofi: "Lo-fi", ambient: "Ambiente", electronic: "Eletrônico", orchestral: "Orquestral", uplifting: "Inspirador", calm: "Calmo", dreamy: "Sonhador", dramatic: "Dramático", dark: "Sombrio", piano: "Piano", guitar: "Violão", synth: "Sintetizador", strings: "Cordas", drums: "Bateria" },
  th: { cinematic: "ภาพยนตร์", lofi: "Lo-fi", ambient: "แอมเบียนต์", electronic: "อิเล็กทรอนิกส์", orchestral: "ออร์เคสตรา", uplifting: "ปลุกใจ", calm: "สงบ", dreamy: "ชวนฝัน", dramatic: "เข้มข้น", dark: "หม่น", piano: "เปียโน", guitar: "กีตาร์", synth: "ซินธิไซเซอร์", strings: "เครื่องสาย", drums: "กลอง" },
  vi: { cinematic: "Điện ảnh", lofi: "Lo-fi", ambient: "Không gian", electronic: "Điện tử", orchestral: "Giao hưởng", uplifting: "Hứng khởi", calm: "Êm dịu", dreamy: "Mơ màng", dramatic: "Kịch tính", dark: "U tối", piano: "Piano", guitar: "Guitar", synth: "Synth", strings: "Dàn dây", drums: "Trống" },
  ru: { cinematic: "Кинематографичный", lofi: "Lo-fi", ambient: "Эмбиент", electronic: "Электронный", orchestral: "Оркестровый", uplifting: "Воодушевляющий", calm: "Спокойный", dreamy: "Мечтательный", dramatic: "Драматичный", dark: "Мрачный", piano: "Пианино", guitar: "Гитара", synth: "Синтезатор", strings: "Струнные", drums: "Ударные" },
  it: { cinematic: "Cinematografico", lofi: "Lo-fi", ambient: "Ambient", electronic: "Elettronico", orchestral: "Orchestrale", uplifting: "Energico", calm: "Calmo", dreamy: "Sognante", dramatic: "Drammatico", dark: "Cupo", piano: "Pianoforte", guitar: "Chitarra", synth: "Sintetizzatore", strings: "Archi", drums: "Batteria" },
  id: { cinematic: "Sinematik", lofi: "Lo-fi", ambient: "Ambien", electronic: "Elektronik", orchestral: "Orkestra", uplifting: "Membangkitkan semangat", calm: "Tenang", dreamy: "Penuh mimpi", dramatic: "Dramatis", dark: "Gelap", piano: "Piano", guitar: "Gitar", synth: "Penyintesis", strings: "Alat musik gesek", drums: "Drum" },
};

export function AiMusicGenerator({ language, music, embedded = false }) {
  const copy = AI_MUSIC_COPY[language] || AI_MUSIC_COPY.en;
  const labels = AI_OPTION_LABELS[language] || {};
  const [open, setOpen] = useState(embedded);
  const [selection, setSelection] = useState({ description: "", style: "cinematic", mood: "dreamy", instrument: "piano", seconds: 30, bpm: 90 });
  const running = music?.job?.state === "running";
  const phaseLabel = copy[music?.job?.phase] || copy.generating;
  const setupRunning = running && ["checking", "download", "repairing", "cache", "initializing"].includes(music?.job?.phase);
  const setupProgress = setupRunning ? Math.min(100, Math.round((music.job.progress / 0.64) * 100)) : (running || music?.job?.state === "complete" ? 100 : 0);
  const generationStarted = running && !setupRunning;
  const generationProgress = generationStarted ? Math.max(1, Math.min(100, Math.round(((music.job.progress - 0.64) / 0.36) * 100))) : (music?.job?.state === "complete" ? 100 : 0);
  const streamingSetup = setupRunning && ["download", "repairing"].includes(music?.job?.phase);
  const activeStageProgress = setupRunning ? setupProgress : generationProgress;
  const activeStageLabel = setupRunning ? copy.modelSetup : copy.musicGeneration;
  const activeStageStatus = setupRunning ? phaseLabel : generationStarted ? phaseLabel : copy.waitingToGenerate;
  const select = (group, value) => setSelection((current) => ({ ...current, [group]: value }));
  const HeadTag = embedded ? "div" : "button";
  return (
    <section className={`ai-music-card ${open ? "is-open" : ""} ${embedded ? "is-embedded" : ""}`}>
      {!embedded ? <HeadTag className="ai-music-card-head" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="ai-music-spark">✦</span>
        <span><strong>{copy.title}</strong><small>{copy.hint}</small></span>
        <CaretDown size={17} />
      </HeadTag> : null}
      {open ? (
        <div className="ai-music-card-body">
          <label className="ai-music-description">{copy.description}<textarea rows="3" value={selection.description} disabled={running} placeholder={copy.descriptionPlaceholder} onChange={(event) => select("description", event.target.value)} /></label>
          <div className="ai-music-select-grid">
            {[["style", copy.style], ["mood", copy.mood], ["instrument", copy.instrument]].map(([group, title]) => (
              <label key={group}>{title}<select value={selection[group]} disabled={running} onChange={(event) => select(group, event.target.value)}>
                {AI_MUSIC_PRESETS[group].map(([id]) => <option value={id} key={id}>{labels[id] || id}</option>)}
              </select></label>
            ))}
          </div>
          <div className="ai-music-numbers">
            <label>{copy.duration}<select value={selection.seconds} disabled={running} onChange={(event) => select("seconds", Number(event.target.value))}><option value="30">30s</option><option value="60">60s</option><option value="90">90s</option><option value="120">120s</option></select></label>
            <label>{copy.bpm}<input type="number" min="60" max="180" value={selection.bpm} disabled={running} onChange={(event) => select("bpm", event.target.value)} /></label>
          </div>
          <details className="ai-music-prompt"><summary>{copy.english}</summary><p>{buildEnglishMusicPrompt(selection)}</p></details>
          <small className="ai-music-model-note">{copy.first}</small>
          {running ? (
            <div className="ai-music-stage-progress">
              <div className="ai-music-stage-labels">
                <span className={setupProgress === 100 ? "is-complete" : "is-active"}><i>1</i>{copy.modelSetup}<small>{setupProgress === 100 ? copy.modelReady : setupRunning ? `${setupProgress}%` : ""}</small></span>
                <span className={generationStarted ? "is-active" : ""}><i>2</i>{copy.musicGeneration}<small>{generationStarted ? `${generationProgress}%` : copy.waitingToGenerate}</small></span>
              </div>
              <div className={`ai-music-progress ${streamingSetup ? "is-streaming" : ""}`}>
                <div><strong>{activeStageLabel}</strong><small>{activeStageStatus} · {activeStageProgress}%</small></div>
                <span><i style={{ width: `${activeStageProgress}%` }} /></span>
              </div>
            </div>
          ) : null}
          {music?.job?.error ? <p className="ai-music-error">{music.job.error}</p> : null}
          {music?.job?.state === "complete" ? <p className="ai-music-success">{copy.complete}</p> : null}
          <div className="ai-music-actions">
            {running ? <button type="button" className="secondary" onClick={music.cancel}>{copy.cancel}</button> : <button type="button" className="primary" onClick={() => music.generate(selection)}><MusicNote size={17} />{copy.generate}</button>}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AssetPreviewDialog({ asset, t, onClose }) {
  const mediaSrc = asset.type === "image" ? (asset.originalSrc || asset.src) : (asset.previewSrc || asset.src);
  const assetDisplayName = asset.nameKey ? t(asset.nameKey, asset.name) : asset.name;
  const assetMeta = asset.metaKey ? t(asset.metaKey, asset.meta) : asset.meta;
  const [videoDimensions, setVideoDimensions] = useState(() => ({
    width: Math.max(0, Number(asset.width) || 0),
    height: Math.max(0, Number(asset.height) || 0),
  }));
  const [audioPreviewStatus, setAudioPreviewStatus] = useState(asset.type === "audio" ? "loading" : "ready");
  const [audioPreviewProgress, setAudioPreviewProgress] = useState(0);
  const [audioPreviewSrc, setAudioPreviewSrc] = useState(asset.type === "audio" && !/^https?:/i.test(mediaSrc) ? mediaSrc : "");
  const audioFallbacksRef = useRef([]);
  const audioFallbackIndexRef = useRef(-1);
  const videoAspectRatio = videoDimensions.width > 0 && videoDimensions.height > 0
    ? videoDimensions.width / videoDimensions.height
    : 16 / 9;
  const tryNextAudioFallback = () => {
    const nextIndex = audioFallbackIndexRef.current + 1;
    const nextSrc = audioFallbacksRef.current[nextIndex];
    if (!nextSrc) {
      setAudioPreviewStatus("error");
      return;
    }
    audioFallbackIndexRef.current = nextIndex;
    setAudioPreviewStatus("loading");
    setAudioPreviewProgress(0.03);
    setAudioPreviewSrc(nextSrc);
  };
  useEffect(() => {
    if (asset.type !== "audio" || !/^https?:/i.test(mediaSrc)) return undefined;
    let canceled = false;
    let objectUrl = "";
    setAudioPreviewStatus("loading");
    setAudioPreviewProgress(0);
    setAudioPreviewSrc("");
    audioFallbacksRef.current = [];
    audioFallbackIndexRef.current = -1;
    try {
      const sourceUrl = new URL(mediaSrc);
      const trackId = sourceUrl.searchParams.get("trackid");
      if (trackId && sourceUrl.hostname.endsWith("storage.jamendo.com")) {
        audioFallbacksRef.current = ["mp31", "ogg", "mp32"].map((format) => {
          const fallbackUrl = new URL(sourceUrl);
          fallbackUrl.searchParams.set("format", format);
          return fallbackUrl.toString();
        });
      } else {
        audioFallbacksRef.current = [mediaSrc];
      }
    } catch {
      audioFallbacksRef.current = [mediaSrc];
    }
    getRemoteAssetBlob({ ...asset, src: mediaSrc }, (progress) => {
      if (!canceled) setAudioPreviewProgress(Math.min(0.96, Math.max(0.01, progress || 0)));
    }).then((blob) => {
      if (canceled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setAudioPreviewProgress(0.98);
      setAudioPreviewSrc(objectUrl);
    }).catch((error) => {
      console.warn("Music preview download failed", error);
      if (!canceled) tryNextAudioFallback();
    });
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, mediaSrc]);
  return (
    <div className="asset-preview-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="asset-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-preview-title">
        <header>
          <div>
            <span>{t("assetPreview", "素材预览")}</span>
            <strong id="asset-preview-title">{assetDisplayName}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label={t("closeAssetPreview", "关闭预览")}>
            <X size={20} />
          </button>
        </header>
        <div className={`asset-preview-media type-${asset.type} ${asset.kind === "vector" ? "is-vector" : ""}`}>
          {asset.type === "video" ? (
            <div
              className={`asset-preview-video-frame ${videoAspectRatio < 1 ? "is-portrait" : "is-landscape"}`}
              style={{ aspectRatio: `${videoAspectRatio}` }}
            >
              <video
                key={mediaSrc}
                src={mediaSrc}
                poster={asset.thumbnail}
                crossOrigin="anonymous"
                controls
                autoPlay
                playsInline
                onLoadedMetadata={(event) => {
                  const width = Math.max(0, Number(event.currentTarget.videoWidth) || 0);
                  const height = Math.max(0, Number(event.currentTarget.videoHeight) || 0);
                  if (width && height) setVideoDimensions({ width, height });
                }}
              />
            </div>
          ) : asset.type === "audio" ? (
            <div className="asset-preview-audio">
              <MusicNote size={58} weight="duotone" />
              <strong>{assetDisplayName}</strong>
              {audioPreviewStatus === "loading" ? (
                <div className="asset-preview-audio-loading" role="status" aria-live="polite">
                  <i style={{ "--audio-preview-progress": `${Math.round(audioPreviewProgress * 100)}%` }}>
                    <b>{Math.round(audioPreviewProgress * 100)}%</b>
                  </i>
                  <span>{t("audioPreviewLoading", "正在加载音乐预览…")}</span>
                </div>
              ) : null}
              {audioPreviewStatus === "error" ? (
                <div className="asset-preview-audio-error" role="alert">{t("audioPreviewFailed", "音乐预览加载失败，请稍后重试")}</div>
              ) : null}
              {audioPreviewSrc ? <audio
                className={audioPreviewStatus === "ready" ? "is-ready" : "is-waiting"}
                key={audioPreviewSrc}
                src={audioPreviewSrc}
                controls
                autoPlay
                preload="metadata"
                onLoadedMetadata={() => setAudioPreviewProgress((progress) => Math.max(progress, 0.99))}
                onCanPlay={() => { setAudioPreviewProgress(1); setAudioPreviewStatus("ready"); }}
                onError={tryNextAudioFallback}
              /> : null}
            </div>
          ) : (
            <img src={mediaSrc} alt={assetDisplayName} crossOrigin="anonymous" />
          )}
        </div>
        {assetMeta || asset.blob ? (
          <footer className="asset-preview-footer">
            {assetMeta ? <span>{assetMeta}</span> : <span />}
            {asset.blob ? (
              <button type="button" onClick={() => downloadMediaBlob(asset.blob, asset.name || "asset")}>
                <DownloadSimple size={14} />{t("download", "下载")}
              </button>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function LibraryLoadingGrid() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <div className="library-skeleton-card" key={index}>
          <div className="library-skeleton-thumb"><i /></div>
          <span /><small />
        </div>
      ))}
    </>
  );
}

function AssetRow({ asset, selected, t, downloadState }) {
  const [mediaLoaded, setMediaLoaded] = useState(asset.type === "audio");
  const [previewSrc, setPreviewSrc] = useState(asset.thumbnail || asset.src);
  useEffect(() => {
    setPreviewSrc(asset.thumbnail || asset.src);
    setMediaLoaded(asset.type === "audio");
  }, [asset.id, asset.src, asset.thumbnail, asset.type]);
  const handlePreviewError = () => {
    if (previewSrc !== asset.src) {
      setPreviewSrc(asset.src);
      return;
    }
    if (asset.originalSrc && previewSrc !== asset.originalSrc) {
      setPreviewSrc(asset.originalSrc);
      return;
    }
    setMediaLoaded(true);
  };
  return (
    <div className={`asset-card ${asset.kind === "vector" ? "is-vector" : ""} ${selected ? "is-selected" : ""}`}>
      <div className="asset-thumb">
        {!mediaLoaded ? <div className="asset-media-loading" aria-hidden="true"><i /></div> : null}
        {asset.type === "video" ? (
          asset.thumbnail ? <img src={previewSrc} alt="" crossOrigin="anonymous" draggable={false} onLoad={() => setMediaLoaded(true)} onError={handlePreviewError} /> : <video src={asset.src} crossOrigin="anonymous" muted playsInline preload="metadata" draggable={false} onLoadedData={() => setMediaLoaded(true)} onError={() => setMediaLoaded(true)} />
        ) : asset.type === "audio" ? (
          <div className="asset-audio-thumb">
            <MusicNote size={28} weight="duotone" />
          </div>
        ) : (
          <img src={previewSrc} alt="" crossOrigin="anonymous" draggable={false} onLoad={() => setMediaLoaded(true)} onError={handlePreviewError} />
        )}
        <span>
          {asset.type === "audio"
            ? t(asset.kind === "music" ? "libraryAudio" : "assetAudio")
            : asset.type === "video"
              ? t("assetVideo")
              : asset.kind === "vector"
                ? t("libraryVector", "矢量")
                : t("assetImage")}
        </span>
        {downloadState?.status === "loading" ? (
          <div className="asset-download-progress" aria-label={t("libraryPreparingAsset")}>
            <i style={{ "--asset-progress": `${Math.max(8, Math.round((downloadState.progress || 0) * 100))}%` }} />
          </div>
        ) : downloadState?.status === "ready" ? <i className="asset-ready-dot" title={t("libraryAssetReady")} /> : null}
        <span className="asset-preview-hover" aria-hidden="true">
          <PlayCircle size={30} weight="fill" />
          <em>{t("assetPreview", "素材预览")}</em>
        </span>
      </div>
      <div>
        <strong>{asset.nameKey ? t(asset.nameKey, asset.name) : asset.name}</strong>
        <span>{asset.metaKey ? t(asset.metaKey, asset.meta) : asset.meta}</span>
      </div>
    </div>
  );
}

export function ToolPanel(props) {
  const {
    activeTool,
    uiLanguage,
    script,
    updateScript,
    segments,
    currentSegmentIndex,
    captionSegments,
    captionTargetDuration,
    selectedCaptionSegment,
    selectedSegmentId,
    setSelectedSegmentId,
    setSelectedAudioSegmentId,
    setSelectedTrack,
    updateCaptionSegmentText,
    toggleCaptionSegmentHidden,
    deleteCaptionSegment,
    seekTo,
    estimatedDuration,
    captionPosition,
    setCaptionPosition,
    syncCaptionPositions,
    captionSize,
    setCaptionSize,
    captionStyle,
    setCaptionStyle,
    captionStylePresetId,
    setCaptionStylePresetId,
    captionStylePresets,
    setCaptionStylePresets,
    setCaptionSegments,
    captionsEnabled,
    setCaptionsEnabled,
    selectedFilterId,
    setSelectedFilterId,
    selectedVisualSegment,
    updateSelectedVisualEffects,
    selectedTransitionId,
    setSelectedTransitionId,
    selectedStickerId,
    setSelectedStickerId,
    handleStickerPointerDown,
    handleStickerClick,
    confirmStickerSelection,
    closeMobilePanel,
    mobilePanelOpen,
    audioBlob,
    audioDuration,
    sourceAudioBlob,
    sourceAudioName,
    sourceAudioDuration,
    sourceAudioVolume,
    sourceAudioLinked,
    setSourceAudioVolume,
    clearSourceAudioTrack,
    generateCaptionsFromSourceAudio,
    isGeneratingCaptions,
    automaticCaptionProgress,
    separateSourceVocals,
    selectedAudioToolTarget,
    separateSelectedAudioVocals,
    vocalSeparationJob,
    analyzeCurrentVisual,
    analyzeEffectVisual,
    openAvatarPanel,
    smartMode,
    setSmartMode,
    openMobileInspector,
    musicBlob,
    musicName,
    musicDuration,
    musicVolume,
    setMusicVolume,
    clearMusicTrack,
    selectedVoice,
    setVoiceTab,
    downloadBlob,
    notify,
    t,
    trOption,
    miganRepair,
    hdRestoration,
    smartDenoise,
    selectedEffectSegment,
    effectAnalysis,
    effectRunning,
    effectProgress,
    effectPhase,
    updateSelectedSubjectEffect,
    updateSelectedClickRipple,
    removeSelectedSubjectEffect,
    openEffectsInspector,
    openFaceSwapInspector,
    openOpticalFlowInspector,
    openCinematicDepthInspector,
    openPhotoParallaxInspector,
    openClickRippleInspector,
    cinematicDepth,
    photoParallaxDepth,
    effectsPanelMode,
  } = props;
  const [captionFontStatus, setCaptionFontStatus] = useState("");
  const [captionStyleMenuOpen, setCaptionStyleMenuOpen] = useState(false);
  const [captionEditTarget, setCaptionEditTarget] = useState("master");
  const captionFontOptions = useMemo(
    () => getCaptionFontsForLanguage(uiLanguage),
    [uiLanguage],
  );
  const editingCurrentCaption = captionEditTarget === "current" && Boolean(selectedCaptionSegment?.id);
  const effectiveCaptionStyle = editingCurrentCaption
    ? resolveCaptionStyleForSegment(captionStyle, selectedCaptionSegment)
    : captionStyle;
  const effectiveCaptionSize = editingCurrentCaption
    ? resolveCaptionSizeForSegment(captionSize, selectedCaptionSegment)
    : captionSize;
  const activeCaptionFontId = effectiveCaptionStyle?.fontId || "default";
  const visibleCaptionFontOptions = useMemo(() => {
    if (captionFontOptions.some((item) => item.id === activeCaptionFontId)) return captionFontOptions;
    return [captionFontOptions[0], getCaptionFont(activeCaptionFontId), ...captionFontOptions.slice(1)]
      .filter((item, index, items) => item && items.findIndex((candidate) => candidate.id === item.id) === index);
  }, [activeCaptionFontId, captionFontOptions]);
  useEffect(() => {
    let canceled = false;
    if (activeCaptionFontId === "default") {
      setCaptionFontStatus("");
      return undefined;
    }
    setCaptionFontStatus("loading");
    ensureCaptionFontLoaded(
      activeCaptionFontId,
      selectedCaptionSegment?.text || "",
    ).then(() => {
      if (!canceled) setCaptionFontStatus("ready");
    }).catch(() => {
      if (!canceled) setCaptionFontStatus("failed");
    });
    return () => {
      canceled = true;
    };
  }, [activeCaptionFontId, selectedCaptionSegment?.text]);
  const selectedCaptionFont = getCaptionFont(activeCaptionFontId);
  const updateCaptionStyleField = (key, value) => {
    if (editingCurrentCaption) {
      setCaptionSegments((items) => items.map((segment) => (
        segment.id === selectedCaptionSegment.id
          ? { ...segment, styleOverrides: { ...(segment.styleOverrides || {}), [key]: value } }
          : segment
      )));
      return;
    }
    setCaptionStylePresetId("modified");
    setCaptionStyle((style) => ({ ...style, [key]: value }));
    setCaptionSegments((items) => items.map((segment) => {
      const styleOverrides = { ...(segment.styleOverrides || {}) };
      delete styleOverrides[key];
      const next = { ...segment, styleOverrides };
      if (key === "fontId") delete next.fontId;
      if (!Object.keys(styleOverrides).length) delete next.styleOverrides;
      return next;
    }));
  };
  const selectCaptionFont = async (fontId) => {
    updateCaptionStyleField("fontId", fontId);
    if (fontId === "default") {
      setCaptionFontStatus("ready");
      return;
    }
    setCaptionFontStatus("loading");
    try {
      await ensureCaptionFontLoaded(
        fontId,
        selectedCaptionSegment?.text || "",
      );
      setCaptionFontStatus("ready");
    } catch {
      setCaptionFontStatus("failed");
    }
  };

  const applyCaptionStylePreset = (preset) => {
    if (!preset) return;
    if (editingCurrentCaption) {
      setCaptionSegments((items) => items.map((segment) => (
        segment.id === selectedCaptionSegment.id
          ? {
            ...segment,
            styleOverrides: {
              ...(segment.styleOverrides || {}),
              ...Object.fromEntries(CAPTION_VISUAL_STYLE_KEYS.map((key) => [key, preset.style?.[key] ?? captionStyle[key]])),
              captionSize: preset.captionSize,
            },
          }
          : segment
      )));
    } else {
      setCaptionStyle(applyCaptionPresetToStyle(captionStyle, preset));
      setCaptionSize(preset.captionSize);
      setCaptionStylePresetId(preset.id);
      setCaptionSegments((items) => items.map((segment) => {
        const { styleOverrides: _styleOverrides, fontId: _fontId, ...rest } = segment;
        return rest;
      }));
    }
    setCaptionStyleMenuOpen(false);
  };

  const saveCurrentCaptionStyle = () => {
    const name = window.prompt(t("captionStyleNamePrompt"), t("captionStyleUntitled"));
    if (!name?.trim()) return;
    const preset = buildCaptionPresetSnapshot(name.trim(), effectiveCaptionStyle, effectiveCaptionSize);
    setCaptionStylePresets((items) => [...items, preset]);
    if (!editingCurrentCaption) setCaptionStylePresetId(preset.id);
    setCaptionStyleMenuOpen(false);
  };

  const selectedCaptionStylePreset = getCaptionStylePreset(captionStylePresetId)
    || captionStylePresets.find((preset) => preset.id === captionStylePresetId)
    || null;

  if (activeTool === "caption") {
    const currentPosition = editingCurrentCaption && selectedCaptionSegment?.placement
      ? ["top", "middle", "bottom"].find((position) => (
        Math.abs(Number(selectedCaptionSegment.placement.y) - ({ top: 18, middle: 50, bottom: 78 }[position])) < 4
      )) || "custom"
      : captionPosition;
    const presetLabel = selectedCaptionStylePreset
      ? (selectedCaptionStylePreset.labelKey ? t(selectedCaptionStylePreset.labelKey) : selectedCaptionStylePreset.name)
      : t("captionStyleModified");
    return (
      <div className="tool-panel caption-tool-panel">
        <div className="caption-tool-heading">
          <div><h2>{t("captionStyle")}</h2><p>{t("captionStyleSystemHint")}</p></div>
          <label className="caption-visibility-toggle"><input type="checkbox" checked={captionsEnabled} onChange={(event) => setCaptionsEnabled(event.target.checked)} /><span>{t("showCaptions")}</span></label>
        </div>
        <div className="caption-style-library">
          <button className="caption-style-library-trigger" type="button" aria-expanded={captionStyleMenuOpen} onClick={() => setCaptionStyleMenuOpen((open) => !open)}>
            <span><small>{t("captionDefaultStyle")}</small><strong>{presetLabel}</strong></span><CaretDown size={16} weight="bold" />
          </button>
          <button className="caption-style-edit-button" type="button" onClick={() => setCaptionEditTarget("master")}>{t("captionEditStyle")}</button>
          {captionStyleMenuOpen ? <div className="caption-style-library-menu">
            <div className="caption-style-library-section">
              <span>{t("captionProjectStyles")}</span>
              <button type="button" onClick={() => { setCaptionEditTarget("master"); setCaptionStyleMenuOpen(false); }}><i className="caption-style-sample is-classic">Aa</i><strong>{t("captionDefaultStyle")}</strong>{captionEditTarget === "master" ? <Check size={15} weight="bold" /> : null}</button>
              {captionStylePresets.map((preset) => <button type="button" key={preset.id} onClick={() => applyCaptionStylePreset(preset)}><i className="caption-style-sample is-custom">Aa</i><strong>{preset.name}</strong>{captionStylePresetId === preset.id && !editingCurrentCaption ? <Check size={15} weight="bold" /> : null}</button>)}
            </div>
            <div className="caption-style-library-section">
              <span>{t("captionBuiltInPresets")}</span>
              {BUILTIN_CAPTION_STYLE_PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => applyCaptionStylePreset(preset)}><i className={`caption-style-sample ${preset.sampleClass}`}>Aa</i><strong>{t(preset.labelKey)}</strong>{captionStylePresetId === preset.id && !editingCurrentCaption ? <Check size={15} weight="bold" /> : null}</button>)}
            </div>
            <button className="caption-style-save-row" type="button" onClick={saveCurrentCaptionStyle}><Plus size={15} weight="bold" />{t("captionSaveAsStyle")}</button>
          </div> : null}
        </div>
        <div className="caption-edit-target" role="tablist" aria-label={t("captionEditTarget")}>
          <button type="button" className={captionEditTarget === "master" ? "is-active" : ""} onClick={() => setCaptionEditTarget("master")}>{t("captionDefaultStyleTab")}</button>
          <button type="button" disabled={!selectedCaptionSegment} className={editingCurrentCaption ? "is-active" : ""} onClick={() => setCaptionEditTarget("current")}>{t("captionCurrentCaption")}</button>
        </div>
        <div className={`caption-edit-scope-note ${editingCurrentCaption ? "is-current" : "is-master"}`}><Diamond size={14} weight={editingCurrentCaption ? "fill" : "duotone"} /><span>{editingCurrentCaption ? t("captionEditingCurrentHint") : t("captionEditingMasterHint").replace("{count}", captionSegments.length)}</span></div>
        <div className="caption-position-heading">
          <span className="caption-field-title">{t("captionPositionLabel")}</span>
          <button
            type="button"
            disabled={!selectedCaptionSegment}
            onClick={() => {
              syncCaptionPositions(selectedCaptionSegment?.id);
              setCaptionEditTarget("master");
            }}
          >
            <ArrowsClockwise size={13} weight="bold" />
            {t("captionSyncPosition")}
          </button>
        </div>
        <div className="segmented caption-position-segmented">
          {["top", "middle", "bottom"].map((position) => (
            <button
              className={currentPosition === position ? "is-active" : ""}
              type="button"
              key={position}
              onClick={() => setCaptionPosition(position, editingCurrentCaption ? selectedCaptionSegment?.id : "")}
            >
              {position === "top" ? t("top") : position === "middle" ? t("middle") : t("bottom")}
            </button>
          ))}
        </div>
        {currentPosition === "custom" ? <small className="caption-custom-position-note">{t("captionCustomPosition")}</small> : null}
        <div className={`caption-font-field ${captionFontStatus === "loading" ? "is-loading" : ""}`} aria-busy={captionFontStatus === "loading"}>
          <div className="caption-style-heading">
            <strong>{t("captionFont")}</strong>
            <span>{t("captionFontHint")}</span>
          </div>
          <div className="caption-font-select-wrap">
            <select
              aria-label={t("captionFont")}
              aria-describedby="caption-font-load-status"
              value={activeCaptionFontId}
              onChange={(event) => selectCaptionFont(event.target.value)}
            >
              {visibleCaptionFontOptions.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.id === "default" ? t("captionFontDefault") : item.label}
                </option>
              ))}
            </select>
            <span className="caption-font-select-indicator" aria-hidden="true">
              {captionFontStatus === "loading"
                ? <i className="caption-font-select-loading" />
                : <CaretDown size={15} weight="bold" />}
            </span>
          </div>
          <div
            className="caption-font-preview"
            style={{
              fontFamily: selectedCaptionFont.family
                ? `"${selectedCaptionFont.family}", ${selectedCaptionFont.fallback}`
                : selectedCaptionFont.fallback,
              fontWeight: selectedCaptionFont.weight,
            }}
          >
            {selectedCaptionFont.sample}
          </div>
          {captionFontStatus ? (
            <small id="caption-font-load-status" className={`caption-font-status is-${captionFontStatus}`} aria-live="polite">
              {t(`captionFont${captionFontStatus[0].toUpperCase()}${captionFontStatus.slice(1)}`)}
            </small>
          ) : null}
        </div>
        <div className="slider-field compact-slider">
          <div>
            <label htmlFor="caption-size">{t("fontSize")}</label>
            <span>{effectiveCaptionSize}px</span>
          </div>
          <input
            id="caption-size"
            type="range"
            min="12"
            max="42"
            step="1"
            value={effectiveCaptionSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (editingCurrentCaption) updateCaptionStyleField("captionSize", value);
              else {
                setCaptionStylePresetId("modified");
                setCaptionSize(value);
                setCaptionSegments((items) => items.map((segment) => {
                  const styleOverrides = { ...(segment.styleOverrides || {}) };
                  delete styleOverrides.captionSize;
                  const next = { ...segment, styleOverrides };
                  if (!Object.keys(styleOverrides).length) delete next.styleOverrides;
                  return next;
                }));
              }
            }}
          />
        </div>
        <div className="caption-style-panel">
          <div className="caption-color-row">
            <label>{t("captionTextColor")}<input type="color" value={effectiveCaptionStyle.textColor} onChange={(event) => updateCaptionStyleField("textColor", event.target.value)} /></label>
            <label>{t("captionBackground")}<input type="color" value={effectiveCaptionStyle.backgroundColor} onChange={(event) => updateCaptionStyleField("backgroundColor", event.target.value)} /></label>
            <label>{t("captionBorderColor")}<input type="color" value={effectiveCaptionStyle.borderColor} onChange={(event) => updateCaptionStyleField("borderColor", event.target.value)} /></label>
          </div>
          {[["backgroundOpacity", t("captionOpacity"), 0, 1, 0.05, "%"], ["textStrokeWidth", t("captionOutlineWidth"), 0, 6, 1, "px"], ["borderWidth", t("captionBorderWidth"), 0, 8, 1, "px"], ["radius", t("captionRadius"), 0, 28, 1, "px"], ["paddingX", t("captionPaddingX"), 0, 52, 1, "px"], ["paddingY", t("captionPaddingY"), 0, 32, 1, "px"], ["shadowOpacity", t("captionShadow"), 0, 1, 0.05, "%"]].map(([key, label, min, max, step, unit]) => (
            <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span>{unit === "%" ? `${Math.round(effectiveCaptionStyle[key] * 100)}%` : `${effectiveCaptionStyle[key]}${unit}`}</span></div><input type="range" min={min} max={max} step={step} value={effectiveCaptionStyle[key]} onChange={(event) => updateCaptionStyleField(key, Number(event.target.value))} /></div>
          ))}
          <button className="caption-save-style-button" type="button" onClick={saveCurrentCaptionStyle}><Plus size={15} weight="bold" />{t("captionSaveAsStyle")}</button>
        </div>
      </div>
    );
  }

  if (activeTool === "smart") {
    const aiCopy = AI_MUSIC_COPY[uiLanguage] || AI_MUSIC_COPY.en;
    return (
      <div className="tool-panel smart-hub-panel">
        <div className="smart-hub-grid" role="tablist" aria-label={t("smartTools")}>
          {[
            ["auto-edit", Scissors, t("smartAutoEdit"), t("smartAutoEditHint")],
            ["ai-music", MusicNote, aiCopy.title, aiCopy.hint],
            ["smart-frame", FrameCorners, t("smartFrame"), t("smartFrameHint")],
            ["avatar", PersonSimpleRun, t("smartAvatar"), t("smartAvatarHint")],
          ].map(([id, Icon, title, hint]) => (
            <button className={smartMode === id ? "is-active" : ""} type="button" role="tab" aria-selected={smartMode === id} key={id} onClick={() => {
              setSmartMode(id);
              if (id === "avatar") openAvatarPanel();
              if (id === "ai-music" && window.matchMedia?.("(max-width: 760px)").matches) openMobileInspector?.();
            }}>
              <Icon size={24} weight="duotone" /><strong>{title}</strong><span>{hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeTool === "audio") {
    return (
      <div className="tool-panel audio-tool-panel mobile-panel-scroll-body">
        <h2>{t("audioPanel")}</h2>
        <button
          className="audio-entry-card"
          type="button"
          onClick={() => {
            setSelectedAudioSegmentId?.("");
            setSelectedTrack?.("");
            setVoiceTab("synthesis");
            notify("已打开 AI 配音");
          }}
        >
          <MicrophoneStage size={24} weight="duotone" />
          <span>
            <strong>{t("aiVoiceEntryTitle")}</strong>
            <em>{t("aiVoiceEntryDesc")}</em>
          </span>
        </button>
        <button
          className="audio-entry-card separation-entry-card"
          type="button"
          disabled={!selectedAudioToolTarget || vocalSeparationJob.running}
          onClick={separateSelectedAudioVocals || separateSourceVocals}
        >
          <Waveform size={24} weight="duotone" />
          <span>
            <strong>{vocalSeparationJob.running ? t("vocalSeparationRunning") : t("vocalSeparationTitle")}</strong>
            <em>{selectedAudioToolTarget ? (vocalSeparationJob.phase || t("vocalSeparationDesc")) : t("vocalSeparationNeedsSource")}</em>
          </span>
          {vocalSeparationJob.running ? <span className="inline-progress" aria-hidden="true"><span style={{ width: `${vocalSeparationJob.progress}%` }} /></span> : null}
        </button>
        <button
          className="audio-entry-card caption-entry-card"
          type="button"
          disabled={!selectedAudioToolTarget || isGeneratingCaptions}
          onClick={() => selectedAudioToolTarget && generateCaptionsFromSourceAudio({
            blob: selectedAudioToolTarget.blob,
            start: selectedAudioToolTarget.start,
            sourceStart: selectedAudioToolTarget.sourceStart,
            duration: selectedAudioToolTarget.duration,
            append: selectedAudioToolTarget.track !== "source",
          })}
        >
          <ClosedCaptioning size={24} weight="duotone" />
          <span>
            <strong>{isGeneratingCaptions ? t("autoCaptionsRunning") : t("autoCaptionsTitle")}</strong>
            <em>{selectedAudioToolTarget ? t("autoCaptionsDesc") : t("autoCaptionsNeedsSource")}</em>
          </span>
          {isGeneratingCaptions ? (
            <span className="inline-progress" aria-hidden="true">
              <span style={{ width: `${automaticCaptionProgress}%` }} />
            </span>
          ) : null}
        </button>
        <div className="metric-list">
          <div>
            <span>{t("currentVoice")}</span>
            <strong>{selectedVoice.name}</strong>
          </div>
          <div>
            <span>{t("voiceDuration")}</span>
            <strong>{formatTime(audioBlob ? audioDuration : 0)}</strong>
          </div>
          <div>
            <span>{t("sourceAudio")}</span>
            <strong>{sourceAudioBlob ? sourceAudioName : t("notSeparated")}</strong>
          </div>
          <div>
            <span>{t("sourceDuration")}</span>
            <strong>{formatTime(sourceAudioBlob ? sourceAudioDuration : 0)}</strong>
          </div>
          <div>
            <span>{t("bgm")}</span>
            <strong>{musicBlob ? musicName : t("notAdded")}</strong>
          </div>
          <div>
            <span>{t("musicDuration")}</span>
            <strong>{formatTime(musicBlob ? musicDuration : 0)}</strong>
          </div>
        </div>
        <div className="slider-field compact-slider">
          <div>
            <label htmlFor="source-audio-volume">{t("sourceAudio")} {t("volume")}</label>
            <span>{Math.round(sourceAudioVolume * 100)}%</span>
          </div>
          <input
            id="source-audio-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sourceAudioVolume}
            disabled={!sourceAudioBlob}
            onInput={(event) => setSourceAudioVolume(Number(event.currentTarget.value))}
            onChange={(event) => setSourceAudioVolume(Number(event.target.value))}
          />
        </div>
        <div className="slider-field compact-slider">
          <div>
            <label htmlFor="music-volume">{t("bgm")} {t("volume")}</label>
            <span>{Math.round(musicVolume * 100)}%</span>
          </div>
          <input
            id="music-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={musicVolume}
            onInput={(event) => setMusicVolume(Number(event.currentTarget.value))}
            onChange={(event) => setMusicVolume(Number(event.target.value))}
          />
        </div>
        <div className="audio-download-actions">
          <button
            className="panel-primary"
            type="button"
            disabled={!audioBlob}
            onClick={() => audioBlob && downloadBlob(audioBlob, "ai-voiceover.wav")}
          >
            {t("downloadCurrentWav")}
          </button>
          <button
            className="panel-secondary"
            type="button"
            disabled={!musicBlob}
            onClick={() => musicBlob && downloadBlob(musicBlob, musicName || "background-music.wav")}
          >
            {t("downloadBgm")}
          </button>
          <button
            className="panel-secondary"
            type="button"
            disabled={!sourceAudioBlob}
            onClick={() => sourceAudioBlob && downloadBlob(sourceAudioBlob, sourceAudioName || "source-audio.wav")}
          >
            {t("downloadSource")}
          </button>
        </div>
        <div className="audio-delete-actions">
          <button className="panel-secondary is-danger" type="button" disabled={!sourceAudioBlob} onClick={() => clearSourceAudioTrack()}>
            {t("deleteSource")}
          </button>
          <button className="panel-secondary is-danger" type="button" disabled={!musicBlob} onClick={() => clearMusicTrack()}>
            {t("deleteBgm")}
          </button>
        </div>
      </div>
    );
  }

  if (activeTool === "stickers") {
    return (
      <StickerPanel
        title={t("stickers")}
        options={STICKERS}
        selectedId={selectedStickerId}
        trOption={trOption}
        t={t}
        onStickerPointerDown={handleStickerPointerDown}
        onStickerClick={handleStickerClick}
        onStickerConfirm={confirmStickerSelection}
        closeMobilePanel={closeMobilePanel}
        mobilePanelOpen={mobilePanelOpen}
        onSelect={(id) => {
          setSelectedStickerId(id);
          notify(t("stickerApplied"));
        }}
      />
    );
  }

  if (activeTool === "effects") {
    return (
      <SubjectEffectsWorkspace
        t={t}
        segment={selectedEffectSegment}
        analysis={effectAnalysis}
        running={effectRunning}
        progress={effectProgress}
        phase={effectPhase}
        onChange={updateSelectedSubjectEffect}
        onChangeClickRipple={updateSelectedClickRipple}
        onAnalyze={analyzeEffectVisual || analyzeCurrentVisual}
        onOpenInspector={openEffectsInspector}
        onOpenFaceSwap={openFaceSwapInspector}
        onOpenOpticalFlow={openOpticalFlowInspector}
        onOpenCinematicDepth={openCinematicDepthInspector}
        onOpenPhotoParallax={openPhotoParallaxInspector}
        onOpenClickRipple={openClickRippleInspector}
        faceSwapActive={effectsPanelMode === "face-swap"}
        opticalFlowActive={effectsPanelMode === "vector-tracking"}
        cinematicDepthActive={effectsPanelMode === "cinematic-depth"}
        cinematicDepthAnalysis={cinematicDepth?.record}
        cinematicDepthRunning={cinematicDepth?.job?.running}
        cinematicDepthProgress={cinematicDepth?.job?.progress}
        photoParallaxActive={effectsPanelMode === "photo-parallax"}
        photoParallaxAnalysis={photoParallaxDepth?.record}
        photoParallaxRunning={photoParallaxDepth?.job?.running}
        photoParallaxProgress={photoParallaxDepth?.job?.progress}
        onRemove={removeSelectedSubjectEffect}
      />
    );
  }

  return (
    <VisualChoicePanel
      title={t("filters")}
      kind="effect"
      options={FILTER_OPTIONS}
      selectedId={selectedVisualSegment?.filterId ?? selectedFilterId}
      trOption={trOption}
      onSelect={(id) => {
        setSelectedFilterId(id);
        updateSelectedVisualEffects?.({ filterId: id });
        notify(t("filterApplied"));
      }}
    />
  );
}

function ColorGradeKeyframeButton({ path, label, keyframes, localTime, value, onChange, t }) {
  const keyed = hasVisualPropertyKeyframe(keyframes, localTime, path);
  return <button
    className={`color-grade-keyframe-button ${keyed ? "is-active" : ""}`}
    type="button"
    aria-label={`${keyed ? t("visualRemovePropertyKeyframe") : t("visualAddPropertyKeyframe")} · ${label}`}
    onClick={() => keyed
      ? onChange?.({ removePropertyKeyframe: { time: localTime, key: path } })
      : onChange?.({ propertyKeyframe: { time: localTime, key: path, value } })}
  ><Diamond size={10} weight={keyed ? "fill" : "regular"} /></button>;
}

function ColorGradeWheel({ label, value, keyframePrefix, keyframes, localTime, onChange, onReset, onKeyframeChange, t }) {
  const wheel = value || DEFAULT_COLOR_GRADE.shadows;
  const radians = (270 - (wheel.hue || 0)) * Math.PI / 180;
  const radius = Math.max(0, Math.min(100, wheel.saturation || 0)) * 0.42;
  const markerStyle = {
    left: `calc(50% + ${Math.cos(radians) * radius}%)`,
    top: `calc(50% + ${Math.sin(radians) * radius}%)`,
    "--marker-color": wheel.saturation > 0 ? `hsl(${wheel.hue} 82% 60%)` : "#dce7e8",
  };
  const updateFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const maxRadius = Math.max(1, Math.min(rect.width, rect.height) * 0.44);
    onChange({
      ...wheel,
      hue: (270 - Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360,
      saturation: Math.min(100, Math.hypot(dx, dy) / maxRadius * 100),
    });
  };
  const onPointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event);
  };
  const onPointerMove = (event) => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    updateFromPointer(event);
  };
  const onKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      onChange({ ...wheel, hue: (wheel.hue + (event.key === "ArrowRight" ? 3 : -3) + 360) % 360 });
      return;
    }
    onChange({ ...wheel, saturation: Math.max(0, Math.min(100, wheel.saturation + (event.key === "ArrowUp" ? 2 : -2))) });
  };
  const updateLuminanceFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    onChange({ ...wheel, luminance: Math.round(100 - position * 200) });
  };
  const onLuminancePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateLuminanceFromPointer(event);
  };
  const onLuminancePointerMove = (event) => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    updateLuminanceFromPointer(event);
  };
  const onLuminanceKeyDown = (event) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    onChange({ ...wheel, luminance: Math.max(-100, Math.min(100, wheel.luminance + (event.key === "ArrowUp" ? 2 : -2))) });
  };
  return (
    <section className="color-grade-wheel-card">
      <div className="color-grade-wheel-heading"><strong>{label}</strong><button type="button" aria-label={`${label} · ${t("colorGradeResetWheel")}`} onClick={onReset}><ArrowCounterClockwise size={13} weight="bold" /></button></div>
      <div className="color-grade-wheel-control">
        <div
          className="color-grade-wheel"
          role="slider"
          tabIndex="0"
          aria-label={label}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(wheel.saturation)}
          aria-valuetext={`${t("colorGradeHue")} ${Math.round(wheel.hue)}°, ${t("colorGradeStrength")} ${Math.round(wheel.saturation)}%`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
        ><span className="color-grade-wheel-marker" style={markerStyle} /></div>
        <div
          className="color-grade-luminance-arc"
          role="slider"
          tabIndex="0"
          aria-label={`${label} · ${t("colorGradeLuminance")}`}
          aria-valuemin="-100"
          aria-valuemax="100"
          aria-valuenow={Math.round(wheel.luminance)}
          onPointerDown={onLuminancePointerDown}
          onPointerMove={onLuminancePointerMove}
          onKeyDown={onLuminanceKeyDown}
        >
          <svg viewBox="0 0 22 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="color-grade-luminance-track" pathLength="100" d="M 4 3 C 17 29, 17 71, 4 97" />
            <path className="color-grade-luminance-fill" pathLength="100" d="M 4 3 C 17 29, 17 71, 4 97" style={{ strokeDasharray: `${Math.max(0, Math.min(100, (wheel.luminance + 100) / 2))} 100` }} />
          </svg>
        </div>
      </div>
      <div className="color-grade-wheel-values">
        {[["hue", `H ${Math.round(wheel.hue)}°`, wheel.hue], ["saturation", `S ${Math.round(wheel.saturation)}%`, wheel.saturation], ["luminance", `L ${Math.round(wheel.luminance)}`, wheel.luminance]].map(([field, text, fieldValue]) => <span key={field}>{text}<ColorGradeKeyframeButton path={`${keyframePrefix}.${field}`} label={`${label} · ${field}`} keyframes={keyframes} localTime={localTime} value={fieldValue} onChange={onKeyframeChange} t={t} /></span>)}
      </div>
    </section>
  );
}

function ColorWheelsPanel({ t, value, keyframes = [], localTime = 0, onChange }) {
  const baseGrade = normalizeColorGrade(value);
  const grade = resolveColorGrade(keyframes, localTime, baseGrade);
  const updateBasic = (key, nextValue) => {
    const path = `colorGrade.${key}`;
    if (hasVisualPropertyKeyframe(keyframes, localTime, path)) onChange?.({ propertyKeyframe: { time: localTime, key: path, value: nextValue } });
    else onChange?.({ colorGrade: normalizeColorGrade({ ...baseGrade, [key]: nextValue }) });
  };
  const updateWheel = (key, wheel) => {
    const changedFields = ["hue", "saturation", "luminance"].filter((field) => Math.abs(Number(wheel[field]) - Number(grade[key][field])) > 0.0001);
    if (!changedFields.length) return;
    const nextBaseWheel = { ...baseGrade[key] };
    let baseChanged = false;
    changedFields.forEach((field) => {
      const path = `colorGrade.${key}.${field}`;
      if (hasVisualPropertyKeyframe(keyframes, localTime, path)) onChange?.({ propertyKeyframe: { time: localTime, key: path, value: wheel[field] } });
      else { nextBaseWheel[field] = wheel[field]; baseChanged = true; }
    });
    if (baseChanged) onChange?.({ colorGrade: normalizeColorGrade({ ...baseGrade, [key]: nextBaseWheel }) });
  };
  const addAllColorKeyframes = () => COLOR_GRADE_KEYFRAME_KEYS.forEach((key) => onChange?.({ propertyKeyframe: { time: localTime, key, value: getColorGradeProperty(grade, key) } }));
  return (
    <section className="visual-editor-card color-grade-card">
      <div className="visual-editor-heading"><span><Palette size={16} weight="duotone" />{t("colorGradeTitle")}</span><button className="color-grade-reset-all" type="button" onClick={() => onChange?.({ colorGrade: DEFAULT_COLOR_GRADE })}>{t("colorGradeResetAll")}</button></div>
      <p className="color-grade-hint">{t("colorGradeHint")}</p>
      <div className="color-grade-keyframe-summary"><span><Diamond size={12} weight="fill" />{localTime.toFixed(2)}s · {keyframes.filter((frame) => COLOR_GRADE_KEYFRAME_KEYS.some((key) => key in frame)).length} {t("visualFrames")}</span><button type="button" onClick={addAllColorKeyframes}>{t("visualAddAllKeyframes")}</button></div>
      <div className="color-grade-basics">
        {[["temperature", t("colorGradeTemperature")], ["tint", t("colorGradeTint")], ["saturation", t("colorGradeSaturation")]].map(([key, label]) => <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span className="color-grade-basic-value">{Math.round(grade[key])}<ColorGradeKeyframeButton path={`colorGrade.${key}`} label={label} keyframes={keyframes} localTime={localTime} value={grade[key]} onChange={onChange} t={t} /></span></div><input aria-label={label} type="range" min="-100" max="100" value={grade[key]} onChange={(event) => updateBasic(key, Number(event.target.value))} /></div>)}
      </div>
      <div className="color-grade-wheel-grid">
        {[["shadows", t("colorGradeShadows")], ["midtones", t("colorGradeMidtones")], ["highlights", t("colorGradeHighlights")], ["offset", t("colorGradeOffset")]].map(([key, label]) => <ColorGradeWheel key={key} label={label} value={grade[key]} keyframePrefix={`colorGrade.${key}`} keyframes={keyframes} localTime={localTime} onKeyframeChange={onChange} t={t} onChange={(wheel) => updateWheel(key, wheel)} onReset={() => updateWheel(key, DEFAULT_COLOR_GRADE[key])} />)}
      </div>
    </section>
  );
}

function getSegmentFilterPreview(segment) {
  if (!segment) return "";
  if (segment.type === "video") {
    const firstFrame = Array.isArray(segment.trackFrames) ? segment.trackFrames[0] : null;
    return (typeof firstFrame === "string" ? firstFrame : firstFrame?.src) || segment.thumbnail || "";
  }
  return segment.src || segment.thumbnail || "";
}

const SPEED_GRAPH = Object.freeze({ width: 340, height: 198, left: 34, right: 10, top: 14, bottom: 27 });

function speedGraphPoint(progress, rate) {
  const width = SPEED_GRAPH.width - SPEED_GRAPH.left - SPEED_GRAPH.right;
  const height = SPEED_GRAPH.height - SPEED_GRAPH.top - SPEED_GRAPH.bottom;
  return {
    x: SPEED_GRAPH.left + Math.max(0, Math.min(1, progress)) * width,
    y: SPEED_GRAPH.top + ((2 - Math.log2(Math.max(0.25, Math.min(4, rate)))) / 4) * height,
  };
}

function speedGraphValue(clientX, clientY, rect) {
  const x = (clientX - rect.left) / Math.max(1, rect.width) * SPEED_GRAPH.width;
  const y = (clientY - rect.top) / Math.max(1, rect.height) * SPEED_GRAPH.height;
  const width = SPEED_GRAPH.width - SPEED_GRAPH.left - SPEED_GRAPH.right;
  const height = SPEED_GRAPH.height - SPEED_GRAPH.top - SPEED_GRAPH.bottom;
  const progress = Math.max(0, Math.min(1, (x - SPEED_GRAPH.left) / width));
  const rate = Math.max(0.25, Math.min(4, 2 ** (2 - ((y - SPEED_GRAPH.top) / height) * 4)));
  return { progress, rate };
}

function buildSpeedCurvePath(curve) {
  return Array.from({ length: 81 }, (_, index) => {
    const progress = index / 80;
    const point = speedGraphPoint(progress, getVisualSpeedCurveRateAtProgress(curve, progress));
    return `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

function SpeedStageSparkline({ startRate, endRate, smooth }) {
  const startY = Math.max(5, Math.min(27, 24 - Math.log2(startRate) * 6));
  const endY = Math.max(5, Math.min(27, 24 - Math.log2(endRate) * 6));
  const delta = endRate - startRate;
  const trend = Math.abs(delta) < 0.08 ? "steady" : delta > 0 ? "faster" : "slower";
  const curvePath = smooth
    ? `M4 ${startY.toFixed(1)} C21 ${startY.toFixed(1)} 43 ${endY.toFixed(1)} 60 ${endY.toFixed(1)}`
    : `M4 ${startY.toFixed(1)} L60 ${endY.toFixed(1)}`;
  return (
    <svg className={`visual-speed-stage-spark is-${trend}`} viewBox="0 0 64 32" aria-hidden="true">
      <line x1="4" x2="60" y1="27.5" y2="27.5" />
      <path className="visual-speed-stage-area" d={`${curvePath} L60 28 L4 28 Z`} />
      <path className="visual-speed-stage-line" d={curvePath} />
      <circle cx="4" cy={startY} r="1.8" />
      <circle cx="60" cy={endY} r="2.4" />
    </svg>
  );
}

function VisualSpeedCurvePanel({ t, segment, localTime, onChange }) {
  const graphRef = useRef(null);
  const curve = normalizeVisualSpeedCurve(segment?.speedCurve);
  const [selectedNodeId, setSelectedNodeId] = useState(curve.points[1]?.id || curve.points[0]?.id || "");
  const dragNodeRef = useRef("");
  const clipProgress = Math.max(0, Math.min(1, Number(localTime) / Math.max(0.001, Number(segment?.duration) || 0.001)));
  const selectedIndex = Math.max(0, curve.points.findIndex((point) => point.id === selectedNodeId));
  const selectedPoint = curve.points[selectedIndex] || curve.points[0];
  const playhead = speedGraphPoint(clipProgress, 1);
  const commit = (nextCurve) => onChange?.({ speedCurve: { ...normalizeVisualSpeedCurve(nextCurve), enabled: true } });
  const updatePoint = (index, patch) => {
    const points = curve.points.map((point, pointIndex) => pointIndex === index ? { ...point, ...patch } : point);
    if (index > 0 && index < points.length - 1) {
      points[index].progress = Math.max(points[index - 1].progress + 0.025, Math.min(points[index + 1].progress - 0.025, points[index].progress));
    } else points[index].progress = index === 0 ? 0 : 1;
    commit({ ...curve, points });
  };
  const addStageAt = (progress, rate) => {
    if (curve.points.length >= 8) return;
    const id = `speed-${Date.now().toString(36)}`;
    const points = [...curve.points, { id, progress, rate }].sort((left, right) => left.progress - right.progress);
    setSelectedNodeId(id);
    commit({ ...curve, points });
  };
  const addWidestStage = () => {
    const interval = curve.points.slice(0, -1).reduce((best, point, index) => {
      const width = curve.points[index + 1].progress - point.progress;
      return width > best.width ? { index, width } : best;
    }, { index: 0, width: 0 });
    const left = curve.points[interval.index];
    const right = curve.points[interval.index + 1];
    addStageAt((left.progress + right.progress) / 2, (left.rate + right.rate) / 2);
  };
  const moveDraggedNode = (event) => {
    if (!dragNodeRef.current || !graphRef.current) return;
    const index = curve.points.findIndex((point) => point.id === dragNodeRef.current);
    if (index < 0) return;
    const value = speedGraphValue(event.clientX, event.clientY, graphRef.current.getBoundingClientRect());
    updatePoint(index, value);
  };
  const resetCurve = () => {
    setSelectedNodeId("speed-1");
    commit({ enabled: true, smooth: true, points: DEFAULT_VISUAL_SPEED_CURVE_POINTS });
  };
  return (
    <section className="visual-editor-card visual-speed-curve-card">
      <div className="visual-editor-heading">
        <strong>{t("visualSpeedCurveTitle")}</strong>
        <button className="visual-speed-curve-reset" type="button" onClick={resetCurve}><ArrowCounterClockwise size={13} />{t("reset")}</button>
      </div>
      <div className="visual-speed-curve-readout"><strong>{Math.round(selectedPoint.progress * 100)}%</strong><span>· {selectedPoint.rate.toFixed(2)}×</span></div>
      <svg
        ref={graphRef}
        className="visual-speed-curve-graph"
        viewBox={`0 0 ${SPEED_GRAPH.width} ${SPEED_GRAPH.height}`}
        role="img"
        aria-label={t("visualSpeedCurveTitle")}
        onPointerMove={moveDraggedNode}
        onPointerUp={(event) => { dragNodeRef.current = ""; event.currentTarget.releasePointerCapture?.(event.pointerId); }}
        onPointerCancel={() => { dragNodeRef.current = ""; }}
        onDoubleClick={(event) => {
          const value = speedGraphValue(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
          addStageAt(value.progress, value.rate);
        }}
      >
        {[4, 2, 1, 0.5, 0.25].map((rate) => {
          const point = speedGraphPoint(0, rate);
          return <g key={rate}><line className="speed-grid-line" x1={SPEED_GRAPH.left} x2={SPEED_GRAPH.width - SPEED_GRAPH.right} y1={point.y} y2={point.y} /><text x="2" y={point.y + 4}>{rate}×</text></g>;
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((progress) => {
          const point = speedGraphPoint(progress, 1);
          return <g key={progress}><line className="speed-grid-line" x1={point.x} x2={point.x} y1={SPEED_GRAPH.top} y2={SPEED_GRAPH.height - SPEED_GRAPH.bottom} /><text className="speed-x-label" x={point.x} y={SPEED_GRAPH.height - 5}>{Math.round(progress * 100)}%</text></g>;
        })}
        <line className="speed-playhead" x1={playhead.x} x2={playhead.x} y1={SPEED_GRAPH.top} y2={SPEED_GRAPH.height - SPEED_GRAPH.bottom} />
        <path className="speed-curve-path" d={buildSpeedCurvePath(curve)} />
        {curve.points.map((point, index) => {
          const graphPoint = speedGraphPoint(point.progress, point.rate);
          const selected = point.id === selectedNodeId;
          return <circle
            key={point.id}
            className={`speed-curve-node ${selected ? "is-selected" : ""}`}
            cx={graphPoint.x}
            cy={graphPoint.y}
            r={selected ? 7 : 5}
            tabIndex="0"
            aria-label={`${Math.round(point.progress * 100)}% · ${point.rate.toFixed(2)}×`}
            onPointerDown={(event) => {
              event.preventDefault();
              setSelectedNodeId(point.id);
              dragNodeRef.current = point.id;
              event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              updatePoint(index, {
                progress: point.progress + (event.key === "ArrowLeft" ? -0.01 : event.key === "ArrowRight" ? 0.01 : 0),
                rate: point.rate + (event.key === "ArrowDown" ? -0.05 : event.key === "ArrowUp" ? 0.05 : 0),
              });
            }}
          />;
        })}
      </svg>
      <p className="visual-speed-curve-hint">{t("visualSpeedCurveHint")}</p>
      <div className="visual-speed-stage-list">
        {curve.points.slice(0, -1).map((point, index) => {
          const next = curve.points[index + 1];
          const active = point.id === selectedNodeId
            || (index === curve.points.length - 2 && next.id === selectedNodeId);
          return (
            <div className={`visual-speed-stage-row ${active ? "is-active" : ""}`} role="button" tabIndex="0" key={point.id} onClick={() => setSelectedNodeId(point.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedNodeId(point.id); } }}>
              <span className="visual-speed-stage-index"><i>{index + 1}</i></span>
              <span className="visual-speed-stage-name"><strong>{t(VISUAL_SPEED_STAGE_KEYS[index] || "visualSpeedStageGeneric", `${t("visualSpeedStageGeneric")} ${index + 1}`)}</strong><em>{Math.round(point.progress * 100)}–{Math.round(next.progress * 100)}%</em></span>
              <SpeedStageSparkline startRate={point.rate} endRate={next.rate} smooth={curve.smooth} />
              <label className="visual-speed-stage-rate" onClick={(event) => event.stopPropagation()}><input aria-label={t("visualSpeedStageRate")} type="number" min="0.25" max="4" step="0.05" value={Math.round(point.rate * 100) / 100} onChange={(event) => updatePoint(index, { rate: Number(event.target.value) || 1 })} /><i>×</i></label>
              <Diamond size={15} weight="fill" />
            </div>
          );
        })}
      </div>
      <div className="visual-speed-stage-actions">
        <button className="panel-secondary" type="button" disabled={curve.points.length >= 8} onClick={addWidestStage}><Plus size={14} />{t("visualSpeedAddStage")}</button>
        <label className="visual-speed-smooth-toggle"><span>{t("visualSpeedSmooth")}</span><input type="checkbox" checked={curve.smooth} onChange={(event) => commit({ ...curve, smooth: event.target.checked })} /></label>
      </div>
    </section>
  );
}

export function VisualEffectsPanel({
  t,
  segment,
  localTime,
  onChange,
  onSeek,
  onPreviewAnimation,
  selectedFilterId,
  trOption,
  onSelectFilter,
  contextMode = false,
  sourceAudioLinked = false,
  miganRepair = null,
  hdRestoration = null,
  smartDenoise = null,
  mode = "main",
  vectorEditor = null,
  onApplyPreset = null,
  onDelete = null,
  onCanvasEditModeChange,
  requestedTab = "",
  singleSection = "",
}) {
  const [activeTab, setActiveTab] = useState("transform");
  const [tabEdges, setTabEdges] = useState({ atStart: true, atEnd: false });
  const tabsRef = useRef(null);
  const [animationSection, setAnimationSection] = useState("in");
  const [hoveredAnimation, setHoveredAnimation] = useState(null);
  const keyframes = normalizeVisualKeyframes(segment?.keyframes ?? []);
  const transform = resolveVisualTransform(keyframes, localTime, segment?.baseTransform);
  const mask = segment?.mask ?? { type: "none", feather: 0, inverted: false };
  const hasMask = mask.type && mask.type !== "none";
  const isCircleMask = mask.type === "circle";
  const isVideo = segment?.type === "video";
  const isVector = segment?.kind === "vector" || Boolean(segment?.vectorBody);
  const isOverlay = mode === "overlay";
  const isMobileFocusedSection = Boolean(singleSection);
  const playbackRate = Math.max(0.25, Math.min(4, Number(segment?.playbackRate) || 1));
  const clipAnimation = normalizeVisualClipAnimation(segment?.animation);
  const activeAnimation = clipAnimation[animationSection];
  const sourceDuration = Math.max(0, Number(segment?.sourceDuration) || (Number(segment?.duration) || 0) * playbackRate);
  const updateTransform = (key, value) => onChange?.(
    hasVisualPropertyKeyframe(keyframes, localTime, key)
      ? { propertyKeyframe: { time: localTime, key, value } }
      : { baseTransform: { [key]: value } },
  );
  const tabLabels = {
    transform: t("visualTabTransform"),
    mask: t("visualTabMask"),
    filters: t("visualTabEffects"),
    animation: t("visualTabAnimation"),
    speed: t("visualTabSpeed"),
    speedCurve: t("visualTabSpeedCurve"),
    colorWheels: t("visualTabColorWheels"),
    vector: t("vectorProperties"),
    timing: t("overlayTiming", "Timing & layer"),
    repair: t("repairTab"),
  };
  const tabs = getVisualPropertyTabIds({
    isVector,
    isVideo,
    isOverlay,
    hasVectorEditor: Boolean(vectorEditor),
    isMobile: isMobileFocusedSection,
  }).map((id) => [id, tabLabels[id]]);
  const updateTabEdges = useCallback(() => {
    const node = tabsRef.current;
    if (!node) return;
    setTabEdges({
      atStart: node.scrollLeft <= 6,
      atEnd: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2,
    });
  }, []);
  const scrollVisualTabs = (direction) => {
    const node = tabsRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(148, node.clientWidth * 0.68),
      behavior: "smooth",
    });
  };
  useEffect(() => {
    if (!tabs.some(([id]) => id === activeTab)) setActiveTab(tabs[0]?.[0] || "transform");
  }, [activeTab, isMobileFocusedSection, isOverlay, isVector, isVideo, vectorEditor]);
  useEffect(() => {
    const nextTab = tabs.some(([id]) => id === requestedTab) ? requestedTab : "transform";
    setActiveTab(nextTab);
    onCanvasEditModeChange?.(nextTab === "mask" ? "mask" : "transform");
  }, [mode, onCanvasEditModeChange, requestedTab, segment?.id]);
  useEffect(() => {
    onCanvasEditModeChange?.(activeTab === "mask" ? "mask" : "transform");
  }, [activeTab, onCanvasEditModeChange]);
  useEffect(() => {
    tabsRef.current
      ?.closest(".visual-effects-panel")
      ?.querySelector(".visual-context-tab-body")
      ?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab, segment?.id]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = tabsRef.current;
      const activeButton = node?.querySelector('[aria-selected="true"]');
      if (node && activeButton) {
        const start = activeButton.offsetLeft;
        const end = start + activeButton.offsetWidth;
        if (start < node.scrollLeft + 4) node.scrollTo({ left: Math.max(0, start - 4), behavior: "smooth" });
        else if (end > node.scrollLeft + node.clientWidth - 28) {
          node.scrollTo({ left: end - node.clientWidth + 28, behavior: "smooth" });
        }
      }
      requestAnimationFrame(updateTabEdges);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, segment?.id, updateTabEdges]);
  useEffect(() => {
    if (!hoveredAnimation || !segment || !onPreviewAnimation) return undefined;
    let frame = 0;
    let lastPaint = 0;
    const startedAt = performance.now();
    const paint = (now) => {
      if (now - lastPaint >= 32) {
        const phaseProgress = ((now - startedAt) % 1100) / 900;
        const progress = Math.min(1, phaseProgress);
        const previewAnimation = {
          ...clipAnimation,
          [hoveredAnimation.phase]: {
            id: hoveredAnimation.id,
            duration: DEFAULT_VISUAL_ANIMATION_DURATION,
          },
        };
        const previewLocalTime = hoveredAnimation.phase === "in"
          ? progress * DEFAULT_VISUAL_ANIMATION_DURATION
          : Math.max(0, Number(segment.duration) - DEFAULT_VISUAL_ANIMATION_DURATION + progress * DEFAULT_VISUAL_ANIMATION_DURATION);
        onPreviewAnimation({ segmentId: segment.id, animation: previewAnimation, localTime: previewLocalTime });
        lastPaint = now;
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      onPreviewAnimation(null);
    };
  }, [hoveredAnimation, onPreviewAnimation, segment?.id, segment?.duration]);
  return (
    <div className={`tool-panel visual-effects-panel ${contextMode ? "is-context-mode" : ""} ${singleSection ? "is-single-section" : ""}`}>
      {!contextMode ? <h2>{t("imageTrack")}</h2> : null}
      {!segment ? <div className="empty-state">{t("visualSelectClip")}</div> : <>
        {!singleSection ? <div className={`visual-context-tabs-shell ${tabEdges.atStart ? "" : "has-left-shadow"} ${tabEdges.atEnd ? "" : "has-right-shadow"}`}>
          {!tabEdges.atStart ? (
            <button
              className="visual-context-tabs-arrow is-left"
              type="button"
              aria-label={t("visualTabsPrevious")}
              title={t("visualTabsPrevious")}
              onClick={() => scrollVisualTabs(-1)}
            >
              <CaretLeft size={16} weight="bold" />
            </button>
          ) : null}
          <div
            ref={tabsRef}
            className="visual-context-tabs"
            role="tablist"
            aria-label={t("imageTrack")}
            onScroll={updateTabEdges}
          >{tabs.map(([id, label]) => <button type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} key={id} onClick={() => setActiveTab(id)}>{label}</button>)}</div>
          {!tabEdges.atEnd ? (
            <button
              className="visual-context-tabs-arrow is-right"
              type="button"
              aria-label={t("visualTabsNext")}
              title={t("visualTabsNext")}
              onClick={() => scrollVisualTabs(1)}
            >
              <CaretRight size={16} weight="bold" />
            </button>
          ) : null}
        </div> : null}
        <div className="visual-context-tab-body">
        {activeTab === "transform" ?
        <section className="visual-editor-card visual-transform-card">
          <div className="visual-editor-heading"><span><Diamond size={16} weight="fill" />{t("visualKeyframes")}</span><em>{localTime.toFixed(2)}s · {keyframes.length} {t("visualFrames")}</em></div>
          <button className="panel-secondary visual-add-all-keyframes" type="button" onClick={() => onChange?.({ keyframe: { time: localTime, ...transform } })}><Diamond size={14} weight="fill" />{t("visualAddAllKeyframes")}</button>
          {keyframes.length ? <div className="visual-keyframe-times" aria-label={t("visualKeyframes")}>{keyframes.map((frame) => <button type="button" aria-label={`${frame.time.toFixed(2)}s · ${t("visualKeyframes")}`} className={Math.abs(frame.time - localTime) <= 0.04 ? "is-current" : ""} key={frame.time} onClick={() => onSeek?.(frame.time)}>{frame.time.toFixed(2)}s</button>)}</div> : null}
          {[['scale', t('visualScale'), 0.2, 3, 0.01, 100], ['x', t('visualPositionX'), -100, 100, 1, 1], ['y', t('visualPositionY'), -100, 100, 1, 1], ['rotation', t('visualRotation'), -180, 180, 1, 1], ['opacity', t('visualOpacity'), 0, 1, 0.01, 100]].map(([key, label, min, max, step, displayScale]) => {
            const keyed = hasVisualPropertyKeyframe(keyframes, localTime, key);
            const displayValue = Math.round(transform[key] * displayScale * 100) / 100;
            return <div className="slider-field compact-slider visual-keyframe-property" key={key}><div><label>{label}</label><span className="visual-property-value"><label className="visual-number-field"><input aria-label={`${label} · ${t("visualKeyframes")}`} type="number" min={min * displayScale} max={max * displayScale} step={step * displayScale} value={displayValue} onChange={(event) => updateTransform(key, Number(event.target.value) / displayScale)} /><i>{key === 'rotation' ? '°' : '%'}</i></label><button className={keyed ? "is-active" : ""} type="button" aria-label={`${keyed ? t("visualRemovePropertyKeyframe") : t("visualAddPropertyKeyframe")} · ${label}`} onClick={() => keyed ? onChange?.({ removePropertyKeyframe: { time: localTime, key } }) : onChange?.({ propertyKeyframe: { time: localTime, key, value: transform[key] } })}><Diamond size={13} weight={keyed ? "fill" : "regular"} /></button></span></div><input aria-label={`${label} · slider`} type="range" min={min} max={max} step={step} value={transform[key]} onChange={(event) => updateTransform(key, Number(event.target.value))} /></div>;
          })}
          <button className="panel-secondary" type="button" onClick={() => onChange?.({ removeKeyframeAt: localTime })}>{t("visualDeleteKeyframe")}</button>
        </section> : null}
        {activeTab === "mask" ?
        <section className="visual-editor-card">
          {!singleSection ? <div className="visual-editor-heading"><strong>{t("visualMask")}</strong><em>{t("visualClipScoped")}</em></div> : null}
          <div className="mask-choice-grid">{[['none',t('visualMaskNone')],['rectangle',t('visualMaskRectangle')],['rounded',t('visualMaskRounded')],['circle',t('visualMaskCircle')]].map(([id,label]) => <button type="button" key={id} className={mask.type === id ? 'is-active' : ''} onClick={() => onChange?.({ mask: { ...mask, type: id, ...(id === 'circle' && !Number.isFinite(mask.size) ? { size: 72 } : {}), ...(id === 'rounded' && !Number.isFinite(mask.cornerRadius) ? { cornerRadius: 12 } : {}) } })}>{label}</button>)}</div>
          {hasMask ? <>
            <div className="slider-field compact-slider"><div><label>{t("visualFeather")}</label><span>{mask.feather || 0}%</span></div><input type="range" min="0" max="40" value={mask.feather || 0} onChange={(event) => onChange?.({ mask: { ...mask, feather: Number(event.target.value) } })} /></div>
            {[['centerX',t('visualHorizontal'),0,100,50],['centerY',t('visualVertical'),0,100,50]].map(([key,label,min,max,fallback]) => <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span>{Number.isFinite(mask[key]) ? Math.round(mask[key]) : fallback}%</span></div><input type="range" min={min} max={max} value={Number.isFinite(mask[key]) ? mask[key] : fallback} onChange={(event) => onChange?.({ mask: { ...mask, [key]: Number(event.target.value) } })} /></div>)}
            {isCircleMask ? <div className="slider-field compact-slider"><div><label>{t("visualDiameter")}</label><span>{Number.isFinite(mask.size) ? Math.round(mask.size) : 72}%</span></div><input type="range" min="8" max="100" value={Number.isFinite(mask.size) ? mask.size : 72} onChange={(event) => onChange?.({ mask: { ...mask, size: Number(event.target.value) } })} /></div> : [['width',t('visualWidth'),8,100,80],['height',t('visualHeight'),8,100,80]].map(([key,label,min,max,fallback]) => <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span>{Number.isFinite(mask[key]) ? Math.round(mask[key]) : fallback}%</span></div><input type="range" min={min} max={max} value={Number.isFinite(mask[key]) ? mask[key] : fallback} onChange={(event) => onChange?.({ mask: { ...mask, [key]: Number(event.target.value) } })} /></div>)}
            {mask.type === "rounded" ? <div className="slider-field compact-slider"><div><label>{t("visualCornerRadius")}</label><span>{Number.isFinite(mask.cornerRadius) ? Math.round(mask.cornerRadius) : 12}%</span></div><input type="range" min="0" max="50" value={Number.isFinite(mask.cornerRadius) ? mask.cornerRadius : 12} onChange={(event) => onChange?.({ mask: { ...mask, cornerRadius: Number(event.target.value) } })} /></div> : null}
            <label className="switch-row"><input type="checkbox" checked={Boolean(mask.inverted)} onChange={(event) => onChange?.({ mask: { ...mask, inverted: event.target.checked } })} />{t("visualInvertMask")}</label>
          </> : <p className="mask-empty-hint">{t("visualMaskNoneHint")}</p>}
        </section> : null}
        {activeTab === "speed" ? <section className="visual-editor-card visual-speed-card">
          {!singleSection ? <div className="visual-editor-heading"><strong>{t("visualSpeed")}</strong><em>{t("visualClipScoped")}</em></div> : null}
          {isVideo ? <>
            <div className="visual-speed-presets" aria-label={t("visualSpeed")}>{[0.25, 0.5, 1, 1.5, 2, 3, 4].map((rate) => <button type="button" className={Math.abs(playbackRate - rate) < 0.001 ? "is-active" : ""} key={rate} onClick={() => onChange?.({ playbackRate: rate })}>{rate}×</button>)}</div>
            <div className="slider-field compact-slider"><div><label>{t("visualSpeed")}</label><strong>{playbackRate.toFixed(playbackRate % 1 ? 2 : 0)}×</strong></div><input aria-label={t("visualSpeed")} type="range" min="0.25" max="4" step="0.05" value={playbackRate} onChange={(event) => onChange?.({ playbackRate: Number(event.target.value) })} /></div>
            <div className="visual-speed-summary"><span><em>{t("visualSourceDuration")}</em><strong>{sourceDuration.toFixed(2)}s</strong></span><span><em>{t("visualTimelineDuration")}</em><strong>{Number(segment.duration).toFixed(2)}s</strong></span></div>
            <p className="visual-speed-hint">{sourceAudioLinked ? t("sourceAudioSynced") : t("visualSpeedVisualOnlyHint")}</p>
          </> : <div className="empty-state visual-speed-empty">{t("visualSpeedImageHint")}</div>}
        </section> : null}
        {activeTab === "speedCurve" ? <VisualSpeedCurvePanel t={t} segment={segment} localTime={localTime} onChange={onChange} /> : null}
        {activeTab === "filters" ? <VisualChoicePanel title={t("visualEffects")} hideTitle={Boolean(singleSection)} previewImage={getSegmentFilterPreview(segment)} allowFallbackPreview={false} kind="filter" options={FILTER_OPTIONS} selectedId={selectedFilterId} trOption={trOption} onSelect={onSelectFilter} /> : null}
        {activeTab === "animation" ? <section className="visual-editor-card visual-animation-card">
          {!singleSection ? <div className="visual-editor-heading"><strong>{t("visualAnimation")}</strong><em>{t("visualAnimationHoverHint")}</em></div> : null}
          <div className="visual-animation-sections" role="tablist" aria-label={t("visualAnimation")}>
            {[['in', t('visualAnimationIn')], ['out', t('visualAnimationOut')]].map(([id, label]) => <button type="button" role="tab" aria-selected={animationSection === id} className={animationSection === id ? 'is-active' : ''} key={id} onClick={() => setAnimationSection(id)}>{label}</button>)}
          </div>
          <div className="visual-animation-grid">
            {VISUAL_CLIP_ANIMATION_OPTIONS.map((option) => <button
              type="button"
              className={activeAnimation.id === option.id ? "is-active" : ""}
              key={option.id}
              onPointerEnter={() => option.id !== "none" && setHoveredAnimation({ phase: animationSection, id: option.id })}
              onPointerLeave={() => setHoveredAnimation(null)}
              onFocus={() => option.id !== "none" && setHoveredAnimation({ phase: animationSection, id: option.id })}
              onBlur={() => setHoveredAnimation(null)}
              onClick={() => onChange?.({ animation: { ...clipAnimation, [animationSection]: { ...activeAnimation, id: option.id } } })}
            ><span className={`visual-animation-swatch is-${option.id}`} aria-hidden="true"><i /></span><strong>{t(option.labelKey)}</strong></button>)}
          </div>
          {activeAnimation.id !== "none" ? <div className="slider-field compact-slider visual-animation-duration"><div><label>{t("visualAnimationDuration")}</label><strong>{activeAnimation.duration.toFixed(1)}s</strong></div><input aria-label={t("visualAnimationDuration")} type="range" min="0.1" max={Math.min(3, Math.max(0.1, Number(segment.duration) || 0.1))} step="0.1" value={activeAnimation.duration} onChange={(event) => onChange?.({ animation: { ...clipAnimation, [animationSection]: { ...activeAnimation, duration: Number(event.target.value) } } })} /></div> : null}
        </section> : null}
        {activeTab === "colorWheels" ? <ColorWheelsPanel t={t} value={segment.colorGrade} keyframes={keyframes} localTime={localTime} onChange={onChange} /> : null}
        {activeTab === "vector" ? <section className="visual-editor-card visual-vector-card">{vectorEditor}</section> : null}
        {activeTab === "timing" ? <section className="visual-editor-card visual-overlay-timing-card">
          {!singleSection ? <div className="visual-editor-heading"><strong>{t("overlayTiming", "Timing & layer")}</strong><em>{t("visualClipScoped")}</em></div> : null}
          <section className="visual-overlay-presets"><strong>{t("layoutPresets")}</strong><div>
            {[["top-left", "↖"], ["top-right", "↗"], ["bottom-left", "↙"], ["bottom-right", "↘"], ["center", "●"], ["full", "□"]].map(([id, label]) => <button type="button" key={id} title={id} aria-label={`${t("layoutPresets")} ${id}`} onClick={() => onApplyPreset?.(id)}>{label}</button>)}
          </div></section>
          <label><span>{t("clipStart", "Start time")}</span><input type="number" min="0" step="0.1" value={segment.start} onChange={(event) => onChange?.({ timing: { start: Math.max(0, Number(event.target.value) || 0) } })} /></label>
          <label><span>{t("clipDuration", "Duration")}</span><input type="number" min="0.1" step="0.1" value={segment.duration} onChange={(event) => onChange?.({ timing: { duration: Math.max(0.1, Number(event.target.value) || 0.1) } })} /></label>
          <label><span>{t("layer", "Layer")}</span><input type="number" min="1" step="1" value={segment.layer || 1} onChange={(event) => onChange?.({ timing: { layer: Math.max(1, Math.round(Number(event.target.value) || 1)) } })} /></label>
          {isVideo ? <label className="switch-row"><input type="checkbox" checked={segment.muted === true} onChange={(event) => onChange?.({ timing: { muted: event.target.checked } })} />{t("overlayMute", "Mute video audio")}</label> : null}
          <button className="panel-secondary visual-overlay-delete" type="button" onClick={onDelete}><Trash size={14} />{t("delete")}</button>
        </section> : null}
        {activeTab === "repair" ? <section className="visual-editor-card repair-card repair-hub">
          {!singleSection ? <div className="visual-editor-heading">
            <span><MagicWand size={17} weight="duotone" />{t("repairHubTitle")}</span>
            <em>{t("repairLocalBadge")}</em>
          </div> : null}
          <div className={`repair-hub-summary ${singleSection ? "is-focused" : ""}`}>
            <p className="repair-intro">{t("repairHubIntro")}</p>
            {singleSection ? <em>{t("repairLocalBadge")}</em> : null}
          </div>
          <div className="repair-capability-list">
            <article className="repair-capability is-available is-featured">
              <span><MagicWand size={18} weight="duotone" /></span>
              <div><strong>{t("repairWatermarkCapability")}</strong><small>{t("repairWatermarkCapabilityHint")}</small></div>
              <button className="panel-primary" type="button" onClick={miganRepair?.openDialog}>{segment?.repair ? t("repairEditAgain") : t("repairOpenEditor")}</button>
            </article>
            <article className="repair-capability is-available">
              <span><Waveform size={18} weight="duotone" /></span>
              <div><strong>{t("denoiseCapability")}</strong><small>{t("denoiseCapabilityHint")}</small></div>
              <button className="panel-primary" type="button" onClick={smartDenoise?.openDialog}>{segment?.enhancement?.mode === "smart-denoise-drunet" ? t("repairEditAgain") : t("repairOpenEditor")}</button>
            </article>
            <article className="repair-capability is-available">
              <span><Scan size={18} weight="duotone" /></span>
              <div><strong>{t("repairHdCapability")}</strong><small>{t("repairHdCapabilityHint")}</small></div>
              <button className="panel-primary" type="button" onClick={hdRestoration?.openDialog}>{segment?.enhancement?.mode === "nanovsr-644k" ? t("repairEditAgain") : t("repairOpenEditor")}</button>
            </article>
          </div>
          {segment?.repair ? <label className="switch-row repair-result-toggle"><input type="checkbox" checked={segment.repair.enabled !== false} onChange={(event) => onChange?.({ repairEnabled: event.target.checked })} />{t("repairUseResult")}</label> : null}
          {segment?.enhancement?.mode === "nanovsr-644k" ? <label className="switch-row repair-result-toggle"><input type="checkbox" checked={segment.enhancement.enabled !== false} onChange={(event) => onChange?.({ enhancementEnabled: event.target.checked })} />{t("hdRestoreUseResult")}</label> : null}
          {segment?.enhancement?.mode === "smart-denoise-drunet" ? <label className="switch-row repair-result-toggle"><input type="checkbox" checked={segment.enhancement.enabled !== false} onChange={(event) => onChange?.({ enhancementEnabled: event.target.checked })} />{t("denoiseUseResult")}</label> : null}
        </section> : null}
        </div>
      </>}
    </div>
  );
}

function VisualChoicePanel({ title, hideTitle = false, previewImage = SAMPLE_IMAGE, allowFallbackPreview = true, kind, options, selectedId, trOption = (name) => name, onSelect }) {
  const resolvedPreviewImage = previewImage || (allowFallbackPreview ? SAMPLE_IMAGE : "");
  return (
    <div className="tool-panel">
      {!hideTitle ? <h2>{title}</h2> : null}
      <div className="visual-choice-grid">
        {options.map((option) => (
          <button
            className={`visual-choice-card is-${kind} preview-${option.id} ${
              selectedId === option.id ? "is-selected" : ""
            }`}
            type="button"
            key={option.id}
            draggable={option.id !== "none"}
            style={{
              "--choice-image": resolvedPreviewImage ? `url(${resolvedPreviewImage})` : "none",
              "--choice-filter": option.css ?? "none",
            }}
            onClick={() => onSelect(option.id)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-timeline-visual-style", `${kind}:${option.id}`);
              event.dataTransfer.setData("text/plain", `visual-style:${kind}:${option.id}`);
            }}
          >
            <span className={`visual-choice-thumb ${resolvedPreviewImage ? "has-source-preview" : "is-preview-empty"}`} aria-hidden="true">
              {resolvedPreviewImage && kind !== "transition" ? <img src={resolvedPreviewImage} alt="" crossOrigin="anonymous" draggable={false} /> : null}
            </span>
            <span className="visual-choice-label">
              <span>{trOption(option.name, option)}</span>
              {selectedId === option.id ? <Check size={14} weight="bold" /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoicePanel({ title, options, selectedId, trOption = (name) => name, onSelect }) {
  return (
    <div className="tool-panel">
      <h2>{title}</h2>
      <div className="choice-list">
        {options.map((option) => (
          <button className={selectedId === option.id ? "is-selected" : ""} type="button" key={option.id} onClick={() => onSelect(option.id)}>
            <span>{trOption(option.name, option)}</span>
            {selectedId === option.id ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function StickerPanel({
  title,
  options,
  selectedId,
  trOption = (name) => name,
  onSelect,
  t,
  onStickerPointerDown,
  onStickerClick,
  onStickerConfirm,
  closeMobilePanel,
  mobilePanelOpen,
}) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [visibleCount, setVisibleCount] = useState(STICKER_PAGE_SIZE);
  const loadMoreRef = useRef(null);
  const emptySticker = options.find((option) => option.id === "none") ?? { id: "none", name: "无贴纸" };
  const stickerOptions = useMemo(() => options.filter((option) => option.id !== "none"), [options]);
  const filteredStickers = useMemo(
    () =>
      activeCategory === "all"
        ? stickerOptions
        : stickerOptions.filter((option) => option.category === activeCategory),
    [activeCategory, stickerOptions],
  );
  const visibleStickers = filteredStickers.slice(0, visibleCount);
  const hasMore = visibleCount < filteredStickers.length;
  const selectedSticker = stickerOptions.find((option) => option.id === selectedId) ?? null;

  useEffect(() => {
    setVisibleCount(STICKER_PAGE_SIZE);
  }, [activeCategory]);

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setVisibleCount((count) => Math.min(count + STICKER_PAGE_SIZE, filteredStickers.length));
      },
      { root: null, rootMargin: "120px 0px" },
    );
    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [filteredStickers.length, hasMore]);

  const loadMore = () => {
    setVisibleCount((count) => Math.min(count + STICKER_PAGE_SIZE, filteredStickers.length));
  };

  return (
    <div className="tool-panel sticker-panel">
      <h2>{title}</h2>
      <button
        className={`sticker-none-button ${selectedId === emptySticker.id ? "is-selected" : ""}`}
        type="button"
        onClick={() => onSelect(emptySticker.id)}
      >
        <span>{trOption(emptySticker.name, emptySticker)}</span>
        {selectedId === emptySticker.id ? <Check size={15} weight="bold" /> : null}
      </button>
      <div className="sticker-category-row" role="tablist" aria-label={t("stickerCategories")}>
        {STICKER_CATEGORIES.map((category) => (
          <button
            className={activeCategory === category.id ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeCategory === category.id}
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            {trOption(category.name, category)}
          </button>
        ))}
      </div>
      <div className="sticker-grid" aria-live="polite">
        {visibleStickers.map((option) => {
          const dragAsset = {
            ...option,
            type: "sticker",
            meta: "贴纸",
          };

          return (
          <button
            className={`sticker-tile ${selectedId === option.id ? "is-selected" : ""}`}
            type="button"
            key={option.id}
            onPointerDown={(event) => onStickerPointerDown?.(event, dragAsset)}
            onClick={(event) => {
              if (onStickerClick) {
                onStickerClick(event, option);
                return;
              }
              onSelect(option.id);
            }}
          >
            <span className="sticker-tile-thumb" aria-hidden="true">
              <img src={option.src} alt="" loading="lazy" draggable={false} />
            </span>
            <span className="sticker-tile-label">
              <span>{trOption(option.name, option)}</span>
              {selectedId === option.id ? <Check size={13} weight="bold" /> : null}
            </span>
          </button>
          );
        })}
      </div>
      {hasMore ? (
        <button className="sticker-load-more" type="button" ref={loadMoreRef} onClick={loadMore}>
          <span>{t("loadMoreStickers")}</span>
          <span>
            {visibleStickers.length}/{filteredStickers.length}
          </span>
        </button>
      ) : (
        <span className="sticker-load-sentinel" ref={loadMoreRef} aria-hidden="true" />
      )}
      {mobilePanelOpen ? createPortal((
        <div className="mobile-sticker-actions" aria-label={t("mobileStickerActions")}>
          <button type="button" className="is-secondary" onClick={() => {
            onSelect(emptySticker.id);
            closeMobilePanel?.();
          }}>{t("mobileStickerCancel")}</button>
          <button type="button" disabled={!selectedSticker} onClick={() => {
            if (!selectedSticker) return;
            onStickerConfirm?.(selectedSticker);
            closeMobilePanel?.();
          }}>{t("addSticker")}</button>
        </div>
      ), document.body) : null}
    </div>
  );
}

export function VoiceSynthesisPanel({
  script,
  updateScript,
  selectedVoiceId,
  setSelectedVoiceId,
  selectedVoice,
  filteredVoices,
  voiceFilter,
  setVoiceFilter,
  showVoiceFilter,
  setShowVoiceFilter,
  speed,
  setSpeed,
  volume,
  setVolume,
  status,
  statusText,
  progressPercent,
  audioBlob,
  audioUrl,
  generateVoiceover,
  downloadBlob,
  favoriteVoiceIds,
  setFavoriteVoiceIds,
  voiceProfiles,
  selectedVoiceProfileId,
  setSelectedVoiceProfileId,
  toggleVoiceProfileFavorite,
  selectedVoiceProfile,
  clearSelectedVoiceProfile,
  t,
}) {
  const voiceLanguages = useMemo(() => [...new Set(VOICES.map((voice) => voice.language))], []);
  const voiceSampleRef = useRef(null);
  const previousVoiceSampleIdRef = useRef(selectedVoiceId);
  const cloneSampleUrl = useMemo(
    () => selectedVoiceProfile?.testBlob ? URL.createObjectURL(selectedVoiceProfile.testBlob) : "",
    [selectedVoiceProfile],
  );

  useEffect(() => () => { if (cloneSampleUrl) URL.revokeObjectURL(cloneSampleUrl); }, [cloneSampleUrl]);

  const selectAndPlayVoiceSample = (voice, preserveClone = false) => {
    if (!preserveClone) clearSelectedVoiceProfile();
    if (voice.id !== selectedVoiceId) setSpeed(voice.defaultSpeed ?? 1);
    previousVoiceSampleIdRef.current = voice.id;
    flushSync(() => setSelectedVoiceId(voice.id));
    const player = voiceSampleRef.current;
    if (!player) return;
    player.pause();
    player.load();
    delete player.dataset.autoplayStarted;
    delete player.dataset.autoplayError;
    player.play()
      .then(() => { player.dataset.autoplayStarted = "true"; })
      .catch((error) => { player.dataset.autoplayError = error.name || "PlaybackError"; });
  };

  const selectCloneProfile = (profile) => {
    flushSync(() => setSelectedVoiceProfileId(profile.id));
    setVolume((current) => Math.abs(current - 1) < 0.001 ? 1.2 : current);
    const player = voiceSampleRef.current;
    if (player) { player.pause(); player.load(); }
  };

  useEffect(() => {
    const player = voiceSampleRef.current;
    if (!player) return;
    if (previousVoiceSampleIdRef.current === selectedVoiceId) return;
    previousVoiceSampleIdRef.current = selectedVoiceId;
    player.pause();
    player.load();
  }, [selectedVoiceId]);

  return (
    <>
      <label className="field-label" htmlFor="script-input">
        {t("inputScript")}
      </label>
      <div className="script-box">
        <textarea id="script-input" value={script} maxLength={5000} onChange={(event) => updateScript(event.target.value)} />
        <div className="script-meta">
          <button type="button" onClick={() => updateScript("")}>
            <Trash size={14} />
            {t("clear")}
          </button>
          <span>{script.length} / 5000</span>
        </div>
      </div>

      <div className="voice-header">
        <label className="field-label">{t("chooseVoice")}</label>
        <div className="menu-anchor">
          <button className="voice-filter" type="button" onClick={() => setShowVoiceFilter((open) => !open)}>
            {voiceFilter === "all" ? t("allVoices") : voiceFilter} <CaretDown size={14} />
          </button>
          {showVoiceFilter ? (
            <Popover closeLabel={t("close")} onClose={() => setShowVoiceFilter(false)}>
              <div className="menu-list">
                {["all", ...voiceLanguages].map((filter) => (
                  <button
                    type="button"
                    className={voiceFilter === filter ? "is-selected" : ""}
                    key={filter}
                    onClick={() => {
                      setVoiceFilter(filter);
                      if (filter !== "all") {
                        const firstVoiceForLanguage = VOICES.find((voice) => voice.language === filter);
                        if (firstVoiceForLanguage) selectAndPlayVoiceSample(firstVoiceForLanguage, true);
                      }
                      setShowVoiceFilter(false);
                    }}
                  >
                    {filter === "all" ? t("allVoices") : filter}
                  </button>
                ))}
              </div>
            </Popover>
          ) : null}
        </div>
      </div>

      <div className="voice-list">
        {voiceProfiles.map((profile) => (
          <button
            className={`voice-card clone-voice-card ${profile.id === selectedVoiceProfileId ? "is-selected" : ""}`}
            type="button"
            key={profile.id}
            onClick={() => selectCloneProfile(profile)}
          >
            <span className="avatar"><Waveform size={17} weight="bold" /></span>
            <span>
              <strong>{profile.name}</strong>
              <em>{t("cloneVoiceMultilingual", "多语言 · 克隆音色")}</em>
            </span>
          </button>
        ))}
        {filteredVoices.map((voice) => (
          <button
            className={`voice-card ${voice.id === selectedVoiceId && !selectedVoiceProfile ? "is-selected" : ""}`}
            type="button"
            key={voice.id}
            onClick={() => selectAndPlayVoiceSample(voice)}
          >
            <span className="avatar voice-avatar" aria-hidden="true">
              <img src={voice.avatarUrl} alt="" loading="lazy" />
            </span>
            <span>
              <strong>{voice.name}</strong>
              <em>
                {voice.language} · {voice.gender}
              </em>
            </span>
          </button>
        ))}
      </div>

      <div className="model-row">
        <span title={selectedVoice.detail}>{selectedVoiceProfile ? `${t("cloneBaseVoice", "基础语言声音")} · ${selectedVoice.name}` : selectedVoice.detail}</span>
        <button
          type="button"
          onClick={() => selectedVoiceProfile
            ? toggleVoiceProfileFavorite(selectedVoiceProfile.id)
            : setFavoriteVoiceIds((ids) => ids.includes(selectedVoiceId) ? ids.filter((id) => id !== selectedVoiceId) : [...ids, selectedVoiceId])}
        >
          {selectedVoiceProfile
            ? selectedVoiceProfile.favorite ? t("saved") : t("favorite")
            : favoriteVoiceIds.includes(selectedVoiceId) ? t("saved") : t("favorite")}
        </button>
      </div>

      <div className="voice-sample-preview">
        <div>
          <strong>{t("voiceSampleTitle", "音色样音")}</strong>
          <span>{selectedVoiceProfile
            ? `${selectedVoiceProfile.name} · ${t("cloneLanguageFlow", "先合成所选语言，再转换为此音色")}`
            : `${selectedVoice.name} · ${t("voiceSampleHint", "切换音色后试听对应的预生成样音")}`}</span>
        </div>
        <audio
          ref={voiceSampleRef}
          data-testid="voice-sample-player"
          data-voice-id={selectedVoiceProfile?.id || selectedVoice.id}
          controls
          preload="metadata"
          src={cloneSampleUrl || selectedVoice.sampleUrl}
        />
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="speed">{t("speed")}</label>
          <span>{speed.toFixed(2)} x</span>
        </div>
        <input id="speed" type="range" min="0.7" max="1.3" step="0.05" value={selectedVoice.engine === "hojo" ? 1 : speed} disabled={selectedVoice.engine === "hojo"} onChange={(event) => setSpeed(Number(event.target.value))} />
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="volume">{t("volume")}</label>
          <span>{Math.round(volume * 100)}%</span>
        </div>
        <input id="volume" type="range" min="0" max="4" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        {volume > 1 ? <small className="voice-gain-hint">{t("voiceGainLimiterHint", "高增益已启用限幅保护")}</small> : null}
      </div>

      {status === "generating" ? (
        <div className="voice-generation-loading" role="status" aria-live="polite">
          <i className="voice-generation-spinner" aria-hidden="true" />
          <div>
            <strong>{statusText || t("generating")}</strong>
            <span>{t("ttsFirstRunHint")}</span>
          </div>
          <em>{Math.round(progressPercent)}%</em>
          <div className="progress-track" aria-label={t("generationProgress")}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      <div className="voice-actions">
        <button className="generate-button" type="button" disabled={status === "generating" || !script.trim()} onClick={generateVoiceover}>
          {status === "generating" ? <i className="generate-button-spinner" aria-hidden="true" /> : <Waveform size={18} weight="bold" />}
          {status === "generating" ? t("generating") : audioBlob ? t("regenerateVoice") : t("generateVoice")}
        </button>
        <button className="secondary-download" type="button" disabled={!audioBlob} onClick={() => audioBlob && downloadBlob(audioBlob, "ai-voiceover.wav")}>
          <DownloadSimple size={17} />
        </button>
      </div>
      {audioBlob && audioUrl ? (
        <div className="generated-voice-result" aria-live="polite">
          <div><Check size={18} weight="bold" /><span><strong>{t("voiceAddedToTimeline", "已加入配音时间线")}</strong><em>{t("voicePreviewHint", "试听本次已生成的时间线配音")}</em></span></div>
          <audio controls preload="metadata" src={audioUrl} />
        </div>
      ) : null}
    </>
  );
}

export function MyVoicesPanel({
  notify,
  t,
  selectedVoice,
  voiceProfiles,
  addVoiceProfile,
  removeVoiceProfile,
  selectedVoiceProfileId,
  setSelectedVoiceProfileId,
  toggleVoiceProfileFavorite,
  recordedVoices,
  recordingState,
  recordingElapsed,
  startVoiceRecording,
  stopVoiceRecording,
  downloadBlob,
}) {
  const isRecording = recordingState === "recording";
  const isProcessingRecording = recordingState === "processing";
  const fileInputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [cloneState, setCloneState] = useState("idle");
  const [cloneProgress, setCloneProgress] = useState(0);
  const [clonePhase, setClonePhase] = useState("");
  const [testBlob, setTestBlob] = useState(null);
  const [embedding, setEmbedding] = useState(null);
  const latestRecordingIdRef = useRef(recordedVoices[0]?.id || "");
  const testUrl = useMemo(() => testBlob ? URL.createObjectURL(testBlob) : "", [testBlob]);
  const referenceUrl = useMemo(() => draft?.blob ? URL.createObjectURL(draft.blob) : "", [draft]);

  useEffect(() => () => { if (testUrl) URL.revokeObjectURL(testUrl); }, [testUrl]);
  useEffect(() => () => { if (referenceUrl) URL.revokeObjectURL(referenceUrl); }, [referenceUrl]);

  const chooseReference = (blob, name, sourceKind) => {
    setDraft({ blob, name, sourceKind }); setAuthorized(false); setTestBlob(null); setEmbedding(null); setCloneState("idle");
  };
  useEffect(() => {
    const latest = recordedVoices[0];
    if (!latest || latest.id === latestRecordingIdRef.current) return;
    latestRecordingIdRef.current = latest.id;
    chooseReference(latest.blob, latest.name, "recording");
  }, [recordedVoices]);
  const runCloneTest = async () => {
    if (!draft?.blob || !authorized || cloneState === "running") return;
    setCloneState("running"); setCloneProgress(3); setClonePhase(t("cloneChecking", "检查参考声音"));
    try {
      const nextEmbedding = await extractVoiceEmbedding(draft.blob, (event) => {
        setCloneProgress(Math.min(48, Math.round((event.progress || 0) * 0.55))); setClonePhase(event.phase || t("cloneEncoding", "提取音色"));
      });
      const { blob: baseBlob } = await synthesizeBaseVoice({
        voice: selectedVoice, text: getVoiceCloneTestSentence(selectedVoice), speed: 1, notify, t,
        onStatus: (statusKey) => setClonePhase(t(statusKey)),
        onProgress: (progress) => setCloneProgress(48 + Math.round(Math.min(100, progress) * 0.18)),
      });
      const converted = await convertVoiceBlob(baseBlob, nextEmbedding, {
        onProgress: (event) => { setCloneProgress(66 + Math.round((event.progress || 0) * 0.34)); setClonePhase(event.phase || t("cloneConverting", "生成克隆试听")); },
      });
      setEmbedding(nextEmbedding); setTestBlob(converted); setCloneProgress(100); setCloneState("ready");
    } catch (error) {
      console.error(error); setCloneState("error"); setClonePhase(error instanceof Error ? error.message : t("cloneFailed", "克隆试听失败"));
    }
  };
  const saveClone = async () => {
    if (!draft || !embedding || !testBlob || cloneState !== "ready") return;
    const now = new Date().toISOString();
    const profile = { id: crypto.randomUUID(), name: draft.name.replace(/\.[^.]+$/, "") || t("myCloneVoice", "我的克隆声音"),
      sourceKind: draft.sourceKind, referenceBlob: draft.blob, testBlob, embedding: Float32Array.from(embedding),
      embeddingVersion: OPENVOICE_EMBEDDING_VERSION,
      favorite: false, authorized: true, createdAt: now, updatedAt: now };
    await addVoiceProfile(profile); setSelectedVoiceProfileId(profile.id); setDraft(null); setTestBlob(null); setEmbedding(null); setAuthorized(false); setCloneState("idle");
    notify(t("cloneSaved", "克隆声音已保存到“克隆声音”"));
  };

  return (
    <div className="history-panel">
      <input ref={fileInputRef} hidden type="file" accept="audio/*" onChange={(event) => {
        const file = event.target.files?.[0]; if (file) chooseReference(file, file.name, "upload"); event.target.value = "";
      }} />
      <div className="voice-source-grid">
      <div className={`record-card ${isRecording ? "is-recording" : ""}`}>
        <div>
          <strong>{t("recordReferenceVoice", "录制参考声音")}</strong>
          <span>{isRecording ? `${t("recording")} · ${formatClock(recordingElapsed)}` : t("recordReferenceHint", "录制自己的声音，完成后直接进入克隆试听。")}</span>
        </div>
        <button
          type="button"
          disabled={isProcessingRecording}
          onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
        >
          {isRecording ? <Pause size={15} weight="fill" /> : <MicrophoneStage size={15} weight="fill" />}
          {isRecording ? t("stopRecording") : isProcessingRecording ? t("generating") : t("startRecording")}
        </button>
      </div>

      <button className="record-card upload-voice-card" type="button" onClick={() => fileInputRef.current?.click()}>
        <div><strong>{t("uploadVoice", "上传声音")}</strong><span>{t("uploadVoiceHint", "选择清晰的单人语音作为参考")}</span></div>
        <CloudArrowUp size={22} weight="bold" />
      </button>
      </div>

      {draft ? (
        <section className="clone-enrollment-card">
          <header><div><strong>{t("cloneTestTitle", "克隆试听")}</strong><span>{draft.name}</span></div><button type="button" onClick={() => setDraft(null)}><X size={15} /></button></header>
          <div className="clone-test-language"><span>{t("cloneTestLanguage", "测试语言")}</span><strong>{selectedVoice.language}</strong><em>{getVoiceCloneTestSentence(selectedVoice)}</em></div>
          <audio controls preload="metadata" src={referenceUrl} />
          <label className="clone-consent"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} /><span>{t("cloneConsent", "我确认已获得该声音的授权，并仅用于合法、非误导用途。")}</span></label>
          {cloneState === "running" ? <div className="voice-generation-loading clone-generation-loading" role="status" aria-live="polite"><i className="voice-generation-spinner" aria-hidden="true" /><div><strong>{clonePhase}</strong><span>{t("cloneLocalHint", "声音只在当前浏览器中处理")}</span></div><em>{cloneProgress}%</em><div className="progress-track"><span style={{ width: `${cloneProgress}%` }} /></div></div> : null}
          {cloneState === "error" ? <div className="clone-inline-error">{clonePhase}</div> : null}
          {testUrl ? <div className="clone-ab-preview"><span>{t("cloneListenBeforeSave", "请先试听克隆结果，确认满意后再保存")}</span><audio controls preload="metadata" src={testUrl} /></div> : null}
          <div className="clone-actions"><button type="button" disabled={!authorized || cloneState === "running"} onClick={runCloneTest}>{testBlob ? t("cloneRetest", "重新测试") : t("cloneTest", "测试克隆")}</button><button type="button" className="is-primary" disabled={!testBlob || cloneState !== "ready"} onClick={saveClone}>{t("saveToMyVoices", "保存到我的声音")}</button></div>
        </section>
      ) : null}

      {recordedVoices.length ? (
        <>
          <div className="panel-subtitle">{t("recordedVoices")}</div>
          {recordedVoices.map((recording) => (
            <div className="history-item is-recording-item" key={recording.id}>
              <div>
                <strong>{recording.name}</strong>
                <span>
                  {recording.createdAt} · {formatTime(recording.duration)}
                </span>
              </div>
              <button type="button" onClick={() => chooseReference(recording.blob, recording.name, "recording")}>
                {t("useAsReference", "作为参考")}
              </button>
              <button
                type="button"
                onClick={() => downloadBlob(recording.blob, `${recording.name}.${recording.extension}`)}
              >
                {t("download")}
              </button>
            </div>
          ))}
        </>
      ) : null}

      <div className="panel-subtitle">{t("savedCloneVoices", "已保存的克隆声音")}</div>
      {voiceProfiles.length ? voiceProfiles.map((profile) => (
          <div className={`history-item clone-profile-item ${selectedVoiceProfileId === profile.id ? "is-selected" : ""}`} key={profile.id}>
            <div className="clone-profile-copy">
              <strong>{profile.name}</strong><span>{profile.sourceKind === "recording" ? t("recordVoice", "录制声音") : t("uploadVoice", "上传声音")}</span>
            </div>
            <div className="clone-profile-actions">
              <button type="button" onClick={() => { setSelectedVoiceProfileId(profile.id); notify(t("cloneSelected", "已选择克隆音色")); }}>{t("use")}</button>
              <button type="button" onClick={() => toggleVoiceProfileFavorite(profile.id)}>{profile.favorite ? t("saved") : t("favorite")}</button>
              <button type="button" onClick={() => removeVoiceProfile(profile.id)}>{t("delete")}</button>
            </div>
          </div>
        )) : <div className="empty-state">{t("noCloneVoices", "上传或录制参考声音，通过试听后会显示在这里。")}</div>}
    </div>
  );
}

export function FavoriteVoicesPanel({ favoriteVoiceIds, setFavoriteVoiceIds, selectedVoiceId, setSelectedVoiceId,
  voiceProfiles, selectedVoiceProfileId, setSelectedVoiceProfileId, toggleVoiceProfileFavorite, notify, t }) {
  const builtIns = VOICES.filter((voice) => favoriteVoiceIds.includes(voice.id));
  const clones = voiceProfiles.filter((profile) => profile.favorite);
  return <div className="history-panel">
    <div className="panel-subtitle">{t("builtInVoices", "内置声音")}</div>
    {builtIns.map((voice) => <div className={`history-item ${selectedVoiceId === voice.id && !selectedVoiceProfileId ? "is-selected" : ""}`} key={voice.id}><div><strong>{voice.name}</strong><span>{voice.language} · {voice.detail}</span></div><button type="button" onClick={() => { setSelectedVoiceId(voice.id); setSelectedVoiceProfileId(""); notify(t("voiceSelected", "已切换声音")); }}>{t("use")}</button><button type="button" onClick={() => setFavoriteVoiceIds((ids) => ids.filter((id) => id !== voice.id))}>{t("remove")}</button></div>)}
    <div className="panel-subtitle">{t("cloneVoices", "克隆声音")}</div>
    {clones.map((profile) => <div className={`history-item ${selectedVoiceProfileId === profile.id ? "is-selected" : ""}`} key={profile.id}><div><strong>{profile.name}</strong><span>{t("browserLocalVoice", "保存在当前浏览器")}</span></div><button type="button" onClick={() => setSelectedVoiceProfileId(profile.id)}>{t("use")}</button><button type="button" onClick={() => toggleVoiceProfileFavorite(profile.id)}>{t("remove")}</button></div>)}
    {!builtIns.length && !clones.length ? <div className="empty-state">{t("noFavoriteVoices")}</div> : null}
  </div>;
}

export function HistoryPanel({ historyItems, useHistoryItem: onUseHistoryItem, setHistoryItems, downloadBlob, t }) {
  return (
    <div className="history-panel">
      {historyItems.length ? (
        historyItems.map((item) => (
          <div className="history-item" key={item.id}>
            <div>
              <strong>{item.voiceName}</strong>
              <span>
                {item.createdAt} · {formatTime(item.duration)} · {item.script.slice(0, 18)}
              </span>
            </div>
            <button type="button" onClick={() => onUseHistoryItem(item)}>
              {t("use")}
            </button>
            <button type="button" onClick={() => downloadBlob(item.blob, `history-${item.voiceName}.wav`)}>
              {t("download")}
            </button>
            <button type="button" onClick={() => setHistoryItems((items) => items.filter((entry) => entry.id !== item.id))}>
              {t("delete")}
            </button>
          </div>
        ))
      ) : (
        <div className="empty-state">{t("noMediaHistory")}</div>
      )}
    </div>
  );
}
