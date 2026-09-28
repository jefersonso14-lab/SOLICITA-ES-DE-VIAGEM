import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {supabase} from "./lib/supabase";
import * as XLSX from "xlsx";
import "./styles.css";

const nav=[["⌂","Dashboard"],["＋","Solicitações"],["●","Colaboradores"],["R$","Custos"],["▤","Relatórios"],["□","Anexos"],["◷","Histórico"]];
const stats=[["OS em andamento","08","Acompanhar"],["Pendentes","05","Revisar"],["Custo acumulado","R$ 48.620,40","Período atual"]];

function App(){
 const [session,setSession]=useState(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{ if(!supabase){setLoading(false);return;} supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>subscription.unsubscribe();},[]);
 if(loading)return <div className="center-screen">Carregando plataforma…</div>;
 if(!session)return <Login/>;
 return <Shell session={session}/>;
}

function Login(){
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setError("");setBusy(true); if(!supabase){setError("Configure as variáveis do Supabase para ativar o login.");setBusy(false);return;} const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)setError("Não foi possível entrar. Verifique e-mail e senha."); setBusy(false);}
 return <main className="login"><div className="login-card"><div className="brand login-brand"><span className="brand-mark">B</span><div><strong>PLATAFORMA</strong><small>Solicitação de Viagens</small></div></div><span className="eyebrow">ACESSO RESTRITO</span><h1>Entrar</h1><p>Acesse suas solicitações, custos e documentos.</p><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>{error&&<div className="alert" role="alert">⚠ {error}</div>}<button className="primary full" disabled={busy}>{busy?"Entrando…":"Entrar"}</button></form><small className="login-note">Acesso individualizado e protegido.</small></div></main>
}

function Shell({session}){
 const [active,setActive]=useState("Dashboard"); const [profile,setProfile]=useState(null); const [selectedRequest,setSelectedRequest]=useState(null);
 useEffect(()=>{supabase.from("profiles").select("full_name,role").eq("id",session.user.id).maybeSingle().then(({data})=>setProfile(data));},[session.user.id]);
 const name=profile?.full_name||session.user.email?.split("@")[0]||"Usuário";
 return <div className="app"><aside className="sidebar"><div className="brand"><span className="brand-mark">B</span><div><strong>PLATAFORMA</strong><small>Solicitação de Viagens</small></div></div><nav>{nav.map(([icon,label])=><button className={active===label?"nav active":"nav"} onClick={()=>{setActive(label);if(label!=="Solicitações")setSelectedRequest(null)}} key={label}><span>{icon}</span>{label}</button>)}</nav><button className="logout" onClick={()=>supabase.auth.signOut()}>↪ Sair</button></aside><main className="main"><header className="topbar"><div><span className="eyebrow">GESTÃO DE VIAGENS</span><h1>{active}</h1></div><div className="user"><div className="avatar">{name.slice(0,2).toUpperCase()}</div><div><b>{name}</b><small>{profile?.role||"Solicitante"}</small></div></div></header>{active==="Dashboard"?<Dashboard/>:active==="Colaboradores"?<Collaborators/>:active==="Solicitações"?<TravelRequests onOpen={setSelectedRequest}/>:selectedRequest?<RequestDossier requestId={selectedRequest} onBack={()=>setSelectedRequest(null)}/>:<Module title={active}/>}</main></div>
}

function Dashboard(){return <section className="content"><div className="hero"><div><span className="tag">VISÃO GERAL</span><h2>Controle suas viagens em um único lugar.</h2><p>Solicitações, colaboradores, custos e documentos organizados por OS.</p></div><button className="primary">＋ Nova solicitação</button></div><div className="stats">{stats.map(([t,v,s])=><article className="stat" key={t}><span>{t}</span><strong>{v}</strong><small>{s}</small></article>)}<article className="stat"><span>Base ativa</span><strong>Consultar</strong><small>Colaboradores</small></article></div></section>}

