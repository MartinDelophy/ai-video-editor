const rows = {
  "zh": [
    "生成视频",
    "描述你想生成的画面",
    "画幅",
    "生成并保存到我的素材",
    "恢复任务",
    "停止等待",
    "生成中，可稍后恢复",
    "已保存到我的素材",
    "生成失败，请检查 Anna 视频授权和额度",
    "使用 Anna 视频模型，消耗账户 CU；停止等待不代表云端任务已取消。"
  ],
  "en": [
    "Generate video",
    "Describe your video",
    "Aspect ratio",
    "Generate to My assets",
    "Resume job",
    "Stop waiting",
    "Generating; you can resume later",
    "Saved to My assets",
    "Failed; check Anna video permission and quota",
    "Uses your Anna video model and CU. Stopping does not cancel the cloud job."
  ],
  "ja": [
    "動画生成",
    "動画の内容を説明",
    "縦横比",
    "生成して素材に保存",
    "再開",
    "待機を停止",
    "生成中・後で再開可能",
    "素材に保存しました",
    "Anna の動画権限と残高を確認してください",
    "Anna の動画モデルと CU を使用。待機停止はクラウド処理を中止しません。"
  ],
  "ko": [
    "동영상 생성",
    "원하는 장면 설명",
    "화면 비율",
    "생성 후 내 에셋에 저장",
    "작업 재개",
    "대기 중지",
    "생성 중 · 나중에 재개 가능",
    "내 에셋에 저장됨",
    "Anna 동영상 권한과 잔액을 확인하세요",
    "Anna 모델과 CU를 사용합니다. 대기 중지는 클라우드 작업을 취소하지 않습니다."
  ],
  "es": [
    "Generar vídeo",
    "Describe el vídeo",
    "Proporción",
    "Generar en Mis recursos",
    "Reanudar",
    "Dejar de esperar",
    "Generando; puedes reanudar",
    "Guardado en Mis recursos",
    "Comprueba permisos de vídeo y cuota de Anna",
    "Usa el modelo de Anna y CU. Dejar de esperar no cancela el trabajo remoto."
  ],
  "fr": [
    "Générer une vidéo",
    "Décrivez la vidéo",
    "Format",
    "Générer dans Mes médias",
    "Reprendre",
    "Arrêter l’attente",
    "Génération en cours, reprise possible",
    "Enregistré dans Mes médias",
    "Vérifiez les droits vidéo et le quota Anna",
    "Utilise le modèle Anna et des CU. Arrêter l’attente n’annule pas la tâche distante."
  ],
  "de": [
    "Video generieren",
    "Video beschreiben",
    "Seitenverhältnis",
    "In Meine Medien generieren",
    "Fortsetzen",
    "Warten beenden",
    "Generierung läuft; später fortsetzbar",
    "In Meine Medien gespeichert",
    "Anna-Videoberechtigung und Kontingent prüfen",
    "Verwendet Anna-Modell und CU. Warten beenden bricht den Cloud-Auftrag nicht ab."
  ],
  "pt": [
    "Gerar vídeo",
    "Descreva o vídeo",
    "Proporção",
    "Gerar em Meus recursos",
    "Retomar",
    "Parar de aguardar",
    "Gerando; pode retomar depois",
    "Salvo em Meus recursos",
    "Verifique a permissão de vídeo e a cota Anna",
    "Usa o modelo Anna e CU. Parar de aguardar não cancela a tarefa remota."
  ],
  "it": [
    "Genera video",
    "Descrivi il video",
    "Proporzioni",
    "Genera nelle mie risorse",
    "Riprendi",
    "Interrompi attesa",
    "Generazione in corso; ripresa disponibile",
    "Salvato nelle mie risorse",
    "Controlla autorizzazione video e quota Anna",
    "Usa il modello Anna e CU. Interrompere l’attesa non annulla il processo remoto."
  ],
  "id": [
    "Buat video",
    "Jelaskan video",
    "Rasio aspek",
    "Buat ke Aset saya",
    "Lanjutkan tugas",
    "Berhenti menunggu",
    "Sedang dibuat; dapat dilanjutkan",
    "Disimpan ke Aset saya",
    "Periksa izin video dan kuota Anna",
    "Menggunakan model Anna dan CU. Berhenti menunggu tidak membatalkan tugas cloud."
  ],
  "ru": [
    "Создать видео",
    "Опишите видео",
    "Соотношение сторон",
    "Создать в Моих материалах",
    "Продолжить",
    "Прекратить ожидание",
    "Создание; можно продолжить позже",
    "Сохранено в Моих материалах",
    "Проверьте доступ к видео и квоту Anna",
    "Использует модель Anna и CU. Остановка ожидания не отменяет облачную задачу."
  ],
  "vi": [
    "Tạo video",
    "Mô tả video",
    "Tỷ lệ khung hình",
    "Tạo vào Tài nguyên của tôi",
    "Tiếp tục",
    "Dừng chờ",
    "Đang tạo; có thể tiếp tục sau",
    "Đã lưu vào tài nguyên",
    "Kiểm tra quyền video và hạn mức Anna",
    "Dùng mô hình Anna và CU. Dừng chờ không hủy tác vụ đám mây."
  ],
  "th": [
    "สร้างวิดีโอ",
    "อธิบายวิดีโอ",
    "อัตราส่วนภาพ",
    "สร้างในสื่อของฉัน",
    "ทำต่อ",
    "หยุดรอ",
    "กำลังสร้าง สามารถทำต่อภายหลัง",
    "บันทึกในสื่อของฉันแล้ว",
    "ตรวจสอบสิทธิ์วิดีโอและโควตา Anna",
    "ใช้โมเดล Anna และ CU การหยุดรอไม่ได้ยกเลิกงานบนคลาวด์"
  ]
};
export function getAnnaVideoCopy(language) { const r = rows[language] || rows.en; return Object.fromEntries(["title","prompt","ratio","generate","resume","stop","running","complete","error","quota"].map((k,i)=>[k,r[i]])); }

