const rows={
zh:['自动避让人声','说话时压低音乐，停顿后恢复。','强度','轻柔','自然','明显','正在检测人声','检测失败，请关闭后重试','避让已就绪'],
en:['Auto duck speech','Lower this audio during other speech; restore during pauses.','Strength','Gentle','Natural','Strong','Detecting speech','Detection failed. Turn off and retry.','Ducking ready'],
ja:['音声を自動回避','他の話し声に合わせて音量を下げ、間で戻します。','強さ','弱め','自然','強め','音声を検出中','検出失敗。オフにして再試行してください。','回避の準備完了'],
ko:['음성 자동 회피','다른 말소리가 나올 때 줄이고 쉬는 동안 복원합니다.','강도','약하게','자연스럽게','강하게','음성 감지 중','감지 실패. 끈 후 다시 시도하세요.','회피 준비 완료'],
es:['Atenuar ante la voz','Baja este audio durante otras voces y lo restaura en pausas.','Intensidad','Suave','Natural','Fuerte','Detectando voz','Error de detección. Desactiva y reintenta.','Atenuación lista'],
fr:['Atténuation automatique','Baisse cet audio pendant les autres voix, puis le rétablit.','Intensité','Douce','Naturelle','Forte','Détection des voix','Échec. Désactivez puis réessayez.','Atténuation prête'],
de:['Sprache automatisch freistellen','Senkt dieses Audio bei anderen Stimmen und hebt es in Pausen an.','Stärke','Sanft','Natürlich','Stark','Sprache wird erkannt','Erkennung fehlgeschlagen. Ausschalten und erneut versuchen.','Absenkung bereit'],
pt:['Atenuar durante a fala','Reduz este áudio durante outras vozes e restaura nas pausas.','Intensidade','Suave','Natural','Forte','Detectando fala','Falha na detecção. Desative e tente novamente.','Atenuação pronta'],
th:['ลดเสียงอัตโนมัติเมื่อมีคำพูด','ลดเสียงนี้ขณะมีเสียงพูดอื่นและคืนระดับเมื่อหยุดพูด','ความแรง','เบา','เป็นธรรมชาติ','มาก','กำลังตรวจเสียงพูด','ตรวจไม่สำเร็จ โปรดปิดแล้วลองใหม่','พร้อมลดเสียง'],
vi:['Tự giảm khi có lời nói','Giảm âm thanh này khi có giọng khác và khôi phục lúc nghỉ.','Mức độ','Nhẹ','Tự nhiên','Mạnh','Đang phát hiện lời nói','Phát hiện thất bại. Tắt rồi thử lại.','Sẵn sàng giảm âm'],
ru:['Автоприглушение при речи','Снижает этот звук при других голосах и восстанавливает в паузах.','Сила','Мягко','Естественно','Сильно','Поиск речи','Ошибка. Выключите и повторите.','Приглушение готово'],
it:['Attenua durante il parlato','Abbassa questo audio durante altre voci e lo ripristina nelle pause.','Intensità','Leggera','Naturale','Forte','Rilevamento del parlato','Rilevamento fallito. Disattiva e riprova.','Attenuazione pronta'],
id:['Redam saat ada ucapan','Turunkan audio ini saat suara lain berbicara, pulihkan saat jeda.','Kekuatan','Lembut','Alami','Kuat','Mendeteksi ucapan','Deteksi gagal. Matikan lalu coba lagi.','Peredaman siap']};
export function getDuckingCopy(language){return Object.fromEntries(['title','hint','strength','gentle','natural','strong','analyzing','error','ready'].map((key,i)=>[key,(rows[language]||rows.en)[i]]));}

const phases={
zh:['正在加载人声检测模型','正在读取音频','未检测到其他轨道人声，无需避让'],
en:['Loading speech detection model','Reading audio','No other speech detected; no ducking needed'],
ja:['音声検出モデルを読み込み中','音声を読み込み中','他の音声がないため、音量を下げる必要はありません'],
ko:['음성 감지 모델 로딩 중','오디오 읽는 중','다른 말소리가 없어 음량을 줄일 필요가 없습니다'],
es:['Cargando modelo de detección','Leyendo audio','No se detectaron otras voces; no hace falta atenuar'],
fr:['Chargement du modèle vocal','Lecture de l’audio','Aucune autre voix détectée ; aucune atténuation nécessaire'],
de:['Spracherkennungsmodell wird geladen','Audio wird gelesen','Keine andere Sprache erkannt; keine Absenkung nötig'],
pt:['Carregando modelo de detecção','Lendo áudio','Nenhuma outra fala detectada; não é preciso atenuar'],
th:['กำลังโหลดโมเดลตรวจเสียงพูด','กำลังอ่านเสียง','ไม่พบเสียงพูดในแทร็กอื่น ไม่จำเป็นต้องลดเสียง'],
vi:['Đang tải mô hình phát hiện lời nói','Đang đọc âm thanh','Không có lời nói khác; không cần giảm âm'],
ru:['Загрузка модели обнаружения речи','Чтение аудио','Другая речь не обнаружена; приглушение не требуется'],
it:['Caricamento modello del parlato','Lettura audio','Nessun’altra voce rilevata; attenuazione non necessaria'],
id:['Memuat model deteksi ucapan','Membaca audio','Tidak ada ucapan lain; peredaman tidak diperlukan']};
export function getDuckingPhaseCopy(language){const row=phases[language]||phases.en;return {loading:row[0],decoding:row[1],noSpeech:row[2]};}
