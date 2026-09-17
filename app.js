const DB_NAME='exerciseVaultDB';
const DB_VERSION=1;
const STORES=['sources','clips','exercises','workouts','inbox'];
let db;
let activeView='library';
let activeFilter='All';
let ytPlayer=null;
let loopTimer=null;
let previewContext=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalizeList=v=>(v||'').split(',').map(x=>x.trim()).filter(Boolean);

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const d=req.result;STORES.forEach(name=>{if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:'id'});});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function put(store,value){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(value);r.onsuccess=()=>res(value);r.onerror=()=>rej(r.error);});}
function del(store,id){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function all(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
function get(store,id){return new Promise((res,rej)=>{const r=tx(store).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}

function parseTime(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number'&&Number.isFinite(v))return Math.max(0,v);
  const s=String(v).trim();
  if(/^\d+(\.\d+)?$/.test(s))return Number(s);
  const parts=s.split(':').map(Number); if(parts.some(Number.isNaN))return null;
  if(parts.length===2)return parts[0]*60+parts[1];
  if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
  return null;
}
function fmtTime(sec){if(sec===null||sec===undefined||!Number.isFinite(sec))return '—';sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
function parseYouTube(url){
  try{const u=new URL(url);let id='';let isShort=false;if(u.hostname.includes('youtu.be'))id=u.pathname.slice(1).split('/')[0];else if(u.hostname.includes('youtube.com')){if(u.pathname.startsWith('/shorts/')){id=u.pathname.split('/')[2];isShort=true;}else if(u.pathname.startsWith('/embed/'))id=u.pathname.split('/')[2];else id=u.searchParams.get('v')||'';}return id?{id,isShort}:null;}catch{return null;}
}
function ytThumb(videoId){return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;}
function sourceOpenUrl(src,start){
  const yt=parseYouTube(src.url); if(yt){const t=Math.max(0,Math.floor(start||0));return `https://www.youtube.com/watch?v=${yt.id}${t?`&t=${t}s`:''}`;}return src.url;
}

async function ensureExerciseFromClip(clip){
  const exercises=await all('exercises');
  const key=clip.name.trim().toLowerCase();
  let ex=exercises.find(e=>e.name.trim().toLowerCase()===key||e.aliases?.some(a=>a.toLowerCase()===key));
  if(!ex){ex={id:uid(),name:clip.name,aliases:clip.aliases||[],equipment:clip.equipment||[],body:clip.body||[],tags:clip.tags||[],notes:'',createdAt:Date.now()};await put('exercises',ex);}else{
    const merged=(a,b)=>[...new Set([...(a||[]),...(b||[])])];
    ex.aliases=merged(ex.aliases,clip.aliases);ex.equipment=merged(ex.equipment,clip.equipment);ex.body=merged(ex.body,clip.body);ex.tags=merged(ex.tags,clip.tags);await put('exercises',ex);
  }
  clip.exerciseId=ex.id;await put('clips',clip);return ex;
}

async function render(){await Promise.all([renderLibrary(),renderSources(),renderInbox(),renderWorkouts(),renderBuilder()]);}

async function renderLibrary(){
  const [exercises,clips,sources]=await Promise.all([all('exercises'),all('clips'),all('sources')]);
  const q=$('#searchInput').value.trim().toLowerCase();
  const tags=new Set();exercises.forEach(e=>[...(e.tags||[]),...(e.equipment||[]),...(e.body||[])].forEach(t=>tags.add(t)));
  const chipWrap=$('#filterChips');chipWrap.innerHTML='';['All',...Array.from(tags).sort().slice(0,18)].forEach(t=>{const b=document.createElement('button');b.className='chip'+(activeFilter===t?' active':'');b.textContent=t;b.onclick=()=>{activeFilter=t;renderLibrary();};chipWrap.appendChild(b);});
  const filtered=exercises.filter(e=>{const hay=[e.name,...(e.aliases||[]),...(e.tags||[]),...(e.equipment||[]),...(e.body||[]),e.notes||''].join(' ').toLowerCase();const filterOk=activeFilter==='All'||[...(e.tags||[]),...(e.equipment||[]),...(e.body||[])].includes(activeFilter);return filterOk&&(!q||hay.includes(q));});
  const grid=$('#exerciseGrid');grid.innerHTML='';$('#libraryEmpty').classList.toggle('hidden',filtered.length>0);
  filtered.forEach(ex=>{
    const exClips=clips.filter(c=>c.exerciseId===ex.id);
    const featured=exClips[0];const src=featured?sources.find(s=>s.id===featured.sourceId):null;const yt=src?parseYouTube(src.url):null;
    const card=document.createElement('article');card.className='exercise-card';
    const thumbClass=yt?.isShort?'thumb vertical':'thumb';
    card.innerHTML=`<div class="${thumbClass}">${yt?`<img src="${ytThumb(yt.id)}" alt="${escapeHtml(ex.name)} preview thumbnail">`:''}<button class="play-pill" ${featured?'':'disabled'}>${featured?'▶ Loop preview':'No clip yet'}</button></div><div class="exercise-body"><div class="exercise-top"><div><h3>${escapeHtml(ex.name)}</h3><div class="meta">${escapeHtml([...(ex.equipment||[]),...(ex.body||[])].slice(0,4).join(' • '))}</div></div><span class="count">${exClips.length} clip${exClips.length===1?'':'s'}</span></div><div class="tag-row">${(ex.tags||[]).slice(0,6).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><div class="clip-list">${exClips.slice(0,4).map(c=>`<div class="clip-row"><span>${escapeHtml(c.name)} <span class="meta">${fmtTime(c.start)}–${fmtTime(c.end)}</span></span><button data-clip="${c.id}">Preview</button></div>`).join('')}</div></div>`;
    if(featured)card.querySelector('.play-pill').onclick=()=>openPreview(featured.id);
    card.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>openPreview(b.dataset.clip));grid.appendChild(card);
  });
}

async function renderSources(){
  const [sources,clips]=await Promise.all([all('sources'),all('clips')]);const wrap=$('#sourceList');wrap.innerHTML='';$('#sourcesEmpty').classList.toggle('hidden',sources.length>0);
  sources.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(src=>{const srcClips=clips.filter(c=>c.sourceId===src.id).sort((a,b)=>a.start-b.start);const yt=parseYouTube(src.url);const card=document.createElement('article');card.className='source-card';card.innerHTML=`<div class="source-top"><div><h3>${escapeHtml(src.title||'Untitled source')}</h3><div class="meta">${escapeHtml(src.platform||'Other')}${src.creator?` • ${escapeHtml(src.creator)}`:''}${yt?.isShort?' • Short':''}</div></div><div class="source-actions"><button class="btn secondary add-clip">+ Add clip</button><button class="btn secondary open-source">Open</button></div></div><div class="source-clips">${srcClips.map(c=>`<div class="source-clip"><div><strong>${escapeHtml(c.name)}</strong><div class="meta">${fmtTime(c.start)}–${fmtTime(c.end)}</div></div><button class="btn secondary preview" data-id="${c.id}">Preview</button><button class="btn secondary edit" data-id="${c.id}">Edit</button></div>`).join('')||'<div class="meta">No clips indexed yet.</div>'}</div>`;card.querySelector('.add-clip').onclick=()=>openClipDialog(src.id);card.querySelector('.open-source').onclick=()=>window.open(src.url,'_blank','noopener');card.querySelectorAll('.preview').forEach(b=>b.onclick=()=>openPreview(b.dataset.id));card.querySelectorAll('.edit').forEach(b=>b.onclick=()=>openClipDialog(src.id,b.dataset.id));wrap.appendChild(card);});
}

async function renderInbox(){const inbox=(await all('inbox')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));$('#inboxCount').textContent=inbox.length;const wrap=$('#inboxList');wrap.innerHTML='';$('#inboxEmpty').classList.toggle('hidden',inbox.length>0);inbox.forEach(item=>{const d=document.createElement('article');d.className='inbox-card';d.innerHTML=`<div class="source-top"><div><strong>${escapeHtml(item.title||'Unsorted video')}</strong><div class="meta">${escapeHtml(item.platform||'Other')} • ${escapeHtml(item.url)}</div></div><div class="source-actions"><button class="btn secondary organize">Organize</button><button class="btn secondary danger remove">Remove</button></div></div>`;d.querySelector('.organize').onclick=async()=>{const src={id:uid(),url:item.url,title:item.title||'Untitled source',creator:'',platform:item.platform||'Other',createdAt:Date.now()};await put('sources',src);await del('inbox',item.id);await render();setView('sources');openClipDialog(src.id);};d.querySelector('.remove').onclick=async()=>{await del('inbox',item.id);render();};wrap.appendChild(d);});}

async function renderBuilder(){const exercises=(await all('exercises')).sort((a,b)=>a.name.localeCompare(b.name));const wrap=$('#builderExerciseList');wrap.innerHTML='';exercises.forEach(e=>{const row=document.createElement('label');row.className='builder-item';row.innerHTML=`<input type="checkbox" value="${e.id}"><span><strong>${escapeHtml(e.name)}</strong><span class="meta"> ${escapeHtml((e.equipment||[]).slice(0,2).join(' • '))}</span></span>`;wrap.appendChild(row);});}
async function renderWorkouts(){const [workouts,exercises]=await Promise.all([all('workouts'),all('exercises')]);const map=new Map(exercises.map(e=>[e.id,e]));const wrap=$('#workoutList');wrap.innerHTML='';$('#workoutsEmpty').classList.toggle('hidden',workouts.length>0);workouts.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(w=>{const names=(w.exerciseIds||[]).map(id=>map.get(id)?.name).filter(Boolean);const d=document.createElement('article');d.className='workout-card';d.innerHTML=`<div class="source-top"><div><h3>${escapeHtml(w.name)}</h3><div class="meta">${escapeHtml(w.format)} • ${names.length} movements</div></div><button class="btn secondary danger delete">Delete</button></div><div class="workout-moves">${names.map(n=>`<span class="tag">${escapeHtml(n)}</span>`).join('')}</div>${w.notes?`<p>${escapeHtml(w.notes)}</p>`:''}`;d.querySelector('.delete').onclick=async()=>{await del('workouts',w.id);renderWorkouts();};wrap.appendChild(d);});}

function setView(name){activeView=name;$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name));$$('.view').forEach(v=>v.classList.remove('active'));$('#'+name+'View').classList.add('active');}
function showDialog(id){const d=$('#'+id);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');}
function closeDialog(id){const d=$('#'+id);if(d.open)d.close();}

function openClipDialog(sourceId,clipId=''){const f=$('#clipForm');f.reset();$('#clipSourceId').value=sourceId;$('#clipId').value=clipId;$('#clipDialogTitle').textContent=clipId?'Edit clip':'Add clip';if(clipId){get('clips',clipId).then(c=>{if(!c)return;$('#clipName').value=c.name||'';$('#clipAliases').value=(c.aliases||[]).join(', ');$('#clipStart').value=fmtTime(c.start);$('#clipEnd').value=fmtTime(c.end);$('#clipPreviewStart').value=c.previewStart!=null?fmtTime(c.previewStart):'';$('#clipPreviewEnd').value=c.previewEnd!=null?fmtTime(c.previewEnd):'';$('#clipTags').value=(c.tags||[]).join(', ');$('#clipEquipment').value=(c.equipment||[]).join(', ');$('#clipBody').value=(c.body||[]).join(', ');$('#clipGoal').value=(c.goal||[]).join(', ');$('#clipNotes').value=c.notes||'';});}showDialog('clipDialog');}

async function openPreview(clipId){const clip=await get('clips',clipId);if(!clip)return;const src=await get('sources',clip.sourceId);if(!src)return;previewContext={clip,src};$('#previewTitle').textContent=clip.name;$('#previewMeta').textContent=`${fmtTime(clip.previewStart??clip.start)}–${fmtTime(clip.previewEnd??clip.end)} • ${src.title}`;$('#openSourceBtn').onclick=()=>window.open(sourceOpenUrl(src,clip.start),'_blank','noopener');showDialog('previewDialog');startPreviewPlayer();}
function stopPreview(){if(loopTimer){clearInterval(loopTimer);loopTimer=null;}if(ytPlayer?.destroy){try{ytPlayer.destroy();}catch{}}ytPlayer=null;$('#youtubePlayer').innerHTML='';}
function startPreviewPlayer(){stopPreview();const {clip,src}=previewContext||{};if(!clip||!src)return;const yt=parseYouTube(src.url);const fallback=$('#fallbackPlayer');fallback.classList.add('hidden');if(!yt||typeof YT==='undefined'||!YT.Player){fallback.textContent='Inline looping is available for YouTube sources. Use “Open source” for this platform.';fallback.classList.remove('hidden');return;}const start=clip.previewStart??clip.start,end=clip.previewEnd??clip.end;ytPlayer=new YT.Player('youtubePlayer',{videoId:yt.id,playerVars:{start:Math.floor(start||0),autoplay:1,mute:1,playsinline:1,rel:0},events:{onReady:e=>{e.target.mute();e.target.seekTo(start||0,true);e.target.playVideo();loopTimer=setInterval(()=>{try{const t=e.target.getCurrentTime();if(end!=null&&t>=end)e.target.seekTo(start||0,true);}catch{}},250);}}});}

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

async function exportBackup(){const payload={version:1,exportedAt:new Date().toISOString(),data:{}};for(const s of STORES)payload.data[s]=await all(s);const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`exercise-vault-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importBackup(file){const parsed=JSON.parse(await file.text());if(!parsed?.data)throw new Error('Invalid backup');for(const s of STORES){for(const item of parsed.data[s]||[])await put(s,item);}await render();}

function wireEvents(){
  $$('.tab').forEach(t=>t.onclick=()=>setView(t.dataset.view));
  $('#searchInput').addEventListener('input',()=>{if(activeView!=='library')setView('library');renderLibrary();});
  $('#saveVideoBtn').onclick=()=>{ $('#sourceForm').reset();showDialog('sourceDialog');};
  $('#newExerciseBtn').onclick=()=>{ $('#exerciseForm').reset();showDialog('exerciseDialog');};
  $$('[data-close]').forEach(b=>b.onclick=()=>{const id=b.dataset.close;if(id==='previewDialog')stopPreview();closeDialog(id);});
  $('#previewDialog').addEventListener('close',stopPreview);
  $('#sourceForm').addEventListener('submit',async e=>{e.preventDefault();const url=$('#sourceUrl').value.trim();if(!url)return;const platform=$('#sourcePlatform').value;const title=$('#sourceTitle').value.trim()||'Untitled source';if($('#sourceToInbox').checked){await put('inbox',{id:uid(),url,title,platform,createdAt:Date.now()});}else{const yt=parseYouTube(url);await put('sources',{id:uid(),url,title,creator:$('#sourceCreator').value.trim(),platform:yt?'YouTube':platform,createdAt:Date.now()});}closeDialog('sourceDialog');await render();});
  $('#clipForm').addEventListener('submit',async e=>{e.preventDefault();const start=parseTime($('#clipStart').value),end=parseTime($('#clipEnd').value);if(start===null||end===null||end<=start){alert('Please enter a valid clip start and an end time after the start.');return;}const id=$('#clipId').value||uid();const clip={id,sourceId:$('#clipSourceId').value,name:$('#clipName').value.trim(),aliases:normalizeList($('#clipAliases').value),start,end,previewStart:parseTime($('#clipPreviewStart').value),previewEnd:parseTime($('#clipPreviewEnd').value),tags:normalizeList($('#clipTags').value),equipment:normalizeList($('#clipEquipment').value),body:normalizeList($('#clipBody').value),goal:normalizeList($('#clipGoal').value),notes:$('#clipNotes').value.trim(),createdAt:Date.now()};if(clip.previewStart===null)clip.previewStart=start;if(clip.previewEnd===null)clip.previewEnd=Math.min(end,start+7);if(clip.previewEnd<=clip.previewStart){clip.previewStart=start;clip.previewEnd=Math.min(end,start+7);}await put('clips',clip);await ensureExerciseFromClip(clip);closeDialog('clipDialog');await render();});
  $('#exerciseForm').addEventListener('submit',async e=>{e.preventDefault();await put('exercises',{id:uid(),name:$('#exerciseName').value.trim(),aliases:normalizeList($('#exerciseAliases').value),equipment:normalizeList($('#exerciseEquipment').value),body:normalizeList($('#exerciseBody').value),tags:normalizeList($('#exerciseTags').value),notes:$('#exerciseNotes').value.trim(),createdAt:Date.now()});closeDialog('exerciseDialog');await render();});
  $('#saveWorkoutBtn').onclick=async()=>{const ids=$$('#builderExerciseList input:checked').map(x=>x.value);await put('workouts',{id:uid(),name:$('#workoutNameInput').value.trim()||'Untitled workout',format:$('#workoutFormatInput').value,notes:$('#workoutNotesInput').value.trim(),exerciseIds:ids,createdAt:Date.now()});$('#builderExerciseList').querySelectorAll('input').forEach(x=>x.checked=false);await renderWorkouts();};
  $('#exportBtn').onclick=exportBackup;$('#importBtn').onclick=()=>$('#backupFile').click();$('#backupFile').onchange=async e=>{if(!e.target.files[0])return;try{await importBackup(e.target.files[0]);}catch(err){alert('Could not import that backup: '+err.message);}e.target.value='';};
}

async function seedIfEmpty(){const sources=await all('sources');if(sources.length)return;const s={id:uid(),url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',title:'Example source — replace me',creator:'Demo',platform:'YouTube',createdAt:Date.now()};await put('sources',s);const c={id:uid(),sourceId:s.id,name:'Renegade Row',aliases:['plank row'],start:12,end:28,previewStart:14,previewEnd:20,tags:['core','back','anti-rotation'],equipment:['dumbbells'],body:['core','back'],goal:['strength'],notes:'Example clip so you can see the real data structure.',createdAt:Date.now()};await put('clips',c);await ensureExerciseFromClip(c);}

(async()=>{db=await openDB();wireEvents();await seedIfEmpty();await render();if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}})();
