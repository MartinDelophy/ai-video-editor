const rows = {
 zh:['故障动画','RGB 错位、画面撕裂与信号噪点。','撕裂强度','RGB 错位','触发频率','单次持续时间','信号噪点'],
 en:['Glitch animation','RGB splitting, image tearing and signal noise.','Tear strength','RGB split','Frequency','Burst duration','Signal noise'],
 ja:['グリッチアニメーション','RGBずれ、映像の乱れ、信号ノイズ。','乱れの強さ','RGBずれ','頻度','持続時間','信号ノイズ'],
 ko:['글리치 애니메이션','RGB 분리, 화면 찢김과 신호 노이즈.','찢김 강도','RGB 분리','빈도','지속 시간','신호 노이즈'],
 es:['Animación glitch','Separación RGB, distorsión y ruido de señal.','Intensidad de distorsión','Separación RGB','Frecuencia','Duración del pulso','Ruido de señal'],
 fr:['Animation glitch','Décalage RVB, déchirure et bruit du signal.','Intensité de déchirure','Décalage RVB','Fréquence','Durée du flash','Bruit du signal'],
 de:['Glitch-Animation','RGB-Versatz, Bildrisse und Signalrauschen.','Verzerrungsstärke','RGB-Versatz','Frequenz','Impulsdauer','Signalrauschen'],
 pt:['Animação glitch','Separação RGB, distorção e ruído de sinal.','Intensidade da distorção','Separação RGB','Frequência','Duração do pulso','Ruído de sinal'],
 th:['แอนิเมชันกลิตช์','แยกสี RGB ภาพฉีก และสัญญาณรบกวน','ความแรงภาพฉีก','แยกสี RGB','ความถี่','ระยะเวลาต่อครั้ง','สัญญาณรบกวน'],
 vi:['Hiệu ứng glitch','Tách màu RGB, xé hình và nhiễu tín hiệu.','Độ xé hình','Tách màu RGB','Tần suất','Thời lượng mỗi lần','Nhiễu tín hiệu'],
 ru:['Глитч-анимация','Смещение RGB, разрывы кадра и шум сигнала.','Сила искажения','Смещение RGB','Частота','Длительность всплеска','Шум сигнала'],
 it:['Animazione glitch','Separazione RGB, distorsione e rumore del segnale.','Intensità distorsione','Separazione RGB','Frequenza','Durata impulso','Rumore del segnale'],
 id:['Animasi glitch','Pemisahan RGB, robekan gambar dan derau sinyal.','Kekuatan robekan','Pemisahan RGB','Frekuensi','Durasi semburan','Derau sinyal'],
};
export const GLITCH_COPY = Object.fromEntries(Object.entries(rows).map(([language, values]) => [language, Object.fromEntries(['glitchTitle','glitchHint','glitch_intensity','glitch_separation','glitch_frequency','glitch_duration','glitch_scanlines'].map((key,index) => [key,values[index]]))]));
