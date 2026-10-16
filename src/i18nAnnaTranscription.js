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
