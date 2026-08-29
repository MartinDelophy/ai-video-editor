import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  CloudArrowDown,
  Code,
  Globe,
  ImageSquare,
  LinkSimple,
  MagnifyingGlass,
  MagicWand,
  PlugsConnected,
  ShieldCheck,
  SpinnerGap,
  UserCircle,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

const COPY = {
  zh: { title: "插件", subtitle: "连接网页生成服务，结果进入 My assets。", search: "搜索插件", connected: "已连接", connect: "连接", available: "可用", cancel: "取消", disconnect: "断开连接", capability: "图像与视频生成", authTitle: "连接 Puter.js", authBody: "将打开 Puter 登录弹窗。登录成功后，生成调用会使用你的 Puter 账户额度。", continue: "登录 Puter", secure: "无需 API Key；登录和用量由 Puter 处理。", userPays: "用户账户计费", mode: "生成方式", textVideo: "文生视频", textImage: "文生图", prompt: "描述你想生成的内容", placeholder: "例如：雨后的东京街头，缓慢推进镜头，霓虹倒影在路面流动……", ratio: "画幅", duration: "时长", model: "模型", generate: "开始生成", generating: "正在远端生成", resultSaved: "已保存到 My assets", openAssets: "查看 My assets", puterNote: "视频生成可能需要几分钟，关闭面板不会取消远端任务。", spaceUrl: "Space 地址", spacePlaceholder: "owner/space-name 或 https://…hf.space", connectSpace: "连接 Space", spaceHelp: "支持公开或 Protected 的可嵌入 Space。", embedded: "嵌入式 Space", importUrl: "生成结果地址", importPlaceholder: "粘贴 Space 返回的视频或图片 URL", importAsset: "导入 My assets", hfNote: "不同 Space 的 API 结构不同；当前通过嵌入界面生成，再用结果地址导入。", connectionError: "连接失败", jobError: "任务失败" },
  en: { title: "Plugins", subtitle: "Connect browser generation services and save results to My assets.", search: "Search plugins", connected: "Connected", connect: "Connect", available: "Available", cancel: "Cancel", disconnect: "Disconnect", capability: "Image and video generation", authTitle: "Connect Puter.js", authBody: "A Puter sign-in popup will open. Generation uses the signed-in user's Puter allowance.", continue: "Sign in to Puter", secure: "No API key; Puter handles sign-in and usage.", userPays: "User-paid usage", mode: "Generation mode", textVideo: "Text to video", textImage: "Text to image", prompt: "Describe what to generate", placeholder: "A rain-soaked Tokyo street, slow dolly in, neon reflections moving across the pavement…", ratio: "Aspect ratio", duration: "Duration", model: "Model", generate: "Generate", generating: "Generating remotely", resultSaved: "Saved to My assets", openAssets: "View My assets", puterNote: "Video generation can take several minutes. Closing the panel does not cancel the remote task.", spaceUrl: "Space address", spacePlaceholder: "owner/space-name or https://…hf.space", connectSpace: "Connect Space", spaceHelp: "Supports embeddable public or Protected Spaces.", embedded: "Embedded Space", importUrl: "Result URL", importPlaceholder: "Paste an image or video URL returned by the Space", importAsset: "Import to My assets", hfNote: "Space APIs differ. Generate in the embedded app, then import its result URL.", connectionError: "Connection failed", jobError: "Task failed" },
  ja: { title: "プラグイン", subtitle: "Web生成サービスを接続し、結果を My assets に保存します。", search: "プラグインを検索", connected: "接続済み", connect: "接続", available: "利用可能", cancel: "キャンセル", disconnect: "接続解除", capability: "画像・動画生成", authTitle: "Puter.js に接続", authBody: "Puter のログイン画面を開き、ユーザー自身の利用枠で生成します。", continue: "Puter にログイン", secure: "APIキー不要。認証と利用量は Puter が管理します。", userPays: "ユーザー課金", mode: "生成方法", textVideo: "テキストから動画", textImage: "テキストから画像", prompt: "生成内容を説明", placeholder: "雨上がりの東京、ゆっくり前進するカメラ、路面に揺れるネオン…", ratio: "比率", duration: "長さ", model: "モデル", generate: "生成", generating: "リモート生成中", resultSaved: "My assets に保存しました", openAssets: "My assets を開く", puterNote: "動画生成には数分かかる場合があります。", spaceUrl: "Space アドレス", spacePlaceholder: "owner/space-name または https://…hf.space", connectSpace: "Space を接続", spaceHelp: "埋め込み可能な公開または Protected Space に対応します。", embedded: "埋め込み Space", importUrl: "結果 URL", importPlaceholder: "Space が返した画像または動画 URL", importAsset: "My assets に読み込む", hfNote: "Space ごとにAPIが異なるため、埋め込み画面で生成後に結果URLを読み込みます。", connectionError: "接続に失敗しました", jobError: "タスクに失敗しました" },
  ko: { title: "플러그인", subtitle: "웹 생성 서비스를 연결하고 결과를 My assets에 저장합니다.", search: "플러그인 검색", connected: "연결됨", connect: "연결", available: "사용 가능", cancel: "취소", disconnect: "연결 해제", capability: "이미지 및 비디오 생성", authTitle: "Puter.js 연결", authBody: "Puter 로그인 팝업이 열리며 사용자의 Puter 할당량으로 생성합니다.", continue: "Puter 로그인", secure: "API 키 없이 Puter가 로그인과 사용량을 관리합니다.", userPays: "사용자 결제", mode: "생성 방식", textVideo: "텍스트로 비디오", textImage: "텍스트로 이미지", prompt: "생성할 내용 설명", placeholder: "비 내린 도쿄 거리, 천천히 전진하는 카메라, 네온 반사…", ratio: "화면 비율", duration: "길이", model: "모델", generate: "생성", generating: "원격 생성 중", resultSaved: "My assets에 저장됨", openAssets: "My assets 보기", puterNote: "비디오 생성에는 몇 분이 걸릴 수 있습니다.", spaceUrl: "Space 주소", spacePlaceholder: "owner/space-name 또는 https://…hf.space", connectSpace: "Space 연결", spaceHelp: "임베드 가능한 Public 또는 Protected Space를 지원합니다.", embedded: "임베드 Space", importUrl: "결과 URL", importPlaceholder: "Space가 반환한 이미지 또는 비디오 URL", importAsset: "My assets로 가져오기", hfNote: "Space마다 API가 달라 임베드 화면에서 생성한 뒤 결과 URL을 가져옵니다.", connectionError: "연결 실패", jobError: "작업 실패" },
  es: { title: "Plugins", subtitle: "Conecta servicios web y guarda resultados en My assets.", search: "Buscar plugins", connected: "Conectado", connect: "Conectar", available: "Disponible", cancel: "Cancelar", disconnect: "Desconectar", capability: "Generación de imagen y vídeo", authTitle: "Conectar Puter.js", authBody: "Se abrirá el acceso a Puter y la generación usará el saldo del usuario.", continue: "Entrar en Puter", secure: "Sin clave API; Puter gestiona acceso y uso.", userPays: "Paga el usuario", mode: "Modo", textVideo: "Texto a vídeo", textImage: "Texto a imagen", prompt: "Describe el contenido", placeholder: "Una calle de Tokio bajo la lluvia, avance lento, reflejos de neón…", ratio: "Formato", duration: "Duración", model: "Modelo", generate: "Generar", generating: "Generando", resultSaved: "Guardado en My assets", openAssets: "Ver My assets", puterNote: "El vídeo puede tardar varios minutos.", spaceUrl: "Dirección del Space", spacePlaceholder: "owner/space-name o https://…hf.space", connectSpace: "Conectar Space", spaceHelp: "Admite Spaces públicos o Protected incrustables.", embedded: "Space incrustado", importUrl: "URL del resultado", importPlaceholder: "URL de imagen o vídeo devuelta por el Space", importAsset: "Importar a My assets", hfNote: "Cada Space tiene una API distinta; genera en la vista incrustada e importa la URL.", connectionError: "Error de conexión", jobError: "Error de tarea" },
  fr: { title: "Plugins", subtitle: "Connectez des services web et enregistrez dans My assets.", search: "Rechercher", connected: "Connecté", connect: "Connecter", available: "Disponible", cancel: "Annuler", disconnect: "Déconnecter", capability: "Génération d’images et vidéos", authTitle: "Connecter Puter.js", authBody: "La connexion Puter s’ouvrira et utilisera le quota du compte utilisateur.", continue: "Se connecter à Puter", secure: "Aucune clé API ; Puter gère connexion et usage.", userPays: "Usage payé par l’utilisateur", mode: "Mode", textVideo: "Texte vers vidéo", textImage: "Texte vers image", prompt: "Décrivez le contenu", placeholder: "Une rue de Tokyo après la pluie, travelling lent, reflets néon…", ratio: "Format", duration: "Durée", model: "Modèle", generate: "Générer", generating: "Génération distante", resultSaved: "Enregistré dans My assets", openAssets: "Voir My assets", puterNote: "La vidéo peut prendre plusieurs minutes.", spaceUrl: "Adresse du Space", spacePlaceholder: "owner/space-name ou https://…hf.space", connectSpace: "Connecter le Space", spaceHelp: "Compatible avec les Spaces publics ou Protected intégrables.", embedded: "Space intégré", importUrl: "URL du résultat", importPlaceholder: "URL d’image ou vidéo renvoyée par le Space", importAsset: "Importer dans My assets", hfNote: "Les API varient ; générez dans l’app intégrée puis importez son URL.", connectionError: "Échec de connexion", jobError: "Échec de la tâche" },
  de: { title: "Plugins", subtitle: "Web-Generatoren verbinden und Ergebnisse in My assets speichern.", search: "Plugins suchen", connected: "Verbunden", connect: "Verbinden", available: "Verfügbar", cancel: "Abbrechen", disconnect: "Trennen", capability: "Bild- und Videogenerierung", authTitle: "Puter.js verbinden", authBody: "Das Puter-Login wird geöffnet; die Nutzung läuft über das Benutzerkonto.", continue: "Bei Puter anmelden", secure: "Kein API-Schlüssel; Puter verwaltet Anmeldung und Nutzung.", userPays: "Nutzer zahlt", mode: "Modus", textVideo: "Text zu Video", textImage: "Text zu Bild", prompt: "Inhalt beschreiben", placeholder: "Eine regennasse Straße in Tokio, langsame Kamerafahrt, Neonreflexe…", ratio: "Seitenverhältnis", duration: "Dauer", model: "Modell", generate: "Generieren", generating: "Remote-Generierung", resultSaved: "In My assets gespeichert", openAssets: "My assets öffnen", puterNote: "Videogenerierung kann mehrere Minuten dauern.", spaceUrl: "Space-Adresse", spacePlaceholder: "owner/space-name oder https://…hf.space", connectSpace: "Space verbinden", spaceHelp: "Unterstützt einbettbare öffentliche oder Protected Spaces.", embedded: "Eingebetteter Space", importUrl: "Ergebnis-URL", importPlaceholder: "Vom Space gelieferte Bild- oder Video-URL", importAsset: "In My assets importieren", hfNote: "Space-APIs unterscheiden sich; im eingebetteten Space erzeugen und URL importieren.", connectionError: "Verbindung fehlgeschlagen", jobError: "Aufgabe fehlgeschlagen" },
  pt: { title: "Plugins", subtitle: "Conecte serviços web e salve resultados em My assets.", search: "Buscar plugins", connected: "Conectado", connect: "Conectar", available: "Disponível", cancel: "Cancelar", disconnect: "Desconectar", capability: "Geração de imagem e vídeo", authTitle: "Conectar Puter.js", authBody: "O login do Puter será aberto e a geração usará a cota do usuário.", continue: "Entrar no Puter", secure: "Sem chave de API; o Puter gerencia login e uso.", userPays: "Pago pelo usuário", mode: "Modo", textVideo: "Texto para vídeo", textImage: "Texto para imagem", prompt: "Descreva o conteúdo", placeholder: "Uma rua de Tóquio após a chuva, câmera avançando lentamente, reflexos de néon…", ratio: "Proporção", duration: "Duração", model: "Modelo", generate: "Gerar", generating: "Gerando remotamente", resultSaved: "Salvo em My assets", openAssets: "Ver My assets", puterNote: "A geração de vídeo pode levar alguns minutos.", spaceUrl: "Endereço do Space", spacePlaceholder: "owner/space-name ou https://…hf.space", connectSpace: "Conectar Space", spaceHelp: "Suporta Spaces públicos ou Protected incorporáveis.", embedded: "Space incorporado", importUrl: "URL do resultado", importPlaceholder: "URL de imagem ou vídeo retornada pelo Space", importAsset: "Importar para My assets", hfNote: "As APIs variam; gere na interface incorporada e importe a URL.", connectionError: "Falha na conexão", jobError: "Falha na tarefa" },
  th: { title: "ปลั๊กอิน", subtitle: "เชื่อมต่อบริการสร้างบนเว็บและบันทึกไปยัง My assets", search: "ค้นหาปลั๊กอิน", connected: "เชื่อมต่อแล้ว", connect: "เชื่อมต่อ", available: "พร้อมใช้", cancel: "ยกเลิก", disconnect: "ยกเลิกการเชื่อมต่อ", capability: "สร้างภาพและวิดีโอ", authTitle: "เชื่อมต่อ Puter.js", authBody: "จะเปิดหน้าต่างเข้าสู่ระบบ Puter และใช้โควตาของผู้ใช้", continue: "เข้าสู่ระบบ Puter", secure: "ไม่ต้องใช้ API Key; Puter จัดการการเข้าสู่ระบบและการใช้งาน", userPays: "ผู้ใช้เป็นผู้ชำระ", mode: "รูปแบบ", textVideo: "ข้อความเป็นวิดีโอ", textImage: "ข้อความเป็นภาพ", prompt: "อธิบายสิ่งที่ต้องการสร้าง", placeholder: "ถนนโตเกียวหลังฝนตก กล้องเคลื่อนไปข้างหน้าช้า ๆ แสงนีออนสะท้อน…", ratio: "อัตราส่วน", duration: "ระยะเวลา", model: "โมเดล", generate: "สร้าง", generating: "กำลังสร้างจากระยะไกล", resultSaved: "บันทึกใน My assets แล้ว", openAssets: "ดู My assets", puterNote: "การสร้างวิดีโออาจใช้เวลาหลายนาที", spaceUrl: "ที่อยู่ Space", spacePlaceholder: "owner/space-name หรือ https://…hf.space", connectSpace: "เชื่อมต่อ Space", spaceHelp: "รองรับ Space แบบ public หรือ Protected ที่ฝังได้", embedded: "Space ที่ฝัง", importUrl: "URL ผลลัพธ์", importPlaceholder: "URL ภาพหรือวิดีโอจาก Space", importAsset: "นำเข้า My assets", hfNote: "API ของแต่ละ Space ต่างกัน ให้สร้างในหน้าฝังแล้วนำเข้า URL", connectionError: "เชื่อมต่อล้มเหลว", jobError: "งานล้มเหลว" },
  vi: { title: "Plugin", subtitle: "Kết nối dịch vụ tạo trên web và lưu vào My assets.", search: "Tìm plugin", connected: "Đã kết nối", connect: "Kết nối", available: "Có sẵn", cancel: "Hủy", disconnect: "Ngắt kết nối", capability: "Tạo ảnh và video", authTitle: "Kết nối Puter.js", authBody: "Cửa sổ đăng nhập Puter sẽ mở và dùng hạn mức của người dùng.", continue: "Đăng nhập Puter", secure: "Không cần API Key; Puter quản lý đăng nhập và mức dùng.", userPays: "Người dùng chi trả", mode: "Chế độ", textVideo: "Văn bản thành video", textImage: "Văn bản thành ảnh", prompt: "Mô tả nội dung", placeholder: "Một con phố Tokyo sau mưa, máy quay tiến chậm, ánh đèn neon phản chiếu…", ratio: "Tỷ lệ", duration: "Thời lượng", model: "Mô hình", generate: "Tạo", generating: "Đang tạo từ xa", resultSaved: "Đã lưu vào My assets", openAssets: "Xem My assets", puterNote: "Tạo video có thể mất vài phút.", spaceUrl: "Địa chỉ Space", spacePlaceholder: "owner/space-name hoặc https://…hf.space", connectSpace: "Kết nối Space", spaceHelp: "Hỗ trợ Space public hoặc Protected có thể nhúng.", embedded: "Space nhúng", importUrl: "URL kết quả", importPlaceholder: "URL ảnh hoặc video do Space trả về", importAsset: "Nhập vào My assets", hfNote: "API mỗi Space khác nhau; tạo trong giao diện nhúng rồi nhập URL.", connectionError: "Kết nối thất bại", jobError: "Tác vụ thất bại" },
  ru: { title: "Плагины", subtitle: "Подключайте веб-сервисы и сохраняйте результаты в My assets.", search: "Поиск плагинов", connected: "Подключено", connect: "Подключить", available: "Доступно", cancel: "Отмена", disconnect: "Отключить", capability: "Генерация изображений и видео", authTitle: "Подключить Puter.js", authBody: "Откроется вход Puter; генерация использует лимит пользователя.", continue: "Войти в Puter", secure: "Без API-ключа; Puter управляет входом и использованием.", userPays: "Платит пользователь", mode: "Режим", textVideo: "Текст в видео", textImage: "Текст в изображение", prompt: "Опишите результат", placeholder: "Улица Токио после дождя, медленный наезд камеры, неоновые отражения…", ratio: "Формат", duration: "Длительность", model: "Модель", generate: "Создать", generating: "Удалённая генерация", resultSaved: "Сохранено в My assets", openAssets: "Открыть My assets", puterNote: "Создание видео может занять несколько минут.", spaceUrl: "Адрес Space", spacePlaceholder: "owner/space-name или https://…hf.space", connectSpace: "Подключить Space", spaceHelp: "Поддерживаются встраиваемые public и Protected Spaces.", embedded: "Встроенный Space", importUrl: "URL результата", importPlaceholder: "URL изображения или видео из Space", importAsset: "Импортировать в My assets", hfNote: "API Spaces различаются; создайте результат во встроенном интерфейсе и импортируйте URL.", connectionError: "Ошибка подключения", jobError: "Ошибка задачи" },
};

