import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PaintBrush, BoundingBox, ArrowCounterClockwise, Trash, DownloadSimple, SpinnerGap } from '@phosphor-icons/react';
import { getImageEditCopy } from '../i18nImageEdit.js';
import { getAnnaImageCopy } from '../plugins/generation/providers/anna/copy.js';
import { createImageEditMask } from '../lib/imageEditMask.js';
import { downloadBlob } from '../lib/media.js';
import './ImageEditDialog.css';
export function ImageEditDialog({asset,assets,language,plugins,onClose,onGenerated,closeLabel}) {
  const copy=getImageEditCopy(language), anna=getAnnaImageCopy(language);
  const [dimensions,setDimensions]=useState({width:asset.width||1024,height:asset.height||1024});
  const [tool,setTool]=useState('brush'),[size,setSize]=useState(5),[marks,setMarks]=useState([]),[draft,setDraft]=useState(null),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false),[resultId,setResultId]=useState(''),[showOriginal,setShowOriginal]=useState(false);
  const active=useRef(null),attempt=useRef(0),surface=useRef(null);
  const result=assets.find(item=>item.id===resultId), current=result&&!showOriginal?result:asset;
  useEffect(()=>{const close=event=>{if(event.key==='Escape'&&!busy)onClose();};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[busy,onClose]);
  useEffect(()=>()=>{attempt.current++;},[]);
  const point=event=>{const rect=surface.current.getBoundingClientRect(),scale=Math.min(rect.width/dimensions.width,rect.height/dimensions.height);return [Math.max(0,Math.min(dimensions.width,(event.clientX-rect.left-(rect.width-dimensions.width*scale)/2)/scale)),Math.max(0,Math.min(dimensions.height,(event.clientY-rect.top-(rect.height-dimensions.height*scale)/2)/scale))];};
  const down=event=>{if(busy||result||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const [x,y]=point(event);active.current=tool==='brush'?{type:'brush',size:dimensions.width*size/100,points:[[x,y]]}:{type:'rect',x,y,endX:x,endY:y};setDraft(active.current);};
  const move=event=>{if(!active.current)return;const [x,y]=point(event);active.current=active.current.type==='brush'?{...active.current,points:[...active.current.points,[x,y]]}:{...active.current,endX:x,endY:y};setDraft(active.current);};
  const finish=()=>{if(active.current){const mark=active.current; if(mark.type==='brush'||Math.abs(mark.endX-mark.x)>1&&Math.abs(mark.endY-mark.y)>1)setMarks(items=>[...items,mark]);active.current=null;setDraft(null);}};
  const generate=async()=>{if(!marks.length||!prompt.trim()||busy)return;const id=++attempt.current;setBusy(true);setError(false);try{const maskBlob=await createImageEditMask(asset.blob,marks);if(id!==attempt.current)return;const connection=await plugins.connectProvider('anna');if(!connection||id!==attempt.current)throw new Error('Not connected');const output=await plugins.generateProvider('anna',{mode:'image-to-image',prompt,referenceAssets:[asset],maskBlob},connection);if(id!==attempt.current)return;if(!output?.selectedAssetId)throw new Error('Edit failed');setResultId(output.selectedAssetId);onGenerated(output.assetIds);}catch{if(id===attempt.current)setError(true);}finally{if(id===attempt.current)setBusy(false);}};
  const cancel=()=>{attempt.current++;plugins.cancelProviderConnect('anna');void plugins.cancelGeneration();setBusy(false);};
  return createPortal(<div className="image-edit-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section className="image-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="image-edit-title">
    <header><div><strong id="image-edit-title">{copy.title}</strong><small>{asset.name}</small></div><button type="button" autoFocus disabled={busy} aria-label={closeLabel} onClick={onClose}><X size={20}/></button></header>
    <div className="image-edit-workspace"><div className="image-edit-surface" ref={surface}>
      <img src={current.src} alt={current.name} draggable={false} onLoad={event=>{if(!result)setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});}}/>
      {!result&&<svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{active.current=null;setDraft(null);}} aria-label={copy.region}>
        {[...marks,...(draft?[draft]:[])].map((mark,i)=>mark.type==='brush'?<path key={i} d={mark.points.map(([x,y],n)=>`${n?'L':'M'}${x},${y}`).join(' ') + (mark.points.length===1?' l0.01,0':'')} stroke="#33ead4" strokeWidth={mark.size} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".5"/>:<rect key={i} x={Math.min(mark.x,mark.endX)} y={Math.min(mark.y,mark.endY)} width={Math.abs(mark.endX-mark.x)} height={Math.abs(mark.endY-mark.y)} fill="#33ead4" opacity=".5"/>)}
      </svg>}
    </div><aside>
      {result?<div className="image-edit-tools"><button type="button" aria-pressed={showOriginal} onClick={()=>setShowOriginal(true)}>{copy.original}</button><button type="button" aria-pressed={!showOriginal} onClick={()=>setShowOriginal(false)}>{copy.result}</button></div>:<><div className="image-edit-tools"><button type="button" disabled={busy} aria-pressed={tool==='brush'} onClick={()=>setTool('brush')}><PaintBrush size={17}/>{copy.brush}</button><button type="button" disabled={busy} aria-pressed={tool==='rect'} onClick={()=>setTool('rect')}><BoundingBox size={17}/>{copy.region}</button></div><label>{copy.size}<input type="range" min="1" max="15" value={size} disabled={busy} onChange={event=>setSize(Number(event.target.value))}/></label><div className="image-edit-tools"><button type="button" disabled={busy||!marks.length} onClick={()=>setMarks(items=>items.slice(0,-1))}><ArrowCounterClockwise size={17}/>{copy.undo}</button><button type="button" disabled={busy||!marks.length} onClick={()=>setMarks([])}><Trash size={17}/>{copy.clear}</button></div><p>{copy.hint}</p><textarea aria-label={copy.prompt} placeholder={copy.prompt} value={prompt} maxLength={4000} disabled={busy} onChange={event=>setPrompt(event.target.value)}/>{busy?<button type="button" onClick={cancel}><SpinnerGap size={17} className="spin"/>{anna.cancel}</button>:<button className="image-edit-primary" type="button" disabled={!marks.length||!prompt.trim()} onClick={generate}>{copy.apply}</button>}</>}
      {error&&<p role="alert">{copy.error}</p>}
      <button type="button" disabled={busy} onClick={()=>void downloadBlob(current.blob,current.name)}><DownloadSimple size={17}/>{copy.download}</button>
    </aside></div>
  </section></div>,document.body);
}
