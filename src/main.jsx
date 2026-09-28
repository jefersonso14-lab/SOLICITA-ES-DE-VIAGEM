import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {supabase} from "./lib/supabase";
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
 const [active,setActive]=useState("Dashboard"); const [profile,setProfile]=useState(null);
 useEffect(()=>{supabase.from("profiles").select("full_name,role").eq("id",session.user.id).maybeSingle().then(({data})=>setProfile(data));},[session.user.id]);
 const name=profile?.full_name||session.user.email?.split("@")[0]||"Usuário";
 return <div className="app"><aside className="sidebar"><div className="brand"><span className="brand-mark">B</span><div><strong>PLATAFORMA</strong><small>Solicitação de Viagens</small></div></div><nav>{nav.map(([icon,label])=><button className={active===label?"nav active":"nav"} onClick={()=>setActive(label)} key={label}><span>{icon}</span>{label}</button>)}</nav><button className="logout" onClick={()=>supabase.auth.signOut()}>↪ Sair</button></aside><main className="main"><header className="topbar"><div><span className="eyebrow">GESTÃO DE VIAGENS</span><h1>{active}</h1></div><div className="user"><div className="avatar">{name.slice(0,2).toUpperCase()}</div><div><b>{name}</b><small>{profile?.role||"Solicitante"}</small></div></div></header>{active==="Dashboard"?<Dashboard/>:active==="Colaboradores"?<Collaborators/>:<Module title={active}/>}</main></div>
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

function Module({title}){return <section className="content"><div className="module-empty"><div className="module-icon">◆</div><h2>{title}</h2><p>Este módulo está preparado para receber a próxima etapa funcional da plataforma.</p></div></section>}

createRoot(document.getElementById("root")).render(<App/>);
