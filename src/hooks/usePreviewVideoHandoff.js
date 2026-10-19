import { useLayoutEffect } from "react";

export function usePreviewVideoHandoff({ canvasRef, videoRef, source, type, portalOpen }) {
  // Retain the outgoing decoded frame while a replacement decoder prepares.
  // Layout cleanup runs before paint, so no empty/new-source opening frame leaks.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return undefined;
    if (type !== "video" || !video) {
      canvas.style.display = "none";
      return undefined;
    }
    video.style.visibility = "hidden";
    const reveal = () => {
      if (videoRef.current !== video) return;
      video.style.visibility = "visible";
      canvas.style.display = "none";
    };
    video.addEventListener("timelineframepresented", reveal);
    return () => {
      video.removeEventListener("timelineframepresented", reveal);
      if (video.readyState < 2 || !video.videoWidth || video.style.visibility === "hidden") return;
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const style = getComputedStyle(video);
        for (const property of ["transform", "transformOrigin", "filter", "opacity", "objectFit", "objectPosition"])
          canvas.style[property] = style[property];
        canvas.style.display = "block";
      } catch { canvas.style.display = "none"; }
    };
  }, [canvasRef, source, type, videoRef, portalOpen]);
}
