export const MAX_STROKES=300, MAX_POINTS=1500, MAX_TOTAL_POINTS=30000;
export function paint(ctx,strokes,width,height) {
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const stroke of strokes){ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width*width/600;ctx.beginPath();stroke.points.forEach((p,i)=>i?ctx.lineTo(p.x*width,p.y*height):ctx.moveTo(p.x*width,p.y*height));if(stroke.points.length===1){const p=stroke.points[0];ctx.arc(p.x*width,p.y*height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
}
export function attachDrawing(canvas,{onChange,onError,color,width}) {
  let strokes=[],active=null,pointer=null;
  const redraw=()=>{const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);paint(ctx,strokes,rect.width,rect.height);};
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  const total=()=>strokes.reduce((n,s)=>n+s.points.length,0);
  const finish=()=>{if(!active)return;active=null;pointer=null;onChange(structuredClone(strokes));};
  canvas.addEventListener('pointerdown',e=>{if(active||e.button!==0)return;if(strokes.length>=MAX_STROKES||total()>=MAX_TOTAL_POINTS){onError(new Error('그림의 저장 한도에 도달했어요. 일부 획을 지워 주세요.'));return;}e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);active={color:color(),width:Number(width()),points:[point(e)]};strokes.push(active);redraw();onChange(structuredClone(strokes));});
  canvas.addEventListener('pointermove',e=>{if(!active||e.pointerId!==pointer)return;if(active.points.length>=MAX_POINTS||total()>=MAX_TOTAL_POINTS){finish();onError(new Error('한 획의 길이 한도에 도달했어요.'));return;}active.points.push(point(e));redraw();onChange(structuredClone(strokes));});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,finish);
  new ResizeObserver(redraw).observe(canvas);
  return {set(value){active=null;pointer=null;strokes=structuredClone(value);redraw();},undo(){finish();strokes.pop();redraw();onChange(structuredClone(strokes));},clear(){finish();strokes=[];redraw();onChange([]);},redraw};
}
