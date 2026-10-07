(()=>{
'use strict';
const APP_VERSION='1.2.0';
const DEL_HASH='a5b432ee0307be7fa23aa00461f54eee34ba9d45251b5504567d37a8da339dff';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUS={C:{l:'Conforme',k:'ok'},NCMAIOR:{l:'NC maior',k:'ncm'},NCMENOR:{l:'NC menor',k:'nc'},OBS:{l:'Observação',k:'obs'},OFI:{l:'Oport. de melhoria',k:'ofi'},NA:{l:'N/A',k:'na'}};
const ACT=['NCMAIOR','NCMENOR','OFI'];
const CHAPTERS={'4':'4 Contexto da organização','5':'5 Liderança','6':'6 Planejamento','7':'7 Apoio','8':'8 Operação','9':'9 Avaliação de desempenho','10':'10 Melhoria','A':'Anexo A – Plano de controle'};
const chap=id=>String(id).split(/[.\-]/)[0];
const chapName=c=>CHAPTERS[c]||('Grupo '+c);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const nowISO=()=>new Date().toISOString();
const fmt=d=>d?new Date(d).toLocaleString('pt-BR'):'';
const fmtD=d=>d?new Date(d+(String(d).length===10?'T00:00:00':'')).toLocaleDateString('pt-BR'):'';
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);};
const app=$('#app');
let db,cur=null,evMap={},settings={company:'',auditor:''},deferredPrompt=null;
const urls=new Map();

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800);}
function debounce(f,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms);};}

/* ---------- Banco de dados (IndexedDB) ---------- */
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('iatf-audit',1);
 r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('audits',{keyPath:'number'});const e=d.createObjectStore('evidences',{keyPath:'id'});e.createIndex('audit','auditNumber');d.createObjectStore('meta',{keyPath:'key'});};
 r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
const p=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
const tx=(s,m='readonly')=>db.transaction(s,m);
const getMeta=async k=>{const r=await p(tx('meta').objectStore('meta').get(k));return r?r.value:undefined;};
const setMeta=(k,v)=>p(tx('meta','readwrite').objectStore('meta').put({key:k,value:v}));
const getAudit=n=>p(tx('audits').objectStore('audits').get(n));
const allAudits=()=>p(tx('audits').objectStore('audits').getAll());
const saveAudit=a=>{a.updatedAt=nowISO();return p(tx('audits','readwrite').objectStore('audits').put(a));};
const getEvs=n=>p(tx('evidences').objectStore('evidences').index('audit').getAll(n));
const putEv=e=>p(tx('evidences','readwrite').objectStore('evidences').put(e));
const delEv=id=>p(tx('evidences','readwrite').objectStore('evidences').delete(id));

async function activeChecklist(){const c=await getMeta('customChecklist');
 if(c&&c.items&&c.items.length)return{version:c.version,items:c.items};
 return{version:window.BASE_VERSION,items:window.CHECKLIST};}

function createAudit(data){const year=new Date().getFullYear();
 return new Promise((res,rej)=>{const t=db.transaction(['meta','audits'],'readwrite');const m=t.objectStore('meta');const g=m.get('seq-'+year);let a;
  g.onsuccess=()=>{const n=(g.result?g.result.value:0)+1;m.put({key:'seq-'+year,value:n});
   const number=`AUD-${year}-${String(n).padStart(4,'0')}`;const ts=nowISO();
   a={number,seq:n,year,...data,status:'Em andamento',createdAt:ts,updatedAt:ts,items:{},signatures:{},log:[],
    trace:{createdAt:ts,createdBy:data.auditor,standard:'IATF 16949:2016',appVersion:APP_VERSION,device:navigator.userAgent,platform:navigator.platform||'',language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,origin:location.origin+location.pathname}};
   a.log.push({ts,user:data.auditor,action:'Auditoria aberta',detail:`${number} · checklist ${data.checklistVersion} · app ${APP_VERSION}`});
   t.objectStore('audits').put(a);};
  t.oncomplete=()=>res(a);t.onerror=()=>rej(t.error);});}

const addLog=(a,action,detail='')=>a.log.push({ts:nowISO(),user:a.auditor||settings.auditor||'',action,detail});

/* ---------- Orientação por requisito ---------- */
const guide=it=>{const g=(window.GUIDE||{})[it.id]||{};return{i:it.i||g.i||'',e:it.e||g.e||''};};
function guideHTML(it){const g=guide(it);if(!g.i&&!g.e)return'';
 return`<div class="guide"><div class="gh">Orientação do app – não é texto da norma</div>${g.i?`<div class="gb"><b>Interpretação do requisito</b><p>${esc(g.i)}</p></div>`:''}${g.e?`<div class="gb"><b>Exemplos de evidência de atendimento</b><p>${esc(g.e)}</p></div>`:''}</div>`;}

/* ---------- Texto da norma (blocos do PDF) ---------- */
const TAG={1:'IATF',2:'ISO + IATF'};
function normHTML(it){
 if(!it.b)return it.q?`<p class="q qtxt">${esc(it.q)}</p>`:'';
 return`<div class="norm"><div class="gh">Texto da norma IATF 16949:2016 – <i>itálico = exigência automotiva</i></div>${it.b.map(b=>{
  const c=b.i?' ni':'';
  if(b.k==='l')return`<div class="nl d${b.d||0}${c}"><b>${esc(b.m||'')}</b><span>${esc(b.x)}</span></div>`;
  if(b.k==='n')return`<p class="nn${c}">${esc(b.x)}</p>`;
  if(b.k==='h')return`<p class="nh${c}">${esc(b.x)}</p>`;
  return`<p class="np${c}">${esc(b.x)}</p>`;}).join('')}</div>`;}
function normText(it){
 if(!it.b)return it.q||'';
 return it.b.map(b=>(b.k==='l'?(b.d?'    ':'  ')+(b.m||'')+' ':'')+b.x).join('\n');}
const itemText=it=>it.t+' '+normText(it);