const resolutionCopy = {
 zh: ["分辨率", "模型默认", "可用分辨率由 Anna 当前视频模型决定。"],
 en: ["Resolution", "Model default", "Available resolutions depend on your current Anna video model."],
 ja: ["解像度", "モデルの既定値", "利用できる解像度は Anna の動画モデルにより異なります。"],
 ko: ["해상도", "모델 기본값", "지원 해상도는 현재 Anna 동영상 모델에 따라 다릅니다."],
 es: ["Resolución", "Predeterminada", "Las resoluciones dependen del modelo de vídeo de Anna seleccionado."],
 fr: ["Résolution", "Par défaut", "Les résolutions dépendent du modèle vidéo Anna sélectionné."],
 de: ["Auflösung", "Modellstandard", "Verfügbare Auflösungen hängen vom gewählten Anna-Videomodell ab."],
 pt: ["Resolução", "Padrão do modelo", "As resoluções dependem do modelo de vídeo Anna selecionado."],
 it: ["Risoluzione", "Predefinita", "Le risoluzioni dipendono dal modello video Anna selezionato."],
 id: ["Resolusi", "Default model", "Resolusi yang tersedia bergantung pada model video Anna yang dipilih."],
 ru: ["Разрешение", "По умолчанию", "Доступные разрешения зависят от выбранной видеомодели Anna."],
 vi: ["Độ phân giải", "Mặc định mô hình", "Độ phân giải phụ thuộc vào mô hình video Anna đã chọn."],
 th: ["ความละเอียด", "ค่าเริ่มต้นโมเดล", "ความละเอียดที่ใช้ได้ขึ้นอยู่กับโมเดลวิดีโอ Anna ที่เลือก"]
};
export function getAnnaVideoResolutionCopy(language) {
 const [label, automatic, hint] = resolutionCopy[language] || resolutionCopy.en;
 return { label, automatic, hint };
}
