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

export async function listTravelRequestCollaborators(travelRequestId) {
  const { data, error } = await requireSupabase().from("travel_request_collaborators")
    .select("collaborator:collaborators(id,name,cpf)")
    .eq("travel_request_id", travelRequestId);
  if (error) throw error;
  return (data || []).map(x => x.collaborator).filter(Boolean);
}

export async function saveTravelService(type, payload) {
  const client = requireSupabase();
  const tables = { ticket:"tickets", accommodation:"accommodations", vehicle:"vehicles", meal:"meals", laundry:"laundry", uber:"uber_expenses" };
  const table = tables[type];
  if (!table) throw new Error("Tipo de serviço inválido.");
  const { data, error } = await client.from(table).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function listTravelServices(type, travelRequestId) {
  const client = requireSupabase();
  const tables = { ticket:"tickets", accommodation:"accommodations", vehicle:"vehicles", meal:"meals", laundry:"laundry", uber:"uber_expenses" };
  const table = tables[type];
  if (!table) throw new Error("Tipo de serviço inválido.");
  const { data, error } = await client.from(table).select("*").eq("travel_request_id", travelRequestId).order("created_at", { ascending:false });
  if (error) throw error;
  return data || [];
}

export async function listCostComposition(travelRequestId) {
  const client = requireSupabase();
  const [costs, tickets, hotels, vehicles, meals, laundry, uber] = await Promise.all([
    client.from("costs").select("id,category,amount,collaborator_id,description,cost_date,source").eq("travel_request_id", travelRequestId),
    client.from("tickets").select("id,cost,collaborator_id,baggage_included,baggage_quantity").eq("travel_request_id", travelRequestId),
    client.from("accommodations").select("id,cost,provider,check_in,check_out").eq("travel_request_id", travelRequestId),
    client.from("vehicles").select("id,rental_cost,toll_cost,parking_cost,other_cost,required").eq("travel_request_id", travelRequestId),
    client.from("meals").select("id,unit_cost,quantity,collaborator_id,meal_type,meal_date").eq("travel_request_id", travelRequestId),
    client.from("laundry").select("id,cost,collaborator_id,period_days").eq("travel_request_id", travelRequestId),
    client.from("uber_expenses").select("id,amount,collaborator_id,expense_date,description").eq("travel_request_id", travelRequestId)
  ]);
  for (const result of [costs,tickets,hotels,vehicles,meals,laundry,uber]) if (result.error) throw result.error;

  const rows = [];
  (costs.data || []).forEach(x => rows.push({ category:x.category, amount:Number(x.amount||0), collaborator_id:x.collaborator_id, source:x.source || "manual", description:x.description || "" }));
  (tickets.data || []).forEach(x => {
    rows.push({ category:"ticket", amount:Number(x.cost||0), collaborator_id:x.collaborator_id, source:"ticket", description:x.description || "Passagem" });
    if (x.baggage_included) rows.push({ category:"baggage", amount:0, collaborator_id:x.collaborator_id, source:"ticket", description:`Bagagem: ${x.baggage_quantity || 0}` });
  });
  (hotels.data || []).forEach(x => rows.push({ category:"hotel", amount:Number(x.cost||0), source:"accommodation", description:x.provider || "Hospedagem" }));
  (vehicles.data || []).forEach(x => {
    [["vehicle",x.rental_cost],["toll",x.toll_cost],["parking",x.parking_cost],["other",x.other_cost]].forEach(([category,amount]) => { if (Number(amount||0) > 0) rows.push({category,amount:Number(amount),source:"vehicle",description:category}); });
  });
  (meals.data || []).forEach(x => rows.push({ category:"meal", amount:Number(x.unit_cost||0)*Number(x.quantity||1), collaborator_id:x.collaborator_id, source:"meal", description:x.meal_type }));
  (laundry.data || []).forEach(x => rows.push({ category:"laundry", amount:Number(x.cost||0), collaborator_id:x.collaborator_id, source:"laundry", description:`Período ${x.period_days} dias` }));
  (uber.data || []).forEach(x => rows.push({ category:"uber", amount:Number(x.amount||0), collaborator_id:x.collaborator_id, source:"uber", description:x.description || "Uber" }));

  const byCategory = rows.reduce((a,x) => { a[x.category]=(a[x.category]||0)+x.amount; return a; }, {});
  const byCollaborator = rows.reduce((a,x) => {
    const key=x.collaborator_id || "sem-colaborador";
    a[key]=(a[key]||0)+x.amount; return a;
  }, {});
  return { rows, byCategory, byCollaborator, total: rows.reduce((s,x)=>s+x.amount,0) };
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
