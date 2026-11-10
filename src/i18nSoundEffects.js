const copy = {
  zh: ["音效", "搜索音效", "拖到切点，或添加到播放头", "试听", "停止试听", "添加到播放头", "已添加音效", "无法播放此音效", ["转场", "撞击", "快门", "点击"], ["轻扫", "上扬扫音", "低频撞击", "干脆重拍", "胶片快门", "数码快门", "轻触", "提示音"]],
  en: ["Sound FX", "Search sound effects", "Drag to a cut or add at the playhead", "Audition", "Stop audition", "Add at playhead", "Sound effect added", "Could not play this sound effect", ["Transition", "Impact", "Shutter", "Click"], ["Soft sweep", "Rising whoosh", "Bass hit", "Punch hit", "Film shutter", "Digital shutter", "Soft tap", "Confirm chime"]],
  ja: ["効果音", "効果音を検索", "カットにドラッグ、または再生ヘッドに追加", "試聴", "試聴を停止", "再生ヘッドに追加", "効果音を追加しました", "効果音を再生できませんでした", ["切り替え", "衝撃", "シャッター", "クリック"], ["柔らかな風切り音", "上昇する風切り音", "低音の衝撃", "鋭い打音", "フィルムのシャッター", "デジタルシャッター", "軽いタップ", "確認音"]],
  ko: ["효과음", "효과음 검색", "컷으로 끌거나 재생 헤드에 추가", "미리 듣기", "미리 듣기 중지", "재생 헤드에 추가", "효과음을 추가했습니다", "효과음을 재생할 수 없습니다", ["전환", "타격", "셔터", "클릭"], ["부드러운 스윕", "상승하는 바람 소리", "저음 타격", "짧은 강타", "필름 셔터", "디지털 셔터", "가벼운 터치", "확인음"]],
  es: ["Efectos de sonido", "Buscar efectos de sonido", "Arrastra a un corte o añade en el cabezal", "Escuchar", "Detener escucha", "Añadir en el cabezal", "Efecto de sonido añadido", "No se pudo reproducir el efecto", ["Transición", "Impacto", "Obturador", "Clic"], ["Barrido suave", "Barrido ascendente", "Golpe grave", "Golpe seco", "Obturador analógico", "Obturador digital", "Toque suave", "Tono de confirmación"]],
  fr: ["Bruitages", "Rechercher des bruitages", "Glissez vers une coupe ou ajoutez à la tête de lecture", "Écouter", "Arrêter l’écoute", "Ajouter à la tête de lecture", "Bruitage ajouté", "Impossible de lire ce bruitage", ["Transition", "Impact", "Obturateur", "Clic"], ["Souffle doux", "Souffle montant", "Impact grave", "Coup sec", "Obturateur argentique", "Obturateur numérique", "Petit clic", "Son de confirmation"]],
  de: ["Soundeffekte", "Soundeffekte suchen", "Zum Schnitt ziehen oder am Abspielkopf einfügen", "Anhören", "Vorhören stoppen", "Am Abspielkopf einfügen", "Soundeffekt hinzugefügt", "Soundeffekt konnte nicht abgespielt werden", ["Übergang", "Aufprall", "Auslöser", "Klick"], ["Sanftes Rauschen", "Ansteigendes Rauschen", "Tiefer Schlag", "Trockener Schlag", "Analoger Auslöser", "Digitaler Auslöser", "Leichtes Tippen", "Bestätigungston"]],
  pt: ["Efeitos sonoros", "Pesquisar efeitos sonoros", "Arraste para um corte ou adicione no cursor", "Ouvir", "Parar audição", "Adicionar no cursor", "Efeito sonoro adicionado", "Não foi possível reproduzir o efeito", ["Transição", "Impacto", "Obturador", "Clique"], ["Sopro suave", "Sopro ascendente", "Impacto grave", "Batida seca", "Obturador analógico", "Obturador digital", "Toque suave", "Som de confirmação"]],
  th: ["เอฟเฟกต์เสียง", "ค้นหาเอฟเฟกต์เสียง", "ลากไปยังจุดตัดหรือเพิ่มที่หัวเล่น", "ฟังตัวอย่าง", "หยุดฟัง", "เพิ่มที่หัวเล่น", "เพิ่มเอฟเฟกต์เสียงแล้ว", "เล่นเอฟเฟกต์เสียงนี้ไม่ได้", ["การเปลี่ยนฉาก", "กระแทก", "ชัตเตอร์", "คลิก"], ["เสียงกวาดเบา", "เสียงกวาดไต่ระดับ", "เสียงกระแทกทุ้ม", "เสียงกระแทกสั้น", "ชัตเตอร์กล้องฟิล์ม", "ชัตเตอร์ดิจิทัล", "เสียงแตะเบา", "เสียงยืนยัน"]],
  vi: ["Hiệu ứng âm thanh", "Tìm hiệu ứng âm thanh", "Kéo đến điểm cắt hoặc thêm tại đầu phát", "Nghe thử", "Dừng nghe thử", "Thêm tại đầu phát", "Đã thêm hiệu ứng âm thanh", "Không thể phát hiệu ứng này", ["Chuyển cảnh", "Va đập", "Màn trập", "Nhấp"], ["Tiếng lướt nhẹ", "Tiếng vút lên", "Cú đập trầm", "Cú đập gọn", "Màn trập máy phim", "Màn trập kỹ thuật số", "Tiếng chạm nhẹ", "Âm xác nhận"]],
  ru: ["Звуковые эффекты", "Поиск звуковых эффектов", "Перетащите к склейке или добавьте на курсор", "Прослушать", "Остановить прослушивание", "Добавить на курсор", "Звуковой эффект добавлен", "Не удалось воспроизвести эффект", ["Переход", "Удар", "Затвор", "Щелчок"], ["Мягкий свист", "Нарастающий свист", "Басовый удар", "Резкий удар", "Затвор плёночной камеры", "Цифровой затвор", "Лёгкое касание", "Сигнал подтверждения"]],
  it: ["Effetti sonori", "Cerca effetti sonori", "Trascina su un taglio o aggiungi alla testina", "Ascolta", "Interrompi ascolto", "Aggiungi alla testina", "Effetto sonoro aggiunto", "Impossibile riprodurre l’effetto", ["Transizione", "Impatto", "Otturatore", "Clic"], ["Soffio leggero", "Soffio crescente", "Colpo grave", "Colpo secco", "Otturatore analogico", "Otturatore digitale", "Tocco leggero", "Suono di conferma"]],
  id: ["Efek suara", "Cari efek suara", "Seret ke titik potong atau tambahkan di playhead", "Dengarkan", "Hentikan pratinjau", "Tambahkan di playhead", "Efek suara ditambahkan", "Efek suara tidak dapat diputar", ["Transisi", "Benturan", "Rana", "Klik"], ["Desir lembut", "Desir meninggi", "Dentuman bas", "Pukulan singkat", "Rana kamera film", "Rana digital", "Ketukan lembut", "Nada konfirmasi"]],
};

