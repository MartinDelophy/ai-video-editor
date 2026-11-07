const keys = ["title", "range", "start", "end", "fixed", "invalid", "done"];
const rows = {
  zh: ["替换片段", "素材取用区间（秒）", "起点", "终点", "保留时间轴片段时长", "请选择有效区间，匹配时长后的速度须为 0.25×–4×。", "已替换片段"],
  en: ["Replace clip", "Source range (seconds)", "In point", "Out point", "Keeps the timeline clip duration", "Choose a valid range that fits the clip at 0.25×–4× speed.", "Clip replaced"],
  ja: ["クリップを置き換え", "素材の使用範囲（秒）", "開始点", "終了点", "タイムライン上の長さを維持", "0.25〜4倍速で収まる範囲を選択してください。", "クリップを置き換えました"],
  ko: ["클립 교체", "원본 사용 구간(초)", "시작점", "끝점", "타임라인 클립 길이 유지", "0.25×–4× 속도로 길이를 맞출 수 있는 구간을 선택하세요.", "클립을 교체했습니다"],
  es: ["Reemplazar clip", "Intervalo del material (segundos)", "Punto de entrada", "Punto de salida", "Mantiene la duración en la línea de tiempo", "Elige un intervalo que encaje a una velocidad de 0,25×–4×.", "Clip reemplazado"],
  fr: ["Remplacer le clip", "Plage source (secondes)", "Point d’entrée", "Point de sortie", "Conserve la durée du clip dans la timeline", "Choisissez une plage compatible avec une vitesse de 0,25× à 4×.", "Clip remplacé"],
  de: ["Clip ersetzen", "Quellbereich (Sekunden)", "Startpunkt", "Endpunkt", "Behält die Clipdauer in der Timeline bei", "Wähle einen Bereich, der mit 0,25× bis 4× Geschwindigkeit in den Clip passt.", "Clip ersetzt"],
  pt: ["Substituir clipe", "Intervalo da mídia (segundos)", "Ponto de entrada", "Ponto de saída", "Mantém a duração do clipe na linha do tempo", "Escolha um intervalo que caiba a uma velocidade de 0,25× a 4×.", "Clipe substituído"],
  th: ["แทนที่คลิป", "ช่วงจากต้นฉบับ (วินาที)", "จุดเริ่ม", "จุดสิ้นสุด", "คงความยาวคลิปบนไทม์ไลน์", "เลือกช่วงที่พอดีกับคลิปที่ความเร็ว 0.25×–4×", "แทนที่คลิปแล้ว"],
  vi: ["Thay clip", "Khoảng dùng từ nguồn (giây)", "Điểm vào", "Điểm ra", "Giữ thời lượng clip trên dòng thời gian", "Chọn khoảng vừa với clip ở tốc độ 0,25×–4×.", "Đã thay clip"],
  ru: ["Заменить клип", "Отрезок источника (секунды)", "Начало", "Конец", "Длительность клипа на шкале сохраняется", "Выберите отрезок, который укладывается в клип при скорости 0,25×–4×.", "Клип заменён"],
  it: ["Sostituisci clip", "Intervallo della sorgente (secondi)", "Punto di ingresso", "Punto di uscita", "Mantiene la durata della clip nella timeline", "Scegli un intervallo compatibile con una velocità di 0,25×–4×.", "Clip sostituita"],
  id: ["Ganti klip", "Rentang sumber (detik)", "Titik masuk", "Titik keluar", "Durasi klip di linimasa tetap", "Pilih rentang yang pas pada kecepatan 0,25×–4×.", "Klip diganti"],
};
export const replacementCopy = (language) => Object.fromEntries(
  keys.map((key, index) => [key, (rows[language] || rows.en)[index]]),
);
