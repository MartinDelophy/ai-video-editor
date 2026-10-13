const rows = {
  zh: [
    ["先展示素材的核心内容", "先突出素材中已有的细节"],
    ["舒缓", "均衡", "紧凑"],
    ["保留原始构图", "适度裁切素材中的已有细节"],
    ["保留原声", "适度降低原声音量"],
  ],
  en: [
    ["Lead with the core content already present", "Lead with an existing detail"],
    ["Gentle", "Balanced", "Punchy"],
    ["Preserve source framing", "Crop an existing detail moderately"],
    ["Preserve source audio", "Lower source audio moderately"],
  ],
  ja: [
    ["素材の中心となる内容から始める", "既存の細部から始める"],
    ["穏やか", "バランス重視", "きびきび"],
    ["元の構図を保つ", "既存の細部を適度にクロップ"],
    ["元の音声を保つ", "元の音量を適度に下げる"],
  ],
  ko: [
    ["소재의 핵심 내용으로 시작", "기존 세부 장면으로 시작"],
    ["차분하게", "균형 있게", "빠르게"],
    ["원본 구도 유지", "기존 세부 장면을 적절히 자르기"],
    ["원본 오디오 유지", "원본 음량을 적절히 낮추기"],
  ],
  es: [
    ["Empezar con el contenido principal existente", "Empezar con un detalle existente"],
    ["Suave", "Equilibrado", "Dinámico"],
    ["Conservar el encuadre original", "Recortar moderadamente un detalle existente"],
    ["Conservar el audio original", "Reducir moderadamente el audio original"],
  ],
  fr: [
    ["Commencer par le contenu principal existant", "Commencer par un détail existant"],
    ["Doux", "Équilibré", "Dynamique"],
    ["Conserver le cadrage original", "Recadrer modérément un détail existant"],
    ["Conserver le son original", "Réduire modérément le son original"],
  ],
  de: [
    ["Mit vorhandenem Kerninhalt beginnen", "Mit einem vorhandenen Detail beginnen"],
    ["Ruhig", "Ausgewogen", "Dynamisch"],
    ["Originalbildausschnitt bewahren", "Vorhandenes Detail moderat zuschneiden"],
    ["Originalton bewahren", "Originalton moderat absenken"],
  ],
  pt: [
    ["Começar pelo conteúdo principal existente", "Começar por um detalhe existente"],
    ["Suave", "Equilibrado", "Dinâmico"],
    ["Preservar o enquadramento original", "Recortar moderadamente um detalhe existente"],
    ["Preservar o áudio original", "Reduzir moderadamente o áudio original"],
  ],
  th: [
    ["เริ่มด้วยเนื้อหาหลักที่มีอยู่", "เริ่มด้วยรายละเอียดที่มีอยู่"],
    ["นุ่มนวล", "สมดุล", "กระชับ"],
    ["รักษาองค์ประกอบภาพเดิม", "ครอปรายละเอียดที่มีอยู่เล็กน้อย"],
    ["รักษาเสียงต้นฉบับ", "ลดเสียงต้นฉบับเล็กน้อย"],
  ],
  vi: [
    ["Mở đầu bằng nội dung chính có sẵn", "Mở đầu bằng chi tiết có sẵn"],
    ["Nhẹ nhàng", "Cân bằng", "Dồn dập"],
    ["Giữ bố cục gốc", "Cắt khung vừa phải vào chi tiết có sẵn"],
    ["Giữ âm thanh gốc", "Giảm vừa phải âm thanh gốc"],
  ],
  ru: [
    ["Начать с основного имеющегося содержания", "Начать с имеющейся детали"],
    ["Спокойный", "Сбалансированный", "Динамичный"],
    ["Сохранить исходное кадрирование", "Умеренно кадрировать имеющуюся деталь"],
    ["Сохранить исходный звук", "Умеренно снизить исходный звук"],
  ],
  it: [
    ["Aprire con il contenuto principale esistente", "Aprire con un dettaglio esistente"],
    ["Dolce", "Equilibrato", "Dinamico"],
    ["Mantenere l’inquadratura originale", "Ritagliare moderatamente un dettaglio esistente"],
    ["Mantenere l’audio originale", "Ridurre moderatamente l’audio originale"],
  ],
  id: [
    ["Mulai dengan konten utama yang sudah ada", "Mulai dengan detail yang sudah ada"],
    ["Lembut", "Seimbang", "Dinamis"],
    ["Pertahankan bingkai asli", "Pangkas detail yang ada secukupnya"],
    ["Pertahankan audio asli", "Kurangi audio asli secukupnya"],
  ],
};
export function directorOptions(lang) {
  return Object.fromEntries(
    ["hook", "pacing", "visuals", "audio"].map((k, i) => [k, (rows[lang] || rows.en)[i]]),
  );
}
