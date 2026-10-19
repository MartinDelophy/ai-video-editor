import { getAudioProcessingCopy } from "./i18nAudioProcessing.js";
import { getCaptionEditingCopy, getCaptionKeywordCopy, getCaptionSpacingCopy, getCaptionVisualLinkCopy } from "./i18nCaptionEditing.js";
const rows = {
  zh: ["处理字幕、旁白或音频", "识别字幕、生成旁白、处理降噪及声音链，或修复视频水印；返回结果供审阅，不修改时间线。", "将真实字幕、旁白或音频处理结果生成编辑预览，确认后应用。"],
  en: ["Process captions, narration or audio", "Transcribe captions, synthesize narration, process denoise and audio chains, or repair video watermarks. Return results for review without editing the timeline.", "Prepare an edit preview from real caption, narration or audio processing results; apply after review."],
  ja: ["字幕・ナレーション・音声の処理", "字幕認識、ナレーション生成、ノイズ除去と音声処理、動画透かし修復を行い、タイムラインを変更せず結果を返します。", "実際の字幕・ナレーション・音声処理結果から編集プレビューを作成し、確認後に適用します。"],
  ko: ["자막·내레이션·오디오 처리", "자막 인식, 내레이션 생성, 노이즈 및 오디오 처리, 영상 워터마크 복구 결과를 검토용으로 반환하며 타임라인은 변경하지 않습니다.", "실제 자막·내레이션·오디오 처리 결과로 편집 미리보기를 만들고 검토 후 적용합니다."],
  es: ["Procesar subtítulos, narración o audio", "Transcribe subtítulos, genera narración, procesa ruido y audio o repara marcas de agua. Devuelve resultados sin editar la línea de tiempo.", "Prepara una edición con resultados reales de subtítulos, narración o audio para revisar antes de aplicar."],
  fr: ["Traiter sous-titres, narration ou audio", "Transcrit les sous-titres, génère la narration, traite le bruit et l’audio ou restaure les filigranes vidéo, sans modifier la timeline.", "Prépare un aperçu à partir des résultats réels de sous-titres, narration ou audio, à appliquer après examen."],
  de: ["Untertitel, Erzählstimme oder Audio verarbeiten", "Untertitel transkribieren, Sprache erzeugen, Rauschen und Audio bearbeiten oder Video-Wasserzeichen reparieren. Ergebnisse ohne Timeline-Änderung prüfen.", "Bearbeitung aus echten Untertitel-, Sprach- oder Audioergebnissen vorbereiten und nach Prüfung anwenden."],
  pt: ["Processar legendas, narração ou áudio", "Transcreve legendas, gera narração, trata ruído e áudio ou repara marcas d’água, sem editar a linha do tempo.", "Prepara uma edição a partir de resultados reais de legenda, narração ou áudio para revisar antes de aplicar."],
  th: ["ประมวลผลคำบรรยาย เสียงบรรยาย หรือเสียง", "ถอดคำบรรยาย สร้างเสียงบรรยาย ลดเสียงรบกวนและประมวลผลเสียง หรือซ่อมลายน้ำวิดีโอ โดยไม่แก้ไขไทม์ไลน์", "สร้างตัวอย่างการแก้ไขจากผลคำบรรยาย เสียงบรรยาย หรือเสียงจริง แล้วใช้หลังตรวจสอบ"],
  vi: ["Xử lý phụ đề, lời dẫn hoặc âm thanh", "Nhận dạng phụ đề, tạo lời dẫn, khử nhiễu và xử lý âm thanh hoặc sửa watermark video, trả kết quả để duyệt mà không sửa dòng thời gian.", "Tạo bản xem trước chỉnh sửa từ kết quả phụ đề, lời dẫn hoặc âm thanh thực, áp dụng sau khi duyệt."],
  ru: ["Обработать субтитры, озвучку или аудио", "Распознаёт субтитры, создаёт озвучку, обрабатывает шум и звук или восстанавливает видео с водяными знаками, не меняя монтаж.", "Готовит предпросмотр из реальных результатов субтитров, озвучки или аудио для проверки перед применением."],
  it: ["Elabora sottotitoli, narrazione o audio", "Trascrive sottotitoli, genera narrazione, riduce il rumore ed elabora l’audio o ripara filigrane video, senza modificare la timeline.", "Prepara un’anteprima dai risultati reali di sottotitoli, narrazione o audio, da applicare dopo la verifica."],
  id: ["Proses takarir, narasi, atau audio", "Transkripsikan takarir, buat narasi, proses pengurangan derau dan audio, atau perbaiki tanda air video tanpa mengubah linimasa.", "Siapkan pratinjau edit dari hasil takarir, narasi, atau audio nyata untuk ditinjau sebelum diterapkan."],
};
const catalogs = {
  zh: ["读取 Anna 声音", "读取真实可用的模型和声音目录，不生成音频。"], en: ["Read Anna voices", "Read available real model and voice IDs without generating audio."],
  ja: ["Anna の音声を確認", "音声を生成せず、利用可能な実際のモデルと音声 ID を読み取ります。"], ko: ["Anna 음성 조회", "오디오를 생성하지 않고 사용 가능한 실제 모델과 음성 ID를 읽습니다."],
  es: ["Consultar voces Anna", "Consulta los modelos y voces reales disponibles sin generar audio."], fr: ["Consulter les voix Anna", "Lit les modèles et voix réellement disponibles sans générer d’audio."],
  de: ["Anna-Stimmen lesen", "Verfügbare echte Modelle und Stimmen ohne Audioerzeugung lesen."], pt: ["Consultar vozes Anna", "Consulta os modelos e vozes reais disponíveis sem gerar áudio."],
  th: ["อ่านเสียง Anna", "อ่านรหัสโมเดลและเสียงจริงที่ใช้ได้โดยไม่สร้างเสียง"], vi: ["Đọc giọng Anna", "Đọc mã mô hình và giọng thực có sẵn mà không tạo âm thanh."],
  ru: ["Просмотреть голоса Anna", "Читает доступные реальные модели и голоса без генерации аудио."], it: ["Leggi le voci Anna", "Legge i modelli e le voci reali disponibili senza generare audio."],
  id: ["Baca suara Anna", "Baca model dan ID suara nyata yang tersedia tanpa membuat audio."],
};
export function getChatCutFeatureCopy(language) {
  const row = rows[language] || rows.en, audio = getAudioProcessingCopy(language), caption = getCaptionEditingCopy(language), spacing = getCaptionSpacingCopy(language), keyword = getCaptionKeywordCopy(language);
  return {
    toolVoiceCatalogTitle: (catalogs[language] || catalogs.en)[0], toolVoiceCatalogDescription: (catalogs[language] || catalogs.en)[1],
    toolAiProcessTitle: row[0], toolAiProcessDescription: row[1], toolAiPreviewDescription: row[2],
    fieldVisualLink: getCaptionVisualLinkCopy(language)[0], fieldTextAlign: caption[0], valueAlignLeft: caption[1], valueAlignCenter: caption[2], valueAlignRight: caption[3], fieldPaddingX: caption[4], fieldPaddingY: caption[5],
    fieldHighlightWords: keyword[0], fieldHighlightColor: keyword[1], fieldLetterSpacing: spacing[0], fieldLineGap: spacing[1],
    ...Object.fromEntries(["processing", "eq", "compressor", "loudness", "limiter", "engine", "strength", "low", "mid", "high", "threshold", "ratio", "attack", "release", "gain", "ceiling"].map(key => [`processing_${key}`, audio[key]])),
    processing_off: audio.off,
  };
}
