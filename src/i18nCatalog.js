// Recovery copy belongs to the catalog panel so language changes also update
// an already visible error without issuing another provider request.
const CATALOG_COPY = {
  zh: { unavailable: "暂时无法从 {provider} 加载素材。请重试，或从本地上传文件。", retry: "重新加载" },
  en: { unavailable: "Could not load media from {provider}. Try again, or upload a local file.", retry: "Try again" },
  ja: { unavailable: "{provider} から素材を読み込めませんでした。再試行するか、端末のファイルを追加してください。", retry: "再試行" },
  ko: { unavailable: "{provider}에서 미디어를 불러오지 못했습니다. 다시 시도하거나 로컬 파일을 업로드하세요.", retry: "다시 시도" },
  es: { unavailable: "No se pudo cargar contenido de {provider}. Inténtalo de nuevo o sube un archivo local.", retry: "Reintentar" },
  fr: { unavailable: "Impossible de charger les médias de {provider}. Réessayez ou importez un fichier local.", retry: "Réessayer" },
  de: { unavailable: "Medien von {provider} konnten nicht geladen werden. Versuche es erneut oder lade eine lokale Datei hoch.", retry: "Erneut versuchen" },
  pt: { unavailable: "Não foi possível carregar mídia de {provider}. Tente novamente ou envie um arquivo local.", retry: "Tentar novamente" },
  th: { unavailable: "ไม่สามารถโหลดสื่อจาก {provider} ได้ โปรดลองอีกครั้งหรืออัปโหลดไฟล์จากอุปกรณ์", retry: "ลองอีกครั้ง" },
  vi: { unavailable: "Không thể tải nội dung từ {provider}. Hãy thử lại hoặc tải tệp từ thiết bị lên.", retry: "Thử lại" },
  ru: { unavailable: "Не удалось загрузить медиа из {provider}. Повторите попытку или загрузите файл с устройства.", retry: "Повторить" },
  it: { unavailable: "Impossibile caricare i contenuti da {provider}. Riprova oppure carica un file locale.", retry: "Riprova" },
  id: { unavailable: "Tidak dapat memuat media dari {provider}. Coba lagi atau unggah berkas lokal.", retry: "Coba lagi" },
};

export function getCatalogCopy(language, provider) {
  const copy = CATALOG_COPY[language] || CATALOG_COPY.en;
  return { ...copy, unavailable: copy.unavailable.replace("{provider}", provider) };
}
