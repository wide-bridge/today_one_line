import * as db from './storage.js';
import {localDate,approvedQuotes,chooseQuote,previousDate} from './quotes.js';
import {$,formatDate,showView,renderEntries,renderCatalog} from './ui.js';
import {readBackup,download} from './backup.js';

let quotes=[],current=null,favorites=new Set(),drawing=null,dirty=false,timer,revision=0,view='today',pendingBackup=null,day=localDate(),switching=false;
let writeQueue=Promise.resolve();
const enqueue=task=>{const pending=writeQueue.then(task);writeQueue=pending.catch(()=>{});return pending;};
function error(error){$('message').textContent=error?.name==='QuotaExceededError'?'저장 공간이 부족해요. 현재 내용을 백업한 뒤 공간을 확보해 주세요.':(error?.message||'작업을 완료하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.');$('message').hidden=false;}
const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(error);
function status(text){$('save-status').textContent=text;}
function changed(){if(!current)return;dirty=true;revision++;status('저장 중…');clearTimeout(timer);timer=setTimeout(()=>flush().catch(error),500);}
async function flush(){clearTimeout(timer);if(!current||!dirty){await writeQueue;return;}const saved=structuredClone(current),version=revision;saved.updatedAt=new Date().toISOString();try{await enqueue(()=>db.put('entries',saved));if(version===revision){dirty=false;current.updatedAt=saved.updatedAt;status('기기에 저장됨');}}catch(e){status('저장하지 못했어요');throw e;}}
async function loadDate(key){
  $('note').disabled=true;document.querySelector('.editor').inert=true;
  try{await flush();const existing=await db.read('entries',key);let assignment=existing||await db.read('assignments',key);
  if(!assignment){const previous=await db.read('assignments',previousDate(key));const q=chooseQuote(key,quotes,previous?.quoteId);assignment={dateKey:key,quoteId:q.id,quoteSnapshot:{text:q.text,sourceTitle:q.sourceTitle}};await db.put('assignments',assignment);}
  const now=new Date().toISOString();current=existing||{...assignment,note:'',strokes:[],createdAt:now,updatedAt:now};dirty=false;revision++;
  $('date-label').textContent=formatDate(key);$('past-label').textContent=key===localDate()?'나를 위한 작은 쉼표':'지난날의 마음';$('day-title').textContent=key===localDate()?'오늘, 마음에 닿는 한 줄':'그날, 마음에 닿은 한 줄';$('editor-title').textContent=key===localDate()?'오늘의 마음':'그날의 마음';$('quote').textContent=current.quoteSnapshot.text;$('source').textContent=`${current.quoteSnapshot.sourceTitle} · 자체 제작 문장`;$('note').value=current.note;$('note').disabled=false;$('count').textContent=current.note.length;drawing?.set(current.strokes);favoriteUI();status(existing?'기기에 저장됨':'아직 남긴 기록이 없어요');
  }finally{$('note').disabled=!current;document.querySelector('.editor').inert=false;}
}
function favoriteUI(){const yes=favorites.has(current?.quoteId);$('favorite').textContent=yes?'★':'☆';$('favorite').setAttribute('aria-pressed',String(yes));}
async function toggleFavorite(id){if(!id)return;if(favorites.has(id)){await db.remove('favorites',id);favorites.delete(id);}else{await db.put('favorites',{quoteId:id,createdAt:new Date().toISOString()});favorites.add(id);}favoriteUI();if(view==='archive')await archive();}
async function archive(){const search=$('search').value.toLocaleLowerCase().trim(),month=$('month').value,only=$('only-favorites').checked;const entries=(await db.read('entries')).filter(e=>(e.note.trim()||e.strokes.length)&&(!month||e.dateKey.startsWith(month))&&(!only||favorites.has(e.quoteId))&&`${e.note} ${e.quoteSnapshot.text}`.toLocaleLowerCase().includes(search)).sort((a,b)=>b.dateKey.localeCompare(a.dateKey));renderEntries(entries,favorites,safe(async key=>{await loadDate(key);view='today';showView(view);$('note').focus();}));renderCatalog(quotes.filter(q=>(!only||favorites.has(q.id))&&q.text.toLocaleLowerCase().includes(search)),favorites,safe(toggleFavorite));}
async function navigate(name){try{await flush();}catch(e){if(name!=='settings')throw e;error(e);}if(name==='today')await loadDate(localDate());if(name==='archive')await archive();if(name==='settings'){const data=await db.snapshot();const bytes=new Blob([JSON.stringify(data)]).size;const estimate=await navigator.storage?.estimate?.().catch(()=>null);$('storage-size').textContent=`기록 ${data.entries.filter(e=>e.note.trim()||e.strokes.length).length}개 · 백업 크기 약 ${(bytes/1024).toFixed(1)}KB${estimate?.quota?` · 브라우저 저장 한도 약 ${Math.round(estimate.quota/1024/1024)}MB`:''}`;}view=name;showView(name);}
async function initDrawing(){if(!drawing){const {attachDrawing}=await import('./drawing.js');if(drawing)return;drawing=attachDrawing($('canvas'),{color:()=>$('pen-color').value,width:()=>$('pen-width').value,onChange:strokes=>{if(!current)return;current.strokes=strokes;changed();},onError:error});drawing.set(current.strokes);}drawing.redraw();}
function applyTheme(theme){document.documentElement.dataset.theme=theme;$('theme').value=theme;try{localStorage.setItem('one-line-theme',theme);}catch{/* Preferences also persist in IndexedDB. */}}
async function rollover(){if(switching||document.hidden||day===localDate())return;switching=true;try{await flush();const wasToday=current?.dateKey===day;day=localDate();if(view==='today'&&wasToday)await loadDate(day);}finally{switching=false;}}
async function restoreBackup(replace){if(!pendingBackup)return;await flush();await db.restore(pendingBackup,replace);pendingBackup=null;$('restore-dialog').close();favorites=new Set((await db.read('favorites')).map(f=>f.quoteId));const theme=await db.read('settings','theme');applyTheme(theme?.value||'system');await loadDate(localDate());await navigate('settings');$('message').hidden=false;$('message').textContent='백업을 안전하게 가져왔어요.';}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',safe(()=>navigate(b.dataset.view))));
document.querySelector('.brand').addEventListener('click',safe(e=>{e.preventDefault();return navigate('today');}));
$('note').addEventListener('input',()=>{if(!current)return;current.note=$('note').value;$('count').textContent=current.note.length;changed();});
$('note').addEventListener('blur',safe(flush));
$('write').onclick=()=>$('note').focus();
$('draw').onclick=safe(async()=>{$('drawing-panel').open=true;await initDrawing();$('canvas').focus();});
$('drawing-panel').addEventListener('toggle',safe(()=>{if($('drawing-panel').open&&current)return initDrawing();}));
$('undo').onclick=()=>drawing?.undo();$('clear-drawing').onclick=()=>{if(current?.strokes.length&&confirm('이날의 그림을 모두 지울까요?'))drawing?.clear();};
$('favorite').onclick=safe(()=>toggleFavorite(current?.quoteId));
for(const id of ['search','month','only-favorites'])$(id).addEventListener('input',safe(archive));
$('theme').onchange=safe(async()=>{const value=$('theme').value;await db.put('settings',{key:'theme',value});applyTheme(value);});
$('export').onclick=safe(async()=>{try{await flush();}catch(e){error(e);}const data=await db.snapshot();if(dirty&&current){data.entries=data.entries.filter(e=>e.dateKey!==current.dateKey);data.entries.push(structuredClone(current));}download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`one-line-${localDate()}.json`);});
$('import').onchange=safe(async()=>{const file=$('import').files[0];$('import').value='';if(!file)return;await flush();pendingBackup=await readBackup(file);const data=await db.snapshot();const existing=new Set(data.entries.map(e=>e.dateKey));const duplicates=pendingBackup.entries.filter(e=>existing.has(e.dateKey)).length;const favoriteIds=new Set(data.favorites.map(f=>f.quoteId));$('restore-summary').textContent=`기록 ${pendingBackup.entries.length}개 (같은 날짜 ${duplicates}개), 즐겨찾기 ${pendingBackup.favorites.length}개 (중복 ${pendingBackup.favorites.filter(f=>favoriteIds.has(f.quoteId)).length}개), 문장 배정 ${pendingBackup.assignments.length}개를 가져옵니다.`;$('restore-dialog').showModal();});
$('restore-cancel').onclick=()=>{$('restore-dialog').close();pendingBackup=null;};
for(const [id,replace] of [['restore-merge',false],['restore-replace',true]])$(id).onclick=safe(async()=>{for(const b of $('restore-dialog').querySelectorAll('button'))b.disabled=true;try{await restoreBackup(replace);}finally{for(const b of $('restore-dialog').querySelectorAll('button'))b.disabled=false;}});
$('delete-all').onclick=safe(async()=>{if(!confirm('모든 기록과 그림, 즐겨찾기를 삭제할까요? 백업하지 않은 데이터는 복구할 수 없습니다.'))return;await flush();await db.clearAll();favorites.clear();applyTheme('system');await loadDate(localDate());await navigate('settings');});
for(const [id,share] of [['png',false],['share',true]])$(id).onclick=safe(async()=>{if(!current)return;await flush();$(id).disabled=true;try{const {exportCard}=await import('./share.js');await exportCard(structuredClone(current),share);}finally{$(id).disabled=false;}});
document.addEventListener('visibilitychange',safe(async()=>{if(document.hidden)await flush();else await rollover();}));
window.addEventListener('pagehide',()=>{flush().catch(error);});
window.addEventListener('beforeunload',e=>{if(dirty){flush().catch(error);e.preventDefault();e.returnValue='';}});
setInterval(safe(rollover),15000);
async function boot(){try{applyTheme(localStorage.getItem('one-line-theme')||'system');}catch{applyTheme('system');}const response=await fetch(new URL('../data/quotes.original.json',import.meta.url));if(!response.ok)throw new Error('문장을 불러오지 못했어요. 다시 열어 주세요.');quotes=approvedQuotes(await response.json());await db.openDB();favorites=new Set((await db.read('favorites')).map(f=>f.quoteId));const setting=await db.read('settings','theme');if(setting)applyTheme(setting.value);await loadDate(localDate());if('serviceWorker'in navigator){try{const registration=await navigator.serviceWorker.register('./service-worker.js');let updating=false;const offer=()=>{if(registration.waiting){$('update-app').hidden=false;$('update-app').onclick=safe(async()=>{await flush();updating=true;registration.waiting?.postMessage('ACTIVATE');});}};offer();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',offer));navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload();});}catch{/* Offline support may be unavailable; journaling still works. */}}}
boot().catch(e=>{status('불러오지 못했어요');error(e);});