/* ---------- Cálculos ---------- */
const blank=()=>({C:0,NCMAIOR:0,NCMENOR:0,OBS:0,OFI:0,NA:0,pend:0});
const pct=o=>{const d=o.C+o.NCMAIOR+o.NCMENOR;return d?Math.round(o.C/d*1000)/10:null;};
function calc(a){const per={},tot=blank();
 for(const it of a.checklist){const c=chap(it.id);per[c]=per[c]||blank();const k=(a.items[it.id]&&a.items[it.id].status)||'pend';per[c][k]++;tot[k]++;}
 return{per,tot,total:a.checklist.length,answered:a.checklist.length-tot.pend,pct:pct(tot)};}
const pctTxt=v=>v==null?'–':v.toFixed(1).replace('.',',')+'%';

/* ---------- Utilitários de arquivo ---------- */
function download(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
const csvEsc=v=>{v=String(v??'');return /[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const toCSV=rows=>'\uFEFF'+rows.map(r=>r.map(csvEsc).join(';')).join('\r\n');
function parseCSV(txt){txt=txt.replace(/^\uFEFF/,'');const first=txt.split(/\r?\n/)[0];const sep=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],f='',q=false;
 for(let i=0;i<txt.length;i++){const c=txt[i];
  if(q){if(c==='"'){if(txt[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else if(c==='"')q=true;else if(c===sep){row.push(f);f='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f='';}
  else f+=c;}
 if(f!==''||row.length){row.push(f);rows.push(row);}
 return rows.filter(r=>r.some(x=>x.trim()));}
const blobToDataURL=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);});
const dataURLToBlob=async u=>(await fetch(u)).blob();
const sizeTxt=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const hex=buf=>[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(file){try{if(!crypto||!crypto.subtle)return'';return hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));}catch{return'';}}
async function sha256Str(s){if(!crypto||!crypto.subtle)return'';return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
async function shrink(file){if(!file.type.startsWith('image/')||file.type==='image/gif')return file;
 try{const bmp=await createImageBitmap(file);const s=Math.min(1,1800/Math.max(bmp.width,bmp.height));if(s===1&&file.size<1.5e6)return file;
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));
  return b&&b.size<file.size?new File([b],file.name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'}):file;}catch{return file;}}
const urlOf=e=>{if(!urls.has(e.id))urls.set(e.id,URL.createObjectURL(e.blob));return urls.get(e.id);};

/* ---------- Exclusão protegida por senha ---------- */
function askPassword(number){return new Promise(res=>{const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="mbox"><h2>Excluir ${esc(number)}</h2><p>Esta ação apaga a auditoria e todas as evidências anexadas, e não pode ser desfeita. Digite a senha para confirmar.</p><input type="password" id="pw" autocomplete="off" placeholder="Senha"><p class="err" id="pe"></p><div class="actions"><button type="button" class="btn" id="pc">Cancelar</button><button type="button" class="btn danger" id="po">Excluir</button></div></div>`;
 document.body.appendChild(m);const pw=$('#pw',m);pw.focus();
 const close=v=>{m.remove();res(v);};
 $('#pc',m).onclick=()=>close(null);$('#po',m).onclick=()=>close(pw.value);
 pw.onkeydown=e=>{if(e.key==='Enter')close(pw.value);if(e.key==='Escape')close(null);};
 m.addEventListener('click',e=>{if(e.target===m)close(null);});});}
async function deleteAudit(number){
 const a=await getAudit(number);if(!a)return;
 const pw=await askPassword(number);if(pw===null)return;
 const h=await sha256Str(pw);
 if(!h)return toast('Abra o app pelo endereço https para validar a senha');
 if(h!==DEL_HASH)return toast('Senha incorreta. Nada foi excluído.');
 for(const e of await getEvs(number))await delEv(e.id);
 await p(tx('audits','readwrite').objectStore('audits').delete(number));
 const dl=(await getMeta('deletedAudits'))||[];
 dl.push({number,deletedAt:nowISO(),deletedBy:settings.auditor||'',status:a.status,process:a.process,auditor:a.auditor,createdAt:a.createdAt});
 await setMeta('deletedAudits',dl);
 toast(number+' excluída');route();}

/* ---------- Menu de opções (⋮) ---------- */
document.addEventListener('click',async e=>{
 const dots=e.target.closest('.dots');
 $$('.mpop').forEach(x=>{if(!dots||x.parentElement!==dots.parentElement)x.hidden=true;});
 if(dots){const pop=$('.mpop',dots.parentElement);pop.hidden=!pop.hidden;e.preventDefault();return;}
 const b=e.target.closest('.mpop button');if(!b)return;
 const n=b.closest('.row').dataset.n;b.closest('.mpop').hidden=true;
 if(b.dataset.a==='open')location.hash='#/audit/'+encodeURIComponent(n);
 if(b.dataset.a==='json')exportJSON([n],true);
 if(b.dataset.a==='csv'){const a=await getAudit(n);if(a)exportAuditCSV(a);}
 if(b.dataset.a==='del')deleteAudit(n);});

/* ---------- Roteamento ---------- */
window.addEventListener('hashchange',route);
async function route(){
 if(cur){try{await saveAudit(cur);}catch{}}
 const h=location.hash.replace(/^#\/?/,'');const [a,b,c]=h.split('/').map(decodeURIComponent);
 $$('#nav a').forEach(x=>x.classList.toggle('on',x.dataset.r===(a||'')||(a==='audit'&&x.dataset.r==='history')));
 window.scrollTo(0,0);
 try{
  if(!a){cur=null;return await viewHome();}
  if(a==='new'){cur=null;return await viewNew();}
  if(a==='audit')return await viewAudit(b,c||'check');
  cur=null;
  if(a==='history')return await viewHistory();
  if(a==='export')return await viewExport();
  if(a==='settings')return await viewSettings();
  location.hash='#/';
 }catch(err){console.error(err);app.innerHTML=`<div class="card"><h2>Erro</h2><p>${esc(err.message)}</p></div>`;}
}

/* ---------- Início ---------- */
function rowHTML(a){const c=calc(a);const n=encodeURIComponent(a.number);
 return`<div class="row" data-n="${esc(a.number)}"><a class="rl" href="#/audit/${n}"><div><b>${esc(a.number)}</b> <span class="st ${a.status==='Concluída'?'done':'prog'}">${esc(a.status)}</span><div class="sub">${esc(a.process||a.scope||'')} · ${esc(a.area||'')} · ${fmtD(a.date)}</div><div class="sub">Auditor: ${esc(a.auditor)} · Auditado: ${esc(a.auditee||'–')}</div></div>
 <div class="rt"><b>${pctTxt(c.pct)}</b><div class="sub">${c.tot.NCMAIOR+c.tot.NCMENOR} NC · ${c.answered}/${c.total}</div></div></a>
 <div class="menu"><button type="button" class="dots" aria-label="Opções da auditoria" title="Opções">⋮</button><div class="mpop" hidden><button type="button" data-a="open">Abrir</button><button type="button" data-a="csv">Exportar CSV</button><button type="button" data-a="json">Exportar JSON</button><button type="button" class="del" data-a="del">Excluir…</button></div></div></div>`;}
async function viewHome(){const list=(await allAudits()).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));
 const andamento=list.filter(a=>a.status!=='Concluída').length;const conc=list.length-andamento;
 const nc=list.reduce((s,a)=>{const c=calc(a);return s+c.tot.NCMAIOR+c.tot.NCMENOR;},0);
 app.innerHTML=`<h1>Auditoria IATF 16949:2016</h1>${settings.company?`<p class="muted">${esc(settings.company)}</p>`:''}
 <div class="kpis"><div class="kpi"><b>${list.length}</b><span>Auditorias</span></div><div class="kpi"><b>${andamento}</b><span>Em andamento</span></div><div class="kpi"><b>${conc}</b><span>Concluídas</span></div><div class="kpi"><b>${nc}</b><span>NCs registradas</span></div></div>
 <a class="btn primary big" href="#/new">+ Nova auditoria</a>
 <h2>Recentes</h2><div class="card list">${list.slice(0,8).map(rowHTML).join('')||'<p class="muted pad">Nenhuma auditoria realizada ainda.</p>'}</div>`;}

/* ---------- Nova auditoria ---------- */
async function viewNew(){const cl=await activeChecklist();
 app.innerHTML=`<h1>Nova auditoria</h1><form id="f" class="card form">
 <p class="muted">Um número sequencial (AUD-ANO-0000) e os dados de rastreabilidade serão gerados ao abrir.</p>
 <label>Tipo de auditoria<input name="type" value="Auditoria de SGQ – IATF 16949:2016" required></label>
 <label>Escopo / Processo auditado<input name="process" required placeholder="Ex.: Todos os processos / Qualidade / Produção"></label>
 <div class="grid2"><label>Setor / Planta<input name="area" placeholder="Ex.: Planta 1 – Linha de usinagem"></label><label>Turno<select name="shift"><option>1º</option><option>2º</option><option>3º</option><option>Administrativo</option><option>N/A</option></select></label></div>
 <div class="grid2"><label>Auditor (responsável)<input name="auditor" required value="${esc(settings.auditor)}"></label><label>Auditado (responsável pela área)<input name="auditee"></label></div>
 <label>Data da auditoria<input type="date" name="date" value="${today()}" required></label>
 <label>Observações gerais<textarea name="notes" rows="2"></textarea></label>
 <p class="muted">Checklist: <b>${esc(cl.version)}</b> · ${cl.items.length} itens</p>
 <button class="btn primary big">Abrir auditoria</button></form>`;
 $('#f').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
  const a=await createAudit({...d,checklistVersion:cl.version,checklist:cl.items.map(x=>({...x}))});
  toast('Criada '+a.number);location.hash='#/audit/'+encodeURIComponent(a.number);};}

/* ---------- Auditoria ---------- */
async function viewAudit(num,tab){
 const a=await getAudit(num);if(!a){app.innerHTML='<div class="card"><p>Auditoria não encontrada.</p></div>';return;}
 cur=a;evMap={};(await getEvs(num)).forEach(e=>(evMap[e.itemId]=evMap[e.itemId]||[]).push(e));
 const enc=encodeURIComponent(num);
 app.innerHTML=`<div class="ahead"><div><h1>${esc(a.number)} <span class="st ${a.status==='Concluída'?'done':'prog'}">${esc(a.status)}</span></h1><div class="sub">${esc(a.process)} · ${esc(a.area||'')} · ${fmtD(a.date)} · Auditor: ${esc(a.auditor)}</div></div></div>
 <div class="tabs"><a href="#/audit/${enc}/check" class="${tab==='check'?'on':''}">Checklist</a><a href="#/audit/${enc}/summary" class="${tab==='summary'?'on':''}">Resumo</a><a href="#/audit/${enc}/data" class="${tab==='data'?'on':''}">Dados e rastreabilidade</a></div><div id="tab"></div>`;
 if(tab==='summary')tabSummary();else if(tab==='data')tabData();else tabCheck();}

const locked=()=>cur.status==='Concluída';
const evHTML=id=>{const l=evMap[id]||[];
 return`<div class="evlist">${l.map(e=>`<div class="ev" data-eid="${e.id}"><a href="#" class="open">${e.type.startsWith('image/')?`<img src="${urlOf(e)}" alt="">`:'<span class="pdf">PDF</span>'}</a><div class="evi"><b>${esc(e.name)}</b><span>${sizeTxt(e.size)} · ${fmt(e.createdAt)}</span>${e.hash?`<span class="hash" title="SHA-256">#${e.hash.slice(0,12)}</span>`:''}</div>${locked()?'':'<button type="button" class="rm" title="Remover">✕</button>'}</div>`).join('')||'<p class="muted small">Sem evidências anexadas.</p>'}</div>
 ${locked()?'':'<label class="btn small addev">📎 Anexar evidência<input type="file" class="fi" multiple accept="image/*,application/pdf" hidden></label>'}`;};
function cardHTML(it){const d=cur.items[it.id]||{};const st=d.status;const L=locked();const n=(evMap[it.id]||[]).length;
 return`<details class="item" data-id="${esc(it.id)}"><summary><span class="cl">${esc(it.id)}</span><span class="tt">${esc(it.t)}</span>${it.a?`<span class="tagi" title="${it.a===1?'Exigência automotiva (itálico na norma)':'Contém texto ISO 9001 e texto automotivo IATF'}">${TAG[it.a]}</span>`:''}${it.u?'<span class="flag" title="Trecho não lido integralmente no PDF – conferir texto da norma">conferir</span>':''}<span class="evc">${n?'📎'+n:''}</span><span class="badge ${st?STATUS[st].k:'pend'}">${st?STATUS[st].l:'Pendente'}</span></summary>
 <div class="body">${normHTML(it)}${guideHTML(it)}
 <div class="chips">${Object.entries(STATUS).map(([k,v])=>`<button type="button" class="chip ${v.k} ${st===k?'on':''}" data-st="${k}" ${L?'disabled':''}>${v.l}</button>`).join('')}</div>
 <label>Comentários / constatação<textarea rows="3" class="cm" ${L?'disabled':''} placeholder="Descreva a evidência objetiva observada…">${esc(d.comment||'')}</textarea></label>
 <div class="act grid2 ${ACT.includes(st)?'':'hide'}"><label>Responsável pela ação<input class="resp" value="${esc(d.resp||'')}" ${L?'disabled':''}></label><label>Prazo<input type="date" class="prazo" value="${esc(d.prazo||'')}" ${L?'disabled':''}></label></div>
 <div class="evs">${evHTML(it.id)}</div></div></details>`;}

function updateProg(){const c=calc(cur);const el=$('#prog');if(!el)return;
 el.innerHTML=`<div class="bar"><i style="width:${c.answered/c.total*100}%"></i></div><span>${c.answered}/${c.total} avaliados · conformidade <b>${pctTxt(c.pct)}</b> · NC maior ${c.tot.NCMAIOR} · NC menor ${c.tot.NCMENOR}</span>`;}
function refreshCard(id){const el=$(`.item[data-id="${CSS.escape(id)}"]`);if(!el)return;const st=(cur.items[id]||{}).status;
 const b=$('.badge',el);b.className='badge '+(st?STATUS[st].k:'pend');b.textContent=st?STATUS[st].l:'Pendente';
 $$('.chip',el).forEach(c=>c.classList.toggle('on',c.dataset.st===st));$('.act',el).classList.toggle('hide',!ACT.includes(st));
 $('.evs',el).innerHTML=evHTML(id);const n=(evMap[id]||[]).length;$('.evc',el).textContent=n?'📎'+n:'';updateProg();}
function touch(id){const d=cur.items[id]=cur.items[id]||{};d.updatedAt=nowISO();d.updatedBy=cur.auditor;return d;}

function tabCheck(){const chaps=[...new Set(cur.checklist.map(i=>chap(i.id)))];
 $('#tab').innerHTML=`${locked()?'<div class="banner">Auditoria concluída – somente leitura. Para editar, reabra na aba Resumo.</div>':''}
 <div id="prog" class="prog"></div>
 <div class="filters"><select id="fc"><option value="">Todas as cláusulas</option>${chaps.map(c=>`<option value="${esc(c)}">${esc(chapName(c))}</option>`).join('')}</select>
 <select id="fs"><option value="">Todas as situações</option><option value="pend">Pendentes</option><option value="NC">NC (maior e menor)</option>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v.l}</option>`).join('')}</select>
 <input id="fq" type="search" placeholder="Buscar cláusula ou texto…"></div>
 <div id="items">${cur.checklist.map((it,i)=>{const c=chap(it.id);const prev=cur.checklist[i-1];const newCh=!prev||chap(prev.id)!==c;const hs=(it.s&&(newCh||prev.s!==it.s)&&it.s.split(' ')[0]!==it.id)?`<h4 class="ssh" data-c="${esc(c)}" data-s="${esc(it.s)}">${esc(it.s)}</h4>`:'';const hg=it.g?`<h5 class="gsh" data-c="${esc(c)}" data-s="${esc(it.s||'')}">${esc(it.g)}</h5>`:'';return(newCh?`<h3 class="chh" data-c="${esc(c)}">${esc(chapName(c))}</h3>`:'')+hs+hg+cardHTML(it);}).join('')}</div>`;
 updateProg();
 const apply=()=>{const fc=$('#fc').value,fs=$('#fs').value,q=$('#fq').value.toLowerCase().trim();const vis={};
  $$('.item').forEach(el=>{const id=el.dataset.id,it=cur.checklist.find(x=>x.id===id),st=(cur.items[id]||{}).status||'pend';
   let ok=(!fc||chap(id)===fc);
   if(fs)ok=ok&&(fs==='NC'?(st==='NCMAIOR'||st==='NCMENOR'):st===fs);
   if(q)ok=ok&&(id+' '+itemText(it)+' '+((cur.items[id]||{}).comment||'')).toLowerCase().includes(q);
   el.hidden=!ok;if(ok){vis[chap(id)]=1;vis['s:'+(it.s||'')]=1;}});
  $$('.chh').forEach(h=>h.hidden=!vis[h.dataset.c]);
  $$('.ssh,.gsh').forEach(h=>h.hidden=!vis['s:'+h.dataset.s]);};
 ['fc','fs'].forEach(i=>$('#'+i).onchange=apply);$('#fq').oninput=apply;
 const saveSoon=debounce(()=>saveAudit(cur),400);
 const box=$('#items');
 box.addEventListener('click',async e=>{const el=e.target.closest('.item');if(!el)return;const id=el.dataset.id;
  const chip=e.target.closest('.chip');
  if(chip&&!chip.disabled){const d=touch(id);const nv=d.status===chip.dataset.st?undefined:chip.dataset.st;
   addLog(cur,'Situação alterada',`${id}: ${d.status?STATUS[d.status].l:'Pendente'} → ${nv?STATUS[nv].l:'Pendente'}`);d.status=nv;refreshCard(id);saveSoon();return;}
  if(e.target.closest('.open')){e.preventDefault();const eid=e.target.closest('.ev').dataset.eid;const ev=(evMap[id]||[]).find(x=>x.id===eid);if(ev)window.open(urlOf(ev),'_blank');return;}
  if(e.target.closest('.rm')){const eid=e.target.closest('.ev').dataset.eid;const ev=(evMap[id]||[]).find(x=>x.id===eid);
   if(ev&&confirm('Remover a evidência "'+ev.name+'"?')){await delEv(eid);evMap[id]=evMap[id].filter(x=>x.id!==eid);addLog(cur,'Evidência removida',`${id}: ${ev.name}`);touch(id);refreshCard(id);saveSoon();}}});
 box.addEventListener('input',e=>{const el=e.target.closest('.item');if(!el)return;const d=touch(el.dataset.id);
  if(e.target.classList.contains('cm'))d.comment=e.target.value;
  if(e.target.classList.contains('resp'))d.resp=e.target.value;
  if(e.target.classList.contains('prazo'))d.prazo=e.target.value;saveSoon();});
 box.addEventListener('focusout',e=>{const el=e.target.closest('.item');if(!el)return;
  if(e.target.classList.contains('cm')&&e.target.dataset.last!==e.target.value){e.target.dataset.last=e.target.value;addLog(cur,'Comentário registrado',el.dataset.id);saveSoon();}});
 box.addEventListener('change',async e=>{if(!e.target.classList.contains('fi'))return;const el=e.target.closest('.item');const id=el.dataset.id;
  for(const f0 of e.target.files){const f=await shrink(f0);const hash=await sha256(f);
   const ev={id:uid(),auditNumber:cur.number,itemId:id,name:f.name,type:f.type||'application/octet-stream',size:f.size,hash,createdAt:nowISO(),createdBy:cur.auditor,blob:f};
   await putEv(ev);(evMap[id]=evMap[id]||[]).push(ev);addLog(cur,'Evidência anexada',`${id}: ${f.name} (${sizeTxt(f.size)})${hash?' SHA-256 '+hash.slice(0,16)+'…':''}`);}
  touch(id);refreshCard(id);await saveAudit(cur);toast('Evidência salva');});}

/* ---------- Resumo ---------- */
function sigBox(key,label){const s=cur.signatures[key];
 return`<div class="sig" data-k="${key}"><b>${label}</b>${s?`<img src="${s.image}" alt=""><div class="sub">${esc(s.name)} · ${fmt(s.at)}</div>${locked()?'':'<button class="btn small redo no-print">Refazer</button>'}`:
 (locked()?'<p class="muted">Sem assinatura.</p>':`<canvas width="500" height="160"></canvas><input class="sn no-print" placeholder="Nome" value="${esc(key==='auditor'?cur.auditor:cur.auditee||'')}"><div class="no-print"><button class="btn small clr">Limpar</button> <button class="btn small primary sv">Salvar assinatura</button></div>`)}</div>`;}
function pad(cv){const c=cv.getContext('2d');c.lineWidth=2.5;c.lineCap='round';c.strokeStyle='#111';let d=false,dirty=false;
 const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height];};
 cv.style.touchAction='none';
 cv.onpointerdown=e=>{d=true;dirty=true;cv.setPointerCapture(e.pointerId);const[x,y]=pos(e);c.beginPath();c.moveTo(x,y);};
 cv.onpointermove=e=>{if(!d)return;const[x,y]=pos(e);c.lineTo(x,y);c.stroke();};
 cv.onpointerup=()=>{d=false;};
 return{clear(){c.clearRect(0,0,cv.width,cv.height);dirty=false;},empty:()=>!dirty,data:()=>cv.toDataURL('image/png')};}
function tabSummary(){const c=calc(cur);const L=locked();
 const finds=cur.checklist.filter(i=>{const s=(cur.items[i.id]||{}).status;return s&&['NCMAIOR','NCMENOR','OBS','OFI'].includes(s);});
 const order={NCMAIOR:0,NCMENOR:1,OBS:2,OFI:3};finds.sort((x,y)=>order[cur.items[x.id].status]-order[cur.items[y.id].status]);
 const per=Object.keys(c.per);
 $('#tab').innerHTML=`<div id="report">
 <div class="kpis"><div class="kpi big"><b>${pctTxt(c.pct)}</b><span>Conformidade (C ÷ C+NC)</span></div><div class="kpi nc"><b>${c.tot.NCMAIOR}</b><span>NC maior</span></div><div class="kpi nc"><b>${c.tot.NCMENOR}</b><span>NC menor</span></div><div class="kpi"><b>${c.tot.OBS}</b><span>Observações</span></div><div class="kpi"><b>${c.tot.OFI}</b><span>Melhorias</span></div><div class="kpi"><b>${c.tot.pend}</b><span>Pendentes</span></div></div>
 <div class="card"><h2>Conformidade por cláusula</h2><div class="tw"><table><thead><tr><th>Cláusula</th><th>C</th><th>NC M</th><th>NC m</th><th>Obs</th><th>OFI</th><th>N/A</th><th>Pend.</th><th>%</th></tr></thead><tbody>
 ${per.map(k=>{const o=c.per[k],v=pct(o);return`<tr><td>${esc(chapName(k))}</td><td>${o.C}</td><td>${o.NCMAIOR}</td><td>${o.NCMENOR}</td><td>${o.OBS}</td><td>${o.OFI}</td><td>${o.NA}</td><td>${o.pend}</td><td><div class="mini"><i style="width:${v||0}%" class="${v==null?'':v>=90?'g':v>=70?'y':'r'}"></i></div>${pctTxt(v)}</td></tr>`;}).join('')}
 <tr class="tot"><td>Total</td><td>${c.tot.C}</td><td>${c.tot.NCMAIOR}</td><td>${c.tot.NCMENOR}</td><td>${c.tot.OBS}</td><td>${c.tot.OFI}</td><td>${c.tot.NA}</td><td>${c.tot.pend}</td><td>${pctTxt(c.pct)}</td></tr></tbody></table></div></div>
 <div class="card"><h2>Constatações (${finds.length})</h2>${finds.length?`<div class="tw"><table><thead><tr><th>Cláusula</th><th>Situação</th><th>Comentário</th><th>Ação / prazo</th><th>Evid.</th></tr></thead><tbody>${finds.map(i=>{const d=cur.items[i.id];return`<tr><td><b>${esc(i.id)}</b><br><span class="sub">${esc(i.t)}</span></td><td><span class="badge ${STATUS[d.status].k}">${STATUS[d.status].l}</span></td><td>${esc(d.comment||'')}</td><td>${esc(d.resp||'')}${d.prazo?'<br>'+fmtD(d.prazo):''}</td><td>${(evMap[i.id]||[]).length}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="muted">Nenhuma constatação registrada.</p>'}</div>
 <div class="card"><h2>Assinaturas</h2><div class="grid2">${sigBox('auditor','Auditor')}${sigBox('auditee','Auditado')}</div></div>
 <div class="card small">Rastreabilidade: ${esc(cur.number)} · aberta em ${fmt(cur.createdAt)} por ${esc(cur.auditor)} · checklist ${esc(cur.checklistVersion)} · app ${esc(cur.trace.appVersion)}${cur.closedAt?' · concluída em '+fmt(cur.closedAt):''}</div></div>
 <div class="actions no-print">${L?'<button class="btn" id="reopen">Reabrir auditoria</button>':'<button class="btn primary" id="close">Concluir auditoria</button>'}<button class="btn" id="print">Imprimir / PDF</button><button class="btn" id="csv">Exportar CSV</button><button class="btn" id="json">Exportar JSON</button></div>`;
 $$('.sig').forEach(box=>{const k=box.dataset.k;const cv=$('canvas',box);
  if(cv){const pd=pad(cv);$('.clr',box).onclick=()=>pd.clear();
   $('.sv',box).onclick=async()=>{if(pd.empty())return toast('Assine no quadro antes de salvar');
    cur.signatures[k]={image:pd.data(),name:$('.sn',box).value||'',at:nowISO()};addLog(cur,'Assinatura registrada',k+': '+cur.signatures[k].name);await saveAudit(cur);tabSummary();};}
  const r=$('.redo',box);if(r)r.onclick=async()=>{delete cur.signatures[k];addLog(cur,'Assinatura removida',k);await saveAudit(cur);tabSummary();};});
 $('#print').onclick=()=>window.print();
 $('#csv').onclick=()=>exportAuditCSV(cur);
 $('#json').onclick=()=>exportJSON([cur.number],true);
 const cl=$('#close');if(cl)cl.onclick=async()=>{
  if(c.tot.pend&&!confirm(`Existem ${c.tot.pend} itens pendentes. Concluir mesmo assim?`))return;
  cur.status='Concluída';cur.closedAt=nowISO();addLog(cur,'Auditoria concluída',`Conformidade ${pctTxt(c.pct)}; NC maior ${c.tot.NCMAIOR}; NC menor ${c.tot.NCMENOR}`);await saveAudit(cur);toast('Auditoria concluída');viewAudit(cur.number,'summary');};
 const ro=$('#reopen');if(ro)ro.onclick=async()=>{const m=prompt('Motivo da reabertura (fica registrado no histórico):');if(!m)return;
  cur.status='Em andamento';delete cur.closedAt;addLog(cur,'Auditoria reaberta',m);await saveAudit(cur);viewAudit(cur.number,'summary');};}

/* ---------- Dados e rastreabilidade ---------- */
function tabData(){const a=cur,L=locked();const t=a.trace;
 $('#tab').innerHTML=`<form id="df" class="card form"><h2>Dados da auditoria</h2>
 <label>Tipo<input name="type" value="${esc(a.type)}" ${L?'disabled':''}></label><label>Escopo / Processo<input name="process" value="${esc(a.process)}" ${L?'disabled':''}></label>
 <div class="grid2"><label>Setor / Planta<input name="area" value="${esc(a.area||'')}" ${L?'disabled':''}></label><label>Turno<input name="shift" value="${esc(a.shift||'')}" ${L?'disabled':''}></label></div>
 <div class="grid2"><label>Auditor<input name="auditor" value="${esc(a.auditor)}" ${L?'disabled':''}></label><label>Auditado<input name="auditee" value="${esc(a.auditee||'')}" ${L?'disabled':''}></label></div>
 <label>Data<input type="date" name="date" value="${esc(a.date)}" ${L?'disabled':''}></label><label>Observações<textarea name="notes" rows="2" ${L?'disabled':''}>${esc(a.notes||'')}</textarea></label>
 ${L?'':'<button class="btn primary">Salvar alterações</button>'}</form>
 <div class="card"><h2>Rastreabilidade</h2><dl class="dl"><dt>Número</dt><dd>${esc(a.number)}</dd><dt>Norma</dt><dd>${esc(t.standard)}</dd><dt>Aberta em</dt><dd>${fmt(t.createdAt)}</dd><dt>Aberta por</dt><dd>${esc(t.createdBy)}</dd><dt>Última alteração</dt><dd>${fmt(a.updatedAt)}</dd><dt>Checklist</dt><dd>${esc(a.checklistVersion)} (${a.checklist.length} itens)</dd><dt>Versão do app (abertura)</dt><dd>${esc(t.appVersion)}</dd><dt>Fuso horário</dt><dd>${esc(t.timezone)}</dd><dt>Dispositivo</dt><dd class="wrap">${esc(t.platform)} – ${esc(t.device)}</dd><dt>Origem</dt><dd class="wrap">${esc(t.origin)}</dd></dl></div>
 <div class="card"><h2>Registro de alterações (${a.log.length})</h2><div class="tw logbox"><table><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${[...a.log].reverse().map(l=>`<tr><td>${fmt(l.ts)}</td><td>${esc(l.user)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join('')}</tbody></table></div></div>`;
 $('#df').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const ch=[];
  for(const k in d)if((a[k]||'')!==d[k]){ch.push(`${k}: "${a[k]||''}" → "${d[k]}"`);a[k]=d[k];}
  if(ch.length){addLog(a,'Dados alterados',ch.join('; '));await saveAudit(a);toast('Dados salvos');viewAudit(a.number,'data');}};}

/* ---------- Histórico ---------- */
async function viewHistory(){const list=(await allAudits()).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));
 app.innerHTML=`<h1>Histórico de auditorias</h1><div class="filters"><input id="hq" type="search" placeholder="Buscar por número, processo, auditor…"><select id="hs"><option value="">Todas</option><option>Em andamento</option><option>Concluída</option></select></div><div class="card list" id="hl"></div>`;
 const r=()=>{const q=$('#hq').value.toLowerCase(),s=$('#hs').value;
  const l=list.filter(a=>(!s||a.status===s)&&(!q||[a.number,a.process,a.area,a.auditor,a.auditee,a.scope].join(' ').toLowerCase().includes(q)));
  $('#hl').innerHTML=l.map(a=>rowHTML(a)).join('')||'<p class="muted pad">Nenhuma auditoria encontrada.</p>';};
 $('#hq').oninput=r;$('#hs').onchange=r;r();}

/* ---------- Exportar / Importar ---------- */
async function exportAuditCSV(a){const evs=await getEvs(a.number);
 const rows=[['Auditoria','Cláusula','Título','Texto da norma','Interpretação','Exemplos de evidência','Situação','Comentário','Responsável ação','Prazo','Nº evidências','Evidências','Atualizado em','Atualizado por']];
 for(const it of a.checklist){const d=a.items[it.id]||{};const ev=evs.filter(e=>e.itemId===it.id);const g=guide(it);
  rows.push([a.number,it.id,it.t,normText(it),g.i,g.e,d.status?STATUS[d.status].l:'Pendente',d.comment||'',d.resp||'',d.prazo||'',ev.length,ev.map(e=>e.name).join(' | '),d.updatedAt||'',d.updatedBy||'']);}
 download(a.number+'.csv',new Blob([toCSV(rows)],{type:'text/csv;charset=utf-8'}));}
async function exportSummaryCSV(){const l=(await allAudits()).sort((x,y)=>x.createdAt.localeCompare(y.createdAt));
 const rows=[['Número','Data','Tipo','Processo','Setor','Turno','Auditor','Auditado','Status','Conformidade %','Conforme','NC maior','NC menor','Observação','OFI','N/A','Pendentes','Criada em','Concluída em']];
 l.forEach(a=>{const c=calc(a);rows.push([a.number,a.date,a.type,a.process,a.area||'',a.shift||'',a.auditor,a.auditee||'',a.status,c.pct==null?'':String(c.pct).replace('.',','),c.tot.C,c.tot.NCMAIOR,c.tot.NCMENOR,c.tot.OBS,c.tot.OFI,c.tot.NA,c.tot.pend,a.createdAt,a.closedAt||'']);});
 download('auditorias-resumo.csv',new Blob([toCSV(rows)],{type:'text/csv;charset=utf-8'}));}
async function exportJSON(numbers,withEv){
 const all=await allAudits();const sel=numbers?all.filter(a=>numbers.includes(a.number)):all;const evs=[];
 for(const a of sel)for(const e of await getEvs(a.number)){const o={...e};delete o.blob;if(withEv)o.dataUrl=await blobToDataURL(e.blob);evs.push(o);}
 const counters={};for(const a of all)counters[a.year]=Math.max(counters[a.year]||0,a.seq);
 const data={schema:'iatf-audit-export',schemaVersion:1,exportedAt:nowISO(),appVersion:APP_VERSION,standard:'IATF 16949:2016',company:settings.company,evidencesIncluded:!!withEv,counters,audits:sel,evidences:evs};
 download(numbers&&numbers.length===1?numbers[0]+'.json':'auditorias-'+today()+'.json',new Blob([JSON.stringify(data)],{type:'application/json'}));toast('Exportação gerada');}
async function importJSON(file){let d;try{d=JSON.parse(await file.text());}catch{return toast('Arquivo JSON inválido');}
 if(d.schema!=='iatf-audit-export'||!Array.isArray(d.audits))return toast('Formato não reconhecido');
 let n=0,s=0;const ex=new Set((await allAudits()).map(a=>a.number));
 for(const a of d.audits){if(ex.has(a.number)&&!confirm(`${a.number} já existe. Sobrescrever?`)){s++;continue;}
  a.log=a.log||[];a.log.push({ts:nowISO(),user:settings.auditor||'',action:'Importada',detail:'Importada de arquivo JSON (exportado em '+d.exportedAt+')'});
  await p(tx('audits','readwrite').objectStore('audits').put(a));n++;
  const prev=await getMeta('seq-'+a.year)||0;if(a.seq>prev)await setMeta('seq-'+a.year,a.seq);}
 let ne=0;for(const e of d.evidences||[]){if(!e.dataUrl)continue;const o={...e};o.blob=await dataURLToBlob(e.dataUrl);delete o.dataUrl;await putEv(o);ne++;}
 toast(`Importadas: ${n} auditorias, ${ne} evidências${s?` (${s} ignoradas)`:''}`);}
async function viewExport(){const list=(await allAudits()).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));
 const opts=list.map(a=>`<option value="${esc(a.number)}">${esc(a.number)} – ${esc(a.process)}</option>`).join('');
 app.innerHTML=`<h1>Exportar e importar</h1>
 <div class="card form"><h2>Exportar uma auditoria</h2><select id="xa">${opts||'<option value="">Nenhuma auditoria</option>'}</select><div class="actions"><button class="btn" id="xcsv">CSV (Excel)</button><button class="btn" id="xjson">JSON completo</button></div></div>
 <div class="card form"><h2>Exportar tudo</h2><label class="chk"><input type="checkbox" id="xev" checked> Incluir evidências (arquivos em base64 – o arquivo fica maior)</label>
 <div class="actions"><button class="btn primary" id="xall">JSON de todas as auditorias</button><button class="btn" id="xsum">Resumo de todas (CSV)</button></div>
 <p class="muted small">O JSON segue um formato versionado (iatf-audit-export v1), preparado para importação em um futuro site.</p></div>
 <div class="card form"><h2>Importar JSON</h2><p class="muted small">Restaura backup ou traz dados de outro aparelho. O contador sequencial é ajustado para não repetir números.</p><input type="file" id="imp" accept="application/json,.json"></div>`;
 $('#xcsv').onclick=async()=>{const a=await getAudit($('#xa').value);if(a)exportAuditCSV(a);};
 $('#xjson').onclick=()=>{const v=$('#xa').value;if(v)exportJSON([v],true);};
 $('#xall').onclick=()=>exportJSON(null,$('#xev').checked);$('#xsum').onclick=exportSummaryCSV;
 $('#imp').onchange=async e=>{if(e.target.files[0]){await importJSON(e.target.files[0]);viewExport();}};}

/* ---------- Configurações ---------- */
async function viewSettings(){const cl=await activeChecklist();const custom=!!(await getMeta('customChecklist'));const del=(await getMeta('deletedAudits'))||[];
 app.innerHTML=`<h1>Configurações</h1>
 <form id="sf" class="card form"><h2>Empresa e usuário</h2><label>Nome da empresa<input name="company" value="${esc(settings.company)}"></label><label>Auditor padrão<input name="auditor" value="${esc(settings.auditor)}"></label><button class="btn primary">Salvar</button></form>
 <div class="card form"><h2>Checklist</h2><p>Ativo: <b>${esc(cl.version)}</b> · ${cl.items.length} itens ${custom?'(personalizado)':'(base)'}</p>
 <p class="muted small">O checklist base reproduz o texto integral da IATF 16949:2016 (cláusulas 4 a 10 e Anexo A), com todas as alíneas e notas. Para ajustar interpretações e exemplos, ou incluir requisitos específicos do cliente (CSR), baixe o modelo, edite no Excel e importe (colunas: clausula;titulo;texto;interpretacao;exemplos). Um checklist importado passa a mostrar o texto como parágrafo único, sem a formatação por alíneas. Auditorias já abertas mantêm o checklist com que foram criadas.</p>
 <div class="actions"><button class="btn" id="ckdl">Baixar checklist atual (CSV)</button><label class="btn">Importar CSV<input type="file" id="ckup" accept=".csv,text/csv" hidden></label>${custom?'<button class="btn" id="ckrs">Restaurar base</button>':''}</div></div>
 <div class="card form"><h2>Aplicativo</h2><p class="muted small">Versão ${APP_VERSION}. Os dados ficam armazenados neste aparelho (IndexedDB). Faça exportações periódicas como backup. Auditorias excluídas: ${del.length}${del.length?' (último: '+esc(del[del.length-1].number)+' em '+fmt(del[del.length-1].deletedAt)+')':''}.</p><button class="btn" id="persist">Solicitar armazenamento persistente</button></div>`;
 $('#sf').onsubmit=async e=>{e.preventDefault();settings={...settings,...Object.fromEntries(new FormData(e.target))};await setMeta('settings',settings);renderBrand();toast('Configurações salvas');};
 $('#ckdl').onclick=()=>download('checklist-iatf.csv',new Blob([toCSV([['clausula','titulo','pergunta','interpretacao','exemplos'],...cl.items.map(i=>{const g=guide(i);return[i.id,i.t,normText(i),g.i,g.e];})])],{type:'text/csv;charset=utf-8'}));
 $('#ckup').onchange=async e=>{const f=e.target.files[0];if(!f)return;const rows=parseCSV(await f.text());
  const items=rows.slice(1).filter(r=>r[0]&&r[2]).map(r=>({id:r[0].trim(),t:(r[1]||'').trim(),q:r[2].trim(),i:(r[3]||'').trim(),e:(r[4]||'').trim()}));
  if(!items.length)return toast('Nenhum item válido (use: clausula;titulo;pergunta;interpretacao;exemplos)');
  await setMeta('customChecklist',{version:'custom-'+today(),items});toast(items.length+' itens importados');viewSettings();};
 const rs=$('#ckrs');if(rs)rs.onclick=async()=>{if(confirm('Voltar ao checklist base?')){await p(tx('meta','readwrite').objectStore('meta').delete('customChecklist'));viewSettings();}};
 $('#persist').onclick=async()=>{const ok=navigator.storage&&navigator.storage.persist?await navigator.storage.persist():false;toast(ok?'Armazenamento persistente ativo':'Não concedido pelo navegador');};}

/* ---------- Inicialização ---------- */
function renderBrand(){$('#brand').textContent=settings.company||'Auditoria IATF 16949';}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#install').hidden=false;});
$('#install').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#install').hidden=true;};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&cur)saveAudit(cur);});
(async()=>{
 try{db=await openDB();}catch(e){app.innerHTML='<div class="card"><h2>Armazenamento indisponível</h2><p>Este navegador não permite IndexedDB (modo anônimo?).</p></div>';return;}
 settings={...settings,...(await getMeta('settings')||{})};renderBrand();
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 route();
})();
})();
