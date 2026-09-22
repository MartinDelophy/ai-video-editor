/** Optional project cover. Never delay a save indefinitely or reject it. */
export async function captureProjectPreview(visuals = []) {
  const visual = visuals.find(item => item.thumbnail || (item.type !== 'video' && item.src));
  const source = visual?.thumbnail || visual?.src;
  if (!source || typeof source !== 'string') return null;
  return new Promise(resolve => {
    const image = new Image();
    let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); image.onload = null; image.onerror = null; resolve(value); };
    const timer = setTimeout(() => finish(null), 1200);
    image.crossOrigin = 'anonymous';
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 135;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#10171d'; ctx.fillRect(0, 0, 240, 135);
        const scale = Math.min(240 / image.naturalWidth, 135 / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        ctx.drawImage(image, (240-w)/2, (135-h)/2, w, h);
        canvas.toBlob(blob => finish(blob?.size <= 32768 ? blob : null), 'image/jpeg', 0.65);
      } catch { finish(null); }
    };
    image.src = source;
  });
}
