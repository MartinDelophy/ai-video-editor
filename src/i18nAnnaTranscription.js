const notices = {
zh:'字幕识别会将所选音频分段发送给 Anna，按音频秒数消耗账户 CU。时间由分段范围估算；停止等待不会取消已提交的转写或退还其费用。',
en:'Caption recognition sends selected audio chunks to Anna and uses account CU per audio second. Timing is estimated from chunk ranges. Stopping does not cancel or refund submitted transcription.',
ja:'選択した音声を分割して Anna に送信し、音声の秒数に応じて CU を消費します。時刻は分割範囲から推定されます。停止しても送信済みの認識や料金は取り消されません。',
ko:'선택한 오디오를 나누어 Anna에 전송하며 초당 계정 CU를 사용합니다. 시간은 구간으로 추정합니다. 중지해도 제출된 변환은 취소되거나 환불되지 않습니다.',
es:'El audio seleccionado se envía por fragmentos a Anna y consume CU por segundo. Los tiempos se estiman por fragmento. Detener no cancela ni reembolsa las transcripciones enviadas.',
fr:'L’audio sélectionné est envoyé par segments à Anna et consomme des CU par seconde. Les temps sont estimés par segment. Arrêter n’annule ni ne rembourse les transcriptions envoyées.',
de:'Ausgewählte Audioabschnitte werden an Anna gesendet und verbrauchen CU pro Sekunde. Zeiten werden aus den Abschnitten geschätzt. Stoppen storniert oder erstattet bereits gesendete Transkriptionen nicht.',
pt:'O áudio selecionado é enviado em trechos à Anna e consome CU por segundo. Os tempos são estimados pelos trechos. Parar não cancela nem reembolsa transcrições enviadas.',
th:'ส่งเสียงที่เลือกเป็นช่วงไปยัง Anna และใช้ CU ตามจำนวนวินาที เวลาเป็นค่าประมาณจากช่วงเสียง การหยุดไม่ยกเลิกหรือคืนค่าใช้จ่ายของงานที่ส่งแล้ว',
vi:'Âm thanh được chọn được chia đoạn gửi tới Anna và dùng CU theo giây. Thời gian được ước tính theo đoạn. Dừng không hủy hay hoàn phí phiên chép lời đã gửi.',
ru:'Выбранный звук отправляется в Anna частями с оплатой CU за секунду. Время оценивается по границам частей. Остановка не отменяет и не возвращает оплату отправленных запросов.',
it:'L’audio selezionato viene inviato ad Anna in segmenti e consuma CU al secondo. I tempi sono stimati dai segmenti. L’arresto non annulla né rimborsa le trascrizioni inviate.',
id:'Audio terpilih dikirim per bagian ke Anna dan memakai CU per detik. Waktu diperkirakan dari rentang bagian. Berhenti tidak membatalkan atau mengembalikan biaya transkripsi yang dikirim.',
};
export const getAnnaTranscriptionNotice = language => notices[language] || notices.en;
const errors = {
zh:'Anna 转写未完成。请检查应用的音频识别授权、所选模型、CU 和网络。已有字幕未改动；已提交片段可能仍会计费。',
en:'Anna transcription did not finish. Check app transcription permission, model, CU and network. Existing captions are unchanged; submitted chunks may still be billed.',
ja:'Anna の文字起こしが完了しませんでした。アプリの音声認識権限、モデル、CU、接続を確認してください。既存字幕は保持され、送信済み音声には料金が発生する場合があります。',
ko:'Anna 변환이 완료되지 않았습니다. 앱의 인식 권한, 모델, CU와 연결을 확인하세요. 기존 자막은 유지되며 제출한 구간은 청구될 수 있습니다.',
es:'La transcripción de Anna no terminó. Revisa permisos, modelo, CU y red. Los subtítulos existentes se conservan; los fragmentos enviados pueden cobrarse.',
fr:'La transcription Anna n’a pas abouti. Vérifiez autorisation, modèle, CU et réseau. Les sous-titres existants sont conservés ; les segments envoyés peuvent être facturés.',
de:'Anna-Transkription nicht abgeschlossen. Berechtigung, Modell, CU und Netzwerk prüfen. Vorhandene Untertitel bleiben erhalten; gesendete Abschnitte können berechnet werden.',
pt:'A transcrição Anna não terminou. Verifique permissão, modelo, CU e rede. As legendas existentes são preservadas; trechos enviados podem ser cobrados.',
th:'Anna ถอดเสียงไม่สำเร็จ ตรวจสอบสิทธิ์แอป โมเดล CU และเครือข่าย คงคำบรรยายเดิมไว้ ช่วงเสียงที่ส่งแล้วอาจยังมีค่าใช้จ่าย',
vi:'Anna chưa chép lời xong. Kiểm tra quyền ứng dụng, mô hình, CU và mạng. Phụ đề cũ được giữ; đoạn đã gửi vẫn có thể tính phí.',
ru:'Транскрипция Anna не завершена. Проверьте разрешение, модель, CU и сеть. Старые субтитры сохранены; отправленные части могут быть оплачены.',
it:'Trascrizione Anna non completata. Controlla autorizzazione, modello, CU e rete. I sottotitoli esistenti restano invariati; i segmenti inviati possono essere addebitati.',
id:'Transkripsi Anna belum selesai. Periksa izin aplikasi, model, CU dan jaringan. Subtitle lama tetap tersimpan; bagian yang dikirim mungkin tetap ditagih.',
};
export const getAnnaTranscriptionError = language => errors[language] || errors.en;

