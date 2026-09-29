import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const menu = [
  ["dashboard","Dashboard"],
  ["requests","Solicitações"],
  ["people","Colaboradores"],
  ["costs","Custos"],
  ["reports","Relatórios"],
  ["files","Anexos"],
  ["history","Histórico"],
];

const stats = [
  ["OS abertas","12","Em acompanhamento"],
  ["Em andamento","7","Viagens ativas"],
  ["Pendentes","4","Aguardando ação"],
  ["Custo acumulado","R$ 48.620,40","Período atual"],
];

function App(){
  const [active,setActive]=useState("dashboard");
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(false);

  const title = useMemo(()=>menu.find(([id])=>id===active)?.[1] || "Dashboard",[active]);

  return <div className="app">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">B</div>
        <div><strong>PLATAFORMA</strong><span>Solicitação de Viagens</span></div>
      </div>
      <nav aria-label="Navegação principal">
        {menu.map(([id,label],i)=><button key={id} className={active===id?"nav-item active":"nav-item"} onClick={()=>setActive(id)}>
          <span className="nav-icon" aria-hidden="true">{["⌂","▣","♙","R$","▤","□","◷"][i]}</span>{label}
        </button>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot">●</span> Sistema operacional</div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">PLATAFORMA DE SOLICITAÇÃO DE VIAGENS</div><h1>{title}</h1></div>
        <div className="top-actions"><button className="icon-button" aria-label="Notificações">◔</button><div className="avatar" aria-label="Usuário">JS</div></div>
      </header>

      {active==="dashboard" ? <Dashboard search={search} setSearch={setSearch} onNew={()=>setModal(true)}/> :
       <Section title={title} onNew={active==="requests"||active==="people"?()=>setModal(true):undefined}/>}
    </main>

    {modal && <Modal active={active} onClose={()=>setModal(false)}/>}
  </div>
}

function Dashboard({search,setSearch,onNew}){
 return <section className="content">
   <div className="welcome"><div><h2>Visão geral</h2><p>Acompanhe suas solicitações e custos de viagem.</p></div><button className="primary" onClick={onNew}>＋ Nova solicitação</button></div>
   <div className="stats">{stats.map(([label,value,note])=><article className="stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
   <div className="grid">
     <article className="panel wide"><div className="panel-head"><div><h3>Solicitações recentes</h3><p>Últimas OS registradas</p></div><div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar OS, cliente..." aria-label="Pesquisar"/></div></div>
       <div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Destino</th><th>Período</th><th>Status</th></tr></thead><tbody>
       {[
        ["OS 9086","TRUSTED","Vinhedo - SP","16/09 — 26/09","Em andamento","progress"],
        ["OS 9078","AMAZON","Joinville - SC","22/09 — 26/09","Pendente","warning"],
        ["OS 8864","AMAZON","Salvador - BA","18/02 — 28/02","Programada","info"],
        ["OS 8862","TIM","Boa Vista - RR","18/02 — 28/02","Programada","info"],
       ].filter(r=>r.join(" ").toLowerCase().includes(search.toLowerCase())).map(r=><tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><span className={"badge "+r[5]}><i>{r[5]==="progress"?"✓":r[5]==="warning"?"⚠":"●"}</i>{r[4]}</span></td></tr>)}
       </tbody></table></div>
     </article>
     <article className="panel"><div className="panel-head"><div><h3>Acesso rápido</h3><p>Ações frequentes</p></div></div><div className="quick">
       <button onClick={onNew}><span>＋</span><div><b>Nova solicitação</b><small>Criar uma nova OS</small></div></button>
       <button><span>♙</span><div><b>Colaboradores</b><small>Consultar base</small></div></button>
       <button><span>▤</span><div><b>Relatórios</b><small>Analisar custos</small></div></button>
     </div></article>
   </div>
 </section>
}

function Section({title,onNew}){
 return <section className="content"><div className="welcome"><div><h2>{title}</h2><p>Módulo preparado para integração com os dados da plataforma.</p></div>{onNew&&<button className="primary" onClick={onNew}>＋ {title==="Colaboradores"?"Novo colaborador":"Nova solicitação"}</button>}</div><article className="panel empty"><div className="empty-icon">□</div><h3>Próxima etapa</h3><p>Este módulo será conectado às tabelas e permissões do Supabase.</p></article></section>
}

function Modal({active,onClose}){
 const isPeople=active==="people";
 return <div className="overlay"><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">CADASTRO</span><h2>{isPeople?"Novo colaborador":"Nova solicitação de viagem"}</h2></div><button className="close" onClick={onClose} aria-label="Fechar">×</button></div>
 {isPeople?<div className="form-grid"><Field label="Nome completo"/><Field label="CPF"/><Field label="Data de nascimento" type="date"/><Field label="Setor"/><Field label="UF"/></div>:<><div className="form-grid"><Field label="OS"/><Field label="Cliente"/><Field label="Contrato"/><Field label="Estado"/><Field label="Cidade"/><Field label="Gestor"/><Field label="Data inicial" type="date"/><Field label="Data final" type="date"/></div><div className="form-section"><b>Serviços da viagem</b><div className="checks">{["Passagem","Hospedagem","Veículo","Refeições","Lavanderia","Uber"].map(x=><label key={x}><input type="checkbox"/>{x}</label>)}</div></div></>}
 <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={onClose}>Salvar rascunho</button></div>
 </div></div>
}
function Field({label,type="text"}){return <label className="field"><span>{label}</span><input type={type} /></label>}

createRoot(document.getElementById("root")).render(<App/>);
