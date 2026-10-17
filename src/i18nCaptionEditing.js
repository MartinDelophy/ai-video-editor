const copy = {
  zh: ['文字对齐','左对齐','居中','右对齐','背景左右留白','背景上下留白'],
  en: ['Text alignment','Left','Center','Right','Background horizontal padding','Background vertical padding'],
  ja: ['文字揃え','左揃え','中央揃え','右揃え','背景の左右余白','背景の上下余白'],
  ko: ['텍스트 정렬','왼쪽','가운데','오른쪽','배경 좌우 여백','배경 상하 여백'],
  es: ['Alineación del texto','Izquierda','Centro','Derecha','Margen horizontal del fondo','Margen vertical del fondo'],
  fr: ['Alignement du texte','Gauche','Centré','Droite','Marge horizontale du fond','Marge verticale du fond'],
  de: ['Textausrichtung','Links','Zentriert','Rechts','Horizontaler Hintergrundabstand','Vertikaler Hintergrundabstand'],
  pt: ['Alinhamento do texto','Esquerda','Centro','Direita','Margem horizontal do fundo','Margem vertical do fundo'],
  th: ['การจัดแนวข้อความ','ซ้าย','กึ่งกลาง','ขวา','ระยะขอบพื้นหลังแนวนอน','ระยะขอบพื้นหลังแนวตั้ง'],
  vi: ['Căn chỉnh chữ','Trái','Giữa','Phải','Lề nền ngang','Lề nền dọc'],
  ru: ['Выравнивание текста','Слева','По центру','Справа','Горизонтальные поля фона','Вертикальные поля фона'],
  it: ['Allineamento del testo','Sinistra','Centro','Destra','Margine orizzontale dello sfondo','Margine verticale dello sfondo'],
  id: ['Perataan teks','Kiri','Tengah','Kanan','Padding horizontal latar','Padding vertikal latar'],
};
export const getCaptionEditingCopy = language => copy[language] || copy.en;

const sourceEnd = {
  zh: "视频已到源素材末尾。延长运动画面需要更多素材或调整播放速度。",
  en: "The video has reached the source end. Use more footage or adjust playback speed to extend motion.",
  ja: "元動画の末尾です。動きを延長するには素材を追加するか再生速度を調整してください。",
  ko: "원본 영상의 끝입니다. 움직임을 늘리려면 영상을 추가하거나 재생 속도를 조절하세요.",
  es: "El vídeo llegó al final del original. Añade material o ajusta la velocidad para prolongar el movimiento.",
  fr: "La vidéo a atteint la fin de la source. Ajoutez des images ou ajustez la vitesse pour prolonger le mouvement.",
  de: "Das Quellvideo ist zu Ende. Für längere Bewegung weiteres Material verwenden oder die Geschwindigkeit anpassen.",
  pt: "O vídeo chegou ao fim da fonte. Adicione material ou ajuste a velocidade para prolongar o movimento.",
  th: "วิดีโอถึงจุดสิ้นสุดของต้นฉบับแล้ว เพิ่มฟุตเทจหรือปรับความเร็วเพื่อยืดการเคลื่อนไหว",
  vi: "Video đã đến cuối nguồn. Thêm tư liệu hoặc chỉnh tốc độ để kéo dài chuyển động.",
  ru: "Достигнут конец исходного видео. Добавьте материал или измените скорость, чтобы продлить движение.",
  it: "Il video ha raggiunto la fine della sorgente. Aggiungi filmati o regola la velocità per prolungare il movimento.",
  id: "Video mencapai akhir sumber. Tambahkan rekaman atau ubah kecepatan untuk memperpanjang gerakan.",
};
export const getVideoSourceEndCopy = language => sourceEnd[language] || sourceEnd.en;

const spacingCopy = {
  zh: ['字间距', '行间距'], en: ['Letter spacing', 'Line spacing'],
  ja: ['文字間隔', '行間隔'], ko: ['자간', '줄 간격'],
  es: ['Espaciado de letras', 'Interlineado'], fr: ['Espacement des lettres', 'Interligne'],
  de: ['Zeichenabstand', 'Zeilenabstand'], pt: ['Espaçamento entre letras', 'Entrelinha'],
  th: ['ระยะห่างตัวอักษร', 'ระยะห่างบรรทัด'], vi: ['Giãn chữ', 'Giãn dòng'],
  ru: ['Межбуквенный интервал', 'Межстрочный интервал'],
  it: ['Spaziatura caratteri', 'Interlinea'], id: ['Jarak huruf', 'Jarak baris'],
};
export const getCaptionSpacingCopy = language => spacingCopy[language] || spacingCopy.en;

const keywordCopy = {
  zh: ['关键词高亮', '高亮颜色', '输入词语或短语，用逗号或换行分隔；清空后关闭高亮。英文不区分大小写。'],
  en: ['Keyword highlighting', 'Highlight color', 'Separate words or phrases with commas or new lines. Clear to disable. Matching ignores case.'],
  ja: ['キーワード強調', '強調色', '単語やフレーズをカンマまたは改行で区切ります。空欄で無効。英字の大小は区別しません。'],
  ko: ['키워드 강조', '강조 색상', '단어나 구를 쉼표 또는 줄바꿈으로 구분하세요. 비우면 꺼집니다. 대소문자를 구분하지 않습니다.'],
  es: ['Resaltar palabras clave', 'Color de resaltado', 'Separa palabras o frases con comas o saltos de línea. Borra para desactivar. No distingue mayúsculas.'],
  fr: ['Mots-clés en couleur', 'Couleur de mise en valeur', 'Séparez les mots ou expressions par des virgules ou des retours à la ligne. Videz pour désactiver. La casse est ignorée.'],
  de: ['Schlüsselwörter hervorheben', 'Hervorhebungsfarbe', 'Wörter oder Ausdrücke mit Kommas oder Zeilenumbrüchen trennen. Leeren zum Deaktivieren. Groß-/Kleinschreibung wird ignoriert.'],
  pt: ['Destacar palavras-chave', 'Cor de destaque', 'Separe palavras ou frases por vírgulas ou quebras de linha. Apague para desativar. Não diferencia maiúsculas.'],
  th: ['เน้นคำสำคัญ', 'สีเน้น', 'คั่นคำหรือวลีด้วยจุลภาคหรือขึ้นบรรทัดใหม่ ล้างเพื่อปิด ไม่แยกตัวพิมพ์เล็กและใหญ่'],
  vi: ['Tô nổi bật từ khóa', 'Màu nổi bật', 'Ngăn cách từ hoặc cụm từ bằng dấu phẩy hay xuống dòng. Xóa để tắt. Không phân biệt hoa thường.'],
  ru: ['Выделение ключевых слов', 'Цвет выделения', 'Разделяйте слова или фразы запятыми или переносами строк. Очистите для отключения. Регистр не учитывается.'],
  it: ['Evidenzia parole chiave', 'Colore evidenziazione', 'Separa parole o frasi con virgole o nuove righe. Svuota per disattivare. Maiuscole e minuscole sono equivalenti.'],
  id: ['Sorotan kata kunci', 'Warna sorotan', 'Pisahkan kata atau frasa dengan koma atau baris baru. Kosongkan untuk menonaktifkan. Huruf besar/kecil diabaikan.'],
};
export const getCaptionKeywordCopy = language => keywordCopy[language] || keywordCopy.en;