function Collaborators(){
 const [rows,setRows]=useState([]); const [query,setQuery]=useState(""); const [open,setOpen]=useState(false); const [form,setForm]=useState({name:"",cpf:"",birth_date:"",sector:"",uf:""}); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
 async function load(){const {data,error}=await supabase.from("collaborators").select("id,name,cpf,birth_date,sector,uf,active").order("name"); if(!error)setRows(data||[]); else setError("Não foi possível carregar a base de colaboradores.");}
 useEffect(()=>{load()},[]);
 const filtered=rows.filter(r=>[r.name,r.cpf,r.sector,r.uf].join(" ").toLowerCase().includes(query.toLowerCase()));
 async function save(e){e.preventDefault();setSaving(true);setError("");const {error}=await supabase.from("collaborators").insert(form);if(error)setError(error.code==="23505"?"CPF já cadastrado.":"Não foi possível salvar.");else{setOpen(false);setForm({name:"",cpf:"",birth_date:"",sector:"",uf:""});load();}setSaving(false)}
 return <section className="content"><div className="module-head"><div><span className="eyebrow">CADASTRO MESTRE</span><h2>Colaboradores</h2><p>Base reutilizável para todas as solicitações de viagem.</p></div><button className="primary" onClick={()=>setOpen(true)}>＋ Novo colaborador</button></div><div className="toolbar"><input placeholder="Pesquisar nome, CPF, setor ou UF" value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length} registros</span></div>{error&&<div className="alert" role="alert">⚠ {error}</div>}<div className="panel"><div className="table collab"><div className="tr th"><span>Nome</span><span>CPF</span><span>Nascimento</span><span>Setor</span><span>UF</span></div>{filtered.length?filtered.map(r=><div className="tr" key={r.id}><span><b>{r.name}</b></span><span>{r.cpf||"—"}</span><span>{r.birth_date?new Date(r.birth_date+"T00:00:00").toLocaleDateString("pt-BR"):"—"}</span><span>{r.sector||"—"}</span><span>{r.uf||"—"}</span></div>):<div className="empty">Nenhum colaborador encontrado.</div>}</div></div>{open&&<div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="panel-head"><div><span className="eyebrow">NOVO REGISTRO</span><h3>Colaborador</h3></div><button type="button" className="close" onClick={()=>setOpen(false)}>×</button></div><label>Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="form-grid"><label>CPF<input value={form.cpf} onChange={e=>setForm({...form,cpf:e.target.value})}/></label><label>Data de nascimento<input type="date" value={form.birth_date} onChange={e=>setForm({...form,birth_date:e.target.value})}/></label><label>Setor<input value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})}/></label><label>UF<input maxLength="2" value={form.uf} onChange={e=>setForm({...form,uf:e.target.value.toUpperCase()})}/></label></div>{error&&<div className="alert">⚠ {error}</div>}<button className="primary full" disabled={saving}>{saving?"Salvando…":"Salvar colaborador"}</button></form></div>}</section>
}


