import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowsOutCardinal, Cursor, MouseRightClick, X } from "@phosphor-icons/react";

const COPY = {
  zh: { title: "两个常用操作", timeline: "在轨道片段上右键，可以打开剪切、复制、静音等快捷操作。", canvas: "点击画面后，可直接拖动位置，并用控制点缩放或旋转。", done: "知道了" },
  en: { title: "Two useful shortcuts", timeline: "Right-click a timeline clip to open quick actions such as cut, duplicate, and mute.", canvas: "Click the visual, then drag to move it or use the handles to resize and rotate.", done: "Got it" },
  ja: { title: "便利な2つの操作", timeline: "タイムラインのクリップを右クリックすると、カット、複製、ミュートなどを操作できます。", canvas: "画面をクリックしてドラッグすると移動でき、ハンドルで拡大縮小や回転ができます。", done: "わかりました" },
  ko: { title: "유용한 두 가지 조작", timeline: "타임라인 클립을 마우스 오른쪽 버튼으로 클릭하면 자르기, 복제, 음소거 등의 메뉴가 열립니다.", canvas: "화면을 클릭한 뒤 드래그해 이동하고 핸들로 크기와 회전을 조절하세요.", done: "확인" },
  es: { title: "Dos controles útiles", timeline: "Haz clic derecho en un clip para abrir acciones como cortar, duplicar y silenciar.", canvas: "Haz clic en la imagen y arrástrala; usa los controles para cambiar su tamaño o girarla.", done: "Entendido" },
  fr: { title: "Deux gestes utiles", timeline: "Faites un clic droit sur un clip pour accéder aux actions de coupe, duplication et sourdine.", canvas: "Cliquez sur l’image, puis faites-la glisser ou utilisez les poignées pour la redimensionner et la faire pivoter.", done: "Compris" },
  de: { title: "Zwei nützliche Aktionen", timeline: "Klicke mit der rechten Maustaste auf einen Clip, um Aktionen wie Schneiden, Duplizieren und Stummschalten zu öffnen.", canvas: "Klicke auf das Bild und ziehe es; mit den Griffen kannst du Größe und Drehung ändern.", done: "Verstanden" },
  pt: { title: "Dois controles úteis", timeline: "Clique com o botão direito em um clipe para abrir ações como cortar, duplicar e silenciar.", canvas: "Clique na imagem e arraste para mover; use as alças para redimensionar e girar.", done: "Entendi" },
  th: { title: "สองวิธีใช้งานที่มีประโยชน์", timeline: "คลิกขวาที่คลิปบนไทม์ไลน์เพื่อเปิดเมนูตัด ทำสำเนา และปิดเสียง", canvas: "คลิกภาพแล้วลากเพื่อย้าย หรือใช้จุดควบคุมเพื่อปรับขนาดและหมุน", done: "เข้าใจแล้ว" },
  vi: { title: "Hai thao tác hữu ích", timeline: "Nhấp chuột phải vào clip để mở các thao tác như cắt, nhân bản và tắt tiếng.", canvas: "Nhấp vào hình rồi kéo để di chuyển; dùng các tay nắm để đổi kích thước và xoay.", done: "Đã hiểu" },
  ru: { title: "Два полезных действия", timeline: "Щёлкните клип правой кнопкой мыши, чтобы открыть команды обрезки, дублирования и отключения звука.", canvas: "Нажмите на изображение и перетащите его; маркеры позволяют менять размер и поворот.", done: "Понятно" },
};

function getTargetRect(selector) {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

export function FirstVisualGuide({ language = "zh", onClose, onComplete }) {
  const [targets, setTargets] = useState({ canvas: null, timeline: null });
  const copy = COPY[language] ?? COPY.en;

  useLayoutEffect(() => {
    const update = () => setTargets({
      canvas: getTargetRect(".preview-frame"),
      timeline: getTargetRect('.image-clip[data-timeline-segment-track="image"]'),
    });
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const timelineStyle = targets.timeline ? {
    left: Math.max(16, Math.min(window.innerWidth - 336, targets.timeline.left)),
    bottom: Math.max(16, window.innerHeight - targets.timeline.top + 14),
  } : undefined;
  const canvasStyle = targets.canvas ? {
    left: Math.max(16, Math.min(window.innerWidth - 336, targets.canvas.right + 14)),
    top: Math.max(70, Math.min(window.innerHeight - 160, targets.canvas.top + targets.canvas.height * 0.24)),
  } : undefined;

  return (
    <div className="first-visual-guide" role="dialog" aria-modal="true" aria-labelledby="first-visual-guide-title">
      <button className="first-visual-guide-dismiss" type="button" aria-label={copy.done} onClick={onClose}><X size={18} /></button>
      <div className="first-visual-guide-heading">
        <strong id="first-visual-guide-title">{copy.title}</strong>
        <button type="button" onClick={onComplete}>{copy.done}</button>
      </div>
      {targets.canvas ? <div className="first-visual-guide-highlight is-canvas" style={{ left: targets.canvas.left - 5, top: targets.canvas.top - 5, width: targets.canvas.width + 10, height: targets.canvas.height + 10 }} /> : null}
      {targets.timeline ? <div className="first-visual-guide-highlight is-timeline" style={{ left: targets.timeline.left - 4, top: targets.timeline.top - 4, width: targets.timeline.width + 8, height: targets.timeline.height + 8 }} /> : null}
      {targets.canvas ? (
        <div className="first-visual-guide-demo is-transform" aria-hidden="true" style={{ left: targets.canvas.left, top: targets.canvas.top, width: targets.canvas.width, height: targets.canvas.height }}>
          <div className="first-visual-guide-demo-box"><i /><i /><i /><i /></div>
          <Cursor className="first-visual-guide-demo-cursor" size={27} weight="fill" />
        </div>
      ) : null}
      {targets.timeline ? (
        <div className="first-visual-guide-demo is-context" aria-hidden="true" style={{ left: targets.timeline.left, top: targets.timeline.top, width: targets.timeline.width, height: targets.timeline.height }}>
          <MouseRightClick className="first-visual-guide-demo-mouse" size={29} weight="fill" />
          <span className="first-visual-guide-click-ring" />
          <div className="first-visual-guide-mini-menu"><i /><i /><i /></div>
        </div>
      ) : null}
      <div className="first-visual-guide-card is-canvas" style={canvasStyle}><ArrowsOutCardinal size={21} /><span>{copy.canvas}</span></div>
      <div className="first-visual-guide-card is-timeline" style={timelineStyle}><MouseRightClick size={21} /><span>{copy.timeline}</span></div>
    </div>
  );
}
