import { supabase } from "./supabase";
import { buildCostComposition } from "./cost-composition.js";
import { summarizeAuditEvent } from "./audit.js";

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

export async function generateMealsForRequest(travelRequestId) {
  const client = requireSupabase();
  const { data: request, error: requestError } = await client.from("travel_requests")
    .select("id,start_date,end_date,state");
  if (requestError) throw requestError;
  const target = (request || []).find(x => x.id === travelRequestId);
  if (!target) throw new Error("OS não encontrada.");
  const { data: links, error: linksError } = await client.from("travel_request_collaborators")
    .select("collaborator:collaborators(id,name,uf)")
    .eq("travel_request_id", travelRequestId);
  if (linksError) throw linksError;
  const collaborators = (links || []).map(x => x.collaborator).filter(Boolean);
  if (!collaborators.length) throw new Error("A OS não possui colaboradores vinculados.");

  const { data: existing, error: existingError } = await client.from("meals")
    .select("collaborator_id,meal_date,meal_type")
    .eq("travel_request_id", travelRequestId);
  if (existingError) throw existingError;
  const existingKeys = new Set((existing || []).map(x => `${x.collaborator_id}|${x.meal_date}|${x.meal_type}`));

  const start = new Date(target.start_date + "T00:00:00");
  const end = new Date(target.end_date + "T00:00:00");
  const rows = [];
  for (const collaborator of collaborators) {
    const uf = collaborator.uf || target.state || "";
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const date = cursor.toISOString().slice(0,10);
      for (const meal_type of ["breakfast","lunch","dinner"]) {
        const key = `${collaborator.id}|${date}|${meal_type}`;
        if (existingKeys.has(key)) continue;
        let unit_cost = 0;
        if (meal_type === "breakfast") unit_cost = 15;
        if (meal_type === "lunch" && uf === "SP") unit_cost = 32;
        if (meal_type === "lunch" && uf === "RJ") unit_cost = 35;
        if (meal_type === "dinner" && (uf === "SP" || uf === "RJ")) unit_cost = 35;
        rows.push({travel_request_id:travelRequestId,collaborator_id:collaborator.id,meal_date:date,meal_type,uf,unit_cost,quantity:1});
      }
    }
  }
  if (!rows.length) return { created: 0, skipped: existing?.length || 0 };
  const { data, error } = await client.from("meals").insert(rows).select("id");
  if (error) throw error;
  return { created: data?.length || rows.length, skipped: existing?.length || 0 };
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

  return buildCostComposition({
    costs: costs.data || [], tickets: tickets.data || [], hotels: hotels.data || [],
    vehicles: vehicles.data || [], meals: meals.data || [], laundry: laundry.data || [], uber: uber.data || []
  });
}

export async function syncTravelRequestCosts(travelRequestId) {
  const { data, error } = await requireSupabase().rpc("sync_travel_request_costs", {
    p_travel_request_id: travelRequestId
  });
  if (error) throw error;
  return data || { inserted: 0, total: 0 };
}