function TravelRequests({onOpen}){
 const [clients,setClients]=useState([]),[contracts,setContracts]=useState([]),[collabs,setCollabs]=useState([]),[requests,setRequests]=useState([]);
 const [form,setForm]=useState({os:"",client_id:"",contract_id:"",state:"",city:"",manager_name:"",start_date:"",end_date:"",status:"draft"});
 const [selected,setSelected]=useState([]),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{Promise.all([supabase.from("clients").select("id,name").eq("active",true).order("name"),supabase.from("contracts").select("id,name,code,client_id").eq("active",true).order("name"),supabase.from("collaborators").select("id,name,cpf").eq("active",true).order("name"),supabase.from("travel_requests").select("id,os,state,city,start_date,end_date,status").order("created_at",{ascending:false})]).then(([c,k,x,r])=>{setClients(c.data||[]);setContracts(k.data||[]);setCollabs(x.data||[]);setRequests(r.data||[])})},[]);
 const days=form.start_date&&form.end_date?Math.max(0,Math.floor((new Date(form.end_date)-new Date(form.start_date))/86400000)+1):0;
 const availableContracts=contracts.filter(c=>!form.client_id||c.client_id===form.client_id);
 function toggle(id){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}
 async function save(e){e.preventDefault();setSaving(true);setMessage("");const {data,error}=await supabase.from("travel_requests").insert({...form}).select("id").single();if(error){setMessage("⚠ Não foi possível salvar a solicitação.");setSaving(false);return} if(selected.length){const {error:e2}=await supabase.from("travel_request_collaborators").insert(selected.map(collaborator_id=>({travel_request_id:data.id,collaborator_id})));if(e2){setMessage("⚠ OS criada, mas houve erro ao vincular colaboradores.");setSaving(false);return}}setRequests(r=>[{id:data.id,...form},...r]);setForm({os:"",client_id:"",contract_id:"",state:"",city:"",manager_name:"",start_date:"",end_date:"",status:"draft"});setSelected([]);setMessage("✓ Solicitação salva como rascunho.");setSaving(false)}
 return <section className="content"><div className="module-head"><div><span className="eyebrow">NOVA SOLICITAÇÃO</span><h2>Solicitação de viagem</h2><p>Cadastre a OS e prepare o dossiê digital da viagem.</p></div></div><div className="request-layout"><form className="panel request-form" onSubmit={save}><div className="panel-head"><div><span className="eyebrow">1 · IDENTIFICAÇÃO</span><h3>Dados da OS</h3></div></div><div className="form-grid"><label>OS<input required value={form.os} onChange={e=>setForm({...form,os:e.target.value})}/></label><label>Gestor responsável<input value={form.manager_name} onChange={e=>setForm({...form,manager_name:e.target.value})}/></label><label>Cliente<select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value,contract_id:""})}><option value="">Selecione</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Contrato<select value={form.contract_id} onChange={e=>setForm({...form,contract_id:e.target.value})}><option value="">Selecione</option>{availableContracts.map(c=><option value={c.id} key={c.id}>{c.code?c.code+" — ":""}{c.name}</option>)}</select></label><label>Estado (UF)<input maxLength="2" value={form.state} onChange={e=>setForm({...form,state:e.target.value.toUpperCase()})}/></label><label>Cidade<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>Início<input type="date" required value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>Retorno<input type="date" required value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></label></div><div className="period-card"><span>PERÍODO</span><strong>{days?days+" dia(s)":"Informe as datas"}</strong></div><div className="panel-head section-gap"><div><span className="eyebrow">2 · EQUIPE</span><h3>Colaboradores</h3></div></div><div className="collab-picker">{collabs.map(c=><label className={selected.includes(c.id)?"check active":"check"} key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>toggle(c.id)}/><span><b>{c.name}</b><small>{c.cpf||"CPF não informado"}</small></span></label>)}</div>{message&&<div className="alert" role="status">{message}</div>}<button className="primary full" disabled={saving}>{saving?"Salvando…":"Salvar solicitação como rascunho"}</button></form><aside className="panel request-side"><span className="eyebrow">FLUXO DA OS</span><h3>Próximas etapas</h3><ol><li><b>Identificação</b><small>OS, cliente, contrato e período</small></li><li><b>Serviços</b><small>Passagem, hospedagem e veículo</small></li><li><b>Despesas</b><small>Refeições, lavanderia e Uber</small></li><li><b>Comprovantes</b><small>Anexos e conferência</small></li><li><b>Relatório</b><small>Consolidação final de custos</small></li></ol></aside></div><div className="panel request-list"><div className="panel-head"><div><span className="eyebrow">HISTÓRICO RECENTE</span><h3>Solicitações</h3></div></div><div className="table"><div className="tr th"><span>OS</span><span>Destino</span><span>Período</span><span>Status</span></div>{requests.map(r=><div className="tr" key={r.id}><span><b>{r.os}</b></span><span>{r.city||"—"}{r.state?" / "+r.state:""}</span><span>{r.start_date} → {r.end_date}</span><span className="pill">{r.status}</span><button className="text-btn" onClick={()=>onOpen(r.id)}>Abrir →</button></div>)}</div></div></section>
}


