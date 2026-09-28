const STORES = ['entries','assignments','favorites','settings'];
let connection;
export function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve,reject)=>{
    const request=indexedDB.open('one-line-db',1);
    request.onupgradeneeded=()=>{const db=request.result; for(const name of STORES) if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath: name==='favorites'?'quoteId':name==='settings'?'key':'dateKey'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();connection=null;};resolve(request.result);};
    request.onerror=()=>{connection=null;reject(request.error);};
    request.onblocked=()=>{connection=null;reject(new Error('다른 탭을 닫고 다시 열어 주세요.'));};
  });return connection;
}
export async function read(store,key) {
  const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store);const req=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function atomic(stores,work) {
  const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('저장이 취소됐어요.'));try{work(tx);}catch(error){tx.abort();reject(error);}});
}
export function put(store,value){return atomic([store],tx=>tx.objectStore(store).put(value));}
export function remove(store,key){return atomic([store],tx=>tx.objectStore(store).delete(key));}
export function clearAll(){return atomic(STORES,tx=>STORES.forEach(s=>tx.objectStore(s).clear()));}
export async function snapshot(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORES);const data={schemaVersion:1,exportedAt:new Date().toISOString()};for(const s of STORES){const r=tx.objectStore(s).getAll();r.onsuccess=()=>data[s]=r.result;}tx.oncomplete=()=>resolve(data);tx.onerror=()=>reject(tx.error);});}
export function restore(data,replace){return atomic(STORES,tx=>{for(const s of STORES){const store=tx.objectStore(s);if(replace)store.clear();for(const value of data[s])store.put(value);}for(const entry of data.entries)tx.objectStore('assignments').put({dateKey:entry.dateKey,quoteId:entry.quoteId,quoteSnapshot:entry.quoteSnapshot});});}
