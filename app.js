// ===== Prezzi Amazon — assistente prezzi dentro l'interfaccia Grok (v4.1) =====
// L'interfaccia (app.html) è lo snapshot reale di Grok: NON viene ridisegnata.
// Qui c'è il motore originale (raccolta prezzi su sessione Amazon reale, CAP,
// varianti, storico, import XLSX/CSV, export CSV) + un sottile strato che
// aggancia la casella di testo di Grok e mostra la conversazione nel suo layout.

const $=(id)=>document.getElementById(id);
const hasExtStore=(typeof chrome!=="undefined")&&chrome.storage&&chrome.storage.local;
const hasExtTabs=(typeof chrome!=="undefined")&&chrome.windows&&chrome.tabs&&chrome.scripting;
const store={
  async get(keys){
    if(hasExtStore) return new Promise(r=>chrome.storage.local.get(keys,r));
    const out={}; (Array.isArray(keys)?keys:[keys]).forEach(k=>{ try{ const v=localStorage.getItem("pa_"+k); if(v!=null) out[k]=JSON.parse(v); }catch(_){}}); return out;
  },
  async set(obj){
    if(hasExtStore) return new Promise(r=>chrome.storage.local.set(obj,r));
    try{ Object.keys(obj).forEach(k=>localStorage.setItem("pa_"+k,JSON.stringify(obj[k]))); }catch(_){}
  }
};

// stato (persistito in chrome.storage.local)
let asins=[];          // [{asin,label}]
let history=[];        // [{ts,date,asin,variant,price,priceNum,title,url}]
let settings={dominio:"www.amazon.it",cap:"20121",forceIt:true};
let importParsed=null; // {columns, rows}
let paTextarea=null;   // la textarea di Grok
let fileInput=null;

