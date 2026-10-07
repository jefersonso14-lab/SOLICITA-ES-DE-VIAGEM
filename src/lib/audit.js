const entityLabels = {
  profiles: "Perfil",
  collaborators: "Colaborador",
  clients: "Cliente",
  contracts: "Contrato",
  travel_requests: "Solicitação",
  travel_request_collaborators: "Vínculo de colaborador",
  tickets: "Passagem",
  accommodations: "Hospedagem",
  vehicles: "Veículo",
  meals: "Refeição",
  laundry: "Lavanderia",
  uber_expenses: "Uber",
  costs: "Custo",
  attachments: "Anexo",
  attachment_extraction_reviews: "Validação de anexo",
  reports: "Relatório",
  expenses: "Despesa importada",
  imports: "Importação"
};

const fieldLabels = {
  active: "Ativo", amount: "Valor", category: "Categoria", check_in: "Check-in",
  check_out: "Check-out", client_id: "Cliente", collaborator_id: "Colaborador",
  contract_id: "Contrato", cost: "Custo", cost_date: "Data do custo",
  description: "Descrição", end_date: "Data final", extraction_data: "Dados extraídos",
  extracted_data: "Dados extraídos", extraction_status: "Estado da extração", extraction_text: "Texto OCR",
  file_name: "Arquivo", manager_name: "Gestor", meal_date: "Data da refeição",
  name: "Nome", os: "OS", role: "Perfil de acesso", start_date: "Data inicial",
  status: "Situação", supplier: "Fornecedor", travel_request_id: "Solicitação",
  unit_cost: "Valor unitário"
};

export function summarizeAuditEvent(event) {
  const action = String(event?.action || "").toLowerCase();
  const entity = entityLabels[event?.entity_type] || "Registro";
  if (action === "insert") return `${entity} criado`;
  if (action === "delete") return `${entity} removido`;

  const oldData = event?.old_data || {};
  const newData = event?.new_data || {};
  const changed = [...new Set(event?.changed_fields || [...Object.keys(oldData), ...Object.keys(newData)]
    .filter(key => key !== "created_at" && key !== "updated_at" && JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])))]
    .map(key => fieldLabels[key] || key.replaceAll("_", " "));
  return `${entity} atualizado${changed.length ? ` · ${changed.join(", ")}` : ""}`;
}

export function filterAuditEvents(events, requests, filters = {}) {
  const requestsById = new Map(requests.map(request => [request.id, request]));
  const search = String(filters.search || "").toLocaleLowerCase("pt-BR");

  return events.filter(event => {
    const request = requestsById.get(event.travel_request_id);
    const date = String(event.created_at || "").slice(0, 10);
    const searchText = [event.summary, event.actor_name, request?.os, event.entity_id]
      .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");

    return (!search || searchText.includes(search))
      && (!filters.request || event.travel_request_id === filters.request)
      && (!filters.entity || event.entity_type === filters.entity)
      && (!filters.action || event.action === filters.action)
      && (!filters.start || date >= filters.start)
      && (!filters.end || date <= filters.end);
  });
}

export function auditActionLabel(action) {
  return ({ insert: "Criação", update: "Alteração", delete: "Remoção" })[String(action || "").toLowerCase()] || "Evento";
}

export function auditEntityLabel(entityType) {
  return entityLabels[entityType] || "Registro";
}
