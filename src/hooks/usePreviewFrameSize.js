import { useEffect, useState } from "react";
export function usePreviewFrameSize(shellRef, ratio, compactRail) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const update = () => {
      const style = getComputedStyle(shell);
      const aw = Math.max(1, shell.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0));
      const ah = Math.max(1, shell.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0));
      const width = Math.max(1, Math.floor(Math.min(aw, ah * ratio.width / ratio.height)));
      const height = Math.max(1, Math.floor(width * ratio.height / ratio.width));
      setSize((old) => old.width === width && old.height === height ? old : { width, height });
    };
    update();
    if (window.ResizeObserver) { const observer = new ResizeObserver(update); observer.observe(shell); return () => observer.disconnect(); }
    addEventListener("resize", update); return () => removeEventListener("resize", update);
  }, [compactRail, ratio.height, ratio.width, shellRef]);
  return size;
}
