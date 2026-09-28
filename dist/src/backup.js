import {MAX_STROKES,MAX_POINTS,MAX_TOTAL_POINTS} from './drawing.js';
const fail=()=>{throw new Error('백업 형식이나 데이터 크기가 올바르지 않아요. 기존 기록은 유지됩니다.');};
const string=(v,max)=>typeof v==='string'&&v.length<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const timestamp=v=>string(v,40)&&Number.isFinite(Date.parse(v));
const quote=v=>v&&string(v.text,2000)&&v.text.length>0&&string(v.sourceTitle,200);
export const MAX_BACKUP_BYTES=20*1024*1024;
export function validateBackup(data) {
  if(!data||data.schemaVersion!==1)fail();
  for(const name of ['entries','assignments','favorites','settings'])if(!Array.isArray(data[name])||data[name].length>20000)fail();
  const result={schemaVersion:1,entries:[],assignments:[],favorites:[],settings:[]};
  for(const name of ['entries','assignments']){
    const seen=new Set();for(const e of data[name]){
      if(!e||!date(e.dateKey)||seen.has(e.dateKey)||!string(e.quoteId,100)||!e.quoteId||!quote(e.quoteSnapshot))fail();seen.add(e.dateKey);
      const item={dateKey:e.dateKey,quoteId:e.quoteId,quoteSnapshot:{text:e.quoteSnapshot.text,sourceTitle:e.quoteSnapshot.sourceTitle}};
      if(name==='entries'){
        if(!string(e.note,2000)||!timestamp(e.createdAt)||!timestamp(e.updatedAt)||!Array.isArray(e.strokes)||e.strokes.length>MAX_STROKES)fail();
        let count=0;const strokes=e.strokes.map(s=>{if(!s||!/^#[0-9a-f]{6}$/i.test(s.color)||!Number.isFinite(s.width)||s.width<1||s.width>20||!Array.isArray(s.points)||s.points.length<1||s.points.length>MAX_POINTS)fail();count+=s.points.length;if(count>MAX_TOTAL_POINTS)fail();return {color:s.color,width:s.width,points:s.points.map(p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)fail();return {x:p.x,y:p.y};})};});
        Object.assign(item,{note:e.note,strokes,createdAt:e.createdAt,updatedAt:e.updatedAt});
      }result[name].push(item);
    }
  }
  const ids=new Set();for(const f of data.favorites){if(!f||!string(f.quoteId,100)||!f.quoteId||ids.has(f.quoteId)||!timestamp(f.createdAt))fail();ids.add(f.quoteId);result.favorites.push({quoteId:f.quoteId,createdAt:f.createdAt});}
  const keys=new Set();for(const s of data.settings){if(!s||keys.has(s.key))fail();keys.add(s.key);if(s.key==='theme'&&['system','light','dark','green'].includes(s.value))result.settings.push({key:s.key,value:s.value});else if(s.key==='preferredLocale'&&s.value==='ko')result.settings.push({key:s.key,value:s.value});else if(s.key==='schemaVersion'&&s.value===1)result.settings.push({key:s.key,value:1});else fail();}
  return result;
}
export async function readBackup(file){if(file.size>MAX_BACKUP_BYTES)throw new Error('백업 파일은 20MB 이하여야 해요.');let data;try{data=JSON.parse(await file.text());}catch{fail();}return validateBackup(data);}
export function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