function RequestDossier({requestId,onBack}){
 const [tab,setTab]=useState("Resumo"),[data,setData]=useState(null),[collabs,setCollabs]=useState([]),[loading,setLoading]=useState(true);
 window.__dossierRequestId=requestId; window.__dossierDays=data?.days||0; const tabs=["Resumo","Passagens","Hospedagem","Veículo","Refeições","Lavanderia","Uber","Custos","Anexos","Relatório","Histórico"];
 useEffect(()=>{async function load(){const {data:r}=await supabase.from("travel_requests").select("id,os,state,city,manager_name,start_date,end_date,days,status,created_at,client_id,contract_id").eq("id",requestId).single();setData(r);const {data:c}=await supabase.from("travel_request_collaborators").select("collaborator_id,collaborators(id,name,cpf,birth_date)").eq("travel_request_id",requestId);setCollabs((c||[]).map(x=>x.collaborators).filter(Boolean));setLoading(false)}load()},[requestId]);
 if(loading)return <section className="content"><div className="center-box">Carregando dossiê…</div></section>;
 if(!data)return <section className="content"><div className="alert">⚠ Solicitação não encontrada.</div></section>;
 return <section className="content"><button className="back-btn" onClick={onBack}>← Voltar para solicitações</button><div className="dossier-head"><div><span className="eyebrow">DOSSIÊ DIGITAL</span><h2>OS {data.os}</h2><p>{data.city||"Destino não informado"}{data.state?" / "+data.state:""} · {data.start_date} → {data.end_date} · {data.days} dia(s)</p></div><span className="status-badge">{data.status}</span></div><div className="tabs">{tabs.map(t=><button className={tab===t?"tab active":"tab"} onClick={()=>setTab(t)} key={t}>{t}</button>)}</div>{tab==="Resumo"?<DossierSummary data={data} collabs={collabs}/>:tab==="Anexos"?<AttachmentsTab requestId={requestId}/>:<DossierPlaceholder tab={tab}/>}</section>
}

function DossierSummary({data,collabs}){return <div className="dossier-grid"><article className="panel"><span className="eyebrow">IDENTIFICAÇÃO</span><h3>Dados da viagem</h3><div className="detail-grid"><div><small>OS</small><b>{data.os}</b></div><div><small>Gestor</small><b>{data.manager_name||"—"}</b></div><div><small>Destino</small><b>{data.city||"—"}{data.state?" / "+data.state:""}</b></div><div><small>Período</small><b>{data.start_date} → {data.end_date}</b></div><div><small>Duração</small><b>{data.days} dia(s)</b></div><div><small>Status</small><b>{data.status}</b></div></div></article><article className="panel"><span className="eyebrow">EQUIPE</span><h3>Colaboradores ({collabs.length})</h3>{collabs.length?collabs.map(c=><div className="person-row" key={c.id}><div className="avatar small">{c.name.slice(0,2).toUpperCase()}</div><div><b>{c.name}</b><small>{c.cpf||"CPF não informado"}</small></div></div>):<p className="muted">Nenhum colaborador vinculado.</p>}</article><article className="panel"><span className="eyebrow">EXECUÇÃO</span><h3>Composição da viagem</h3><div className="dossier-checks"><div>○ Passagens <span>Aguardando lançamento</span></div><div>○ Hospedagem <span>Aguardando lançamento</span></div><div>○ Veículo <span>Aguardando lançamento</span></div><div>○ Despesas <span>Aguardando lançamento</span></div><div>○ Comprovantes <span>Aguardando anexos</span></div></div></article></div>}

