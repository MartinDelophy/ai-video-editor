const keys=['title','hint','processing','ready','error','original','enhanced','retry','playing'];
const rows={
zh:['人声增强','降低噪声、改善清晰度并平衡人声音量。','正在增强人声','人声增强已应用','增强失败，原音频已保留','对比原声','试听增强','重试','停止试听'],
en:['Voice enhancement','Reduce noise, improve clarity and balance speech levels.','Enhancing speech','Voice enhancement applied','Enhancement failed; original audio retained','Compare original','Preview enhanced','Retry','Stop preview'],
ja:['音声強調','ノイズを抑え、明瞭さと声の音量を整えます。','音声を強調中','音声強調を適用しました','失敗しました。元音声は保持されています','元音声と比較','強調音声を試聴','再試行','試聴を停止'],
ko:['음성 향상','잡음을 줄이고 명료도와 말소리 음량을 개선합니다.','음성 향상 중','음성 향상 적용됨','실패했습니다. 원본 오디오는 유지됩니다','원본 비교','향상된 음성 듣기','재시도','미리 듣기 중지'],
es:['Mejorar voz','Reduce ruido, mejora claridad y equilibra la voz.','Mejorando la voz','Mejora de voz aplicada','Error; se conserva el audio original','Comparar original','Escuchar mejora','Reintentar','Detener escucha'],
fr:['Améliorer la voix','Réduit le bruit et équilibre la clarté et le volume vocal.','Amélioration de la voix','Amélioration appliquée','Échec ; audio original conservé','Comparer l’original','Écouter le résultat','Réessayer','Arrêter l’écoute'],
de:['Stimme verbessern','Reduziert Rauschen und verbessert Klarheit und Sprachpegel.','Stimme wird verbessert','Stimmverbesserung angewendet','Fehlgeschlagen; Originalaudio bleibt erhalten','Original vergleichen','Verbesserung anhören','Erneut versuchen','Wiedergabe stoppen'],
pt:['Melhorar voz','Reduz ruído, melhora a clareza e equilibra a voz.','Melhorando a voz','Melhoria de voz aplicada','Falha; áudio original preservado','Comparar original','Ouvir melhoria','Tentar novamente','Parar prévia'],
th:['เพิ่มความชัดของเสียงพูด','ลดเสียงรบกวน เพิ่มความชัด และปรับระดับเสียงพูด','กำลังปรับปรุงเสียงพูด','ปรับปรุงเสียงพูดแล้ว','ไม่สำเร็จ เก็บเสียงต้นฉบับไว้แล้ว','เปรียบเทียบต้นฉบับ','ฟังเสียงที่ปรับแล้ว','ลองใหม่','หยุดฟัง'],
vi:['Tăng cường giọng nói','Giảm nhiễu, tăng độ rõ và cân bằng âm lượng giọng nói.','Đang cải thiện giọng nói','Đã áp dụng cải thiện','Thất bại; âm thanh gốc được giữ lại','So sánh bản gốc','Nghe bản cải thiện','Thử lại','Dừng nghe'],
ru:['Улучшение голоса','Уменьшает шум, повышает разборчивость и выравнивает громкость.','Улучшение речи','Улучшение голоса применено','Ошибка; исходное аудио сохранено','Сравнить оригинал','Прослушать результат','Повторить','Остановить'],
it:['Migliora voce','Riduce il rumore, migliora la chiarezza e bilancia la voce.','Miglioramento della voce','Miglioramento applicato','Errore; audio originale conservato','Confronta originale','Ascolta risultato','Riprova','Interrompi ascolto'],
id:['Tingkatkan suara','Kurangi derau, perjelas ucapan dan seimbangkan volumenya.','Meningkatkan ucapan','Peningkatan suara diterapkan','Gagal; audio asli tetap tersimpan','Bandingkan asli','Dengarkan hasil','Coba lagi','Hentikan pratinjau']};
export function getSpeechEnhancementCopy(language){const row=rows[language]||rows.en;return Object.fromEntries(keys.map((key,i)=>[key,row[i]]));}
