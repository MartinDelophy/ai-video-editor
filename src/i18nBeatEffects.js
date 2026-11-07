const keys = [
  "beat-montage", "beat-backdrop", "beat-zoom", "ink-print", "shape-flash",
  "beatSource", "tempo", "markers", "beatDivision", "quarter", "eighth", "shape", "circle", "star", "line",
];
const rows = {
  zh: ["三分屏卡点", "底色闪拍", "卡点推拉", "网点线描", "形状闪光", "卡点来源", "固定节拍", "时间轴标记", "节拍间隔", "四分音符", "八分音符", "形状", "圆形", "星形", "横线"],
  en: ["Three-panel beat montage", "Background beat flash", "Beat zoom", "Halftone ink", "Shape flash", "Beat source", "Fixed tempo", "Timeline markers", "Beat interval", "Quarter note", "Eighth note", "Shape", "Circle", "Star", "Horizontal line"],
  ja: ["3分割ビート編集", "背景ビートフラッシュ", "ビートズーム", "網点インク", "図形フラッシュ", "ビートの基準", "固定テンポ", "タイムラインマーカー", "ビート間隔", "四分音符", "八分音符", "図形", "円", "星", "横線"],
  ko: ["3분할 비트 몽타주", "배경 비트 플래시", "비트 줌", "망점 잉크", "도형 플래시", "비트 기준", "고정 템포", "타임라인 마커", "비트 간격", "4분음표", "8분음표", "도형", "원", "별", "가로선"],
  es: ["Montaje rítmico de tres paneles", "Destello de fondo al ritmo", "Zoom al ritmo", "Trama de tinta", "Destello con forma", "Fuente del ritmo", "Tempo fijo", "Marcadores de la línea de tiempo", "Intervalo rítmico", "Negra", "Corchea", "Forma", "Círculo", "Estrella", "Línea horizontal"],
  fr: ["Montage rythmé à trois panneaux", "Flash de fond au rythme", "Zoom au rythme", "Trame d’encre", "Flash en forme", "Source du rythme", "Tempo fixe", "Marqueurs de la timeline", "Intervalle rythmique", "Noire", "Croche", "Forme", "Cercle", "Étoile", "Ligne horizontale"],
  de: ["Dreiteilige Beatmontage", "Hintergrundblitz im Takt", "Zoom im Takt", "Rastertinte", "Formblitz", "Taktquelle", "Festes Tempo", "Timeline-Markierungen", "Taktintervall", "Viertelnote", "Achtelnote", "Form", "Kreis", "Stern", "Horizontale Linie"],
  pt: ["Montagem rítmica em três painéis", "Flash de fundo no ritmo", "Zoom no ritmo", "Retícula de tinta", "Flash de forma", "Fonte do ritmo", "Tempo fixo", "Marcadores da linha do tempo", "Intervalo rítmico", "Semínima", "Colcheia", "Forma", "Círculo", "Estrela", "Linha horizontal"],
  th: ["ตัดต่อสามช่องตามจังหวะ", "พื้นหลังวาบตามจังหวะ", "ซูมตามจังหวะ", "ลายจุดหมึก", "แฟลชรูปทรง", "แหล่งจังหวะ", "จังหวะคงที่", "หมุดบนไทม์ไลน์", "ช่วงจังหวะ", "โน้ตตัวดำ", "เขบ็ตหนึ่งชั้น", "รูปทรง", "วงกลม", "ดาว", "เส้นแนวนอน"],
  vi: ["Dựng ba khung theo nhịp", "Nền chớp theo nhịp", "Thu phóng theo nhịp", "Mực tram", "Chớp hình", "Nguồn nhịp", "Nhịp độ cố định", "Dấu mốc dòng thời gian", "Khoảng nhịp", "Nốt đen", "Nốt móc đơn", "Hình", "Tròn", "Sao", "Đường ngang"],
  ru: ["Три панели в ритме", "Вспышка фона в ритме", "Зум в ритме", "Растровая тушь", "Фигурная вспышка", "Источник ритма", "Постоянный темп", "Метки шкалы времени", "Интервал долей", "Четвертная", "Восьмая", "Форма", "Круг", "Звезда", "Горизонтальная линия"],
  it: ["Montaggio a ritmo in tre riquadri", "Lampo di sfondo a ritmo", "Zoom a ritmo", "Retino a inchiostro", "Lampo con forma", "Sorgente del ritmo", "Tempo fisso", "Marcatori della timeline", "Intervallo ritmico", "Semiminima", "Croma", "Forma", "Cerchio", "Stella", "Linea orizzontale"],
  id: ["Montase tiga panel mengikuti ketukan", "Kilat latar mengikuti ketukan", "Zum mengikuti ketukan", "Tinta halftone", "Kilat berbentuk", "Sumber ketukan", "Tempo tetap", "Penanda linimasa", "Jarak ketukan", "Not seperempat", "Not seperdelapan", "Bentuk", "Lingkaran", "Bintang", "Garis horizontal"],
};
export const beatEffectCopy = (language) => Object.fromEntries(keys.map((key, index) => [key, (rows[language] || rows.en)[index]]));
