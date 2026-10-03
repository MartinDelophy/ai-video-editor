/** Optional project cover. Capture actual video frames as well as image assets. */
export async function captureProjectPreview(visuals = []) {
  const visual = visuals.find(item => item.thumbnail || item.trackFrames?.length || item.src || item.blob);
  if (!visual) return null;
  const frame = visual.trackFrames?.find(item => typeof item === 'string' || item?.src);
  const still = visual.thumbnail || (typeof frame === 'string' ? frame : frame?.src);
  // Capture the source rather than enlarging a small filmstrip thumbnail.
  const original = visual.blob instanceof Blob || visual.src;
  const video = visual.type === 'video' && Boolean(original);
  const ownedUrl = original && visual.blob instanceof Blob ? URL.createObjectURL(visual.blob) : '';
  const source = ownedUrl || visual.src || still;
  if (!source || typeof source !== 'string') return null;
  return new Promise(resolve => {
    const media = video ? document.createElement('video') : new Image();
    let done = false;
    const finish = value => {
      if (done) return;
      done = true; clearTimeout(timer);
      media.onload = media.onerror = media.onloadeddata = media.onseeked = null;
      if (video) { media.pause(); media.removeAttribute('src'); media.load(); }
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 2500);
    const draw = () => {
      try {
        const width = video ? media.videoWidth : media.naturalWidth;
        const height = video ? media.videoHeight : media.naturalHeight;
        if (!width || !height) return finish(null);
        const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#10171d'; ctx.fillRect(0, 0, 960, 540);
        const scale = Math.min(960 / width, 540 / height);
        const w = width * scale, h = height * scale;
        ctx.drawImage(media, (960-w)/2, (540-h)/2, w, h);
        const encode = quality => canvas.toBlob(blob => {
          if (blob && blob.size <= 131072) finish(blob);
          else if (quality > 0.5) encode(quality - 0.12);
          else finish(null);
        }, 'image/jpeg', quality);
        encode(0.86);
      } catch { finish(null); }
    };
    media.crossOrigin = 'anonymous';
    media.onerror = () => finish(null);
    if (video) {
      media.muted = true; media.preload = 'auto'; media.playsInline = true;
      media.onloadeddata = () => {
        media.onloadeddata = null;
        const time = Math.min(Math.max(0, Number(visual.sourceStart) || 0), Math.max(0, media.duration - 0.05));
        if (time > 0) { media.onseeked = draw; media.currentTime = time; }
        else draw();
      };
    } else media.onload = draw;
    media.src = source;
  });
}
