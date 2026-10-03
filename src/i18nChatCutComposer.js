const rows = {
  zh: ['引用素材','生成图片','制作动画','没有匹配的素材','输入 @ 引用素材，/ 选择指令','快捷用法'],
  en: ['Reference media','Generate an image','Create an animation','No matching media','Type @ for media, / for commands','Quick actions'],
  ja: ['素材を参照','画像を生成','アニメーションを作成','一致する素材はありません','@ で素材、/ でコマンドを選択','クイック操作'],
  ko: ['미디어 참조','이미지 생성','애니메이션 만들기','일치하는 미디어 없음','@로 미디어, /로 명령 선택','빠른 사용법'],
  es: ['Referenciar medios','Generar imagen','Crear animación','No hay medios coincidentes','Escribe @ para medios, / para comandos','Acciones rápidas'],
  fr: ['Référencer un média','Générer une image','Créer une animation','Aucun média correspondant','@ pour les médias, / pour les commandes','Actions rapides'],
  de: ['Medien referenzieren','Bild erstellen','Animation erstellen','Keine passenden Medien','@ für Medien, / für Befehle eingeben','Schnellaktionen'],
  pt: ['Referenciar mídia','Gerar imagem','Criar animação','Nenhuma mídia correspondente','Digite @ para mídia, / para comandos','Ações rápidas'],
  th: ['อ้างอิงสื่อ','สร้างภาพ','สร้างแอนิเมชัน','ไม่มีสื่อที่ตรงกัน','พิมพ์ @ เพื่อเลือกสื่อ / เพื่อเลือกคำสั่ง','วิธีใช้ด่วน'],
  vi: ['Tham chiếu nội dung','Tạo ảnh','Tạo hoạt ảnh','Không có nội dung phù hợp','Nhập @ chọn nội dung, / chọn lệnh','Thao tác nhanh'],
  ru: ['Указать медиа','Создать изображение','Создать анимацию','Подходящих медиа нет','Введите @ для медиа, / для команд','Быстрые действия'],
  it: ['Riferisci un contenuto','Genera immagine','Crea animazione','Nessun contenuto corrispondente','@ per i contenuti, / per i comandi','Azioni rapide'],
  id: ['Rujuk media','Buat gambar','Buat animasi','Tidak ada media yang cocok','Ketik @ untuk media, / untuk perintah','Tindakan cepat'],
};
const noCommands = { zh: '没有匹配的指令', en: 'No matching commands', ja: '一致するコマンドはありません', ko: '일치하는 명령 없음', es: 'No hay comandos coincidentes', fr: 'Aucune commande correspondante', de: 'Keine passenden Befehle', pt: 'Nenhum comando correspondente', th: 'ไม่มีคำสั่งที่ตรงกัน', vi: 'Không có lệnh phù hợp', ru: 'Подходящих команд нет', it: 'Nessun comando corrispondente', id: 'Tidak ada perintah yang cocok' };
export function getChatCutComposerCopy(language) {
  return { noCommands: noCommands[language] || noCommands.en, ...Object.fromEntries(['mention','image','remotion','noAssets','placeholder','info'].map((key,index)=>[key,(rows[language] || rows.en)[index]])) };
}