const AUTH_RECOVERY_COPY = {
  zh: { waitingAuth: "等待 Puter 返回授权", retryAuth: "重试登录", authTimeout: "没有收到 Puter 的授权回传。请关闭登录窗口后重试。", popupBlocked: "登录窗口被浏览器拦截，请允许弹窗后重试。", authClosed: "登录窗口已关闭，尚未完成授权。" },
  en: { waitingAuth: "Waiting for Puter", retryAuth: "Retry sign-in", authTimeout: "Puter did not return the authorization result. Close the sign-in window and try again.", popupBlocked: "The browser blocked the sign-in window. Allow popups and try again.", authClosed: "The sign-in window was closed before authorization completed." },
  ja: { waitingAuth: "Puter の認証を待機中", retryAuth: "ログインを再試行", authTimeout: "Puter から認証結果が返されませんでした。ログイン画面を閉じて再試行してください。", popupBlocked: "ログイン画面がブラウザーにブロックされました。ポップアップを許可して再試行してください。", authClosed: "認証完了前にログイン画面が閉じられました。" },
  ko: { waitingAuth: "Puter 인증 대기 중", retryAuth: "로그인 다시 시도", authTimeout: "Puter에서 인증 결과를 받지 못했습니다. 로그인 창을 닫고 다시 시도하세요.", popupBlocked: "브라우저가 로그인 창을 차단했습니다. 팝업을 허용한 뒤 다시 시도하세요.", authClosed: "인증이 완료되기 전에 로그인 창이 닫혔습니다." },
  es: { waitingAuth: "Esperando a Puter", retryAuth: "Reintentar acceso", authTimeout: "Puter no devolvió la autorización. Cierra la ventana de acceso e inténtalo de nuevo.", popupBlocked: "El navegador bloqueó la ventana de acceso. Permite ventanas emergentes e inténtalo de nuevo.", authClosed: "La ventana se cerró antes de completar la autorización." },
  fr: { waitingAuth: "En attente de Puter", retryAuth: "Réessayer la connexion", authTimeout: "Puter n’a pas renvoyé l’autorisation. Fermez la fenêtre de connexion et réessayez.", popupBlocked: "Le navigateur a bloqué la fenêtre de connexion. Autorisez les pop-ups et réessayez.", authClosed: "La fenêtre a été fermée avant la fin de l’autorisation." },
  de: { waitingAuth: "Auf Puter warten", retryAuth: "Anmeldung wiederholen", authTimeout: "Puter hat keine Autorisierung zurückgegeben. Schließe das Anmeldefenster und versuche es erneut.", popupBlocked: "Das Anmeldefenster wurde vom Browser blockiert. Pop-ups zulassen und erneut versuchen.", authClosed: "Das Anmeldefenster wurde vor Abschluss der Autorisierung geschlossen." },
  pt: { waitingAuth: "Aguardando Puter", retryAuth: "Tentar login novamente", authTimeout: "O Puter não retornou a autorização. Feche a janela de login e tente novamente.", popupBlocked: "O navegador bloqueou a janela de login. Permita pop-ups e tente novamente.", authClosed: "A janela foi fechada antes da autorização terminar." },
  th: { waitingAuth: "กำลังรอการอนุญาตจาก Puter", retryAuth: "ลองเข้าสู่ระบบอีกครั้ง", authTimeout: "ไม่ได้รับผลการอนุญาตจาก Puter โปรดปิดหน้าต่างเข้าสู่ระบบแล้วลองอีกครั้ง", popupBlocked: "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ โปรดอนุญาตป๊อปอัปแล้วลองอีกครั้ง", authClosed: "หน้าต่างเข้าสู่ระบบถูกปิดก่อนอนุญาตเสร็จ" },
  vi: { waitingAuth: "Đang chờ Puter", retryAuth: "Thử đăng nhập lại", authTimeout: "Puter chưa trả kết quả ủy quyền. Hãy đóng cửa sổ đăng nhập rồi thử lại.", popupBlocked: "Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên rồi thử lại.", authClosed: "Cửa sổ đăng nhập đã đóng trước khi hoàn tất ủy quyền." },
  ru: { waitingAuth: "Ожидание Puter", retryAuth: "Повторить вход", authTimeout: "Puter не вернул результат авторизации. Закройте окно входа и повторите попытку.", popupBlocked: "Браузер заблокировал окно входа. Разрешите всплывающие окна и повторите попытку.", authClosed: "Окно входа закрыто до завершения авторизации." },
};

