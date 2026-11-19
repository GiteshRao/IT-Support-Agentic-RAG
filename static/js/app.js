const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const question = document.getElementById('question');
const trace = document.getElementById('trace');
const sourceUsed = document.getElementById('sourceUsed');
const sourceBox = sourceUsed.closest('.source-box');
const flowSteps = document.querySelectorAll('.flow-step');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let busy = false;

/* ---------- text helpers ---------- */
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
// escape first, then allow a tiny, safe subset of markdown
function formatText(s=''){
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g,'<code>$1</code>')
    .replace(/\n/g,'<br>');
}
function sourceKind(s=''){
  if(/web|tavily|search|external/i.test(s)) return 'web';
  if(/private|kb|pinecone|vector|internal|knowledge/i.test(s)) return 'private';
  return 'other';
}

/* ---------- chat ---------- */
const AVATAR = '<div class="avatar"><svg><use href="#w-fig"/></svg></div>';

function scrollChat(){ chat.scrollTo({top: chat.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth'}); }

function addMessage(role, text, source='', citations=[]){
  const wrap=document.createElement('div'); wrap.className=`message ${role}`;
  const citeHtml=citations.length?`<div class="citations"><strong>Sources</strong><br>${citations.map(c=>c.url?`<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>`:escapeHtml(c.title)).join('<br>')}</div>`:'';
  const srcHtml=source?`<div class="answer-source ${sourceKind(source)}">Source: ${escapeHtml(source)}</div>`:'';
  wrap.innerHTML=`${role==='assistant'?AVATAR:''}<div class="bubble">${formatText(text)}${srcHtml}${citeHtml}</div>`;
  chat.appendChild(wrap); scrollChat();
}

let thinkingEl = null;
function showThinking(){
  hideThinking();
  thinkingEl=document.createElement('div'); thinkingEl.className='message assistant';
  thinkingEl.innerHTML=`${AVATAR}<div class="bubble"><span class="thinking" aria-label="Thinking"><i></i><i></i><i></i></span></div>`;
  chat.appendChild(thinkingEl); scrollChat();
}
function hideThinking(){ if(thinkingEl){ thinkingEl.remove(); thinkingEl=null; } }

/* ---------- trace + workflow ---------- */
function renderTrace(items=[]){
  trace.innerHTML=items.length
    ? items.map((x,i)=>`<div class="trace-item" style="--i:${i}"><b>${String(i+1).padStart(2,'0')}</b><span>${escapeHtml(x)}</span></div>`).join('')
    : '<div class="empty">No trace.</div>';
}

let flowTimer = null;
function startFlow(){
  stopFlow(); let i=0;
  const paint=()=>flowSteps.forEach((el,n)=>{ el.classList.toggle('done',n<i); el.classList.toggle('active',n===i); });
  paint();
  flowTimer=setInterval(()=>{ if(i<flowSteps.length-1){ i++; paint(); } },1100);
}
function stopFlow(){ if(flowTimer){ clearInterval(flowTimer); flowTimer=null; } }
function finishFlow(ok){
  stopFlow();
  flowSteps.forEach(el=>{ el.classList.remove('active'); el.classList.toggle('done',!!ok); });
}

function setSource(text, kind){ sourceUsed.textContent=text; sourceBox.dataset.kind=kind; }

/* ---------- ask ---------- */
async function askAgent(q){
  if(busy) return;
  busy=true;
  addMessage('user',q); question.value=''; renderTrace(['Running LangGraph workflow...']); setSource('Running','run');
  showThinking(); startFlow();
  const btn=form.querySelector('button'); btn.disabled=true;
  try{
    const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});
    const data=await res.json(); if(!res.ok) throw new Error(data.detail||'Request failed');
    hideThinking(); finishFlow(true);
    addMessage('assistant',data.answer,data.source_used,data.citations||[]); renderTrace(data.trace||[]);
    setSource(data.source_used, sourceKind(data.source_used));
  }catch(e){
    hideThinking(); finishFlow(false);
    addMessage('assistant',`Error: ${e.message}`); renderTrace(['Request failed']); setSource('Error','err');
  }
  finally{btn.disabled=false; busy=false; question.focus();}
}
form.addEventListener('submit',e=>{e.preventDefault(); const q=question.value.trim(); if(q) askAgent(q);});
// Enter sends, Shift+Enter adds a new line
question.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll('.example').forEach(b=>b.addEventListener('click',()=>askAgent(b.textContent.trim())));

/* ---------- upload modal ---------- */
const modal=document.getElementById('uploadModal');
const openModal=()=>{ modal.classList.remove('hidden'); document.getElementById('adminKey').focus(); };
const closeModal=()=>modal.classList.add('hidden');
document.getElementById('openUpload').onclick=openModal;
document.getElementById('closeUpload').onclick=closeModal;
modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !modal.classList.contains('hidden')) closeModal(); });

document.getElementById('uploadBtn').onclick=async()=>{
  const file=document.getElementById('fileInput').files[0]; const key=document.getElementById('adminKey').value; const status=document.getElementById('uploadStatus');
  if(!file){status.textContent='Choose a file first.'; return;}
  status.textContent='Indexing document...'; const fd=new FormData(); fd.append('file',file);
  try{const r=await fetch('/api/ingest',{method:'POST',headers:{'X-Admin-Key':key},body:fd}); const d=await r.json(); if(!r.ok) throw new Error(d.detail||'Upload failed'); status.textContent=`Indexed ${d.file}: ${d.chunks} chunks.`;}catch(e){status.textContent=`Error: ${e.message}`;}
};

/* ---------- liquid-glass lighting ---------- */
if(!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches){
  // specular light follows the cursor inside each glass panel
  document.querySelectorAll('.sidebar,.main,.trace-panel,.workflow-card,.modal-card').forEach(el=>{
    el.addEventListener('pointermove',e=>{
      const r=el.getBoundingClientRect();
      el.style.setProperty('--mx',`${e.clientX-r.left}px`);
      el.style.setProperty('--my',`${e.clientY-r.top}px`);
    });
  });
  // background light drifts opposite to the cursor
  const root=document.documentElement; let raf=0;
  window.addEventListener('pointermove',e=>{
    if(raf) return;
    raf=requestAnimationFrame(()=>{
      root.style.setProperty('--px',(e.clientX/innerWidth-0.5).toFixed(3));
      root.style.setProperty('--py',(e.clientY/innerHeight-0.5).toFixed(3));
      raf=0;
    });
  });
}