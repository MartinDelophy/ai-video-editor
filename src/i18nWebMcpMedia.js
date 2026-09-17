// Direct translations for media review and the expanded edit surface in all 13 interface languages.
export const WEBMCP_MEDIA_COPY = {
  "en": {
    "toolMediaSampleTitle": "Sample rendered media",
    "toolMediaSampleDescription": "Render explicitly requested timeline frames and a short audio mix using the current stateToken. Returns JPEG and WAV data for review without moving the playhead. The agent receives these media bytes.",
    "mediaSampleFailed": "The media sample could not be rendered. Inspect the current project and retry.",
    "mediaSampleUnavailable": "Media sampling is unavailable for this project or browser.",
    "toolPreviewDescription": "Preview supported visual and timed-clip edits, overlay transforms, caption text/style/position, project aspect ratio/fit, audio, markers, and asset insertion. Requires the current stateToken; returns a semantic review and previewId without applying changes."
  },
  "zh": {
    "toolMediaSampleTitle": "采样渲染画面与声音",
    "toolMediaSampleDescription": "凭当前 stateToken 渲染明确请求的时间线画面与短段混音，返回 JPEG 和 WAV 内容供审看，不移动播放头。Agent 将接收到这些媒体数据。",
    "mediaSampleFailed": "媒体采样渲染失败，请重新读取当前工程后重试。",
    "mediaSampleUnavailable": "当前工程或浏览器暂不支持媒体采样。",
    "toolPreviewDescription": "预览支持的主画面与定时片段编辑、画中画变换、字幕文字／样式／位置、工程画幅与适配方式、音频、标记及素材插入。需提供当前 stateToken；返回语义修改审阅与 previewId，不应用修改。"
  },
  "ja": {
    "toolMediaSampleTitle": "描画済みメディアを取得",
    "toolMediaSampleDescription": "現在の stateToken で明示的に指定されたフレームと短いミックス音声を生成します。再生ヘッドを動かさず、確認用の JPEG と WAV データを返します。エージェントにはこのメディアデータが渡されます。",
    "mediaSampleFailed": "メディアを生成できませんでした。現在のプロジェクトを確認して再試行してください。",
    "mediaSampleUnavailable": "このプロジェクトまたはブラウザではメディアの取得を利用できません。",
    "toolPreviewDescription": "映像と時間指定クリップの編集、オーバーレイ変換、字幕の文字・スタイル・位置、画面比率・フィット方法、音声、マーカー、素材挿入を確認します。現在の stateToken が必要です。変更せず変更内容と previewId を返します。"
  },
  "ko": {
    "toolMediaSampleTitle": "렌더링된 미디어 샘플 확인",
    "toolMediaSampleDescription": "현재 stateToken으로 명시적으로 요청한 타임라인 프레임과 짧은 오디오 믹스를 렌더링합니다. 재생 헤드를 움직이지 않고 검토용 JPEG와 WAV 데이터를 반환합니다. 에이전트에 해당 미디어 데이터가 전달됩니다.",
    "mediaSampleFailed": "미디어 샘플을 렌더링하지 못했습니다. 현재 프로젝트를 확인한 후 다시 시도하세요.",
    "mediaSampleUnavailable": "이 프로젝트나 브라우저에서는 미디어 샘플링을 사용할 수 없습니다.",
    "toolPreviewDescription": "영상 및 시간 지정 클립 편집, 오버레이 변환, 자막 텍스트·스타일·위치, 프로젝트 화면 비율·맞춤, 오디오, 마커 및 자산 삽입을 미리 봅니다. 현재 stateToken이 필요하며 변경을 적용하지 않고 변경 검토와 previewId를 반환합니다."
  },
  "es": {
    "toolMediaSampleTitle": "Obtener muestras del montaje",
    "toolMediaSampleDescription": "Renderiza los fotogramas y una mezcla de audio breve solicitados explícitamente con el stateToken actual. Devuelve datos JPEG y WAV para revisión sin mover el cabezal. El agente recibe estos datos multimedia.",
    "mediaSampleFailed": "No se pudo renderizar la muestra. Consulta el proyecto actual y vuelve a intentarlo.",
    "mediaSampleUnavailable": "Las muestras multimedia no están disponibles para este proyecto o navegador.",
    "toolPreviewDescription": "Previsualiza ediciones de vídeo y clips temporizados, transformaciones de superposiciones, texto/estilo/posición de subtítulos, proporción/ajuste del proyecto, audio, marcadores e inserción de recursos. Requiere stateToken actual; devuelve la revisión y previewId sin aplicar cambios."
  },
  "fr": {
    "toolMediaSampleTitle": "Examiner des extraits du montage",
    "toolMediaSampleDescription": "Rend les images et un court mixage audio explicitement demandés avec le stateToken actuel. Renvoie des données JPEG et WAV sans déplacer la tête de lecture. Ces données multimédias sont transmises à l’agent.",
    "mediaSampleFailed": "Impossible de rendre cet extrait. Inspectez le projet actuel et réessayez.",
    "mediaSampleUnavailable": "Les extraits multimédias sont indisponibles pour ce projet ou ce navigateur.",
    "toolPreviewDescription": "Prévisualise les modifications des clips, transformations des incrustations, texte/style/position des sous-titres, format/ajustement du projet, audio, marqueurs et insertions de médias. Exige le stateToken actuel ; renvoie les modifications et previewId sans les appliquer."
  },
  "de": {
    "toolMediaSampleTitle": "Gerenderte Medien prüfen",
    "toolMediaSampleDescription": "Rendert ausdrücklich angeforderte Timeline-Bilder und eine kurze Audiomischung mit dem aktuellen stateToken. Gibt JPEG- und WAV-Daten zur Prüfung zurück, ohne den Abspielkopf zu bewegen. Der Agent erhält diese Mediendaten.",
    "mediaSampleFailed": "Die Medienprobe konnte nicht gerendert werden. Prüfe das aktuelle Projekt und versuche es erneut.",
    "mediaSampleUnavailable": "Medienproben sind für dieses Projekt oder diesen Browser nicht verfügbar.",
    "toolPreviewDescription": "Zeigt unterstützte Clip-Bearbeitungen, Overlay-Transformationen, Untertiteltext/-stil/-position, Seitenverhältnis/Einpassung, Audio, Marker und Medieneinfügungen vorab. Benötigt den aktuellen stateToken; gibt die Änderungsprüfung und previewId zurück, ohne Änderungen anzuwenden."
  },
  "pt": {
    "toolMediaSampleTitle": "Examinar amostras renderizadas",
    "toolMediaSampleDescription": "Renderiza os quadros e uma breve mixagem de áudio solicitados explicitamente com o stateToken atual. Retorna dados JPEG e WAV para revisão sem mover o cursor de reprodução. O agente recebe esses dados de mídia.",
    "mediaSampleFailed": "Não foi possível renderizar a amostra. Consulte o projeto atual e tente novamente.",
    "mediaSampleUnavailable": "As amostras de mídia não estão disponíveis para este projeto ou navegador.",
    "toolPreviewDescription": "Pré-visualiza edições de clipes, transformações de sobreposições, texto/estilo/posição das legendas, proporção/ajuste do projeto, áudio, marcadores e inserções de mídia. Exige o stateToken atual; retorna a revisão e previewId sem aplicar alterações."
  },
  "th": {
    "toolMediaSampleTitle": "ตรวจตัวอย่างภาพและเสียงที่เรนเดอร์",
    "toolMediaSampleDescription": "ใช้ stateToken ปัจจุบันเรนเดอร์เฟรมและเสียงมิกซ์ช่วงสั้นที่ขออย่างชัดเจน ส่งข้อมูล JPEG และ WAV ให้ตรวจสอบโดยไม่ย้ายหัวเล่น เอเจนต์จะได้รับข้อมูลสื่อนี้",
    "mediaSampleFailed": "เรนเดอร์ตัวอย่างสื่อไม่สำเร็จ โปรดตรวจสอบโปรเจกต์ปัจจุบันแล้วลองอีกครั้ง",
    "mediaSampleUnavailable": "โปรเจกต์หรือเบราว์เซอร์นี้ไม่รองรับการสร้างตัวอย่างสื่อ",
    "toolPreviewDescription": "แสดงตัวอย่างการแก้ไขคลิป การแปลงภาพซ้อน ข้อความ/รูปแบบ/ตำแหน่งคำบรรยาย อัตราส่วน/การปรับพอดีของโปรเจกต์ เสียง เครื่องหมาย และการแทรกสื่อ ต้องใช้ stateToken ปัจจุบัน ส่งรายการการเปลี่ยนแปลงและ previewId โดยยังไม่ใช้การแก้ไข"
  },
  "vi": {
    "toolMediaSampleTitle": "Xem mẫu hình và tiếng đã dựng",
    "toolMediaSampleDescription": "Dựng các khung hình và đoạn âm thanh trộn ngắn được yêu cầu rõ ràng bằng stateToken hiện tại. Trả dữ liệu JPEG và WAV để kiểm tra mà không di chuyển đầu phát. Tác nhân sẽ nhận dữ liệu phương tiện này.",
    "mediaSampleFailed": "Không thể dựng mẫu phương tiện. Kiểm tra dự án hiện tại rồi thử lại.",
    "mediaSampleUnavailable": "Dự án hoặc trình duyệt này không hỗ trợ lấy mẫu phương tiện.",
    "toolPreviewDescription": "Xem trước chỉnh sửa clip, biến đổi lớp phủ, văn bản/kiểu/vị trí phụ đề, tỷ lệ/cách lấp khung của dự án, âm thanh, dấu mốc và chèn tài nguyên. Cần stateToken hiện tại; trả bản xem xét thay đổi và previewId mà không áp dụng chỉnh sửa."
  },
  "ru": {
    "toolMediaSampleTitle": "Проверить кадры и звук монтажа",
    "toolMediaSampleDescription": "Создаёт явно запрошенные кадры и короткий аудиомикс с текущим stateToken. Возвращает данные JPEG и WAV для проверки, не перемещая курсор воспроизведения. Агент получает эти медиаданные.",
    "mediaSampleFailed": "Не удалось создать фрагмент для проверки. Проверьте текущий проект и повторите попытку.",
    "mediaSampleUnavailable": "Получение кадров и звука недоступно для этого проекта или браузера.",
    "toolPreviewDescription": "Проверяет правки клипов, преобразования наложений, текст/стиль/позицию субтитров, формат/заполнение кадра, аудио, маркеры и вставку материалов. Требует текущий stateToken; возвращает список изменений и previewId без применения правок."
  },
  "it": {
    "toolMediaSampleTitle": "Esamina campioni del montaggio",
    "toolMediaSampleDescription": "Renderizza i fotogrammi e un breve mix audio richiesti esplicitamente con lo stateToken corrente. Restituisce dati JPEG e WAV senza spostare la testina. L’agente riceve questi dati multimediali.",
    "mediaSampleFailed": "Impossibile renderizzare il campione. Esamina il progetto attuale e riprova.",
    "mediaSampleUnavailable": "I campioni multimediali non sono disponibili per questo progetto o browser.",
    "toolPreviewDescription": "Mostra in anteprima modifiche alle clip, trasformazioni delle sovrapposizioni, testo/stile/posizione dei sottotitoli, formato/adattamento del progetto, audio, marcatori e inserimenti multimediali. Richiede lo stateToken corrente; restituisce la revisione e previewId senza applicare modifiche."
  },
  "id": {
    "toolMediaSampleTitle": "Tinjau sampel media hasil render",
    "toolMediaSampleDescription": "Merender bingkai linimasa dan campuran audio singkat yang diminta secara eksplisit menggunakan stateToken saat ini. Mengembalikan data JPEG dan WAV untuk ditinjau tanpa memindahkan kepala putar. Agen menerima data media ini.",
    "mediaSampleFailed": "Sampel media tidak dapat dirender. Periksa proyek saat ini dan coba lagi.",
    "mediaSampleUnavailable": "Pengambilan sampel media tidak tersedia untuk proyek atau browser ini.",
    "toolPreviewDescription": "Pratinjau edit klip, transformasi lapisan, teks/gaya/posisi takarir, rasio/penyesuaian proyek, audio, penanda, dan penyisipan aset. Memerlukan stateToken saat ini; mengembalikan tinjauan perubahan dan previewId tanpa menerapkan edit."
  }
};