function AttachmentsTab({requestId}) {
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[preview,setPreview]=useState(null),[role,setRole]=useState("");
 useEffect(()=>{load()},[requestId]);
 async function load(){const {data,error}=await supabase.from("attachments").select("id,file_name,mime_type,file_size,extraction_status,extracted_data,storage_path,created_at").eq("travel_request_id",requestId).order("created_at",{ascending:false});if(error)setError("Não foi possível carregar os anexos.");else setRows(data||[]);const {data:u}=await supabase.auth.getUser();if(u.user){const p=await supabase.from("profiles").select("role").eq("id",u.user.id).maybeSingle();setRole(p.data?.role||"requester")}}
 function fmt(n){return !n?"—":n<1048576?(n/1024).toFixed(1)+" KB":(n/1048576).toFixed(1)+" MB"}
 function normalize(v){return String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")}
 function num(v){if(typeof v==="number")return v;let s=String(v??"").replace(/R\\$|\\s/g,"");if(s.includes(",")&&s.includes("."))s=s.replace(/\\./g,"").replace(",",".");else s=s.replace(",",".");const n=Number(s.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0}
 function date(v){if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);return d?new Date(Date.UTC(d.y,d.m-1,d.d)).toISOString().slice(0,10):null}const s=String(v??"").trim();const m=s.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{2,4})$/);if(m)return (m[3].length===2?"20"+m[3]:m[3])+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");return /^\\d{4}-\\d{2}-\\d{2}$/.test(s)?s:null}
 function category(v){const x=normalize(v);if(/pass|ticket|aereo|onibus/.test(x))return "ticket";if(/hotel|hosped/.test(x))return "hotel";if(/bagag/.test(x))return "baggage";if(/veicul|locac/.test(x))return "vehicle";if(/pedag/.test(x))return "toll";if(/estacion/.test(x))return "parking";if(/combust|gasolina/.test(x))return "fuel";if(/refeic|almoco|jantar|cafe/.test(x))return "meal";if(/lavander/.test(x))return "laundry";if(/uber|99|taxi|transporte/.test(x))return "uber";return "other"}
 function extractRows(text){
   const lines=String(text||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
   const rows=[]; let currentCategory="other";
   for(let i=0;i<lines.length;i++){
     const line=lines[i], x=normalize(line);
     const cat=category(line); if(cat!=="other") currentCategory=cat;
     const amounts=line.match(/(?:R\\$\\s*)?-?\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d{2})|-?\\d+(?:[.,]\\d{2})/g)||[];
     const amount=amounts.length?Math.max(...amounts.map(num)):0;
     const dates=line.match(/\\b\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b/g)||[];
     const collaboratorMatch=line.match(/(?:colaborador|passageiro|hospede|nome)\\s*[:=-]\\s*([^|;]+)/i);
     const collaborator_name=collaboratorMatch?.[1]?.trim()||"";
     if(amount>0){
       const desc=line.replace(amounts.join(" "), " ").replace(/\\s{2,}/g," ").trim();
       rows.push({line:i+1,category:currentCategory,description:desc.slice(0,240),collaborator_name,cost_date:dates.length?date(dates[0]):null,amount});
     }
   }
   return rows;
 }
 async function readPdf(file){
   const pdfjs=await import("pdfjs-dist");
   const workerModule=await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
   pdfjs.GlobalWorkerOptions.workerSrc=workerModule.default;
   const buffer=await file.arrayBuffer();
   const pdf=await pdfjs.getDocument({data:buffer}).promise;
   const maxPages=Math.min(pdf.numPages,15);
   let text="";
   for(let pageNo=1;pageNo<=maxPages;pageNo++){
     setProgress("Lendo PDF — página "+pageNo+" de "+maxPages);
     const page=await pdf.getPage(pageNo);
     const content=await page.getTextContent();
     text+=content.items.map(item=>item.str||"").join(" ")+"\\n";
   }
   if(text.replace(/\\s/g,"").length>=80)return {text,method:"pdf-text",pages:pdf.numPages};
   const worker=await createOcrWorker();
   let ocr="";
   for(let pageNo=1;pageNo<=maxPages;pageNo++){
     setProgress("OCR do PDF — página "+pageNo+" de "+maxPages);
     const page=await pdf.getPage(pageNo);
     const viewport=page.getViewport({scale:1.5});
     const canvas=document.createElement("canvas"); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
     await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
     const result=await worker.recognize(canvas);
     ocr+=result.data.text+"\\n";
   }
   await worker.terminate();
   return {text:ocr,method:"pdf-ocr",pages:pdf.numPages};
 }
 async function createOcrWorker(){
   const {createWorker}=await import("tesseract.js");
   return createWorker("por");
 }
 async function readImage(file){
   const worker=await createOcrWorker();
   setProgress("Executando OCR da imagem…");
   const result=await worker.recognize(file);
   await worker.terminate();
   return {text:result.data.text,method:"image-ocr",pages:1};
 }
 async function extractAttachment(file){
   if(/\\.(xlsx?|csv)$/i.test(file.name))return null;
   if(file.type==="application/pdf"||/\\.pdf$/i.test(file.name))return readPdf(file);
   if(/^image\\//.test(file.type)||/\\.(jpe?g|png)$/i.test(file.name))return readImage(file);
   return null;
 }
 async function upload(e){
   const files=[...(e.target.files||[])]; if(!files.length)return;
   setBusy(true);setError("");setMessage("");
   try{
     for(const file of files){
       if(file.size>20*1024*1024){setError("O arquivo "+file.name+" ultrapassa o limite de 20 MB.");continue}
       const {data:u}=await supabase.auth.getUser(); if(!u.user)throw new Error("Sessão expirada.");
       const path=u.user.id+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
       const up=await supabase.storage.from("travel-attachments").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
       if(up.error)throw up.error;
       const ins=await supabase.from("attachments").insert({travel_request_id:requestId,file_name:file.name,mime_type:file.type,file_size:file.size,storage_path:path,uploaded_by:u.user.id,extraction_status:"pending"}).select("id").single();
       if(ins.error){await supabase.storage.from("travel-attachments").remove([path]);throw ins.error}
       let extracted=null;
       try{
         extracted=await extractAttachment(file);
         if(extracted){
           const rows=extractRows(extracted.text);
           await supabase.from("attachments").update({extracted_data:{source:extracted.method,pages:extracted.pages,text:extracted.text.slice(0,20000),rows}}).eq("id",ins.data.id);
           await supabase.from("attachments").update({extraction_status:"extracted"}).eq("id",ins.data.id);
         } else if(/\\.(xlsx?|csv)$/i.test(file.name)){
           const buffer=await file.arrayBuffer(); const wb=XLSX.read(buffer,{type:"array",cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; const json=XLSX.utils.sheet_to_json(ws,{defval:""}); const rows=json.map((r,i)=>{const keys=Object.keys(r);const find=k=>keys.find(key=>normalize(key).includes(k));const amountKey=find("valor")||find("amount")||find("custo")||find("cost")||find("preco")||find("total");const catKey=find("categoria")||find("category")||find("tipo");const dateKey=find("data")||find("date");const descKey=find("descricao")||find("description")||find("historico")||find("detalhe");const collabKey=find("colaborador")||find("passageiro")||find("nome");return {line:i+2,category:category(r[catKey]),description:String(r[descKey]||""),collaborator_name:String(r[collabKey]||""),cost_date:date(r[dateKey]),amount:num(r[amountKey])}}).filter(x=>x.amount>0||x.description||x.collaborator_name);await supabase.from("attachments").update({extracted_data:{source:"spreadsheet",rows}}).eq("id",ins.data.id);await supabase.from("attachments").update({extraction_status:"extracted"}).eq("id",ins.data.id)}
       }catch(ex){await supabase.from("attachments").update({extracted_data:{source:"extraction-error",error:ex.message}}).eq("id",ins.data.id);setError("O arquivo "+file.name+" foi anexado, mas a leitura automática falhou: "+ex.message)}
       setProgress("");
     }
     await load();
   }catch(ex){setError("Não foi possível processar os anexos: "+ex.message)}finally{setBusy(false);setProgress("");e.target.value=""}
 }
 async function openFile(row){const {data,error}=await supabase.storage.from("travel-attachments").createSignedUrl(row.storage_path,300);if(error)setError("Não foi possível abrir o arquivo.");else window.open(data.signedUrl,"_blank","noopener,noreferrer")}
 async function confirmImport(row){
   if(!(role==="admin"||role==="manager"))return;
   const rows=row.extracted_data?.rows||[]; if(!rows.length){setError("Nenhum lançamento financeiro foi identificado.");return}
   const {data:collabsData}=await supabase.from("collaborators").select("id,name"); const collaboratorMap=Object.fromEntries((collabsData||[]).map(c=>[normalize(c.name),c.id]));
   const {data:u}=await supabase.auth.getUser();
   const payload=rows.filter(x=>x.amount>0).map(x=>({travel_request_id:requestId,category:x.category||"other",description:x.description||("Importação: "+row.file_name),amount:x.amount,cost_date:x.cost_date||null,collaborator_id:collaboratorMap[normalize(x.collaborator_name)]||null,source:"attachment:"+row.id,created_by:u.user.id}));
   const ins=await supabase.from("costs").insert(payload); if(ins.error){setError("Não foi possível confirmar os custos: "+ins.error.message);return}
   const upd=await supabase.from("attachments").update({extraction_status:"confirmed"}).eq("id",row.id); if(upd.error){setError("Custos lançados, mas o status não foi atualizado.");return}
   setMessage("✓ "+payload.length+" lançamento(s) confirmado(s) no consolidado.");await load();setPreview(null)
 }
 async function remove(row){if(!confirm("Excluir o anexo “"+row.file_name+"”?"))return;await supabase.storage.from("travel-attachments").remove([row.storage_path]);await supabase.from("attachments").delete().eq("id",row.id);load()}
 return <div className="attachments-module"><div className="panel upload-panel"><div className="panel-head"><div><span className="eyebrow">COMPROVANTES / IMPORTAÇÃO</span><h3>Anexos da OS</h3><p className="muted">PDF, Excel, CSV, JPG e PNG · até 20 MB.</p></div><label className="primary upload-btn">＋ Adicionar arquivos<input type="file" multiple accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png" onChange={upload} disabled={busy}/></label></div>{busy&&<div className="alert">{progress||"Processando arquivo…"}</div>}{message&&<div className="success-note">{message}</div>}{error&&<div className="alert">⚠ {error}</div>}<div className="attachment-list">{rows.length?rows.map(r=><div className="attachment-row" key={r.id}><div className="file-icon">{/\\.(xlsx?|csv)$/i.test(r.file_name)?"XLS":"DOC"}</div><div className="file-main"><b>{r.file_name}</b><small>{fmt(r.file_size)} · {new Date(r.created_at).toLocaleString("pt-BR")}</small></div><span className="extract-status">{r.extraction_status==="pending"?"● Aguardando leitura":r.extraction_status==="extracted"?"● Pronto para conferência":r.extraction_status==="confirmed"?"● Confirmado":"● "+r.extraction_status}</span><div className="file-actions"><button className="text-btn" onClick={()=>openFile(r)}>Abrir</button>{r.extraction_status==="extracted"&&<button className="text-btn" onClick={()=>setPreview(r)}>Conferir</button>}<button className="danger-btn" onClick={()=>remove(r)}>Excluir</button></div></div>):<div className="empty">Nenhum comprovante anexado a esta OS.</div>}</div></div>{preview&&<div className="panel extraction-panel"><div className="panel-head"><div><span className="eyebrow">CONFERÊNCIA FINANCEIRA</span><h3>{preview.file_name}</h3></div><button className="close" onClick={()=>setPreview(null)}>×</button></div><p className="muted">Revise os valores abaixo. A confirmação cria registros no consolidado de custos.</p><div className="import-summary"><b>{preview.extracted_data?.rows?.length||0}</b><span>linhas identificadas</span><b>R$ {(preview.extracted_data?.rows||[]).reduce((s,x)=>s+(x.amount||0),0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</b><span>valor identificado</span></div><div className="import-table">{(preview.extracted_data?.rows||[]).slice(0,100).map((x,i)=><div className="import-row" key={i}><span>{x.line}</span><span>{x.category}</span><span>{x.description||"—"}</span><span>{x.collaborator_name||"—"}</span><b>R$ {(x.amount||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</b></div>)}</div>{(preview.extracted_data?.rows||[]).length>100&&<small className="muted">Exibindo as primeiras 100 linhas.</small>}{(role==="admin"||role==="manager")?<button className="primary full" onClick={()=>confirmImport(preview)}>Confirmar e lançar no consolidado</button>:<div className="alert">ℹ A confirmação financeira é realizada por gestor ou administrador.</div>}</div>}</div>
}
function DossierPlaceholder({tab}){return <div className="panel dossier-placeholder"><div className="module-icon">◆</div><span className="eyebrow">MÓDULO {tab.toUpperCase()}</span><h3>{tab}</h3><p>Estrutura reservada para o lançamento e consolidação desta etapa dentro do dossiê da OS.</p><span className="pill">Próxima implementação</span></div>
}

function Module({title}){return <section className="content"><div className="module-empty"><div className="module-icon">◆</div><h2>{title}</h2><p>Este módulo está preparado para receber a próxima etapa funcional da plataforma.</p></div></section>}

createRoot(document.getElementById("root")).render(<App/>);