export function getSoundEffectsCopy(language) {
  const [tab, search, hint, play, stop, add, added, unavailable, categories, names] = copy[language] || copy.en;
  return { tab, search, hint, play, stop, add, added, unavailable, categories, names };
}

export const SOUND_EFFECT_CATEGORIES = ["all", "instrument", "voice", "foley", "transition", "impact", "interface"];

const categoryLabels = {
  zh: ["全部", "乐器", "人声", "日常", "转场", "撞击", "界面"],
  en: ["All", "Instruments", "Voices", "Everyday", "Transitions", "Impacts", "Interface"],
  ja: ["すべて", "楽器", "声", "生活音", "切り替え", "衝撃", "操作音"],
  ko: ["전체", "악기", "사람 목소리", "생활 소리", "전환", "타격", "조작음"],
  es: ["Todos", "Instrumentos", "Voces", "Cotidianos", "Transiciones", "Impactos", "Interfaz"],
  fr: ["Tous", "Instruments", "Voix", "Quotidien", "Transitions", "Impacts", "Interface"],
  de: ["Alle", "Instrumente", "Stimmen", "Alltag", "Übergänge", "Aufprall", "Bedienung"],
  pt: ["Todos", "Instrumentos", "Vozes", "Cotidiano", "Transições", "Impactos", "Interface"],
  th: ["ทั้งหมด", "เครื่องดนตรี", "เสียงคน", "เสียงในชีวิตประจำวัน", "การเปลี่ยนฉาก", "กระแทก", "เสียงปุ่ม"],
  vi: ["Tất cả", "Nhạc cụ", "Giọng người", "Đời thường", "Chuyển cảnh", "Va đập", "Giao diện"],
  ru: ["Все", "Инструменты", "Голоса", "Бытовые", "Переходы", "Удары", "Интерфейс"],
  it: ["Tutti", "Strumenti", "Voci", "Quotidiani", "Transizioni", "Impatti", "Interfaccia"],
  id: ["Semua", "Instrumen", "Suara manusia", "Sehari-hari", "Transisi", "Benturan", "Antarmuka"],
};

