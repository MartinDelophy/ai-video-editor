import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, DownloadSimple, PencilSimple } from "@phosphor-icons/react";
const labels = {
  zh: ["素材预览", "关闭", "下载"], en: ["Media preview", "Close", "Download"],
  ja: ["素材プレビュー", "閉じる", "ダウンロード"], ko: ["미디어 미리보기", "닫기", "다운로드"],
  es: ["Vista previa", "Cerrar", "Descargar"], fr: ["Aperçu du média", "Fermer", "Télécharger"],
  de: ["Medienvorschau", "Schließen", "Herunterladen"], pt: ["Prévia da mídia", "Fechar", "Baixar"],
  th: ["ตัวอย่างสื่อ", "ปิด", "ดาวน์โหลด"], vi: ["Xem trước nội dung", "Đóng", "Tải xuống"],
  ru: ["Просмотр медиа", "Закрыть", "Скачать"], it: ["Anteprima contenuto", "Chiudi", "Scarica"],
  id: ["Pratinjau media", "Tutup", "Unduh"],
};
export function ChatCutMediaPreview({ asset, language, editLabel, onEdit, onClose }) {
  const [title, close, download] = labels[language] || labels.en;
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="chatcut-preview-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="chatcut-media-preview" role="dialog" aria-modal="true" aria-label={`${title}: ${asset.name}`} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...dialog.current.querySelectorAll("button, a[href], video[controls]")];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><small>{title}</small><strong title={asset.name}>{asset.name}</strong></div><button type="button" aria-label={close} onClick={onClose}><X size={20} /></button></header>
      <div className="chatcut-preview-stage">{asset.type === "image" ? <img src={asset.src} alt={asset.name} /> : <video src={asset.src} poster={asset.thumbnail} controls playsInline tabIndex={0} />}</div>
      <footer><span>{asset.width > 0 && asset.height > 0 ? `${asset.width} × ${asset.height}` : ""}</span><a href={asset.src} download={asset.name}><DownloadSimple size={16} />{download}</a><button type="button" className="is-primary" onClick={onEdit}><PencilSimple size={16} />{editLabel}</button></footer>
    </section>
  </div>, document.body);
}