const PLUGINS = [
  { id: "puter", name: "Puter.js", Icon: MagicWand, tone: "violet", capabilities: ["T2V", "T2I", "I2V"] },
  { id: "huggingface", name: "Hugging Face Spaces", Icon: Globe, tone: "yellow", capabilities: ["APP", "API", "OAuth"] },
];

function getCopy(language) {
  const key = String(language || "en").toLowerCase();
  return { ...(COPY[key] || COPY.en), ...(AUTH_RECOVERY_COPY[key] || AUTH_RECOVERY_COPY.en) };
}

function getPuterAuthError(copy, connection) {
  if (!connection?.error) return "";
  if (connection.errorCode === "auth_timeout") return copy.authTimeout;
  if (connection.errorCode === "popup_blocked") return copy.popupBlocked;
  if (connection.errorCode === "auth_window_closed") return copy.authClosed;
  return connection.error;
}

function AuthDialog({ copy, busy, error, onCancel, onContinue }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="plugin-auth-backdrop" role="presentation">
      <section className="plugin-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="plugin-auth-title">
        <header>
          <div className="plugin-brand-mark is-violet"><MagicWand size={22} weight="fill" /></div>
          <div><span>Puter.js</span><h2 id="plugin-auth-title">{copy.authTitle}</h2></div>
          <button type="button" aria-label={copy.cancel} onClick={onCancel}><X size={19} /></button>
        </header>
        <p>{copy.authBody}</p>
        <div className="plugin-auth-permissions">
          <span><Check size={15} weight="bold" /> {copy.capability}</span>
          <span><Check size={15} weight="bold" /> {copy.userPays}</span>
        </div>
        <div className="plugin-secure-note"><ShieldCheck size={17} weight="duotone" /><span>{copy.secure}</span></div>
        {error ? <p className="plugin-error">{copy.connectionError}: {error}</p> : null}
        <footer>
          <button type="button" className="plugin-button secondary" onClick={onCancel}>{copy.cancel}</button>
          <button type="button" className="plugin-button primary" disabled={busy} onClick={onContinue}>{busy ? <SpinnerGap className="spin" size={17} /> : <UserCircle size={17} />}{busy ? copy.waitingAuth : error ? copy.retryAuth : copy.continue}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function JobStatus({ copy, plugins }) {
  if (!(["running", "complete", "error"].includes(plugins.job.state))) return null;
  const complete = plugins.job.state === "complete";
  const error = plugins.job.state === "error";
  return (
    <div className={`plugin-job ${complete ? "is-complete" : ""} ${error ? "is-error" : ""}`}>
      <div><span>{complete ? <CheckCircle size={17} weight="fill" /> : error ? <X size={17} /> : <SpinnerGap className="spin" size={17} />}{complete ? copy.resultSaved : error ? copy.jobError : copy.generating}</span><strong>{error ? "" : `${plugins.job.progress}%`}</strong></div>
      {!error ? <i><span style={{ width: `${plugins.job.progress}%` }} /></i> : <p>{plugins.job.message}</p>}
      {complete ? <button type="button" onClick={plugins.openGeneratedAsset}>{copy.openAssets}<ArrowSquareOut size={15} /></button> : null}
    </div>
  );
}

export function PluginCatalogPanel({ language, plugins, onOpenInspector }) {
  const copy = getCopy(language);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => PLUGINS.filter((plugin) => plugin.name.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  return (
    <div className="tool-panel plugin-catalog-panel">
      <div className="plugin-catalog-heading"><span><PlugsConnected size={20} weight="duotone" /></span><div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div></div>
      <label className="plugin-search"><MagnifyingGlass size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} /></label>
      <div className="plugin-card-list">
        {filtered.map((plugin) => {
          const selected = plugins.selectedPluginId === plugin.id;
          const connected = plugins.connections[plugin.id]?.state === "connected";
          return (
            <button key={plugin.id} type="button" className={`plugin-card is-${plugin.tone} ${selected ? "is-selected" : ""}`} onClick={() => { plugins.setSelectedPluginId(plugin.id); onOpenInspector?.(); }}>
              <span className={`plugin-brand-mark is-${plugin.tone}`}><plugin.Icon size={21} weight="duotone" /></span>
              <span className="plugin-card-copy"><strong>{plugin.name}</strong><em>{copy.capability}</em><small>{plugin.capabilities.map((item) => <i key={item}>{item}</i>)}</small></span>
              <span className={`plugin-state ${connected ? "is-connected" : "is-available"}`}>{connected ? <CheckCircle size={13} weight="fill" /> : null}{connected ? copy.connected : copy.available}</span>
            </button>
          );
        })}
      </div>
      <div className="plugin-catalog-footnote"><PlugsConnected size={16} /><span>Puter.js · Hugging Face Spaces</span></div>
    </div>
  );
}

function PuterInspector({ copy, plugins }) {
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState("4");
  const [videoModel, setVideoModel] = useState("sora-2");
  const [imageModel, setImageModel] = useState("gpt-image-1-mini");
  const connection = plugins.connections.puter;
  const connected = connection.state === "connected";
  const busy = connection.state === "authorizing";
  const authError = getPuterAuthError(copy, connection);
  const running = plugins.job.state === "running";
  if (!connected) {
    return (
      <>
        <div className="plugin-connect-view">
          <span className="plugin-brand-mark large is-violet"><MagicWand size={28} weight="fill" /></span>
          <small>{copy.available}</small><h2>Puter.js</h2><p>{copy.capability}</p>
          <div className="plugin-capability-grid"><span><ImageSquare size={17} /> T2I</span><span><VideoCamera size={17} /> T2V</span><span><UserCircle size={17} /> {copy.userPays}</span></div>
          <button type="button" className="plugin-button primary wide" onClick={() => setShowAuth(true)}><LinkSimple size={17} /> {copy.connect}</button>
          <div className="plugin-secure-note"><ShieldCheck size={17} weight="duotone" /><span>{copy.secure}</span></div>
          {authError ? <p className="plugin-error">{authError}</p> : null}
        </div>
        {showAuth ? <AuthDialog copy={copy} busy={busy} error={authError} onCancel={() => { plugins.cancelPuterConnect(); setShowAuth(false); }} onContinue={async () => { try { await plugins.connectPuter(); setShowAuth(false); } catch { /* shown in dialog */ } }} /> : null}
      </>
    );
  }
  const model = mode === "text-to-video" ? videoModel : imageModel;
  return (
    <div className="plugin-generator">
      <div className="plugin-connected-banner"><span><CheckCircle size={18} weight="fill" /><strong>Puter.js</strong>{connection.user?.username ? <em>@{connection.user.username}</em> : null}</span><button type="button" onClick={plugins.disconnectPuter}>{copy.disconnect}</button></div>
      <label className="plugin-field"><span>{copy.mode}</span><div className="plugin-mode-tabs"><button type="button" className={mode === "text-to-video" ? "is-active" : ""} onClick={() => setMode("text-to-video")}>{copy.textVideo}</button><button type="button" className={mode === "text-to-image" ? "is-active" : ""} onClick={() => setMode("text-to-image")}>{copy.textImage}</button></div></label>
      <label className="plugin-field"><span>{copy.prompt}</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={copy.placeholder} maxLength={800} /><small>{prompt.length}/800</small></label>
      {mode === "text-to-video" ? <div className="plugin-field-row"><label className="plugin-field"><span>{copy.ratio}</span><select value={ratio} onChange={(event) => setRatio(event.target.value)}><option>16:9</option><option>9:16</option></select></label><label className="plugin-field"><span>{copy.duration}</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="4">4s</option><option value="8">8s</option></select></label></div> : null}
      <label className="plugin-field"><span>{copy.model}</span>{mode === "text-to-video" ? <select value={videoModel} onChange={(event) => setVideoModel(event.target.value)}><option value="sora-2">OpenAI · Sora 2</option><option value="veo-3.0-fast-generate-001">Google · Veo 3 Fast</option></select> : <select value={imageModel} onChange={(event) => setImageModel(event.target.value)}><option value="gpt-image-1-mini">OpenAI · GPT Image</option><option value="grok-imagine-image">xAI · Grok Imagine</option></select>}</label>
      <JobStatus copy={copy} plugins={plugins} />
      <button type="button" className="plugin-button primary wide generation" disabled={!prompt.trim() || running} onClick={() => plugins.generateWithPuter({ mode, prompt, ratio, duration: Number(duration), model })}>{running ? <SpinnerGap className="spin" size={18} /> : <MagicWand size={18} weight="fill" />}{running ? copy.generating : copy.generate}</button>
      <p className="plugin-prototype-note">{copy.puterNote}</p>
    </div>
  );
}

function HuggingFaceInspector({ copy, plugins }) {
  const [spaceInput, setSpaceInput] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const connection = plugins.connections.huggingface;
  const connected = connection.state === "connected";
  const busy = connection.state === "connecting";
  if (!connected) {
    return (
      <div className="plugin-connect-view">
        <span className="plugin-brand-mark large is-yellow"><Globe size={28} weight="duotone" /></span>
        <small>{copy.available}</small><h2>Hugging Face Spaces</h2><p>{copy.spaceHelp}</p>
        <div className="plugin-capability-grid"><span><Globe size={17} /> APP</span><span><Code size={17} /> API</span><span><ShieldCheck size={17} /> OAuth</span></div>
        <label className="plugin-field plugin-space-field"><span>{copy.spaceUrl}</span><input value={spaceInput} onChange={(event) => setSpaceInput(event.target.value)} placeholder={copy.spacePlaceholder} /></label>
        <button type="button" className="plugin-button primary wide" disabled={!spaceInput.trim() || busy} onClick={() => plugins.connectSpace(spaceInput).catch(() => {})}>{busy ? <SpinnerGap className="spin" size={17} /> : <LinkSimple size={17} />}{copy.connectSpace}</button>
        {connection.error ? <p className="plugin-error">{copy.connectionError}: {connection.error}</p> : null}
      </div>
    );
  }
  const importing = plugins.job.state === "running";
  return (
    <div className="plugin-generator plugin-space-generator">
      <div className="plugin-connected-banner"><span><CheckCircle size={18} weight="fill" /><strong>{connection.spaceId}</strong></span><button type="button" onClick={plugins.disconnectSpace}>{copy.disconnect}</button></div>
      <div className="plugin-space-frame"><header><span><Globe size={15} />{copy.embedded}</span><a href={connection.embedUrl} target="_blank" rel="noreferrer"><ArrowSquareOut size={15} /></a></header><iframe title={connection.spaceId} src={connection.embedUrl} credentialless="" allow="clipboard-read; clipboard-write; microphone; camera" /></div>
      <label className="plugin-field plugin-space-field"><span>{copy.importUrl}</span><input value={resultUrl} onChange={(event) => setResultUrl(event.target.value)} placeholder={copy.importPlaceholder} /></label>
      <JobStatus copy={copy} plugins={plugins} />
      <button type="button" className="plugin-button primary wide" disabled={!resultUrl.trim() || importing} onClick={() => plugins.importSpaceOutput(resultUrl)}>{importing ? <SpinnerGap className="spin" size={17} /> : <CloudArrowDown size={17} />}{copy.importAsset}</button>
      <p className="plugin-prototype-note">{copy.hfNote}</p>
    </div>
  );
}

export function PluginInspector({ language, plugins }) {
  const copy = getCopy(language);
  return plugins.selectedPluginId === "huggingface" ? <HuggingFaceInspector copy={copy} plugins={plugins} /> : <PuterInspector copy={copy} plugins={plugins} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getPluginCopy(language) {
  return getCopy(language);
}