const recordedKeys = [
  "piano", "nylon-guitar", "steel-guitar",
  "ready", "go", "correct", "wrong", "congratulations", "level-up", "time-over", "you-win",
  "breath", "laugh", "cough", "gasp", "whistle", "clap",
  "door-open", "door-close", "door-creak", "page-turn", "book-close", "cloth", "coins", "metal-latch", "metal-pot",
  "card-shuffle", "card-fan", "card-slide", "dice-roll", "dice-shake",
  "step-wood", "step-concrete", "step-grass", "step-snow", "step-carpet",
  "wood-hit", "glass-hit", "metal-hit", "plate-hit", "bell-hit", "soft-thud",
  "ui-click", "ui-confirm", "ui-error", "ui-open", "ui-close", "ui-switch", "ui-tick", "ui-glitch",
];

const recordedLabels = {
  zh: [
    "钢琴", "尼龙弦吉他", "钢弦吉他",
    "准备", "出发", "答对", "答错", "恭喜", "升级", "时间到", "你赢了",
    "呼吸", "笑声", "咳嗽", "倒吸气", "口哨", "拍手",
    "开门", "关门", "门吱呀声", "翻页", "合上书", "衣料摩擦", "硬币", "门闩", "金属锅",
    "洗牌", "展开扑克牌", "滑动扑克牌", "掷骰子", "摇骰子",
    "木地板脚步", "水泥地脚步", "草地脚步", "雪地脚步", "地毯脚步",
    "敲木头", "玻璃碰撞", "金属碰撞", "碟子碰撞", "钟声", "闷响",
    "按钮点击", "确认音", "错误音", "界面打开", "界面关闭", "开关切换", "滴答", "数字故障声",
  ],
  en: [
    "Upright piano", "Nylon guitar", "Steel-string guitar",
    "Ready", "Go", "Correct", "Wrong", "Congratulations", "Level up", "Time over", "You win",
    "Breathing", "Laughter", "Cough", "Gasp", "Whistle", "Hand clap",
    "Door opening", "Door closing", "Door creak", "Page turn", "Book closing", "Cloth rustle", "Coins", "Metal latch", "Metal pot",
    "Card shuffle", "Card fan", "Card slide", "Dice roll", "Dice shake",
    "Wood footsteps", "Concrete footsteps", "Grass footsteps", "Snow footsteps", "Carpet footsteps",
    "Wood hit", "Glass impact", "Metal impact", "Plate impact", "Bell strike", "Soft thud",
    "Button click", "Confirmation", "Error tone", "Interface opening", "Interface closing", "Switch toggle", "Tick", "Digital glitch",
  ],
  ja: [
    "アップライトピアノ", "ナイロン弦ギター", "スチール弦ギター",
    "用意", "スタート", "正解", "不正解", "おめでとう", "レベルアップ", "時間切れ", "勝利",
    "呼吸", "笑い声", "せき", "息をのむ音", "口笛", "手を叩く音",
    "ドアを開ける", "ドアを閉める", "ドアのきしみ", "ページをめくる", "本を閉じる", "衣擦れ", "硬貨", "金属の掛け金", "金属鍋",
    "カードを切る", "カードを広げる", "カードを滑らせる", "サイコロを振る", "サイコロを揺らす",
    "木の床の足音", "コンクリートの足音", "草地の足音", "雪の足音", "カーペットの足音",
    "木を打つ音", "ガラスの衝突", "金属の衝突", "皿の衝突", "鐘の音", "鈍い打音",
    "ボタンのクリック", "確認音", "エラー音", "画面を開く", "画面を閉じる", "スイッチ切り替え", "刻み音", "デジタルノイズ",
  ],
  ko: [
    "업라이트 피아노", "나일론 기타", "스틸 기타",
    "준비", "시작", "정답", "오답", "축하", "레벨 업", "시간 종료", "승리",
    "숨소리", "웃음", "기침", "숨 들이켜기", "휘파람", "손뼉",
    "문 열기", "문 닫기", "문 삐걱임", "책장 넘기기", "책 덮기", "옷감 스침", "동전", "금속 걸쇠", "금속 냄비",
    "카드 섞기", "카드 펼치기", "카드 밀기", "주사위 굴리기", "주사위 흔들기",
    "나무 바닥 발소리", "콘크리트 발소리", "풀밭 발소리", "눈밭 발소리", "카펫 발소리",
    "나무 타격", "유리 충돌", "금속 충돌", "접시 충돌", "종소리", "둔탁한 소리",
    "버튼 클릭", "확인음", "오류음", "화면 열기", "화면 닫기", "스위치 전환", "째깍 소리", "디지털 오류음",
  ],
  es: [
    "Piano vertical", "Guitarra de nailon", "Guitarra de acero",
    "Listo", "Adelante", "Correcto", "Incorrecto", "Felicitaciones", "Subir de nivel", "Tiempo agotado", "Has ganado",
    "Respiración", "Risa", "Tos", "Jadeo", "Silbido", "Palmada",
    "Abrir puerta", "Cerrar puerta", "Crujido de puerta", "Pasar página", "Cerrar libro", "Roce de tela", "Monedas", "Pestillo metálico", "Olla metálica",
    "Barajar cartas", "Abanico de cartas", "Deslizar carta", "Lanzar dados", "Agitar dados",
    "Pasos en madera", "Pasos en hormigón", "Pasos en hierba", "Pasos en nieve", "Pasos en alfombra",
    "Golpe en madera", "Impacto de vidrio", "Impacto de metal", "Choque de platos", "Campanada", "Golpe sordo",
    "Clic de botón", "Confirmación", "Tono de error", "Abrir interfaz", "Cerrar interfaz", "Interruptor", "Tic", "Fallo digital",
  ],
  fr: [
    "Piano droit", "Guitare à cordes nylon", "Guitare à cordes acier",
    "Prêt", "Partez", "Correct", "Incorrect", "Félicitations", "Niveau supérieur", "Temps écoulé", "Victoire",
    "Respiration", "Rire", "Toux", "Inspiration brusque", "Sifflement", "Claquement de mains",
    "Ouverture de porte", "Fermeture de porte", "Grincement de porte", "Page tournée", "Livre refermé", "Froissement de tissu", "Pièces", "Loquet métallique", "Casserole",
    "Mélange de cartes", "Éventail de cartes", "Carte glissée", "Lancer de dés", "Dés secoués",
    "Pas sur bois", "Pas sur béton", "Pas dans l’herbe", "Pas dans la neige", "Pas sur moquette",
    "Coup sur bois", "Choc de verre", "Choc métallique", "Choc d’assiettes", "Coup de cloche", "Choc sourd",
    "Clic de bouton", "Confirmation", "Son d’erreur", "Ouverture d’interface", "Fermeture d’interface", "Basculement", "Tic", "Parasite numérique",
  ],
  de: [
    "Klavier", "Nylonsaitengitarre", "Stahlsaitengitarre",
    "Bereit", "Los", "Richtig", "Falsch", "Glückwunsch", "Stufenaufstieg", "Zeit abgelaufen", "Gewonnen",
    "Atmen", "Lachen", "Husten", "Aufkeuchen", "Pfeifen", "Händeklatschen",
    "Tür öffnen", "Tür schließen", "Türknarren", "Seite umblättern", "Buch zuklappen", "Stoffrascheln", "Münzen", "Metallriegel", "Metalltopf",
    "Karten mischen", "Kartenfächer", "Karte schieben", "Würfelwurf", "Würfel schütteln",
    "Schritte auf Holz", "Schritte auf Beton", "Schritte auf Gras", "Schritte im Schnee", "Schritte auf Teppich",
    "Holzschlag", "Glasaufprall", "Metallaufprall", "Tellerklirren", "Glockenschlag", "Dumpfer Stoß",
    "Tastenklick", "Bestätigung", "Fehlerton", "Oberfläche öffnen", "Oberfläche schließen", "Umschalten", "Ticken", "Digitaler Störton",
  ],
  pt: [
    "Piano vertical", "Violão de náilon", "Violão de aço",
    "Pronto", "Vai", "Certo", "Errado", "Parabéns", "Subir de nível", "Tempo esgotado", "Você venceu",
    "Respiração", "Risada", "Tosse", "Suspiro de surpresa", "Assobio", "Palma",
    "Abrir porta", "Fechar porta", "Rangido de porta", "Virar página", "Fechar livro", "Fricção de tecido", "Moedas", "Trinco metálico", "Panela metálica",
    "Embaralhar cartas", "Leque de cartas", "Deslizar carta", "Jogar dados", "Sacudir dados",
    "Passos na madeira", "Passos no concreto", "Passos na grama", "Passos na neve", "Passos no tapete",
    "Batida em madeira", "Impacto de vidro", "Impacto de metal", "Choque de pratos", "Toque de sino", "Batida abafada",
    "Clique de botão", "Confirmação", "Som de erro", "Abrir interface", "Fechar interface", "Alternar botão", "Tique", "Falha digital",
  ],
  th: [
    "เปียโนตั้งตรง", "กีตาร์สายไนลอน", "กีตาร์สายเหล็ก",
    "พร้อม", "ไป", "ถูกต้อง", "ไม่ถูกต้อง", "ยินดีด้วย", "เลื่อนระดับ", "หมดเวลา", "คุณชนะ",
    "หายใจ", "หัวเราะ", "ไอ", "สูดหายใจเฮือก", "ผิวปาก", "ตบมือ",
    "เปิดประตู", "ปิดประตู", "ประตูเอี๊ยด", "พลิกหน้า", "ปิดหนังสือ", "ผ้าเสียดสี", "เหรียญ", "กลอนโลหะ", "หม้อโลหะ",
    "สับไพ่", "กางไพ่", "เลื่อนไพ่", "ทอยลูกเต๋า", "เขย่าลูกเต๋า",
    "ฝีเท้าบนไม้", "ฝีเท้าบนคอนกรีต", "ฝีเท้าบนหญ้า", "ฝีเท้าบนหิมะ", "ฝีเท้าบนพรม",
    "เคาะไม้", "แก้วกระทบ", "โลหะกระทบ", "จานกระทบ", "ตีระฆัง", "เสียงตุ้บ",
    "คลิกปุ่ม", "เสียงยืนยัน", "เสียงข้อผิดพลาด", "เปิดหน้าต่าง", "ปิดหน้าต่าง", "สลับสวิตช์", "เสียงติ๊ก", "เสียงดิจิทัลขัดข้อง",
  ],
  vi: [
    "Piano đứng", "Guitar dây nylon", "Guitar dây thép",
    "Sẵn sàng", "Bắt đầu", "Đúng", "Sai", "Chúc mừng", "Lên cấp", "Hết giờ", "Bạn thắng",
    "Hơi thở", "Tiếng cười", "Tiếng ho", "Hít mạnh", "Huýt sáo", "Vỗ tay",
    "Mở cửa", "Đóng cửa", "Cửa kẽo kẹt", "Lật trang", "Gập sách", "Vải sột soạt", "Tiền xu", "Chốt kim loại", "Nồi kim loại",
    "Xáo bài", "Xòe bài", "Trượt lá bài", "Tung xúc xắc", "Lắc xúc xắc",
    "Bước trên gỗ", "Bước trên bê tông", "Bước trên cỏ", "Bước trên tuyết", "Bước trên thảm",
    "Gõ gỗ", "Va chạm kính", "Va chạm kim loại", "Chạm đĩa", "Tiếng chuông", "Tiếng động trầm",
    "Nhấp nút", "Âm xác nhận", "Âm báo lỗi", "Mở giao diện", "Đóng giao diện", "Gạt công tắc", "Tiếng tích", "Nhiễu kỹ thuật số",
  ],
  ru: [
    "Пианино", "Гитара с нейлоновыми струнами", "Гитара со стальными струнами",
    "Готовность", "Старт", "Верно", "Неверно", "Поздравляем", "Новый уровень", "Время вышло", "Победа",
    "Дыхание", "Смех", "Кашель", "Резкий вдох", "Свист", "Хлопок в ладоши",
    "Открытие двери", "Закрытие двери", "Скрип двери", "Перелистывание", "Закрытие книги", "Шорох ткани", "Монеты", "Металлическая защёлка", "Металлическая кастрюля",
    "Тасование карт", "Веер карт", "Скольжение карты", "Бросок кубиков", "Встряхивание кубиков",
    "Шаги по дереву", "Шаги по бетону", "Шаги по траве", "Шаги по снегу", "Шаги по ковру",
    "Удар по дереву", "Удар по стеклу", "Удар по металлу", "Звон тарелок", "Удар колокола", "Глухой удар",
    "Щелчок кнопки", "Подтверждение", "Сигнал ошибки", "Открытие интерфейса", "Закрытие интерфейса", "Переключение", "Тиканье", "Цифровой сбой",
  ],
  it: [
    "Pianoforte verticale", "Chitarra con corde in nylon", "Chitarra con corde in acciaio",
    "Pronti", "Via", "Corretto", "Sbagliato", "Congratulazioni", "Salita di livello", "Tempo scaduto", "Hai vinto",
    "Respiro", "Risata", "Tosse", "Respiro di sorpresa", "Fischio", "Battito di mani",
    "Apertura porta", "Chiusura porta", "Porta che cigola", "Pagina sfogliata", "Libro chiuso", "Fruscio di tessuto", "Monete", "Chiavistello metallico", "Pentola metallica",
    "Mischiare le carte", "Ventaglio di carte", "Carta che scivola", "Lancio di dadi", "Dadi agitati",
    "Passi sul legno", "Passi sul cemento", "Passi sull’erba", "Passi sulla neve", "Passi sul tappeto",
    "Colpo sul legno", "Urto sul vetro", "Urto metallico", "Urto di piatti", "Rintocco", "Tonfo",
    "Clic del pulsante", "Conferma", "Suono di errore", "Apertura interfaccia", "Chiusura interfaccia", "Interruttore", "Ticchettio", "Disturbo digitale",
  ],
  id: [
    "Piano tegak", "Gitar senar nilon", "Gitar senar baja",
    "Siap", "Mulai", "Benar", "Salah", "Selamat", "Naik level", "Waktu habis", "Kamu menang",
    "Napas", "Tawa", "Batuk", "Tarikan napas kaget", "Siulan", "Tepuk tangan",
    "Pintu dibuka", "Pintu ditutup", "Derit pintu", "Membalik halaman", "Menutup buku", "Gesekan kain", "Koin", "Selot logam", "Panci logam",
    "Mengocok kartu", "Membentangkan kartu", "Menggeser kartu", "Melempar dadu", "Mengguncang dadu",
    "Langkah di kayu", "Langkah di beton", "Langkah di rumput", "Langkah di salju", "Langkah di karpet",
    "Ketukan kayu", "Benturan kaca", "Benturan logam", "Benturan piring", "Bunyi lonceng", "Bunyi gedebuk",
    "Klik tombol", "Konfirmasi", "Nada kesalahan", "Buka antarmuka", "Tutup antarmuka", "Alihkan sakelar", "Detak", "Gangguan digital",
  ],
};

const recordedIndexes = new Map(recordedKeys.map((key, index) => [key, index]));

export function getSoundCategoryLabel(language, category) {
  const labels = categoryLabels[language] || categoryLabels.en;
  return labels[SOUND_EFFECT_CATEGORIES.indexOf(category)];
}

export function getRecordedSoundLabel(language, key) {
  return (recordedLabels[language] || recordedLabels.en)[recordedIndexes.get(key)];
}
