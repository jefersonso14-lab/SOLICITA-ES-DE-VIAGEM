import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import {
  createCollaborator,
  createTravelRequest,
  ensureRequesterProfile,
  listClients,
  listCosts,
  createCost,
  listCostComposition,
  saveTravelService,
  generateMealsForRequest,
  listCollaborators,
  listContracts,
  listTravelRequests,
  syncTravelRequestCosts,
  listTravelRequestReports,
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  saveAttachmentExtraction,
  confirmAttachmentCost,
  loadTravelDossier,
  signIn,
  signOut
} from "./lib/api";
import { supabase } from "./lib/supabase";
import { readDocument } from "./lib/document-reader";
import "./styles.css";

const menu = [
  ["dashboard", "Dashboard"],
  ["requests", "Solicitações"],
  ["people", "Colaboradores"],
  ["costs", "Custos"],
  ["reports", "Relatórios"],
  ["files", "Anexos"],
  ["dossier", "Dossiê da OS"],
  ["history", "Histórico"]
];

const statusMap = {
  draft: ["Rascunho", "info", "●"],
  submitted: ["Enviada", "warning", "⚠"],
  approved: ["Aprovada", "success", "✓"],
  in_progress: ["Em andamento", "progress", "✓"],
  completed: ["Concluída", "success", "✓"],
  cancelled: ["Cancelada", "danger", "×"]
};

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) {
        setSession(data.session);
        try { setProfile(await ensureRequesterProfile()); } catch (error) { console.error(error); }
      }
      if (mounted) setLoading(false);
    };
    load();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); return; }
      ensureRequesterProfile().then(setProfile).catch((error) => console.error(error));
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  if (loading) return <div className="screen-center"><div className="loading-card">Carregando plataforma...</div></div>;
  if (!session) return <LoginScreen configured={Boolean(supabase)} />;
  return <AuthenticatedApp profile={profile} />;
}

function LoginScreen({ configured }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) throw result.error;
    } catch (err) { setError(err.message || "Não foi possível entrar."); }
    finally { setBusy(false); }
  }

  return <div className="login-screen"><div className="login-card">
    <div className="brand login-brand"><div className="brand-mark">B</div><div><strong>PLATAFORMA</strong><span>Solicitação de Viagens</span></div></div>
    <span className="eyebrow">ACESSO RESTRITO</span><h1>Entrar na plataforma</h1>
    <p className="login-subtitle">Use seu e-mail e senha cadastrados.</p>
    {!configured && <div className="notice error">Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente da aplicação.</div>}
    {error && <div className="notice error">{error}</div>}
    <form onSubmit={handleSubmit} className="login-form">
      <Field label="E-mail" value={email} onChange={setEmail} type="email" required />
      <Field label="Senha" value={password} onChange={setPassword} type="password" required />
      <button className="primary full" disabled={busy || !configured}>{busy ? "Entrando..." : "Entrar"}</button>
    </form>
  </div></div>;
}