// ---------- util ----------
const pad=(n)=>String(n).padStart(2,"0");
function nowStamp(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function fileStamp(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function csvEscape(v){v=String(v==null?"":v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function priceToNum(p){ if(!p)return null; const m=String(p).replace(/\./g,'').match(/(\d+),(\d{2})/); if(m)return parseFloat(m[1]+'.'+m[2]); const m2=String(p).match(/(\d+[.,]\d{2})/); return m2?parseFloat(m2[1].replace(',','.')):null; }
function isAsin(s){return /^[A-Z0-9]{10}$/.test(s);}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function download(name,text,mime){const blob=new Blob([text],{type:mime||"text/plain;charset=utf-8"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}

// ---------- persistenza ----------
async function loadAll(){
  const s=await store.get(["asinsList","history","settings"]);
  asins=Array.isArray(s.asinsList)?s.asinsList:[];
  history=Array.isArray(s.history)?s.history:[];
  if(s.settings)settings=Object.assign(settings,s.settings);
  updateBadges();
}
async function saveAsins(){await store.set({asinsList:asins});updateBadges();}
async function saveHistory(){await store.set({history});}
async function saveSettings(){await store.set({settings});}
function updateBadges(){ const el=$("pa-asincount"); if(el) el.textContent=asins.length+" ASIN"; }
function labelFor(asin){const a=asins.find(x=>x.asin===asin);return a&&a.label||"";}

// ============================================================
//  STRATO CHAT — DOM in stile gemma-portable (.msg / .who / .content)
// ============================================================
function threadEl(){return $("thread");}
function scrollDown(){const s=$("scroll"); if(s) s.scrollTop=s.scrollHeight;}
function enterChat(){
  if(document.body.classList.contains("welcome")){
    document.body.classList.remove("welcome");
    document.body.classList.remove("chatmode");
    const t=threadEl(); const g=t&&t.querySelector(".greet"); if(g) g.remove();
  }
}
function msgWrap(role){
  enterChat();
  const w=document.createElement("div"); w.className="msg "+role;
  const who=document.createElement("div"); who.className="who";
  if(role==="bot"){ who.innerHTML='<span class="eu">\u20AC</span>'; } else { who.textContent="R"; }
  const c=document.createElement("div"); c.className="content"; c.style.minWidth="0";
  w.appendChild(who); w.appendChild(c);
  const t=threadEl(); if(t){ t.appendChild(w); } scrollDown(); return c;
}
function bot(html){const c=msgWrap("bot"); if(html!=null) c.innerHTML=html; scrollDown(); return c;}
function user(text){const c=msgWrap("user"); const b=document.createElement("div"); b.className="ubub"; b.textContent=text; c.appendChild(b); scrollDown(); return c;}
function mkbtn(label,cls,on){const btn=document.createElement("button");btn.type="button";btn.className="pa-btn"+(cls?(" "+cls):"");btn.innerHTML=label;btn.addEventListener("click",()=>on(btn));return btn;}
function actions(bubble,list){
  const row=document.createElement("div"); row.className="pa-actions";
  list.forEach(a=>row.appendChild(mkbtn(a.label,(a.primary?"primary":"")+(a.danger?" danger":""),a.on)));
  bubble.appendChild(row); scrollDown(); return row;
}
function mainActions(bubble){
  actions(bubble,[
    {label:"\u25B6 Raccogli prezzi",primary:true,on:()=>{user("Raccogli prezzi");cmdCollect();}},
    {label:"\uD83D\uDDC2 Gestione ASIN",on:()=>{user("Gestione ASIN");cmdAsin();}},
    {label:"\uD83D\uDCC8 Storico",on:()=>{user("Storico");cmdHistory();}},
    {label:"\u2699 Impostazioni",on:()=>{user("Impostazioni");cmdSettings();}}
  ]);
}

// ---------- router linguaggio naturale ----------
function respond(text){
  const t=text.trim(); if(!t) return;
  const low=t.toLowerCase();
  const tokens=t.split(/[\s,;\t\r\n]+/).filter(Boolean);
  const asinTokens=tokens.filter(x=>isAsin(x.toUpperCase()));
  if(asinTokens.length>=2 || (asinTokens.length===1 && tokens.length===1)){
    const n=addAsins(asinTokens.map(x=>x.toUpperCase()));
    const dup=asinTokens.length-n;
    bot(`Aggiunti <b>${n}</b> ASIN alla lista${dup>0?` (${dup} gi\u00E0 presenti ignorati)`:""}. Totale: <b>${asins.length}</b>.`);
    const b=bot("Vuoi raccogliere i prezzi adesso?");
    actions(b,[
      {label:"\u25B6 Raccogli prezzi",primary:true,on:()=>{user("Raccogli prezzi");cmdCollect();}},
      {label:"\uD83D\uDDC2 Vedi lista",on:()=>{user("Gestione ASIN");cmdAsin();}}
    ]);
    return;
  }
  if(/(raccogl|raccolta|prezz|scan|avvia|start|\brun\b|aggiorn|controll)/.test(low)){ cmdCollect(); return; }
  if(/(import|carica|\bfile\b|excel|xlsx|\bcsv\b|foglio)/.test(low)){ cmdImport(); return; }
  if(/(impostazion|settings|config|\bcap\b|dominio|paese|localizz)/.test(low)){ cmdSettings(); return; }
  if(/(storic|history|andament|grafico|trend|variazion)/.test(low)){ cmdHistory(); return; }
  if(/(esport|scarica|download)/.test(low)){ cmdExport(); return; }
  if(/(lista|gestion|\basin\b|prodott|svuot|rimuov|etichett)/.test(low)){ cmdAsin(); return; }
  if(/(aiut|help|comand|cosa sai|cosa puoi|come funzion)/.test(low) || low==="?"){ cmdHelp(); return; }
  if(/\b(ciao|salve|buongiorno|buonasera|hey|hello|hi)\b/.test(low)){ const b=bot("Ciao! Dimmi pure cosa vuoi fare."); mainActions(b); return; }
  const b=bot("Non sono sicuro di aver capito. Posso <b>raccogliere i prezzi</b>, gestire la <b>lista ASIN</b> (incolla o importa un file), mostrarti lo <b>storico</b> o <b>esportare</b> un CSV.");
  mainActions(b);
}
function cmdHelp(){
  const b=bot(`Ecco cosa posso fare:<br>
  \u2022 <b>Raccogli prezzi</b> — visito ogni ASIN in background sulla tua sessione Amazon (forzo il CAP italiano) e leggo prezzo + variante.<br>
  \u2022 <b>Gestione ASIN</b> — incolla ASIN o importa un file .xlsx/.csv; assegna etichette; esporta o svuota.<br>
  \u2022 <b>Storico</b> — andamento nel tempo con variazione e mini-grafico; export CSV.<br>
  \u2022 <b>Impostazioni</b> — dominio Amazon e CAP di consegna.<br><br>
  Puoi anche incollare direttamente gli ASIN qui in chat.`);
  mainActions(b);
}

// ---------- GESTIONE ASIN ----------
function addAsins(list,labelMap){
  const existing=new Set(asins.map(a=>a.asin));
  let added=0;
  list.forEach(raw=>{
    const a=String(raw).trim().toUpperCase();
    if(isAsin(a)&&!existing.has(a)){ asins.push({asin:a,label:(labelMap&&labelMap[a])||""}); existing.add(a); added++; }
  });
  saveAsins();
  return added;
}
function renderAsinList(box){
  if(!asins.length){ box.innerHTML='<div class="pa-muted" style="padding:9px 11px">Nessun ASIN in lista.</div>'; return; }
  box.innerHTML="";
  const table=document.createElement("table"); table.className="pa-table";
  table.innerHTML='<thead><tr><th style="width:34px">#</th><th>ASIN</th><th>Etichetta</th><th style="width:74px"></th></tr></thead>';
  const tb=document.createElement("tbody");
  asins.forEach((a,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${i+1}</td><td><span class="pa-code">${esc(a.asin)}</span></td>`;
    const tdL=document.createElement("td");
    const inp=document.createElement("input"); inp.type="text"; inp.className="pa-lbl"; inp.value=a.label||""; inp.placeholder="(facoltativa)";
    inp.addEventListener("change",()=>{asins[i].label=inp.value;saveAsins();});
    tdL.appendChild(inp); tr.appendChild(tdL);
    const tdD=document.createElement("td");
    const del=mkbtn("Rimuovi","danger sm",()=>{asins.splice(i,1);saveAsins();renderAsinList(box);});
    tdD.appendChild(del); tr.appendChild(tdD);
    tb.appendChild(tr);
  });
  table.appendChild(tb); box.appendChild(table);
}
function cmdAsin(){
  const b=bot(`<div class="pa-title">Gestione ASIN</div><div class="pa-muted">In lista: <b>${asins.length}</b> prodotti. Incolla ASIN (uno per riga o separati) oppure importa un file.</div>`);
  const ta=document.createElement("textarea"); ta.className="pa-input"; ta.rows=3; ta.placeholder="B0F1W3GJ1J\nB0F1VV9V34\n\u2026";
  b.appendChild(ta);
  const listBox=document.createElement("div"); listBox.className="pa-scroll";
  const row=document.createElement("div"); row.className="pa-actions";
  row.appendChild(mkbtn("+ Aggiungi","primary",()=>{
    const lines=ta.value.split(/[\s,;\t\r\n]+/).filter(Boolean);
    const n=addAsins(lines); ta.value="";
    bot(n?`Aggiunti <b>${n}</b> ASIN. Totale: <b>${asins.length}</b>.`:"Nessun nuovo ASIN valido trovato.");
    renderAsinList(listBox);
  }));
  row.appendChild(mkbtn("\u2B06 Importa file",null,()=>cmdImport()));
  row.appendChild(mkbtn("\u2B07 Esporta lista",null,()=>exportAsinList()));
  row.appendChild(mkbtn("\uD83D\uDDD1 Svuota","danger",()=>{ if(confirm("Svuotare tutta la lista ASIN?")){asins=[];saveAsins();renderAsinList(listBox);bot("Lista ASIN svuotata.");}}));
  row.appendChild(mkbtn("\u25B6 Raccogli prezzi",null,()=>{user("Raccogli prezzi");cmdCollect();}));
  b.appendChild(row);
  b.appendChild(listBox);
  renderAsinList(listBox);
}
function exportAsinList(){
  if(!asins.length){bot("La lista \u00E8 vuota: niente da esportare.");return;}
  const csv="\uFEFFASIN;Etichetta\r\n"+asins.map(a=>csvEscape(a.asin)+";"+csvEscape(a.label)).join("\r\n")+"\r\n";
  download(`asin_list_${fileStamp()}.csv`,csv,"text/csv;charset=utf-8");
  bot("Lista ASIN esportata in CSV.");
}

// ---------- IMPORT XLSX / CSV ----------
function ensureFileInput(){
  if(fileInput)return;
  fileInput=document.createElement("input");
  fileInput.type="file"; fileInput.accept=".xlsx,.csv,.tsv,.txt"; fileInput.style.display="none";
  fileInput.addEventListener("change",onFileChosen);
  document.body.appendChild(fileInput);
}
function cmdImport(){
  ensureFileInput();
  bot('Scegli un file <b>.xlsx</b> o <b>.csv</b>: rilever\u00F2 automaticamente la colonna con gli ASIN.');
  fileInput.click();
}
async function onFileChosen(e){
  const f=e.target.files[0]; if(!f)return;
  e.target.value="";
  const b=bot(`Leggo <b>${esc(f.name)}</b>\u2026`);
  try{
    const buf=await f.arrayBuffer();
    importParsed=await window.SheetParse.fromArrayBuffer(buf,f.name);
    b.innerHTML=`File <b>${esc(f.name)}</b> letto: ${importParsed.columns.length} colonne, ${importParsed.rows.length} righe.`;
    showImportCard(f.name);
  }catch(err){ b.innerHTML=`Errore nella lettura del file: ${esc(String(err))}`; }
}
function guessAsinColumn(p){
  let best=-1,bestScore=-1;
  for(let c=0;c<p.columns.length;c++){
    let hits=0,tot=0;
    p.rows.slice(0,20).forEach(r=>{const v=(r[c]||'').toString().trim().toUpperCase();if(v){tot++;if(isAsin(v))hits++;}});
    const nameBonus=/asin/i.test(p.columns[c])?5:0;
    const score=hits+nameBonus;
    if(score>bestScore){bestScore=score;best=c;}
  }
  return best;
}
function pickLabelColumn(asinCol){
  const nCols=importParsed.columns.length;
  let best=-1;
  for(let c=0;c<nCols;c++){ if(c===asinCol)continue; if(/nome|descr|titol|prodotto|name|title/i.test(importParsed.columns[c]))return c; if(best<0)best=c; }
  return best;
}
function collectColumn(colIdx,hasHeader){
  const rows=hasHeader?importParsed.rows:[importParsed.columns,...importParsed.rows];
  return rows.map(r=>(r[colIdx]||'').toString().trim()).filter(Boolean);
}
function showImportCard(fname){
  const p=importParsed;
  const b=bot(`<div class="pa-title">Importazione — ${esc(fname)}</div><div class="pa-muted">Scegli la colonna con gli ASIN (ho fatto una scelta automatica).</div>`);
  const field=document.createElement("div"); field.className="pa-field";
  field.innerHTML='<label>Colonna ASIN</label>';
  const sel=document.createElement("select"); sel.className="pa-input";
  p.columns.forEach((c,i)=>{const o=document.createElement("option");o.value=i;o.textContent=c;sel.appendChild(o);});
  const guess=guessAsinColumn(p); if(guess>=0) sel.value=guess;
  field.appendChild(sel); b.appendChild(field);
  const chk=document.createElement("label"); chk.className="pa-chk";
  const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=true;
  const cspan=document.createElement("span"); cspan.textContent="La prima riga \u00E8 un'intestazione";
  chk.appendChild(cb); chk.appendChild(cspan); b.appendChild(chk);
  const info=document.createElement("div"); info.className="pa-muted"; b.appendChild(info);
  const prev=document.createElement("div"); prev.className="pa-scroll"; b.appendChild(prev);
  function refresh(){
    const colIdx=+sel.value, hasHeader=cb.checked;
    const rows=hasHeader?p.rows:[p.columns,...p.rows];
    let html='<table class="pa-table"><thead><tr>'+p.columns.map((c,i)=>`<th class="${i===colIdx?'hl':''}">${esc(c)}</th>`).join("")+'</tr></thead><tbody>';
    html+=rows.slice(0,6).map(r=>"<tr>"+p.columns.map((_,i)=>`<td class="${i===colIdx?'hl':''}">${esc(r[i]||'')}</td>`).join("")+"</tr>").join("");
    html+="</tbody></table>";
    prev.innerHTML=html;
    const vals=collectColumn(colIdx,hasHeader);
    const valid=vals.filter(v=>isAsin(v.toUpperCase()));
    info.innerHTML=`<b>${valid.length}</b> ASIN validi su ${vals.length} celle.`;
  }
  sel.addEventListener("change",refresh); cb.addEventListener("change",refresh); refresh();
  const row=document.createElement("div"); row.className="pa-actions"; b.appendChild(row);
  row.appendChild(mkbtn("+ Importa colonna","primary",()=>{
    const colIdx=+sel.value, hasHeader=cb.checked;
    const vals=collectColumn(colIdx,hasHeader);
    const labelCol=pickLabelColumn(colIdx);
    const labelMap={};
    if(labelCol>=0){
      const rows=hasHeader?p.rows:[p.columns,...p.rows];
      rows.forEach(r=>{const a=(r[colIdx]||'').toString().trim().toUpperCase();const l=(r[labelCol]||'').toString().trim();if(isAsin(a)&&l)labelMap[a]=l;});
    }
    const n=addAsins(vals,labelMap);
    bot(n?`Importati <b>${n}</b> nuovi ASIN. Totale in lista: <b>${asins.length}</b>.`:"Nessun nuovo ASIN importato.");
    const bb=bot("Procedo con la raccolta?");
    actions(bb,[
      {label:"\u25B6 Raccogli prezzi",primary:true,on:()=>{user("Raccogli prezzi");cmdCollect();}},
      {label:"\uD83D\uDDC2 Vedi lista",on:()=>{user("Gestione ASIN");cmdAsin();}}
    ]);
  }));
  row.appendChild(mkbtn("Annulla",null,()=>{bot("Importazione annullata.");}));
}

// ---------- IMPOSTAZIONI ----------
function cmdSettings(){
  const b=bot(`<div class="pa-title">Impostazioni raccolta</div><div class="pa-muted">Dominio Amazon e localizzazione usati durante la raccolta.</div>`);
  const domF=document.createElement("div"); domF.className="pa-field"; domF.innerHTML='<label>Dominio Amazon</label>';
  const dom=document.createElement("select"); dom.className="pa-input";
  [["www.amazon.it","amazon.it"],["www.amazon.de","amazon.de"],["www.amazon.es","amazon.es"],["www.amazon.fr","amazon.fr"],["www.amazon.co.uk","amazon.co.uk"],["www.amazon.com","amazon.com"]]
    .forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;if(v===settings.dominio)o.selected=true;dom.appendChild(o);});
  domF.appendChild(dom); b.appendChild(domF);
  const chk=document.createElement("label"); chk.className="pa-chk";
  const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!settings.forceIt;
  const cspan=document.createElement("span"); cspan.textContent="Forza CAP (localizzazione Italia)";
  chk.appendChild(cb); chk.appendChild(cspan); b.appendChild(chk);
  const capF=document.createElement("div"); capF.className="pa-field"; capF.innerHTML='<label>CAP di consegna</label>';
  const cap=document.createElement("input"); cap.type="text"; cap.className="pa-input"; cap.maxLength=5; cap.value=settings.cap||"20121"; cap.inputMode="numeric";
  capF.appendChild(cap); b.appendChild(capF);
  function save(){ settings.dominio=dom.value; settings.forceIt=cb.checked; settings.cap=cap.value.trim(); saveSettings(); }
  dom.addEventListener("change",save); cb.addEventListener("change",save); cap.addEventListener("change",save);
  actions(b,[
    {label:'<svg viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Salva',primary:true,on:()=>{save();bot(`Impostazioni salvate: <b>${esc(dom.value.replace("www.",""))}</b>${cb.checked?` \u00B7 CAP ${esc(cap.value.trim())}`:" \u00B7 CAP non forzato"}.`);}},
    {label:"\u25B6 Raccogli prezzi",on:()=>{save();user("Raccogli prezzi");cmdCollect();}}
  ]);
}

// ---------- funzioni iniettate nelle pagine Amazon ----------
function setLocation(cap){
  return new Promise(async (resolve)=>{
    try{
      const tokEl=document.querySelector('input[name="glow-validation-token"]');
      const token=tokEl?tokEl.value:(document.documentElement.innerHTML.match(/glow-validation-token"\s+type="hidden"\s+value="([^"]+)"/)||[])[1];
      if(!token) return resolve({ok:false,reason:"token non trovato"});
      const body=new URLSearchParams({locationType:"LOCATION_INPUT",zipCode:cap,storeContext:"generic",deviceType:"web",pageType:"Gateway",actionSource:"glow"}).toString();
      const r=await fetch("/portal-migration/hz/glow/address-change?actionSource=glow",{method:"POST",credentials:"include",headers:{"anti-csrftoken-a2z":token,"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","x-requested-with":"XMLHttpRequest"},body});
      const t=await r.text();
      resolve({ok:/"successful":1|isAddressUpdated/i.test(t),status:r.status});
    }catch(e){ resolve({ok:false,reason:String(e)}); }
  });
}
function extractData(){
  return new Promise((resolve)=>{
    const t0=Date.now();
    function readVariant(){
      const dims=[...document.querySelectorAll('.inline-twister-dim-title-value')].map(e=>e.textContent.replace(/\s+/g,' ').trim()).filter(Boolean);
      if(dims.length) return dims.join(' / ');
      const sel=document.querySelector('#variation_size_name .selection, #variation_style_name .selection, #variation_color_name .selection');
      return sel?sel.textContent.replace(/\s+/g,' ').trim():"";
    }
    function read(){
      if(/api-services-support|captcha|Inserisci i caratteri/i.test(document.title+document.body.innerText.slice(0,200))) return {captcha:true};
      const C=document.querySelector('#corePriceDisplay_desktop_feature_div,#corePrice_feature_div,#apex_desktop,#buybox');
      const g=(s)=>{const e=(C||document).querySelector(s);return e&&e.textContent.trim();};
      let p=g('.priceToPay .a-offscreen')||g('.a-price[data-a-size] .a-offscreen')||g('.a-price:not(.a-text-price) .a-offscreen');
      if(!p){const x=((document.querySelector('#availability')||document.querySelector('#buybox')||{}).innerText||'');if(/Non disponibile|Attualmente non disponibile/i.test(x))p='Non disponibile';}
      const ti=document.querySelector('#productTitle');
      return {price:p||"",title:ti?ti.textContent.trim():"",variant:readVariant()};
    }
    (function poll(){const r=read();if(r.captcha||r.price||Date.now()-t0>9000)return resolve(r);setTimeout(poll,400);})();
  });
}

// ---------- RACCOLTA (harvest) ----------
let stopRequested=false, harvestWin=null, harvestTab=null, running=false;
function waitTabComplete(tabId,urlPart,timeoutMs=25000){
  return new Promise((resolve)=>{let done=false;const finish=()=>{if(!done){done=true;chrome.tabs.onUpdated.removeListener(l);resolve();}};
    const l=(id,info,tab)=>{if(id===tabId&&info.status==="complete"){if(!urlPart||(tab&&tab.url&&tab.url.indexOf(urlPart)>-1))finish();}};
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tabId,(t)=>{if(chrome.runtime.lastError)return finish();if(t&&t.status==="complete"&&(!urlPart||(t.url&&t.url.indexOf(urlPart)>-1)))finish();});
    setTimeout(finish,timeoutMs);});
}
async function openHarvestWindow(startUrl){
  const w=await chrome.windows.create({url:startUrl,focused:false,width:1200,height:820,type:"normal"});
  harvestWin=w.id; harvestTab=w.tabs[0].id;
  try{await chrome.windows.update(w.id,{state:"minimized"});}catch(_){}
}
async function closeHarvestWindow(){if(harvestWin!=null){try{await chrome.windows.remove(harvestWin);}catch(_){}}harvestWin=null;harvestTab=null;}
async function gotoAndRead(url){
  await chrome.tabs.update(harvestTab,{url});
  await waitTabComplete(harvestTab,"/dp/");
  await new Promise(r=>setTimeout(r,600));
  const [res]=await chrome.scripting.executeScript({target:{tabId:harvestTab},func:extractData});
  return (res&&res.result)||{price:"",title:"",variant:""};
}
function cmdCollectScreen(){
  const b=bot(`<div class="pa-title">Raccogli prezzi</div><div class="pa-muted">${asins.length} prodotti in lista \u00B7 ${esc(settings.dominio.replace("www.",""))}${settings.forceIt?` \u00B7 CAP ${esc(settings.cap||"")}`:""}</div>`);
  if(!asins.length){
    actions(b,[
      {label:"\uD83D\uDDC2 Gestione ASIN",primary:true,on:()=>run("navAsin","Gestione ASIN",cmdAsin)},
      {label:"\u2B06 Importa file",on:()=>cmdImport()}
    ]);
    return;
  }
  actions(b,[
    {label:"\u25B6 Avvia raccolta",primary:true,on:()=>run("navCollect","Raccogli prezzi",cmdCollect)},
    {label:"\uD83D\uDCC8 Vedi storico",on:()=>run("navHistory","Storico",cmdHistory)}
  ]);
}
async function cmdCollect(){
  if(running){ bot("Una raccolta \u00E8 gi\u00E0 in corso."); return; }
  if(!hasExtTabs){
    const b=bot(`<div class="pa-title">Anteprima browser</div><div class="pa-muted">La raccolta prezzi funziona solo quando la pagina \u00E8 aperta come <b>estensione Chrome</b> (serve l'accesso alla tua sessione Amazon). Qui in anteprima puoi gestire e importare gli ASIN, ma non avviare la raccolta.</div>`);
    return;
  }
  if(!asins.length){
    const b=bot("La lista ASIN \u00E8 vuota. Aggiungine prima (incolla o importa un file).");
    actions(b,[
      {label:"\uD83D\uDDC2 Gestione ASIN",primary:true,on:()=>{user("Gestione ASIN");cmdAsin();}},
      {label:"\u2B06 Importa file",on:()=>{user("Importa file");cmdImport();}}
    ]);
    return;
  }
  running=true; stopRequested=false;
  const dom=settings.dominio, cap=(settings.cap||"").trim(), force=settings.forceIt;
  const stamp=nowStamp(), ts=Date.now();

  const b=bot(`<div class="pa-title">Raccolta prezzi in corso\u2026</div><div class="pa-muted">${asins.length} prodotti \u00B7 ${esc(dom.replace("www.",""))}${force?` \u00B7 CAP ${esc(cap)}`:""} \u00B7 ${stamp}</div>`);
  const bar=document.createElement("div"); bar.className="pa-bar"; const barIn=document.createElement("div"); bar.appendChild(barIn); b.appendChild(bar);
  const logBox=document.createElement("div"); logBox.className="pa-log"; b.appendChild(logBox);
  const arow=document.createElement("div"); arow.className="pa-actions"; b.appendChild(arow);
  const stopBtn=mkbtn("\u25A0 Stop","danger",()=>{stopRequested=true;stopBtn.disabled=true;}); arow.appendChild(stopBtn);

  const L=(m,c)=>{const d=document.createElement("div"); if(c)d.className=c; d.textContent=m; logBox.appendChild(d); logBox.scrollTop=logBox.scrollHeight; scrollDown();};
  const P=(done,total)=>{barIn.style.width=total?Math.round(done/total*100)+"%":"0%";};

  const collected=[];
  try{
    L("Apro la finestra di raccolta (in background)\u2026","info");
    await openHarvestWindow(`https://${dom}/`);
    await waitTabComplete(harvestTab,null);
    await new Promise(r=>setTimeout(r,500));
    if(force){
      if(!/^\d{5}$/.test(cap)){ L("CAP non valido (servono 5 cifre). Interrompo.","err"); await closeHarvestWindow(); running=false; stopBtn.disabled=true; return; }
      L(`Imposto la localizzazione sul CAP ${cap}\u2026`,"info");
      const [pr]=await chrome.scripting.executeScript({target:{tabId:harvestTab},func:setLocation,args:[cap]});
      const ok=pr&&pr.result&&pr.result.ok;
      if(ok){L(`\u2714 Localizzazione impostata (CAP ${cap}).`,"ok"); const lc=$("pa-loc"); if(lc) lc.textContent=`CAP ${cap}`;}
      else{L(`\u26A0 CAP non impostato (${(pr&&pr.result&&(pr.result.reason||pr.result.status))||"?"}). Proseguo.`,"warn");}
    }
    L(`Raccolgo ${asins.length} prodotti\u2026`,"info");
    for(let i=0;i<asins.length;i++){
      if(stopRequested){L("Interrotto dall'utente.","err");break;}
      const a=asins[i].asin;
      const url=`https://${dom}/dp/${a}?th=1&psc=1`;
      let r=await gotoAndRead(url);
      if(r.captcha){ L(`[${i+1}/${asins.length}] ${a} \u2192 CAPTCHA rilevato. Apri la finestra e risolvilo, poi riprova.`,"warn"); r={price:"CAPTCHA",title:"",variant:""}; }
      const price=r.price||"N/D";
      const cls=/[0-9],[0-9]/.test(price)?"ok":(price==="Non disponibile"?"warn":"err");
      L(`[${i+1}/${asins.length}] ${a} ${r.variant?("("+r.variant+") "):""}\u2192 ${price}`,cls);
      collected.push({ts,date:stamp,asin:a,variant:r.variant||"",price,priceNum:priceToNum(price),title:r.title||"",url});
      P(i+1,asins.length);
      await new Promise(res=>setTimeout(res,400+Math.random()*500));
    }
  }catch(e){ L("Errore: "+e,"err"); }
  finally{ await closeHarvestWindow(); running=false; stopBtn.disabled=true; }

  if(collected.length){
    history=history.concat(collected);
    await saveHistory();
    const done=bot(`<div class="pa-title">Raccolta completata</div><div class="pa-muted">${collected.length} prezzi rilevati e salvati nello storico.</div>`);
    let html='<table class="pa-table"><thead><tr><th>#</th><th>ASIN</th><th>Variante</th><th>Prezzo</th><th>Titolo</th></tr></thead><tbody>';
    html+=collected.map((r,i)=>`<tr><td>${i+1}</td><td><span class="pa-code">${esc(r.asin)}</span></td><td>${esc(r.variant)}</td><td><b>${esc(r.price)}</b></td><td>${esc((r.title||'').slice(0,44))}</td></tr>`).join("");
    html+="</tbody></table>";
    const wrap=document.createElement("div"); wrap.className="pa-scroll"; wrap.innerHTML=html; done.appendChild(wrap);
    actions(done,[
      {label:"\u2B07 Scarica CSV",primary:true,on:()=>{
        const header="Data;ASIN;Variante;Prezzo;URL;Titolo";
        const bodyCsv=collected.map(r=>[r.date,r.asin,r.variant,r.price,r.url,r.title].map(csvEscape).join(";")).join("\r\n");
        download(`prezzi_amazon_${fileStamp()}.csv`,"\uFEFF"+header+"\r\n"+bodyCsv+"\r\n","text/csv;charset=utf-8");
      }},
      {label:"\uD83D\uDCC8 Vedi storico",on:()=>{user("Storico");cmdHistory();}}
    ]);
  } else {
    bot("Nessun prezzo raccolto.");
  }
}

// ---------- STORICO ----------
function sparkline(points){
  const vals=points.filter(v=>typeof v==="number");
  if(vals.length<2) return '<span class="pa-muted">\u2014</span>';
  const w=90,h=26,min=Math.min(...vals),max=Math.max(...vals),rng=(max-min)||1;
  const step=w/(points.length-1);
  let d="",started=false;
  points.forEach((v,i)=>{ if(typeof v==="number"){const y=h-2-((v-min)/rng)*(h-4);d+=(started?"L":"M")+(i*step).toFixed(1)+","+y.toFixed(1)+" ";started=true;} });
  const last=vals[vals.length-1],first=vals[0];
  const color=last>first?"#f85149":(last<first?"#3fb950":"#8b949e");
  return `<svg class="pa-mini" width="${w}" height="${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}
function cmdHistory(){
  if(!history.length){
    const b=bot("Non ci sono ancora rilevazioni nello storico. Fai una raccolta per iniziare.");
    actions(b,[{label:"\u25B6 Raccogli prezzi",primary:true,on:()=>{user("Raccogli prezzi");cmdCollect();}}]);
    return;
  }
  const dates=[...new Set(history.map(h=>h.date))].sort();
  const b=bot(`<div class="pa-title">Storico prezzi</div><div class="pa-muted">${history.length} rilevazioni \u00B7 ${new Set(history.map(h=>h.asin)).size} prodotti \u00B7 dal ${dates[0]} al ${dates[dates.length-1]}</div>`);
  const byAsin={}; history.forEach(h=>{(byAsin[h.asin]=byAsin[h.asin]||[]).push(h);});
  let html='<table class="pa-table"><thead><tr><th>ASIN</th><th>Etichetta</th><th>Ultimo</th><th>Variazione</th><th>Andamento</th><th>#</th></tr></thead><tbody>';
  Object.keys(byAsin).forEach(asin=>{
    const arr=byAsin[asin].slice().sort((a,b)=>a.ts-b.ts);
    const last=arr[arr.length-1], prev=arr.length>1?arr[arr.length-2]:null;
    let delta='<span class="pa-flat">\u2014</span>';
    if(prev&&typeof last.priceNum==="number"&&typeof prev.priceNum==="number"){
      const d=last.priceNum-prev.priceNum;
      if(Math.abs(d)<0.005) delta='<span class="pa-flat">= 0,00</span>';
      else delta=`<span class="${d>0?'pa-up':'pa-down'}">${d>0?'\u25B2':'\u25BC'} ${Math.abs(d).toFixed(2).replace('.',',')}\u20AC</span>`;
    }
    const spark=sparkline(arr.map(x=>typeof x.priceNum==="number"?x.priceNum:null));
    html+=`<tr><td><span class="pa-code">${esc(asin)}</span></td><td>${esc(labelFor(asin)||(last.title||'').slice(0,34))}</td><td><b>${esc(last.price)}</b></td><td>${delta}</td><td>${spark}</td><td>${arr.length}</td></tr>`;
  });
  html+="</tbody></table>";
  const wrap=document.createElement("div"); wrap.className="pa-scroll"; wrap.innerHTML=html; b.appendChild(wrap);
  actions(b,[
    {label:"\u2B07 Esporta storico",primary:true,on:()=>exportHistory()},
    {label:"\uD83D\uDCCB Tutte le rilevazioni",on:()=>showAllDetections()},
    {label:"\uD83D\uDDD1 Cancella storico",danger:true,on:()=>{ if(confirm("Cancellare tutto lo storico delle rilevazioni?")){history=[];saveHistory();bot("Storico cancellato.");}}}
  ]);
}
function showAllDetections(){
  const b=bot(`<div class="pa-title">Tutte le rilevazioni</div>`);
  let html='<table class="pa-table"><thead><tr><th>Data</th><th>ASIN</th><th>Variante</th><th>Prezzo</th><th>Titolo</th></tr></thead><tbody>';
  html+=history.slice().sort((a,b)=>b.ts-a.ts).slice(0,500).map(h=>`<tr><td>${esc(h.date)}</td><td><span class="pa-code">${esc(h.asin)}</span></td><td>${esc(h.variant)}</td><td>${esc(h.price)}</td><td>${esc((h.title||'').slice(0,50))}</td></tr>`).join("");
  html+="</tbody></table>";
  const wrap=document.createElement("div"); wrap.className="pa-scroll"; wrap.style.maxHeight="320px"; wrap.innerHTML=html; b.appendChild(wrap);
}
function exportHistory(){
  if(!history.length){bot("Lo storico \u00E8 vuoto.");return;}
  const header="Data;ASIN;Etichetta;Variante;Prezzo;PrezzoNum;URL;Titolo";
  const body=history.slice().sort((a,b)=>a.ts-b.ts).map(h=>[h.date,h.asin,labelFor(h.asin),h.variant,h.price,(h.priceNum==null?"":String(h.priceNum).replace('.',',')),h.url,h.title].map(csvEscape).join(";")).join("\r\n");
  download(`storico_prezzi_${fileStamp()}.csv`,"\uFEFF"+header+"\r\n"+body+"\r\n","text/csv;charset=utf-8");
  bot("Storico esportato in CSV.");
}
function cmdExport(){
  const b=bot("Cosa vuoi esportare?");
  actions(b,[
    {label:"\u2B07 Storico (CSV)",primary:true,on:()=>exportHistory()},
    {label:"\u2B07 Lista ASIN (CSV)",on:()=>exportAsinList()}
  ]);
}

// ============================================================
//  MONTAGGIO — interfaccia in stile gemma-portable
// ============================================================
function submitComposer(){
  const ta=$("input"); if(!ta) return;
  const t=ta.value.trim(); if(!t) return;
  document.body.classList.remove("secview");
  user(t); ta.value=""; ta.style.height="auto";
  respond(t);
}

function renderGreeting(){
  const t=threadEl(); if(!t) return;
  if(t.querySelector(".greet")) return;
  const g=document.createElement("div"); g.className="greet";
  g.innerHTML='<h1>Come posso aiutarti?</h1><div class="sub">Scegli come iniziare</div><div class="pa-choice"><button class="pa-choice-card" id="modeChat"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div class="t">Modalit\u00E0 chat</div><div class="d">Scrivi comandi o incolla gli ASIN liberamente.</div></button><button class="pa-choice-card" id="modeAsin"><svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg><div class="t">ASIN importati</div><div class="d">Analizza subito gli ASIN gi\u00E0 salvati o importati.</div></button></div>';
  t.appendChild(g);
}
function resetToWelcome(){
  const t=threadEl(); if(t) t.innerHTML="";
  document.body.classList.remove("chatmode","secview");
  document.body.classList.add("welcome");
  renderGreeting();
  const ta=$("input"); if(ta){ ta.value=""; ta.style.height="auto"; ta.focus(); }
}
function setActiveNav(id){
  document.querySelectorAll(".navitem").forEach(b=>b.classList.remove("active"));
  const el=id?$(id):null; if(el) el.classList.add("active");
}
function run(navId,label,fn){ setActiveNav(navId); const t=threadEl(); if(t) t.innerHTML=""; document.body.classList.remove("welcome","chatmode"); document.body.classList.add("secview"); fn(); }

// ---------- sfondo: diffusione verde fluo (canvas) ----------
function initGalaxy(){
  const cv=$("galaxy"); if(!cv||cv.dataset.on) return; cv.dataset.on="1";
  const ctx=cv.getContext("2d"); let W=0,H=0,DPR=1,blobs=[];
  const cols=["57,255,120","118,255,3","0,230,118","0,255,170","140,255,80","0,200,110"];
  function seed(){
    blobs=[];
    for(let i=0;i<4;i++){
      blobs.push({
        bx:Math.random(), by:Math.random(),
        r:(Math.random()*.20+.16)*Math.max(W,H),
        c:cols[i%cols.length], a:Math.random()*.05+.035,
        px:Math.random()*6.283, py:Math.random()*6.283,
        sx:Math.random()*.5+.3, sy:Math.random()*.5+.3,
        amp:Math.random()*.06+.05
      });
    }
    blobs.push({
      bx:Math.random()*.6+.2, by:Math.random()*.6+.2,
      r:(Math.random()*.16+.14)*Math.max(W,H),
      c:"255,255,255", a:.035,
      px:Math.random()*6.283, py:Math.random()*6.283,
      sx:Math.random()*.5+.3, sy:Math.random()*.5+.3,
      amp:Math.random()*.06+.05
    });
  }
  function resize(){
    DPR=Math.min(window.devicePixelRatio||1,2);
    W=window.innerWidth; H=window.innerHeight;
    cv.style.width=W+"px"; cv.style.height=H+"px";
    cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); seed();
  }
  let t=0;
  function frame(){
    t+=0.006; ctx.clearRect(0,0,W,H);
    for(const b of blobs){
      const cx=(b.bx+Math.sin(t*b.sx+b.px)*b.amp)*W;
      const cy=(b.by+Math.cos(t*b.sy+b.py)*b.amp)*H;
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,b.r);
      g.addColorStop(0,"rgba("+b.c+","+b.a+")");
      g.addColorStop(1,"rgba("+b.c+",0)");
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize",resize); resize(); requestAnimationFrame(frame);
}

function mount(){
  const ta=$("input"); if(!ta) return false;
  paTextarea=ta;

  // composer
  ta.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submitComposer(); } });
  ta.addEventListener("input",()=>{ ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,200)+"px"; });
  const send=$("send"); if(send) send.addEventListener("click",submitComposer);
  const up=$("uploadBtn"); if(up) up.addEventListener("click",(e)=>{ e.preventDefault(); run(null,"Importa file",cmdImport); });

  // sidebar
  const tog=$("toggleSide"); if(tog) tog.addEventListener("click",()=>document.body.classList.toggle("collapsed"));
  const ov=$("ov"); if(ov) ov.addEventListener("click",()=>document.body.classList.add("collapsed"));
  const nc=$("newChat"); if(nc) nc.addEventListener("click",()=>{ setActiveNav(null); resetToWelcome(); });
  const home=$("navHome"); if(home) home.addEventListener("click",()=>{ setActiveNav(null); resetToWelcome(); });
  const scr=$("scroll"); if(scr) scr.addEventListener("click",(e)=>{
    if(e.target.closest("#modeAsin")){ run("navCollect","Raccogli prezzi",cmdCollectScreen); return; }
    if(e.target.closest("#modeChat")){ document.body.classList.add("chatmode"); const g=threadEl()&&threadEl().querySelector(".greet"); if(g) g.innerHTML='<h1>Modalit\u00E0 chat</h1><div class="sub">Scrivi un comando o incolla gli ASIN qui sotto.</div>'; const ta=$("input"); if(ta) ta.focus(); return; }
  });
  const wire=(id,label,fn)=>{ const el=$(id); if(el) el.addEventListener("click",()=>run(id,label,fn)); };
  wire("navCollect","Raccogli prezzi",cmdCollectScreen);
  wire("navAsin","Gestione ASIN",cmdAsin);
  wire("navHistory","Storico",cmdHistory);
  wire("navSettings","Impostazioni",cmdSettings);

  initGalaxy();
  updateBadges();
  ta.focus();
  return true;
}

// ---------- init ----------
async function init(){
  try{ await loadAll(); }catch(_){}
  if(!mount()){ setTimeout(mount,300); }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