export async function listTravelRequestReports() {
  const { data, error } = await requireSupabase().from("travel_request_cost_report")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listCosts() {
  const { data, error } = await requireSupabase().from("costs")
    .select("id,travel_request_id,category,description,amount,cost_date,collaborator_id,source,created_at,travel_request:travel_requests(os,city,state)")
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


export async function listAttachments(travelRequestId) {
  const client = requireSupabase();
  let query = client.from("attachments").select("*").order("created_at", { ascending: false });
  if (travelRequestId) query = query.eq("travel_request_id", travelRequestId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function uploadAttachment({ travelRequestId, file, description = "" }) {
  const client = requireSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error("Usuário não autenticado.");
  if (!travelRequestId) throw new Error("Selecione uma OS.");
  if (!file) throw new Error("Selecione um arquivo.");
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ];
  const extension = file.name.split(".").pop()?.toLowerCase();
  const allowedExtensions = ["pdf", "xlsx", "xls", "csv", "jpg", "jpeg", "png"];
  if (!allowedExtensions.includes(extension) || (file.type && !allowed.includes(file.type) && !(extension === "csv" && file.type === "application/vnd.ms-excel"))) {
    throw new Error("Formato não suportado. Use PDF, XLSX, XLS, CSV, JPG, JPEG ou PNG.");
  }
  const maxSize = 15 * 1024 * 1024;
  if (file.size > maxSize) throw new Error("O arquivo excede o limite de 15 MB.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = user.id + "/" + travelRequestId + "/" + crypto.randomUUID() + "-" + safeName;
  const { error: uploadError } = await client.storage.from("travel-attachments").upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await client.from("attachments").insert({
    travel_request_id: travelRequestId,
    uploaded_by: user.id,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type || ({ csv: "text/csv", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" }[extension]),
    file_size: file.size,
    extraction_status: "pending",
    extracted_data: { description }
  }).select("*").single();
  if (error) {
    await client.storage.from("travel-attachments").remove([path]);
    throw error;
  }
  return data;
}

export async function downloadAttachment(path) {
  const { data, error } = await requireSupabase().storage.from("travel-attachments").download(path);
  if (error) throw error;
  return data;
}

export async function listAuditLogs({ travelRequestId, limit = 250 } = {}) {
  const client = requireSupabase();
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 1), 500);
  let query = client.from("audit_logs")
    .select("id,user_id,travel_request_id,entity_type,entity_id,action,changed_fields,created_at")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (travelRequestId) query = query.eq("travel_request_id", travelRequestId);
  const { data, error } = await query;
  if (error) throw error;

  const userIds = [...new Set((data || []).map(event => event.user_id).filter(Boolean))];
  let namesById = {};
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await client.from("profiles")
      .select("id,full_name").in("id", userIds);
    if (profilesError) throw profilesError;
    namesById = Object.fromEntries((profiles || []).map(profile => [profile.id, profile.full_name]));
  }
  return (data || []).map(event => ({
    ...event,
    actor_name: namesById[event.user_id] || "Usuário do sistema",
    summary: summarizeAuditEvent(event)
  }));
}

export async function saveAttachmentExtraction(attachmentId, extraction) {
  const { data, error } = await requireSupabase().from("attachments").update({
    extraction_status: "extracted",
    extracted_data: extraction.fields,
    extraction_text: extraction.text,
    extraction_method: extraction.method
  }).eq("id", attachmentId).select("*").single();
  if (error) throw error;
  return data;
}

export async function confirmAttachmentCost(attachmentId, fields) {
  const { data, error } = await requireSupabase().rpc("confirm_attachment_cost", {
    p_attachment_id: attachmentId,
    p_fields: fields
  });
  if (error) throw error;
  return data;
}

export async function loadTravelDossier(travelRequestId) {
  const client = requireSupabase();
  const [requestResult, collaboratorResult, ticketResult, lodgingResult, vehicleResult, mealResult, laundryResult, uberResult, costResult, attachmentResult, composition, auditEvents] = await Promise.all([
    client.from("travel_requests").select("*,client:clients(name),contract:contracts(code,name)").eq("id", travelRequestId).single(),
    client.from("travel_request_collaborators").select("collaborator:collaborators(id,name,cpf,sector)").eq("travel_request_id", travelRequestId),
    client.from("tickets").select("*").eq("travel_request_id", travelRequestId),
    client.from("accommodations").select("*").eq("travel_request_id", travelRequestId),
    client.from("vehicles").select("*").eq("travel_request_id", travelRequestId),
    client.from("meals").select("*").eq("travel_request_id", travelRequestId),
    client.from("laundry").select("*").eq("travel_request_id", travelRequestId),
    client.from("uber_expenses").select("*").eq("travel_request_id", travelRequestId),
    client.from("costs").select("*").eq("travel_request_id", travelRequestId).order("created_at", { ascending: false }),
    listAttachments(travelRequestId),
    listCostComposition(travelRequestId),
    listAuditLogs({ travelRequestId, limit: 500 })
  ]);
  for (const result of [requestResult, collaboratorResult, ticketResult, lodgingResult, vehicleResult, mealResult, laundryResult, uberResult, costResult]) if (result.error) throw result.error;
  const request = requestResult.data;
  const links = collaboratorResult.data || [];
  let reviewEvents = [];
  const attachmentIds = attachmentResult.map(item => item.id);
  if (attachmentIds.length) {
    const { data, error } = await client.from("attachment_extraction_reviews")
      .select("id,attachment_id,reviewer_id,reviewed_at,action,cost_id")
      .in("attachment_id", attachmentIds).order("reviewed_at", { ascending: false });
    if (error) throw error;
    reviewEvents = data || [];
  }
  return {
    request,
    collaborators: links.map(link => link.collaborator).filter(Boolean),
    tickets: ticketResult.data || [], lodging: lodgingResult.data || [], vehicles: vehicleResult.data || [],
    meals: mealResult.data || [], laundry: laundryResult.data || [], uber: uberResult.data || [],
    costs: costResult.data || [], attachments: attachmentResult,
    total: composition.total,
    byCategory: composition.byCategory,
    history: [
      { label: "Solicitação criada", date: request.created_at },
      ...auditEvents.filter(event => !(event.entity_type === "travel_requests" && event.action === "insert"))
        .map(event => ({ label: event.summary, date: event.created_at, actor: event.actor_name })),
      ...reviewEvents.filter(event => !auditEvents.some(log => log.entity_type === "attachment_extraction_reviews" && log.entity_id === event.id))
        .map(event => ({ label: `${event.action === "rejected" ? "Extração rejeitada" : "Extração validada"}: ${attachmentResult.find(a => a.id === event.attachment_id)?.file_name || "anexo"}`, date: event.reviewed_at }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  };
}
