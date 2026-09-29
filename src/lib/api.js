import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}

export async function signIn(email, password) {
  return requireSupabase().auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCurrentProfile() {
  const client = requireSupabase();
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await client.from("profiles")
    .select("id,full_name,role,active").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureRequesterProfile() {
  const client = requireSupabase();
  const user = await getCurrentUser();
  if (!user) return null;
  const existing = await getCurrentProfile();
  if (existing) return existing;
  const { data, error } = await client.from("profiles").insert({
    id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
    role: "requester",
    active: true
  }).select("id,full_name,role,active").single();
  if (error) throw error;
  return data;
}

export async function listClients() {
  return requireSupabase().from("clients").select("id,name").eq("active", true).order("name");
}

export async function listContracts(clientId = null) {
  let query = requireSupabase().from("contracts").select("id,client_id,code,name").eq("active", true).order("name");
  if (clientId) query = query.eq("client_id", clientId);
  return query;
}

export async function listCollaborators() {
  return requireSupabase().from("collaborators")
    .select("id,code,name,cpf,birth_date,rg,sector,uf,active")
    .eq("active", true).order("name");
}

export async function createCollaborator(payload) {
  return requireSupabase().from("collaborators").insert({
    code: payload.code || null,
    name: payload.name,
    cpf: payload.cpf || null,
    birth_date: payload.birth_date || null,
    sector: payload.sector || null,
    uf: payload.uf || null,
    active: true
  }).select("id,code,name,cpf,birth_date,sector,uf,active").single();
}

export async function listTravelRequests() {
  const { data, error } = await requireSupabase().from("travel_requests")
    .select("id,os,state,city,manager_name,start_date,end_date,days,status,created_at,client:clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listCosts() {
  const { data, error } = await requireSupabase().from("costs")
    .select("id,travel_request_id,category,description,amount,cost_date,source,created_at,travel_request:travel_requests(os,city,state)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCost(payload) {
  const client = requireSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error("Usuário não autenticado.");
  const { data, error } = await client.from("costs").insert({
    travel_request_id: payload.travel_request_id,
    category: payload.category,
    description: payload.description || null,
    amount: Number(payload.amount || 0),
    cost_date: payload.cost_date || null,
    collaborator_id: payload.collaborator_id || null,
    source: payload.source || "manual",
    created_by: user.id
  }).select("id,travel_request_id,category,description,amount,cost_date,source,created_at").single();
  if (error) throw error;
  return data;
}

export async function createTravelRequest(payload) {
  const client = requireSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { data, error } = await client.from("travel_requests").insert({
    os: payload.os,
    requester_id: user.id,
    client_id: payload.client_id || null,
    contract_id: payload.contract_id || null,
    state: payload.state || null,
    city: payload.city || null,
    manager_name: payload.manager_name || null,
    start_date: payload.start_date,
    end_date: payload.end_date,
    status: "draft"
  }).select("id,os,state,city,manager_name,start_date,end_date,days,status,created_at").single();

  if (error) throw error;

  const collaboratorIds = [...new Set(payload.collaborator_ids || [])].filter(Boolean);
  if (collaboratorIds.length) {
    const { error: childError } = await client.from("travel_request_collaborators")
      .insert(collaboratorIds.map((collaborator_id) => ({
        travel_request_id: data.id,
        collaborator_id
      })));
    if (childError) throw childError;
  }

  return data;
}