const captionServiceCopy = {
 zh:"加载 Anna ASR 模型，识别后写入字幕轨", en:"Load the Anna ASR model, then transcribe to the caption track",
 ja:"Anna ASR モデルを読み込み、認識後に字幕トラックへ書き込みます", ko:"Anna ASR 모델을 불러와 인식 후 자막 트랙에 작성합니다",
 es:"Carga el modelo Anna ASR y escribe la transcripción en la pista de subtítulos", fr:"Charge le modèle Anna ASR, puis écrit la transcription dans la piste de sous-titres",
 de:"Anna-ASR-Modell laden und die Erkennung in die Untertitelspur schreiben", pt:"Carrega o modelo Anna ASR e grava a transcrição na faixa de legendas",
 th:"โหลดโมเดล Anna ASR แล้วเขียนผลการรู้จำลงแทร็กคำบรรยาย", vi:"Tải mô hình Anna ASR rồi ghi kết quả nhận dạng vào phụ đề",
 ru:"Загрузка модели Anna ASR и запись распознанного текста в дорожку субтитров", it:"Carica il modello Anna ASR e scrive il testo riconosciuto nella traccia sottotitoli",
 id:"Muat model Anna ASR, lalu tulis hasil pengenalan ke trek subtitel",
};
export const getAnnaCaptionServiceCopy = language => captionServiceCopy[language] || captionServiceCopy.en;

const captionJobCopy = {
 zh:['正在识别字幕','准备音频…','写入字幕轨…','停止等待','已停止等待'],
 en:['Recognizing captions','Preparing audio…','Writing captions…','Stop waiting','Stopped waiting'],
 ja:['字幕を認識中','音声を準備中…','字幕を書き込み中…','待機を停止','待機を停止しました'],
 ko:['자막 인식 중','오디오 준비 중…','자막 작성 중…','대기 중지','대기를 중지했습니다'],
 es:['Reconociendo subtítulos','Preparando audio…','Escribiendo subtítulos…','Dejar de esperar','Espera detenida'],
 fr:['Reconnaissance en cours','Préparation audio…','Écriture des sous-titres…','Arrêter l’attente','Attente arrêtée'],
 de:['Untertitel werden erkannt','Audio vorbereiten…','Untertitel schreiben…','Warten beenden','Warten beendet'],
 pt:['Reconhecendo legendas','Preparando áudio…','Gravando legendas…','Parar de esperar','Espera encerrada'],
 th:['กำลังรู้จำคำบรรยาย','กำลังเตรียมเสียง…','กำลังเขียนคำบรรยาย…','หยุดรอ','หยุดรอแล้ว'],
 vi:['Đang nhận dạng phụ đề','Đang chuẩn bị âm thanh…','Đang ghi phụ đề…','Dừng chờ','Đã dừng chờ'],
 ru:['Распознавание субтитров','Подготовка аудио…','Запись субтитров…','Прекратить ожидание','Ожидание прекращено'],
 it:['Riconoscimento sottotitoli','Preparazione audio…','Scrittura sottotitoli…','Interrompi attesa','Attesa interrotta'],
 id:['Mengenali subtitel','Menyiapkan audio…','Menulis subtitel…','Berhenti menunggu','Berhenti menunggu'],
};
export const getCaptionJobCopy = language => captionJobCopy[language] || captionJobCopy.en;
