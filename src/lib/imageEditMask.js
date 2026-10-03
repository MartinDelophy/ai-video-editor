export async function createImageEditMask(blob, marks) {
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; image.close();
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineCap = ctx.lineJoin = 'round';
  for (const mark of marks) {
    if (mark.type === 'rect') ctx.fillRect(Math.min(mark.x,mark.endX),Math.min(mark.y,mark.endY),Math.abs(mark.endX-mark.x),Math.abs(mark.endY-mark.y));
    else { ctx.lineWidth = mark.size; ctx.beginPath(); mark.points.forEach(([x,y],i)=> i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); if(mark.points.length===1) { const [x,y]=mark.points[0];ctx.arc(x,y,mark.size/2,0,Math.PI*2);ctx.fill(); } else ctx.stroke(); }
  }
  return new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Mask encoding failed')),'image/png'));
}
export async function preserveUnmaskedImage(sourceBlob, resultBlob, maskBlob) {
  const images = await Promise.all([sourceBlob,resultBlob,maskBlob].map(blob=>createImageBitmap(blob)));
  try {
    const [source,result,mask]=images; const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(mask,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4) pixels.data[i+3]=pixels.data[i];ctx.putImageData(pixels,0,0);
    ctx.globalCompositeOperation='source-in';ctx.drawImage(result,0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='destination-over';ctx.drawImage(source,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image encoding failed')),'image/png'));
  } finally { images.forEach(image=>image.close()); }
}
