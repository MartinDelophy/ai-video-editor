const keys = ["alignment", "yaw", "pitch", "timing", "reset"];
const rows = {
  zh: ["位置对齐", "水平倾斜", "俯仰倾斜", "时间与片段", "重置对齐"],
  en: ["Alignment", "Horizontal tilt", "Vertical tilt", "Timing and clip", "Reset alignment"],
  ja: ["位置合わせ", "左右の傾き", "上下の傾き", "時間とクリップ", "位置をリセット"],
  ko: ["위치 맞춤", "좌우 기울기", "상하 기울기", "시간 및 클립", "정렬 초기화"],
  es: [
    "Alineación",
    "Inclinación horizontal",
    "Inclinación vertical",
    "Tiempo y clip",
    "Restablecer alineación",
  ],
  fr: [
    "Alignement",
    "Inclinaison horizontale",
    "Inclinaison verticale",
    "Durée et clip",
    "Réinitialiser l’alignement",
  ],
  de: [
    "Ausrichtung",
    "Horizontale Neigung",
    "Vertikale Neigung",
    "Zeit und Clip",
    "Ausrichtung zurücksetzen",
  ],
  pt: [
    "Alinhamento",
    "Inclinação horizontal",
    "Inclinação vertical",
    "Tempo e clipe",
    "Redefinir alinhamento",
  ],
  th: ["จัดตำแหน่ง", "เอียงแนวนอน", "เอียงแนวตั้ง", "เวลาและคลิป", "รีเซ็ตตำแหน่ง"],
  vi: ["Căn chỉnh", "Nghiêng ngang", "Nghiêng dọc", "Thời gian và đoạn", "Đặt lại căn chỉnh"],
  ru: [
    "Выравнивание",
    "Наклон по горизонтали",
    "Наклон по вертикали",
    "Время и клип",
    "Сбросить выравнивание",
  ],
  it: [
    "Allineamento",
    "Inclinazione orizzontale",
    "Inclinazione verticale",
    "Tempo e clip",
    "Ripristina allineamento",
  ],
  id: [
    "Penyelarasan",
    "Kemiringan horizontal",
    "Kemiringan vertikal",
    "Waktu dan klip",
    "Atur ulang penyelarasan",
  ],
};
export const faceAppearanceCopy = (language) =>
  Object.fromEntries(keys.map((key, index) => [key, (rows[language] || rows.en)[index]]));
