import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const nav=[["⌂","Dashboard"],["＋","Solicitações"],["●","Colaboradores"],["R$","Custos"],["▤","Relatórios"],["□","Anexos"],["◷","Histórico"]];
const stats=[["OS em andamento","08","Acompanhar"],["Pendentes","05","Revisar"],["Custo acumulado","R$ 48.620,40","Período atual"],["Colaboradores","126","Base ativa"]];

function App(){
 const [active,setActive]=useState("Dashboard");
 return <div className="app">
  <aside className="sidebar">
   <div className="brand"><span className="brand-mark">B</span><div><strong>PLATAFORMA</strong><small>Solicitação de Viagens</small></div></div>
   <nav>{nav.map(([icon,label])=><button className={active===label?"nav active":"nav"} onClick={()=>setActive(label)} key={label}><span>{icon}</span>{label}</button>)}</nav>
   <div className="access"><span className="status-dot"></span><div><b>Ambiente operacional</b><small>Dados protegidos</small></div></div>
  </aside>
  <main className="main">
   <header className="topbar"><div><span className="eyebrow">GESTÃO DE VIAGENS</span><h1>{active}</h1></div><div className="top-actions"><button className="icon-btn" aria-label="Notificações">♧</button><div className="user"><div className="avatar">JS</div><div><b>Jeferson</b><small>Administrador</small></div></div></div></header>
   {active==="Dashboard"?<Dashboard/>:<Module title={active}/>}
  </main>
 </div>
}

function Dashboard(){return <section className="content">
 <div className="hero"><div><span className="tag">VISÃO GERAL</span><h2>Controle suas viagens em um único lugar.</h2><p>Solicitações, colaboradores, custos e documentos organizados por OS.</p></div><button className="primary">＋ Nova solicitação</button></div>
 <div className="stats">{stats.map(([t,v,s])=><article className="stat" key={t}><span>{t}</span><strong>{v}</strong><small>{s}</small></article>)}</div>
 <div className="grid">
  <article className="panel wide"><div className="panel-head"><div><span className="eyebrow">ACOMPANHAMENTO</span><h3>Solicitações recentes</h3></div><button className="text-btn">Ver todas →</button></div>
   <div className="table"><div className="tr th"><span>OS</span><span>Cliente</span><span>Destino</span><span>Período</span><span>Status</span></div>
   {[["OS 9086","TRUSTED","Vinhedo / SP","16–26/09","Em andamento"],["OS 9078","TIM","Joinville / SC","22–26/09","Pendente"],["OS 5911","CORTEVA","Palmas / TO","20/09–13/10","Aprovada"]].map(r=><div className="tr" key={r[0]}>{r.map((x,i)=><span className={i===4?"pill":""} key={i}>{x}</span>)}</div>)}</div>
  </article>
  <article className="panel"><div className="panel-head"><div><span className="eyebrow">CUSTOS</span><h3>Distribuição</h3></div></div><div className="bars">{[["Hospedagem",38],["Passagens",27],["Veículo",18],["Refeições",11],["Outros",6]].map(([l,n])=><div className="bar-row" key={l}><div><span>{l}</span><b>{n}%</b></div><div className="bar"><i style={{width:n+"%"}}/></div></div>)}</div></article>
 </div>
 </section>}

function Module({title}){return <section className="content"><div className="module-empty"><div className="module-icon">◆</div><h2>{title}</h2><p>Este módulo está preparado para receber a próxima etapa funcional da plataforma.</p><button className="primary">＋ Nova solicitação</button></div></section>}

createRoot(document.getElementById("root")).render(<App/>);