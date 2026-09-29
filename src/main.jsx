import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createCollaborator,
  createTravelRequest,
  ensureRequesterProfile,
  listClients,
  listCosts,
  createCost,
  listCostComposition,
  listCollaborators,
  listContracts,
  listTravelRequests,
  signIn,
  signOut
} from "./lib/api";
import { supabase } from "./lib/supabase";
import "./styles.css";

const menu = [
  ["dashboard", "Dashboard"],
  ["requests", "Solicitações"],
  ["people", "Colaboradores"],
  ["costs", "Custos"],
  ["reports", "Relatórios"],
  ["files", "Anexos"],
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
    refreshRequests(); refreshCollaborators(); refreshCatalogs(); refreshCosts();
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
          <span className="nav-icon" aria-hidden="true">{["⌂", "▣", "♙", "R$", "▤", "□", "◷"][i]}</span>{label}
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
      {active === "dashboard" && <Dashboard requests={requests} search={search} setSearch={setSearch} onNew={() => setModal("request")} />}
      {active === "requests" && <Requests requests={requests} search={search} setSearch={setSearch} onNew={() => setModal("request")} />}
      {active === "people" && <People collaborators={collaborators} search={search} setSearch={setSearch} onNew={canManage ? () => setModal("people") : undefined} />}
      {active === "costs" && <Costs costs={costs} requests={requests} canManage={canManage} onNew={canManage ? () => setModal("cost") : undefined} />}
      {!["dashboard", "requests", "people", "costs"].includes(active) && <Section title={title} />}
    </main>

    {modal === "request" && <RequestModal clients={clients} contracts={contracts} collaborators={collaborators} onClose={() => setModal(null)} onSave={handleSaveRequest} />}
    {modal === "people" && <CollaboratorModal onClose={() => setModal(null)} onSave={handleSaveCollaborator} />}
    {modal === "cost" && <CostModal requests={requests} collaborators={collaborators} onClose={() => setModal(null)} onSave={handleSaveCost} />}
  </div>;
}

function Dashboard({ requests, search, setSearch, onNew }) {
  const current = requests.filter((r) => !["completed", "cancelled"].includes(r.status));
  const inProgress = requests.filter((r) => r.status === "in_progress");
  const pending = requests.filter((r) => ["draft", "submitted"].includes(r.status));
  return <section className="content">
    <div className="welcome"><div><h2>Visão geral</h2><p>Acompanhe suas solicitações e custos de viagem.</p></div><button className="primary" onClick={onNew}>＋ Nova solicitação</button></div>
    <div className="stats">
      <Stat label="OS abertas" value={current.length} note="Em acompanhamento" />
      <Stat label="Em andamento" value={inProgress.length} note="Viagens ativas" />
      <Stat label="Pendentes" value={pending.length} note="Aguardando ação" />
      <Stat label="Custo acumulado" value="—" note="Integração de custos na próxima etapa" />
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

function Costs({ costs, requests, canManage, onNew }) {
  const [selectedOs, setSelectedOs] = useState("");
  const [composition, setComposition] = useState(null);
  const [loadingComposition, setLoadingComposition] = useState(false);

  useEffect(() => {
    if (!selectedOs && requests[0]?.id) setSelectedOs(requests[0].id);
  }, [requests, selectedOs]);

  useEffect(() => {
    if (!selectedOs) { setComposition(null); return; }
    setLoadingComposition(true);
    listCostComposition(selectedOs).then(setComposition).catch(() => setComposition(null)).finally(() => setLoadingComposition(false));
  }, [selectedOs]);

  const allTotal = costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const total = costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byCategory = costs.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const labels = { ticket: "Passagens", baggage: "Bagagem", hotel: "Hotel", vehicle: "Veículo", toll: "Pedágio", parking: "Estacionamento", fuel: "Combustível", meal: "Refeições", laundry: "Lavanderia", uber: "Uber", other: "Outros" };

  return <section className="content">
    <div className="welcome"><div><h2>Custos</h2><p>Consolidação financeira das solicitações acessíveis ao usuário.</p></div>{onNew && <button className="primary" onClick={onNew}>＋ Lançar custo</button>}</div>
    <div className="stats">
      <Stat label="Total dos lançamentos" value={money(allTotal)} note={costs.length + " lançamento(s)"} />
      <Stat label="Passagens" value={money(byCategory.ticket || 0)} note="Categoria ticket" />
      <Stat label="Hospedagem" value={money(byCategory.hotel || 0)} note="Categoria hotel" />
      <Stat label="Outros" value={money((byCategory.other || 0) + (byCategory.uber || 0) + (byCategory.vehicle || 0))} note="Outras categorias" />
    </div>
    <article className="panel wide"><div className="panel-head"><div><h3>Composição automática por OS</h3><p>O total considera custos manuais e serviços estruturados da OS.</p></div><SelectField label="" value={selectedOs} onChange={setSelectedOs} options={requests.map(r => [r.id, r.os + " — " + [r.city,r.state].filter(Boolean).join("/")])} placeholder="Selecione a OS" /></div>
      {loadingComposition ? <p>Calculando composição...</p> : composition ? <div className="cost-composition">
        <div className="composition-total"><span>Total da OS</span><strong>{money(composition.total)}</strong></div>
        <div className="composition-grid">{Object.entries(composition.byCategory).map(([key,value]) => <div className="composition-item" key={key}><span>{({ticket:"Passagens",baggage:"Bagagem",hotel:"Hotel",vehicle:"Veículo",toll:"Pedágio",parking:"Estacionamento",other:"Outros",meal:"Refeições",laundry:"Lavanderia",uber:"Uber",fuel:"Combustível"})[key] || key}</span><b>{money(value)}</b></div>)}</div>
      </div> : <p>Selecione uma OS para calcular.</p>}
    </article>
    <article className="panel wide"><div className="panel-head"><div><h3>Lançamentos</h3><p>Valores financeiros seguem controle por perfil.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>OS</th><th>Categoria</th><th>Descrição</th><th>Data</th><th>Valor</th><th>Origem</th></tr></thead><tbody>
        {costs.length ? costs.map((c) => <tr key={c.id}><td><b>{c.travel_request?.os || requests.find(r => r.id === c.travel_request_id)?.os || "—"}</b></td><td>{labels[c.category] || c.category}</td><td>{c.description || "—"}</td><td>{formatDate(c.cost_date)}</td><td><b>{money(c.amount)}</b></td><td>{c.source || "manual"}</td></tr>) : <tr><td colSpan="6" className="table-empty">Nenhum custo lançado.</td></tr>}
      </tbody></table></div>
    </article>
  </section>;
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

function Field({ label, value = "", onChange, type = "text", required = false, disabled = false, maxLength }) {
  return <label className="field"><span>{label}{required ? " *" : ""}</span><input type={type} value={value} onChange={(e) => onChange?.(e.target.value)} required={required} disabled={disabled} maxLength={maxLength} /></label>;
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}

function Stat({ label, value, note }) { return <article className="stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function initials(name) { return (name || "US").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatDate(value) { if (!value) return "—"; const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

createRoot(document.getElementById("root")).render(<App />);