function AuthenticatedApp({ profile }) {
  const [active, setActive] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [requests, setRequests] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [costs, setCosts] = useState([]);
  const [notice, setNotice] = useState("");
  const [costRefreshVersion, setCostRefreshVersion] = useState(0);
  const [reports, setReports] = useState([]);
  const [attachments, setAttachments] = useState([]);

  const title = useMemo(() => menu.find(([id]) => id === active)?.[1] || "Dashboard", [active]);
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  async function refreshRequests() {
    try { setRequests(await listTravelRequests()); }
    catch (error) { setNotice(error.message || "Erro ao consultar solicitações."); }
  }

  async function refreshCollaborators() {
    try {
      const result = await listCollaborators();
      if (result.error) throw result.error;
      setCollaborators(result.data || []);
    } catch (error) { setNotice(error.message || "Erro ao consultar colaboradores."); }
  }

  async function refreshAttachments() {
    try { setAttachments(await listAttachments()); }
    catch (error) { setNotice(error.message || "Erro ao consultar anexos."); }
  }

  async function refreshReports() {
    try { setReports(await listTravelRequestReports()); }
    catch (error) { setNotice(error.message || "Erro ao consultar relatórios."); }
  }

  async function refreshCosts() {
    try { setCosts(await listCosts()); }
    catch (error) { setNotice(error.message || "Erro ao consultar custos."); }
  }

  async function refreshCatalogs() {
    try {
      const [clientResult, contractResult] = await Promise.all([listClients(), listContracts()]);
      if (clientResult.error) throw clientResult.error;
      if (contractResult.error) throw contractResult.error;
      setClients(clientResult.data || []);
      setContracts(contractResult.data || []);
    } catch (error) { setNotice(error.message || "Erro ao consultar clientes e contratos."); }
  }

  useEffect(() => {
    refreshRequests(); refreshCollaborators(); refreshCatalogs(); refreshCosts(); refreshReports(); refreshAttachments();
  }, []);

  async function handleSaveRequest(form) {
    try {
      await createTravelRequest(form);
      setNotice("Solicitação criada como rascunho.");
      setModal(null);
      await refreshRequests();
    } catch (error) { setNotice(error.message || "Não foi possível salvar a solicitação."); }
  }

  async function handleSaveCost(form) {
    try {
      await createCost(form);
      setNotice("Custo lançado com sucesso.");
      setModal(null);
      await refreshCosts();
      await refreshReports();
    } catch (error) { setNotice(error.message || "Não foi possível lançar o custo."); }
  }

  async function handleSaveCollaborator(form) {
    try {
      await createCollaborator(form);
      setNotice("Colaborador cadastrado.");
      setModal(null);
      await refreshCollaborators();
    } catch (error) { setNotice(error.message || "Não foi possível cadastrar o colaborador."); }
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">B</div><div><strong>PLATAFORMA</strong><span>Solicitação de Viagens</span></div></div>
      <nav aria-label="Navegação principal">
        {menu.map(([id, label], i) => <button key={id} className={active === id ? "nav-item active" : "nav-item"} onClick={() => setActive(id)}>
          <span className="nav-icon" aria-hidden="true">{["⌂", "▣", "♙", "R$", "▤", "□", "▧", "◷"][i]}</span>{label}
        </button>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot">●</span> Sistema operacional</div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">PLATAFORMA DE SOLICITAÇÃO DE VIAGENS</div><h1>{title}</h1></div>
        <div className="top-actions">
          <span className="role-label">{profile?.full_name || "Usuário"} · {profile?.role || "requester"}</span>
          <button className="icon-button" aria-label="Sair" title="Sair" onClick={() => signOut()}>↪</button>
          <div className="avatar" aria-label="Usuário">{initials(profile?.full_name)}</div>
        </div>
      </header>

      {notice && <div className="global-notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {active === "dashboard" && <Dashboard requests={requests} costs={costs} search={search} setSearch={setSearch} onNew={() => setModal("request")} />}
      {active === "requests" && <Requests requests={requests} search={search} setSearch={setSearch} onNew={() => setModal("request")} />}
      {active === "people" && <People collaborators={collaborators} search={search} setSearch={setSearch} onNew={canManage ? () => setModal("people") : undefined} />}
      {active === "costs" && <Costs costs={costs} requests={requests} collaborators={collaborators} canManage={canManage} refreshVersion={costRefreshVersion} onCostsUpdated={refreshCosts} onNew={canManage ? () => setModal("cost") : undefined} onServices={canManage ? () => setModal("services") : undefined} />}
      {active === "reports" && <Reports reports={reports} costs={costs} collaborators={collaborators} clients={clients} contracts={contracts} />}
      {active === "files" && <Attachments attachments={attachments} requests={requests} collaborators={collaborators} canManage={canManage} onUploaded={refreshAttachments} onValidated={async () => { await Promise.all([refreshAttachments(), refreshCosts(), refreshReports()]); }} />}
      {active === "dossier" && <Dossier requests={requests} />}
      {!["dashboard", "requests", "people", "costs", "reports", "files", "dossier"].includes(active) && <Section title={title} />}
    </main>

    {modal === "request" && <RequestModal clients={clients} contracts={contracts} collaborators={collaborators} onClose={() => setModal(null)} onSave={handleSaveRequest} />}
    {modal === "people" && <CollaboratorModal onClose={() => setModal(null)} onSave={handleSaveCollaborator} />}
    {modal === "cost" && <CostModal requests={requests} collaborators={collaborators} onClose={() => setModal(null)} onSave={handleSaveCost} />}
    {modal === "services" && <ServiceModal requests={requests} collaborators={collaborators} onClose={() => setModal(null)} onSave={async (type, payload) => { try { if (type === "meal-batch") { const result = await generateMealsForRequest(payload.travel_request_id); setNotice(result.created ? result.created + " refeições geradas automaticamente para a OS." : "As refeições da OS já estavam compostas."); setModal(null); return; } await saveTravelService(type, payload); setNotice("Serviço registrado. A composição da OS foi atualizada."); setCostRefreshVersion(v => v + 1); await refreshCosts(); setModal(null); } catch (error) { setNotice(error.message || "Não foi possível registrar o serviço."); } }} />}
  </div>;
}

function Dashboard({ requests, costs, search, setSearch, onNew }) {
  const current = requests.filter((r) => !["completed", "cancelled"].includes(r.status));
  const inProgress = requests.filter((r) => r.status === "in_progress");
  const pending = requests.filter((r) => ["draft", "submitted"].includes(r.status));
  return <section className="content">
    <div className="welcome"><div><h2>Visão geral</h2><p>Acompanhe suas solicitações e custos de viagem.</p></div><button className="primary" onClick={onNew}>＋ Nova solicitação</button></div>
    <div className="stats">
      <Stat label="OS abertas" value={current.length} note="Em acompanhamento" />
      <Stat label="Em andamento" value={inProgress.length} note="Viagens ativas" />
      <Stat label="Pendentes" value={pending.length} note="Aguardando ação" />
      <Stat label="Custo acumulado" value={money(costs.reduce((sum, item) => sum + Number(item.amount || 0), 0))} note={costs.length + " lançamento(s)"} />
    </div>
    <RequestsTable requests={requests} search={search} setSearch={setSearch} />
  </section>;
}

function Requests({ requests, search, setSearch, onNew }) {
  return <section className="content"><div className="welcome"><div><h2>Solicitações</h2><p>Consulta das OS vinculadas ao usuário autenticado.</p></div><button className="primary" onClick={onNew}>＋ Nova solicitação</button></div><RequestsTable requests={requests} search={search} setSearch={setSearch} /></section>;
}

function RequestsTable({ requests, search, setSearch }) {
  const filtered = requests.filter((r) => [r.os, r.client?.name, r.city, r.state, r.manager_name, r.status].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <article className="panel wide"><div className="panel-head"><div><h3>Solicitações</h3><p>{filtered.length} registro(s) encontrado(s)</p></div><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar OS, cliente..." aria-label="Pesquisar" /></div></div>
    <div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Destino</th><th>Período</th><th>Status</th></tr></thead><tbody>
      {filtered.length ? filtered.map((r) => { const [label, cls, icon] = statusMap[r.status] || [r.status, "info", "●"]; return <tr key={r.id}><td><b>{r.os}</b></td><td>{r.client?.name || "—"}</td><td>{[r.city, r.state].filter(Boolean).join(" - ") || "—"}</td><td>{formatDate(r.start_date)} — {formatDate(r.end_date)}</td><td><span className={"badge " + cls}><i>{icon}</i>{label}</span></td></tr>; }) : <tr><td colSpan="5" className="table-empty">Nenhuma solicitação encontrada.</td></tr>}
    </tbody></table></div>
  </article>;
}

function People({ collaborators, search, setSearch, onNew }) {
  const filtered = collaborators.filter((p) => [p.name, p.cpf, p.sector, p.uf].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <section className="content"><div className="welcome"><div><h2>Colaboradores</h2><p>Base reutilizável para composição das viagens.</p></div>{onNew && <button className="primary" onClick={onNew}>＋ Novo colaborador</button>}</div>
    <article className="panel wide"><div className="panel-head"><div><h3>Base ativa</h3><p>{filtered.length} colaborador(es)</p></div><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar nome, CPF..." aria-label="Pesquisar colaboradores" /></div></div>
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Setor</th><th>UF</th></tr></thead><tbody>
        {filtered.length ? filtered.map((p) => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.cpf || "—"}</td><td>{formatDate(p.birth_date)}</td><td>{p.sector || "—"}</td><td>{p.uf || "—"}</td></tr>) : <tr><td colSpan="5" className="table-empty">Nenhum colaborador ativo encontrado.</td></tr>}
      </tbody></table></div>
    </article>
  </section>;
}

function Costs({ costs, requests, collaborators, canManage, refreshVersion, onCostsUpdated, onNew, onServices }) {
  const [selectedOs, setSelectedOs] = useState("");
  const [composition, setComposition] = useState(null);
  const [loadingComposition, setLoadingComposition] = useState(false);

  useEffect(() => {
    if (!selectedOs && requests[0]?.id) setSelectedOs(requests[0].id);
  }, [requests, selectedOs]);

  async function loadComposition() {
    if (!selectedOs) { setComposition(null); return; }
    setLoadingComposition(true);
    try { setComposition(await listCostComposition(selectedOs)); }
    catch { setComposition(null); }
    finally { setLoadingComposition(false); }
  }

  useEffect(() => { loadComposition(); }, [selectedOs, refreshVersion]);

  async function consolidate() {
    if (!selectedOs || !canManage) return;
    setLoadingComposition(true);
    try {
      const result = await syncTravelRequestCosts(selectedOs);
      setComposition(await listCostComposition(selectedOs));
      await onCostsUpdated?.();
      alert(`Custos consolidados: ${result.inserted || 0} lançamento(s) · ${money(result.total || 0)}`);
    } catch (error) {
      alert(error.message || "Não foi possível consolidar os custos.");
    } finally { setLoadingComposition(false); }
  }

  const allTotal = costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byCategory = costs.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const labels = { ticket: "Passagens", baggage: "Bagagem", hotel: "Hotel", vehicle: "Veículo", toll: "Pedágio", parking: "Estacionamento", fuel: "Combustível", meal: "Refeições", laundry: "Lavanderia", uber: "Uber", other: "Outros" };

  return <section className="content">
    <div className="welcome"><div><h2>Custos</h2><p>Consolidação financeira das solicitações acessíveis ao usuário.</p></div>{onServices && <button className="secondary" onClick={onServices}>＋ Compor OS</button>}{onNew && <button className="primary" onClick={onNew}>＋ Lançar custo</button>}</div>
    <div className="stats">
      <Stat label="Total dos lançamentos" value={money(allTotal)} note={costs.length + " lançamento(s)"} />
      <Stat label="Passagens" value={money(byCategory.ticket || 0)} note="Categoria ticket" />
      <Stat label="Hospedagem" value={money(byCategory.hotel || 0)} note="Categoria hotel" />
      <Stat label="Outros" value={money((byCategory.other || 0) + (byCategory.uber || 0) + (byCategory.vehicle || 0))} note="Outras categorias" />
    </div>
    <article className="panel wide"><div className="panel-head"><div><h3>Composição automática por OS</h3><p>O total considera custos manuais e serviços estruturados da OS.</p></div><div className="cost-actions"><SelectField label="" value={selectedOs} onChange={setSelectedOs} options={requests.map(r => [r.id, r.os + " — " + [r.city,r.state].filter(Boolean).join("/")])} placeholder="Selecione a OS" />{canManage && <button className="primary" onClick={consolidate} disabled={!selectedOs || loadingComposition}>Consolidar custos da OS</button>}</div></div>
      {loadingComposition ? <p>Calculando composição...</p> : composition ? <div className="cost-composition">
        <div className="composition-total"><span>Total da OS</span><strong>{money(composition.total)}</strong></div>
        <div className="composition-grid">{Object.entries(composition.byCategory).map(([key,value]) => <div className="composition-item" key={key}><span>{({ticket:"Passagens",baggage:"Bagagem",hotel:"Hotel",vehicle:"Veículo",toll:"Pedágio",parking:"Estacionamento",other:"Outros",meal:"Refeições",laundry:"Lavanderia",uber:"Uber",fuel:"Combustível"})[key] || key}</span><b>{money(value)}</b></div>)}</div>
        {Object.keys(composition.byCollaborator || {}).length > 0 && <div className="collaborator-costs"><h4>Custo por colaborador</h4>{Object.entries(composition.byCollaborator).map(([id,value]) => <div className="collaborator-cost-row" key={id}><span>{collaborators.find(c => c.id === id)?.name || "Não identificado"}</span><b>{money(value)}</b></div>)}</div>}
      </div> : <p>Selecione uma OS para calcular.</p>}
    </article>
    <article className="panel wide"><div className="panel-head"><div><h3>Lançamentos</h3><p>Valores financeiros seguem controle por perfil.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>OS</th><th>Categoria</th><th>Descrição</th><th>Data</th><th>Valor</th><th>Origem</th></tr></thead><tbody>
        {costs.length ? costs.map((c) => <tr key={c.id}><td><b>{c.travel_request?.os || requests.find(r => r.id === c.travel_request_id)?.os || "—"}</b></td><td>{labels[c.category] || c.category}</td><td>{c.description || "—"}</td><td>{formatDate(c.cost_date)}</td><td><b>{money(c.amount)}</b></td><td>{c.source || "manual"}</td></tr>) : <tr><td colSpan="6" className="table-empty">Nenhum custo lançado.</td></tr>}
      </tbody></table></div>
    </article>
  </section>;
}

function ServiceModal({ requests, collaborators, onClose, onSave }) {
  const [type,setType]=useState("ticket");
  const [form,setForm]=useState({travel_request_id:requests[0]?.id||"", collaborator_id:"", cost:"", description:"", baggage_included:false, baggage_quantity:0, provider:"", check_in:"", check_out:"", rental_cost:"", toll_cost:"", parking_cost:"", other_cost:"", required:true, conductor_name:"", meal_date:"", meal_type:"lunch", uf:"SP", unit_cost:"", quantity:1, period_days:"", amount:"", expense_date:""});
  const selectedRequest = requests.find(r => r.id === form.travel_request_id);
  const requestDays = Number(selectedRequest?.days || 0);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  useEffect(() => {
    if (type !== "meal") return;
    const defaults = { breakfast: 15, lunch: form.uf === "SP" ? 32 : form.uf === "RJ" ? 35 : 0, dinner: form.uf === "SP" || form.uf === "RJ" ? 35 : 0 };
    setForm(f => ({ ...f, unit_cost: String(defaults[f.meal_type] || f.unit_cost || "") }));
  }, [type, form.meal_type, form.uf]);
  const submit=e=>{e.preventDefault(); const p={travel_request_id:form.travel_request_id}; if(form.collaborator_id)p.collaborator_id=form.collaborator_id;
    if(type==="ticket") Object.assign(p,{cost:Number(form.cost||0),description:form.description||null,baggage_included:form.baggage_included,baggage_quantity:Number(form.baggage_quantity||0)});
    if(type==="accommodation") Object.assign(p,{cost:Number(form.cost||0),provider:form.provider||null,check_in:form.check_in||null,check_out:form.check_out||null});
    if(type==="vehicle") Object.assign(p,{required:form.required,conductor_name:form.conductor_name||null,rental_cost:Number(form.rental_cost||0),toll_cost:Number(form.toll_cost||0),parking_cost:Number(form.parking_cost||0),other_cost:Number(form.other_cost||0)});
    if(type==="meal") Object.assign(p,{meal_date:form.meal_date||null,meal_type:form.meal_type,uf:form.uf,unit_cost:Number(form.unit_cost||0),quantity:Number(form.quantity||1)});
    if(type==="laundry") {
      const days = requestDays || Number(form.period_days || 0);
      if (days <= 7) { setForm(f => ({...f, period_days: ""})); return; }
      Object.assign(p,{period_days:days,cost:Number(form.cost||0)});
    }
    if(type==="uber") Object.assign(p,{expense_date:form.expense_date||null,amount:Number(form.amount||0),description:form.description||null});
    onSave(type,p);
  };
  const title={ticket:"Passagem",accommodation:"Hospedagem",vehicle:"Veículo",meal:"Refeição",laundry:"Lavanderia",uber:"Uber"}[type];
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">COMPOSIÇÃO DA OS</span><h3>{title}</h3></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
    <SelectField label="OS" value={form.travel_request_id} onChange={v=>set("travel_request_id",v)} options={requests.map(r=>[r.id,r.os+" — "+[r.city,r.state].filter(Boolean).join("/")])} required />
    <SelectField label="Tipo de serviço" value={type} onChange={setType} options={[["ticket","Passagem"],["accommodation","Hospedagem"],["vehicle","Veículo"],["meal","Refeição"],["laundry","Lavanderia"],["uber","Uber"]]} />
    {selectedRequest && <div className="notice"><b>Período da OS:</b> {requestDays} dia(s) · {formatDate(selectedRequest.start_date)} a {formatDate(selectedRequest.end_date)}</div>}
    {["ticket","meal","laundry","uber"].includes(type) && <SelectField label="Colaborador" value={form.collaborator_id} onChange={v=>set("collaborator_id",v)} options={collaborators.map(x=>[x.id,x.name])} placeholder="Sem colaborador" />}
    {type==="ticket" && <><Field label="Valor da passagem" type="number" step="0.01" value={form.cost} onChange={v=>set("cost",v)} required /><Field label="Descrição" value={form.description} onChange={v=>set("description",v)} /><label className="check"><input type="checkbox" checked={form.baggage_included} onChange={e=>set("baggage_included",e.target.checked)}/> Bagagem incluída</label>{form.baggage_included&&<Field label="Quantidade de bagagens" type="number" value={form.baggage_quantity} onChange={v=>set("baggage_quantity",v)}/>}</>}
    {type==="accommodation" && <><Field label="Fornecedor" value={form.provider} onChange={v=>set("provider",v)}/><Field label="Check-in" type="date" value={form.check_in} onChange={v=>set("check_in",v)}/><Field label="Check-out" type="date" value={form.check_out} onChange={v=>set("check_out",v)}/><Field label="Custo" type="number" step="0.01" value={form.cost} onChange={v=>set("cost",v)} required /></>}
    {type==="vehicle" && <><label className="check"><input type="checkbox" checked={form.required} onChange={e=>set("required",e.target.checked)}/> Veículo necessário</label>{form.required&&<><Field label="Condutor" value={form.conductor_name} onChange={v=>set("conductor_name",v)}/><Field label="Locação" type="number" step="0.01" value={form.rental_cost} onChange={v=>set("rental_cost",v)}/><Field label="Pedágio" type="number" step="0.01" value={form.toll_cost} onChange={v=>set("toll_cost",v)}/><Field label="Estacionamento" type="number" step="0.01" value={form.parking_cost} onChange={v=>set("parking_cost",v)}/><Field label="Outros" type="number" step="0.01" value={form.other_cost} onChange={v=>set("other_cost",v)}/></>}</>}
    {type==="meal" && <><button type="button" className="secondary full" onClick={() => onSave("meal-batch",{travel_request_id:form.travel_request_id})}>Gerar refeições de todo o período da OS</button><small className="helper">Serão criados café da manhã, almoço e jantar para cada colaborador da OS. Registros já existentes não serão duplicados.</small><Field label="Data" type="date" value={form.meal_date} onChange={v=>set("meal_date",v)}/><SelectField label="Refeição" value={form.meal_type} onChange={v=>set("meal_type",v)} options={[["breakfast","Café da manhã"],["lunch","Almoço"],["dinner","Jantar"]]} /><SelectField label="UF" value={form.uf} onChange={v=>set("uf",v)} options={["SP","RJ","MG","PR","SC","RS","BA","PE","CE","AM","PA","GO","DF"].map(x=>[x,x])}/><Field label="Valor unitário" type="number" step="0.01" value={form.unit_cost} onChange={v=>set("unit_cost",v)} required/><Field label="Quantidade" type="number" value={form.quantity} onChange={v=>set("quantity",v)} /></>}
    {type==="laundry" && <><div className="notice"><b>Regra:</b> lavanderia disponível somente para períodos superiores a 7 dias. Período da OS: {requestDays} dia(s).</div><Field label="Período (dias)" type="number" min="8" value={form.period_days} onChange={v=>set("period_days",v)} required/><Field label="Custo" type="number" step="0.01" value={form.cost} onChange={v=>set("cost",v)} required/></>}
    {type==="uber" && <><Field label="Data" type="date" value={form.expense_date} onChange={v=>set("expense_date",v)}/><Field label="Valor" type="number" step="0.01" value={form.amount} onChange={v=>set("amount",v)} required/><Field label="Descrição" value={form.description} onChange={v=>set("description",v)}/></>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Salvar serviço</button></div>
  </form></div>;
}

function CostModal({ requests, collaborators, onClose, onSave }) {
  const [form, setForm] = useState({ travel_request_id: "", category: "ticket", description: "", amount: "", cost_date: "", collaborator_id: "", source: "manual" });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!form.travel_request_id || !form.category || Number(form.amount) < 0) return;
    setBusy(true); await onSave(form); setBusy(false);
  }
  const categories = [["ticket","Passagem"],["baggage","Bagagem"],["hotel","Hotel"],["vehicle","Veículo"],["toll","Pedágio"],["parking","Estacionamento"],["fuel","Combustível"],["meal","Refeição"],["laundry","Lavanderia"],["uber","Uber"],["other","Outros"]];
  return <ModalShell title="Lançar custo" onClose={onClose}><form onSubmit={submit}>
    <div className="form-grid">
      <SelectField label="OS" value={form.travel_request_id} onChange={v => set("travel_request_id", v)} options={requests.map(r => [r.id, r.os + " — " + [r.city,r.state].filter(Boolean).join("/")])} placeholder="Selecione a OS" />
      <SelectField label="Categoria" value={form.category} onChange={v => set("category", v)} options={categories} placeholder="Selecione" />
      <Field label="Valor (R$)" type="number" value={form.amount} onChange={v => set("amount", v)} />
      <Field label="Data" type="date" value={form.cost_date} onChange={v => set("cost_date", v)} />
      <SelectField label="Colaborador (opcional)" value={form.collaborator_id} onChange={v => set("collaborator_id", v)} options={collaborators.map(p => [p.id, p.name])} placeholder="Todos / não informado" />
      <Field label="Origem" value={form.source} onChange={v => set("source", v)} />
    </div>
    <div className="form-section"><Field label="Descrição" value={form.description} onChange={v => set("description", v)} /></div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar custo"}</button></div>
  </form></ModalShell>;
}

function Reports({ reports, costs, collaborators, clients, contracts }) {
  const [filters, setFilters] = useState({ start: "", end: "", client: "", contract: "", os: "", collaborator: "" });
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const filtered = useMemo(() => reports.filter(r => {
    const inStart = !filters.start || r.end_date >= filters.start;
    const inEnd = !filters.end || r.start_date <= filters.end;
    const inClient = !filters.client || r.client_id === filters.client;
    const inContract = !filters.contract || r.contract_id === filters.contract;
    const inOs = !filters.os || String(r.os || "").toLowerCase().includes(filters.os.toLowerCase());
    const requestCosts = costs.filter(c => c.travel_request_id === r.travel_request_id);
    const inCollaborator = !filters.collaborator || requestCosts.some(c => c.collaborator_id === filters.collaborator);
    return inStart && inEnd && inClient && inContract && inOs && inCollaborator;
  }), [reports, costs, filters]);
  const total = filtered.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
  const filteredIds = new Set(filtered.map(r => r.travel_request_id));
  const categoryTotals = costs.filter(c => filteredIds.has(c.travel_request_id)).reduce((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + Number(c.amount || 0); return acc;
  }, {});
  const collaboratorTotals = costs.filter(c => filteredIds.has(c.travel_request_id) && c.collaborator_id).reduce((acc, c) => {
    acc[c.collaborator_id] = (acc[c.collaborator_id] || 0) + Number(c.amount || 0); return acc;
  }, {});
  const labels = { ticket:"Passagens", baggage:"Bagagem", hotel:"Hotel", vehicle:"Veículo", toll:"Pedágio", parking:"Estacionamento", fuel:"Combustível", meal:"Refeições", laundry:"Lavanderia", uber:"Uber", other:"Outros" };
  function exportXlsx() {
    const rows = filtered.map(r => ({ OS:r.os, Cliente:r.client_name || "—", Contrato:[r.contract_code,r.contract_name].filter(Boolean).join(" — ") || "—", Estado:r.state || "—", Cidade:r.city || "—", Gestor:r.manager_name || "—", Inicio:r.start_date || "", Fim:r.end_date || "", Dias:r.days || 0, Status:statusMap[r.status]?.[0] || r.status || "—", "Custo total":Number(r.total_cost || 0), "Itens de custo":r.cost_items || 0 }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, "relatorio-custos-viagens.xlsx");
  }
  return <section className="content">
    <div className="welcome"><div><h2>Relatórios</h2><p>Consulta consolidada por período, cliente, contrato, OS e colaborador.</p></div><div className="report-actions"><button className="secondary" onClick={() => setFilters({start:"",end:"",client:"",contract:"",os:"",collaborator:""})}>Limpar filtros</button><button className="primary" onClick={exportXlsx} disabled={!filtered.length}>Exportar XLSX</button></div></div>
    <article className="panel wide"><div className="report-filters">
      <Field label="Período inicial" type="date" value={filters.start} onChange={v => setFilter("start",v)} />
      <Field label="Período final" type="date" value={filters.end} onChange={v => setFilter("end",v)} />
      <SelectField label="Cliente" value={filters.client} onChange={v => setFilter("client",v)} options={clients.map(c => [c.id,c.name])} placeholder="Todos" />
      <SelectField label="Contrato" value={filters.contract} onChange={v => setFilter("contract",v)} options={contracts.filter(c => !filters.client || c.client_id === filters.client).map(c => [c.id,c.code ? c.code + " — " + c.name : c.name])} placeholder="Todos" />
      <Field label="OS" value={filters.os} onChange={v => setFilter("os",v)} />
      <SelectField label="Colaborador" value={filters.collaborator} onChange={v => setFilter("collaborator",v)} options={collaborators.map(c => [c.id,c.name])} placeholder="Todos" />
    </div></article>
    <div className="stats"><Stat label="Custo total" value={money(total)} note={filtered.length + " OS"} /><Stat label="Quantidade de OS" value={filtered.length} note="Resultado filtrado" /><Stat label="Média por OS" value={money(filtered.length ? total / filtered.length : 0)} note="Custo médio" /><Stat label="Itens de custo" value={filtered.reduce((sum,r) => sum + Number(r.cost_items || 0),0)} note="Lançamentos consolidados" /></div>
    <article className="panel wide"><div className="panel-head"><div><h3>Resumo por OS</h3><p>{filtered.length} registro(s)</p></div></div><div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Destino</th><th>Período</th><th>Status</th><th>Custo</th></tr></thead><tbody>
      {filtered.length ? filtered.map(r => <tr key={r.travel_request_id}><td><b>{r.os}</b></td><td>{r.client_name || "—"}</td><td>{[r.city,r.state].filter(Boolean).join(" - ") || "—"}</td><td>{formatDate(r.start_date)} — {formatDate(r.end_date)}</td><td>{statusMap[r.status]?.[0] || r.status || "—"}</td><td><b>{money(r.total_cost)}</b></td></tr>) : <tr><td colSpan="6" className="table-empty">Nenhum relatório encontrado.</td></tr>}
    </tbody></table></div></article>
    <div className="report-columns">
      <article className="panel"><div className="panel-head"><div><h3>Custos por categoria</h3><p>Resultado filtrado.</p></div></div><div className="report-list">{Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1]).map(([key,value])=><div className="report-row" key={key}><span>{labels[key] || key}</span><b>{money(value)}</b></div>)}{!Object.keys(categoryTotals).length && <p>Nenhum custo.</p>}</div></article>
      <article className="panel"><div className="panel-head"><div><h3>Custo por colaborador</h3><p>Valores vinculados aos lançamentos.</p></div></div><div className="report-list">{Object.entries(collaboratorTotals).sort((a,b)=>b[1]-a[1]).map(([id,value])=><div className="report-row" key={id}><span>{collaborators.find(c=>c.id===id)?.name || "Não identificado"}</span><b>{money(value)}</b></div>)}{!Object.keys(collaboratorTotals).length && <p>Nenhum custo vinculado a colaborador.</p>}</div></article>
    </div>
  </section>;
}

function Attachments({ attachments, requests, collaborators, canManage, onUploaded, onValidated }) {
  const [os, setOs] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [fields, setFields] = useState({});
  const [reviewBusy, setReviewBusy] = useState(false);
  const visible = os ? attachments.filter(a => a.travel_request_id === os) : attachments;
  async function submit(event) {
    event.preventDefault();
    if (!os || !file) return;
    setBusy(true);
    try {
      const attachment = await uploadAttachment({ travelRequestId: os, file });
      try {
        const request = requests.find(item => item.id === os);
        const extracted = await readDocument(file, { os: request?.os || "" });
        await saveAttachmentExtraction(attachment.id, extracted);
        setReviewing(attachment.id); setFields({ ...extracted.fields, collaborator_id: "" });
      } catch (error) {
        console.error("Falha ao ler documento", error);
        alert(`Arquivo armazenado. A leitura automática falhou: ${error.message || "tente novamente"}`);
      }
      setFile(null);
      event.target.reset();
      await onUploaded();
    } catch (error) { alert(error.message || "Não foi possível enviar o anexo."); }
    finally { setBusy(false); }
  }
  async function openFile(item) {
    try {
      const blob = await downloadAttachment(item.storage_path);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { alert(error.message || "Não foi possível abrir o arquivo."); }
  }
  async function startReview(item) {
    setBusy(true);
    try {
      const blob = await downloadAttachment(item.storage_path);
      const fileCopy = new File([blob], item.file_name, { type: item.mime_type || blob.type });
      const request = requests.find(requestItem => requestItem.id === item.travel_request_id);
      const extracted = await readDocument(fileCopy, { os: request?.os || "" });
      await saveAttachmentExtraction(item.id, extracted);
      setFields({ ...extracted.fields, collaborator_id: "" }); setReviewing(item.id);
      await onUploaded();
    } catch (error) { alert(error.message || "Não foi possível extrair os dados."); }
    finally { setBusy(false); }
  }
  async function confirmReview(event) {
    event.preventDefault(); setReviewBusy(true);
    try {
      await confirmAttachmentCost(reviewing, fields);
      setReviewing(null); setFields({});
      await onValidated?.();
      alert("Dados confirmados e custo vinculado ao documento.");
    } catch (error) { alert(error.message || "Não foi possível confirmar os dados."); }
    finally { setReviewBusy(false); }
  }
  return <section className="content">
    <div className="welcome"><div><h2>Anexos</h2><p>Documentos vinculados às OS com armazenamento privado.</p></div></div>
    <article className="panel wide"><form onSubmit={submit} className="attachment-upload">
      <SelectField label="OS" value={os} onChange={setOs} options={requests.map(r => [r.id, r.os + " — " + ([r.city,r.state].filter(Boolean).join(" / ") || "Sem destino")])} placeholder="Selecione a OS" />
      <Field label="Arquivo" type="file" accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png" onChange={v => setFile(v?.[0] || null)} />
      <button className="primary" disabled={busy || !os || !file}>{busy ? "Enviando..." : "Enviar arquivo"}</button>
    </form><small className="helper">PDF, JPG, PNG, CSV, XLS e XLSX · limite de 15 MB. A confirmação financeira é restrita a gestores.</small></article>
    <article className="panel wide"><div className="panel-head"><div><h3>Arquivos armazenados</h3><p>{visible.length} arquivo(s)</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Arquivo</th><th>OS</th><th>Tipo</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>
        {visible.length ? visible.map(item => <tr key={item.id}><td><b>{item.file_name}</b></td><td>{requests.find(r=>r.id===item.travel_request_id)?.os || "—"}</td><td>{item.mime_type || "—"}</td><td>{item.extraction_status === "extracted" ? "Aguardando conferência" : item.extraction_status === "confirmed" ? "Confirmado" : item.extraction_status || "pending"}</td><td>{formatDateTime(item.created_at)}</td><td className="attachment-actions"><button className="secondary small" onClick={() => openFile(item)}>Abrir</button>{canManage && item.extraction_status !== "confirmed" && <button className="secondary small" disabled={busy} onClick={() => startReview(item)}>Conferir</button>}</td></tr>) : <tr><td colSpan="6" className="table-empty">Nenhum anexo encontrado.</td></tr>}
      </tbody></table></div>
    </article>
    {reviewing && <article className="panel wide extraction-review"><div className="panel-head"><div><h3>Conferência antes do lançamento</h3><p>Revise e corrija os campos; o documento sozinho não altera custos.</p></div><button className="secondary" onClick={() => setReviewing(null)}>Fechar</button></div>
      <form onSubmit={confirmReview}>
        <div className="report-filters">
          <Field label="Valor (R$)" type="number" step="0.01" min="0.01" required value={fields.amount ?? ""} onChange={value => setFields(current => ({ ...current, amount: value }))} />
          <Field label="Data do documento" type="date" value={fields.date || ""} onChange={value => setFields(current => ({ ...current, date: value }))} />
          <Field label="Fornecedor" value={fields.supplier || ""} onChange={value => setFields(current => ({ ...current, supplier: value }))} />
          <Field label="Número do documento" value={fields.document_number || ""} onChange={value => setFields(current => ({ ...current, document_number: value }))} />
          <Field label="CPF/CNPJ" value={fields.tax_id || ""} onChange={value => setFields(current => ({ ...current, tax_id: value }))} />
          <SelectField label="Categoria" value={fields.category || "other"} onChange={value => setFields(current => ({ ...current, category: value }))} options={[["ticket","Passagem"],["hotel","Hospedagem"],["vehicle","Veículo"],["meal","Refeição"],["laundry","Lavanderia"],["uber","Uber"],["fuel","Combustível"],["other","Outros"]]} />
          <SelectField label="Colaborador" value={fields.collaborator_id || ""} onChange={value => setFields(current => ({ ...current, collaborator_id: value }))} options={collaborators.map(person => [person.id, person.name])} placeholder="Não identificado" />
          <Field label="OS" value={requests.find(request => request.id === attachments.find(item => item.id === reviewing)?.travel_request_id)?.os || ""} disabled />
        </div>
        <div className="modal-actions"><button type="submit" className="primary" disabled={reviewBusy}>{reviewBusy ? "Confirmando..." : "Confirmar e lançar custo"}</button></div>
      </form>
    </article>}
  </section>;
}

function Dossier({ requests }) {
  const [requestId, setRequestId] = useState("");
  const [dossier, setDossier] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!requestId && requests[0]?.id) setRequestId(requests[0].id); }, [requests, requestId]);
  useEffect(() => {
    if (!requestId) return;
    let active = true; setBusy(true);
    loadTravelDossier(requestId).then(value => { if (active) setDossier(value); })
      .catch(error => { if (active) { setDossier(null); alert(error.message || "Não foi possível carregar o dossiê."); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [requestId]);
  const request = dossier?.request;
  const serviceGroups = [
    ["Passagens", dossier?.tickets || [], item => item.description || item.provider || "Passagem"],
    ["Hospedagem", dossier?.lodging || [], item => item.provider || "Hospedagem"],
    ["Veículos", dossier?.vehicles || [], item => item.description || "Veículo"],
    ["Refeições", dossier?.meals || [], item => item.meal_type || "Refeição"],
    ["Lavanderia", dossier?.laundry || [], item => `${item.period_days || ""} dias`],
    ["Uber", dossier?.uber || [], item => item.description || "Uber"]
  ];
  return <section className="content"><div className="welcome"><div><h2>Dossiê da OS</h2><p>Solicitação, pessoas, serviços, documentos, custos e total consolidado.</p></div><div className="cost-actions"><SelectField label="OS" value={requestId} onChange={setRequestId} options={requests.map(item => [item.id, item.os + " — " + [item.city,item.state].filter(Boolean).join("/")])} placeholder="Selecione a OS" /></div></div>
    {busy && <article className="panel">Carregando dossiê...</article>}
    {request && !busy && <><div className="stats"><Stat label="OS" value={request.os} note={statusMap[request.status]?.[0] || request.status} /><Stat label="Destino" value={[request.city,request.state].filter(Boolean).join(" / ") || "—"} note={`${formatDate(request.start_date)} — ${formatDate(request.end_date)}`} /><Stat label="Colaboradores" value={dossier.collaborators.length} note="Vinculados à solicitação" /><Stat label="Total consolidado" value={money(dossier.total)} note={`${dossier.costs.length} custo(s) confirmados`} /></div>
      <article className="panel wide"><div className="panel-head"><div><h3>Solicitação e equipe</h3><p>{request.client?.name || "Cliente não informado"} · {[request.contract?.code,request.contract?.name].filter(Boolean).join(" — ") || "Sem contrato"}</p></div></div><div className="dossier-people">{dossier.collaborators.length ? dossier.collaborators.map(person => <span className="badge info" key={person.id}>{person.name}{person.cpf ? ` · ${person.cpf}` : ""}</span>) : <span>Nenhum colaborador vinculado.</span>}</div></article>
      <div className="report-columns">{serviceGroups.map(([label, items, description]) => <article className="panel" key={label}><div className="panel-head"><div><h3>{label}</h3><p>{items.length} registro(s)</p></div></div>{items.map((item,index) => <div className="report-row" key={item.id || index}><span>{description(item)}</span><b>{money(item.amount ?? item.cost ?? item.rental_cost ?? item.unit_cost ?? 0)}</b></div>)}{!items.length && <p>Sem registros.</p>}</article>)}</div>
      <article className="panel wide"><div className="panel-head"><div><h3>Custos confirmados</h3><p>Somente lançamentos financeiros salvos, com documento de origem quando disponível.</p></div></div><div className="table-wrap"><table><thead><tr><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Data</th><th>Origem</th></tr></thead><tbody>{dossier.costs.map(cost => <tr key={cost.id}><td>{cost.category}</td><td>{cost.description || "—"}</td><td>{money(cost.amount)}</td><td>{formatDate(cost.cost_date)}</td><td>{dossier.attachments.find(item => item.cost_id === cost.id)?.file_name || cost.source || "Manual"}</td></tr>)}{!dossier.costs.length && <tr><td colSpan="5" className="table-empty">Nenhum custo consolidado.</td></tr>}</tbody></table></div></article>
      <div className="report-columns"><article className="panel"><div className="panel-head"><div><h3>Anexos e validação</h3><p>Estados da extração e conferência.</p></div></div>{dossier.attachments.map(item => <div className="report-row" key={item.id}><span>{item.file_name}</span><b>{item.extraction_status || "pending"}</b></div>)}{!dossier.attachments.length && <p>Sem anexos.</p>}</article><article className="panel"><div className="panel-head"><div><h3>Histórico</h3><p>Criação e validações registradas.</p></div></div>{dossier.history.map((event,index) => <div className="report-row" key={index}><span>{event.label}</span><b>{formatDateTime(event.date)}</b></div>)}</article></div>
      <article className="panel wide"><div className="panel-head"><div><h3>Resumo para relatório</h3><p>Mesma composição financeira usada na consolidação e nos relatórios.</p></div></div>{Object.entries(dossier.byCategory).map(([category,amount]) => <div className="report-row" key={category}><span>{category}</span><b>{money(amount)}</b></div>)}<div className="composition-total"><span>Total consolidado</span><strong>{money(dossier.total)}</strong></div></article>
    </>}
  </section>;
}

function Section({ title }) {
  return <section className="content"><div className="welcome"><div><h2>{title}</h2><p>Módulo preparado para integração com os dados da plataforma.</p></div></div><article className="panel empty"><div className="empty-icon">□</div><h3>Próxima etapa</h3><p>Este módulo será conectado às tabelas e permissões do Supabase.</p></article></section>;
}

function RequestModal({ clients, contracts, collaborators, onClose, onSave }) {
  const [form, setForm] = useState({ os: "", client_id: "", contract_id: "", state: "", city: "", manager_name: "", start_date: "", end_date: "", collaborator_ids: [] });
  const [busy, setBusy] = useState(false);
  const [contractOptions, setContractOptions] = useState(contracts);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setContractOptions(form.client_id ? contracts.filter((c) => c.client_id === form.client_id) : contracts);
    if (form.client_id && form.contract_id && !contracts.some((c) => c.id === form.contract_id && c.client_id === form.client_id)) set("contract_id", "");
  }, [form.client_id, contracts]);

  function toggleCollaborator(id) {
    set("collaborator_ids", form.collaborator_ids.includes(id) ? form.collaborator_ids.filter((x) => x !== id) : [...form.collaborator_ids, id]);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.os || !form.start_date || !form.end_date || form.end_date < form.start_date) return;
    setBusy(true);
    await onSave(form);
    setBusy(false);
  }

  return <ModalShell title="Nova solicitação de viagem" onClose={onClose}><form onSubmit={submit}>
    <div className="form-grid">
      <Field label="OS" value={form.os} onChange={(v) => set("os", v)} required />
      <SelectField label="Cliente" value={form.client_id} onChange={(v) => set("client_id", v)} options={clients.map((c) => [c.id, c.name])} placeholder="Selecione" />
      <SelectField label="Contrato" value={form.contract_id} onChange={(v) => set("contract_id", v)} options={contractOptions.map((c) => [c.id, c.code ? c.code + " — " + c.name : c.name])} placeholder={form.client_id ? "Selecione" : "Todos os contratos"} />
      <Field label="Estado" value={form.state} onChange={(v) => set("state", v)} />
      <Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} />
      <Field label="Gestor" value={form.manager_name} onChange={(v) => set("manager_name", v)} />
      <Field label="Data inicial" type="date" value={form.start_date} onChange={(v) => set("start_date", v)} required />
      <Field label="Data final" type="date" value={form.end_date} onChange={(v) => set("end_date", v)} required />
    </div>
    <div className="form-section"><b>Colaboradores da OS</b><div className="collaborator-picker">
      {collaborators.length ? collaborators.map((p) => <label key={p.id} className={form.collaborator_ids.includes(p.id) ? "person-option selected" : "person-option"}><input type="checkbox" checked={form.collaborator_ids.includes(p.id)} onChange={() => toggleCollaborator(p.id)} /><span><b>{p.name}</b><small>{p.sector || "Sem setor"}{p.uf ? " · " + p.uf : ""}</small></span></label>) : <small className="helper">Cadastre colaboradores antes de associá-los à OS.</small>}
    </div></div>
    <div className="form-section"><b>Serviços da viagem</b><div className="checks">{["Passagem", "Hospedagem", "Veículo", "Refeições", "Lavanderia", "Uber"].map((x) => <label key={x}><input type="checkbox" />{x}</label>)}</div><small className="helper">Os serviços serão persistidos nos módulos específicos na próxima etapa.</small></div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar rascunho"}</button></div>
  </form></ModalShell>;
}

function CollaboratorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", cpf: "", birth_date: "", sector: "", uf: "" });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) { event.preventDefault(); if (!form.name) return; setBusy(true); await onSave(form); setBusy(false); }
  return <ModalShell title="Novo colaborador" onClose={onClose}><form onSubmit={submit}><div className="form-grid">
    <Field label="Nome completo" value={form.name} onChange={(v) => set("name", v)} required />
    <Field label="CPF" value={form.cpf} onChange={(v) => set("cpf", v)} />
    <Field label="Data de nascimento" type="date" value={form.birth_date} onChange={(v) => set("birth_date", v)} />
    <Field label="Setor" value={form.sector} onChange={(v) => set("sector", v)} />
    <Field label="UF" value={form.uf} onChange={(v) => set("uf", v)} maxLength={2} />
  </div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar colaborador"}</button></div></form></ModalShell>;
}

function ModalShell({ title, onClose, children }) {
  return <div className="overlay"><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">CADASTRO</span><h2>{title}</h2></div><button className="close" onClick={onClose} aria-label="Fechar">×</button></div>{children}</div></div>;
}

function Field({ label, value = "", onChange, type = "text", required = false, disabled = false, maxLength, accept, min, step }) {
  return <label className="field"><span>{label}{required ? " *" : ""}</span><input type={type} {...(type === "file" ? { accept, onChange: e => onChange?.(e.target.files) } : { value, onChange: e => onChange?.(e.target.value) })} required={required} disabled={disabled} maxLength={maxLength} min={min} step={step} /></label>;
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}

function Stat({ label, value, note }) { return <article className="stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function initials(name) { return (name || "US").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatDateTime(value) { if (!value) return "—"; return new Date(value).toLocaleString("pt-BR"); }
function formatDate(value) { if (!value) return "—"; const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

createRoot(document.getElementById("root")).render(<App />);
