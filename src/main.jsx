import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createCollaborator,
  createTravelRequest,
  ensureRequesterProfile,
  listCollaborators,
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
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) {
        setSession(data.session);
        try {
          setProfile(await ensureRequesterProfile());
        } catch (error) {
          console.error(error);
        }
      }
      if (mounted) setLoading(false);
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        return;
      }
      ensureRequesterProfile()
        .then(setProfile)
        .catch((error) => console.error(error));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
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
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) throw result.error;
    } catch (err) {
      setError(err.message || "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-screen">
    <div className="login-card">
      <div className="brand login-brand">
        <div className="brand-mark">B</div>
        <div><strong>PLATAFORMA</strong><span>Solicitação de Viagens</span></div>
      </div>
      <span className="eyebrow">ACESSO RESTRITO</span>
      <h1>Entrar na plataforma</h1>
      <p className="login-subtitle">Use seu e-mail e senha cadastrados.</p>
      {!configured && <div className="notice error">Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente da aplicação.</div>}
      {error && <div className="notice error">{error}</div>}
      <form onSubmit={handleSubmit} className="login-form">
        <Field label="E-mail" value={email} onChange={setEmail} type="email" required />
        <Field label="Senha" value={password} onChange={setPassword} type="password" required />
        <button className="primary full" disabled={busy || !configured}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  </div>;
}

function AuthenticatedApp({ profile }) {
  const [active, setActive] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [requests, setRequests] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [notice, setNotice] = useState("");

  const title = useMemo(() => menu.find(([id]) => id === active)?.[1] || "Dashboard", [active]);
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  async function refreshRequests() {
    try {
      setRequests(await listTravelRequests());
    } catch (error) {
      setNotice(error.message || "Erro ao consultar solicitações.");
    }
  }

  async function refreshCollaborators() {
    try {
      const result = await listCollaborators();
      if (result.error) throw result.error;
      setCollaborators(result.data || []);
    } catch (error) {
      setNotice(error.message || "Erro ao consultar colaboradores.");
    }
  }

  useEffect(() => {
    refreshRequests();
    refreshCollaborators();
  }, []);

  async function handleSaveRequest(form) {
    try {
      await createTravelRequest(form);
      setNotice("Solicitação criada como rascunho.");
      setModal(null);
      await refreshRequests();
    } catch (error) {
      setNotice(error.message || "Não foi possível salvar a solicitação.");
    }
  }

  async function handleSaveCollaborator(form) {
    try {
      await createCollaborator(form);
      setNotice("Colaborador cadastrado.");
      setModal(null);
      await refreshCollaborators();
    } catch (error) {
      setNotice(error.message || "Não foi possível cadastrar o colaborador.");
    }
  }

  async function handleLogout() {
    await signOut();
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">B</div>
        <div><strong>PLATAFORMA</strong><span>Solicitação de Viagens</span></div>
      </div>
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
          <button className="icon-button" aria-label="Sair" title="Sair" onClick={handleLogout}>↪</button>
          <div className="avatar" aria-label="Usuário">{initials(profile?.full_name)}</div>
        </div>
      </header>

      {notice && <div className="global-notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

      {active === "dashboard" && <Dashboard requests={requests} search={search} setSearch={setSearch} onNew={() => setModal("request")} />}
      {active === "requests" && <Requests requests={requests} search={search} setSearch={setSearch} onNew={() => setModal("request")} />}
      {active === "people" && <People collaborators={collaborators} search={search} setSearch={setSearch} onNew={canManage ? () => setModal("people") : undefined} />}
      {!["dashboard", "requests", "people"].includes(active) && <Section title={title} />}

    </main>

    {modal === "request" && <RequestModal onClose={() => setModal(null)} onSave={handleSaveRequest} />}
    {modal === "people" && <CollaboratorModal onClose={() => setModal(null)} onSave={handleSaveCollaborator} />}
  </div>;
}

function Dashboard({ requests, search, setSearch, onNew }) {
  const current = requests.filter((r) => r.status !== "completed" && r.status !== "cancelled");
  const inProgress = requests.filter((r) => r.status === "in_progress");
  const pending = requests.filter((r) => r.status === "draft" || r.status === "submitted");

  return <section className="content">
    <div className="welcome"><div><h2>Visão geral</h2><p>Acompanhe suas solicitações e custos de viagem.</p></div><button className="primary" onClick={onNew}>＋ Nova solicitação</button></div>
    <div className="stats">
      <Stat label="OS abertas" value={current.length} note="Em acompanhamento" />
      <Stat label="Em andamento" value={inProgress.length} note="Viagens ativas" />
      <Stat label="Pendentes" value={pending.length} note="Aguardando ação" />
      <Stat label="Custo acumulado" value="—" note="Custos serão integrados na próxima etapa" />
    </div>
    <RequestsTable requests={requests} search={search} setSearch={setSearch} />
  </section>;
}

function Requests({ requests, search, setSearch, onNew }) {
  return <section className="content">
    <div className="welcome"><div><h2>Solicitações</h2><p>Consulta das OS vinculadas ao usuário autenticado.</p></div><button className="primary" onClick={onNew}>＋ Nova solicitação</button></div>
    <RequestsTable requests={requests} search={search} setSearch={setSearch} />
  </section>;
}

function RequestsTable({ requests, search, setSearch }) {
  const filtered = requests.filter((r) => {
    const text = [r.os, r.client?.name, r.city, r.state, r.manager_name, r.status].join(" ").toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return <article className="panel wide">
    <div className="panel-head"><div><h3>Solicitações</h3><p>{filtered.length} registro(s) encontrado(s)</p></div><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar OS, cliente..." aria-label="Pesquisar" /></div></div>
    <div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Destino</th><th>Período</th><th>Status</th></tr></thead><tbody>
      {filtered.length ? filtered.map((r) => {
        const [label, cls, icon] = statusMap[r.status] || [r.status, "info", "●"];
        return <tr key={r.id}><td><b>{r.os}</b></td><td>{r.client?.name || "—"}</td><td>{[r.city, r.state].filter(Boolean).join(" - ") || "—"}</td><td>{formatDate(r.start_date)} — {formatDate(r.end_date)}</td><td><span className={"badge " + cls}><i>{icon}</i>{label}</span></td></tr>;
      }) : <tr><td colSpan="5" className="table-empty">Nenhuma solicitação encontrada.</td></tr>}
    </tbody></table></div>
  </article>;
}

function People({ collaborators, search, setSearch, onNew }) {
  const filtered = collaborators.filter((p) => [p.name, p.cpf, p.sector, p.uf].join(" ").toLowerCase().includes(search.toLowerCase()));

  return <section className="content">
    <div className="welcome"><div><h2>Colaboradores</h2><p>Base reutilizável para composição das viagens.</p></div>{onNew && <button className="primary" onClick={onNew}>＋ Novo colaborador</button>}</div>
    <article className="panel wide">
      <div className="panel-head"><div><h3>Base ativa</h3><p>{filtered.length} colaborador(es)</p></div><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar nome, CPF..." aria-label="Pesquisar colaboradores" /></div></div>
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Setor</th><th>UF</th></tr></thead><tbody>
        {filtered.length ? filtered.map((p) => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.cpf || "—"}</td><td>{formatDate(p.birth_date)}</td><td>{p.sector || "—"}</td><td>{p.uf || "—"}</td></tr>) : <tr><td colSpan="5" className="table-empty">Nenhum colaborador ativo encontrado.</td></tr>}
      </tbody></table></div>
    </article>
  </section>;
}

function Section({ title }) {
  return <section className="content"><div className="welcome"><div><h2>{title}</h2><p>Módulo preparado para integração com os dados da plataforma.</p></div></div><article className="panel empty"><div className="empty-icon">□</div><h3>Próxima etapa</h3><p>Este módulo será conectado às tabelas e permissões do Supabase.</p></article></section>;
}

function RequestModal({ onClose, onSave }) {
  const [form, setForm] = useState({ os: "", state: "", city: "", manager_name: "", start_date: "", end_date: "" });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (!form.os || !form.start_date || !form.end_date) return;
    if (form.end_date < form.start_date) return;
    setBusy(true);
    await onSave(form);
    setBusy(false);
  }

  return <ModalShell title="Nova solicitação de viagem" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="OS" value={form.os} onChange={(v) => set("os", v)} required />
        <Field label="Cliente (ID opcional nesta etapa)" value="" disabled />
        <Field label="Contrato (ID opcional nesta etapa)" value="" disabled />
        <Field label="Estado" value={form.state} onChange={(v) => set("state", v)} />
        <Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} />
        <Field label="Gestor" value={form.manager_name} onChange={(v) => set("manager_name", v)} />
        <Field label="Data inicial" type="date" value={form.start_date} onChange={(v) => set("start_date", v)} required />
        <Field label="Data final" type="date" value={form.end_date} onChange={(v) => set("end_date", v)} required />
      </div>
      <div className="form-section"><b>Serviços da viagem</b><div className="checks">{["Passagem", "Hospedagem", "Veículo", "Refeições", "Lavanderia", "Uber"].map((x) => <label key={x}><input type="checkbox" />{x}</label>)}</div><small className="helper">Os serviços serão persistidos nos módulos específicos na próxima etapa.</small></div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar rascunho"}</button></div>
    </form>
  </ModalShell>;
}

function CollaboratorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", cpf: "", birth_date: "", sector: "", uf: "" });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (!form.name) return;
    setBusy(true);
    await onSave(form);
    setBusy(false);
  }

  return <ModalShell title="Novo colaborador" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nome completo" value={form.name} onChange={(v) => set("name", v)} required />
        <Field label="CPF" value={form.cpf} onChange={(v) => set("cpf", v)} />
        <Field label="Data de nascimento" type="date" value={form.birth_date} onChange={(v) => set("birth_date", v)} />
        <Field label="Setor" value={form.sector} onChange={(v) => set("sector", v)} />
        <Field label="UF" value={form.uf} onChange={(v) => set("uf", v)} maxLength={2} />
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar colaborador"}</button></div>
    </form>
  </ModalShell>;
}

function ModalShell({ title, onClose, children }) {
  return <div className="overlay"><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">CADASTRO</span><h2>{title}</h2></div><button className="close" onClick={onClose} aria-label="Fechar">×</button></div>{children}</div></div>;
}

function Field({ label, value = "", onChange, type = "text", required = false, disabled = false, maxLength }) {
  return <label className="field"><span>{label}{required ? " *" : ""}</span><input type={type} value={value} onChange={(e) => onChange?.(e.target.value)} required={required} disabled={disabled} maxLength={maxLength} /></label>;
}

function Stat({ label, value, note }) {
  return <article className="stat"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function initials(name) {
  return (name || "US").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

createRoot(document.getElementById("root")).render(<App />);
