import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedDocument, parseDocumentFields } from "../src/lib/document-reader.js";
import { buildCostComposition } from "../src/lib/cost-composition.js";
import { auditActionLabel, filterAuditEvents, summarizeAuditEvent } from "../src/lib/audit.js";

test("accepts supported attachment extensions regardless of browser MIME", () => {
  for (const name of ["nota.pdf", "planilha.xlsx", "planilha.xls", "dados.csv", "foto.jpg", "foto.jpeg", "foto.png"]) {
    assert.equal(isSupportedDocument({ name }), true, name);
  }
  assert.equal(isSupportedDocument({ name: "arquivo.docx" }), false);
});

test("extracts receipt fields and preserves the linked OS for review", () => {
  const fields = parseDocumentFields(
    "Fornecedor: Hotel Central Nota Fiscal: 12345 CPF/CNPJ 12.345.678/0001-90 Data 06/10/2026 Total R$ 1.234,50 hospedagem",
    { os: "OS-2026-08" }
  );
  assert.equal(fields.amount, 1234.5);
  assert.equal(fields.date, "2026-10-06");
  assert.equal(fields.supplier, "Hotel Central");
  assert.equal(fields.document_number, "12345");
  assert.equal(fields.tax_id, "12.345.678/0001-90");
  assert.equal(fields.category, "hotel");
  assert.equal(fields.os, "OS-2026-08");
});

test("recognizes expense categories and OS collaborators when named in the document", () => {
  const meal = parseDocumentFields("Restaurante Central · João da Silva · almoço", {
    os: "OS-2026-08", collaborators: [{ name: "João da Silva" }]
  });
  const toll = parseDocumentFields("Recibo de pedágio");

  assert.equal(meal.category, "meal");
  assert.equal(meal.collaborator, "João da Silva");
  assert.equal(meal.os, "OS-2026-08");
  assert.equal(toll.category, "toll");
});

test("does not count consolidated service costs twice", () => {
  const composition = buildCostComposition({
    costs: [
      { category: "ticket", amount: 300, source: "auto:ticket:ticket-1" },
      { category: "other", amount: 40, source: "manual" },
      { category: "uber", amount: 500, source: "attachment" }
    ],
    tickets: [{ id: "ticket-1", cost: 300, collaborator_id: "person-1" }],
    hotels: [{ cost: 700, provider: "Hotel" }]
  });

  assert.equal(composition.total, 1540);
  assert.equal(composition.byCategory.ticket, 300);
  assert.equal(composition.byCategory.hotel, 700);
  assert.equal(composition.byCategory.uber, 500);
  assert.equal(composition.byCategory.other, 40);
  assert.equal(composition.byCollaborator["person-1"], 300);
});

test("composition follows consolidation rules for vehicle and laundry entries", () => {
  const composition = buildCostComposition({
    vehicles: [
      { required: false, rental_cost: 200, toll_cost: 20 },
      { required: true, rental_cost: 300, toll_cost: 25, parking_cost: 15, other_cost: 10 }
    ],
    laundry: [
      { period_days: 7, cost: 50 },
      { period_days: 8, cost: 60 }
    ],
    meals: [{ unit_cost: 20, quantity: 3, collaborator_id: "person-2" }]
  });

  assert.equal(composition.total, 470);
  assert.equal(composition.byCategory.vehicle, 300);
  assert.equal(composition.byCategory.toll, 25);
  assert.equal(composition.byCategory.parking, 15);
  assert.equal(composition.byCategory.other, 10);
  assert.equal(composition.byCategory.laundry, 60);
  assert.equal(composition.byCollaborator["person-2"], 60);
});

test("audit summaries show changed fields without exposing field values", () => {
  const summary = summarizeAuditEvent({
    entity_type: "costs", action: "update",
    old_data: { amount: 100, description: "old supplier" },
    new_data: { amount: 150, description: "new supplier" }
  });

  assert.match(summary, /Custo atualizado/);
  assert.match(summary, /Valor/);
  assert.match(summary, /Descrição/);
  assert.doesNotMatch(summary, /old supplier|new supplier|150/);
  assert.equal(auditActionLabel("delete"), "Remoção");
});

test("audit summaries use safe field names without reading snapshot values", () => {
  const summary = summarizeAuditEvent({
    entity_type: "attachments", action: "update",
    changed_fields: ["extraction_status", "extracted_data", "extraction_text"]
  });

  assert.equal(summary, "Anexo atualizado · Estado da extração, Dados extraídos, Texto OCR");
  assert.doesNotMatch(summary, /cpf|cnpj|supplier|R\$/i);
});

test("audit filters combine text, OS, entity, action, and inclusive date range", () => {
  const events = [
    { id: "1", travel_request_id: "request-1", entity_type: "costs", action: "update", created_at: "2026-10-06T10:00:00Z", actor_name: "Ana Souza", summary: "Custo atualizado · Valor" },
    { id: "2", travel_request_id: "request-2", entity_type: "attachments", action: "insert", created_at: "2026-10-07T10:00:00Z", actor_name: "Bia Lima", summary: "Anexo criado" },
    { id: "3", travel_request_id: "request-1", entity_type: "costs", action: "delete", created_at: "2026-10-08T10:00:00Z", actor_name: "Ana Souza", summary: "Custo removido" }
  ];
  const requests = [{ id: "request-1", os: "OS-101" }, { id: "request-2", os: "OS-202" }];

  assert.deepEqual(filterAuditEvents(events, requests, {
    search: "os-101", request: "request-1", entity: "costs", action: "update",
    start: "2026-10-06", end: "2026-10-06"
  }).map(event => event.id), ["1"]);
  assert.deepEqual(filterAuditEvents(events, requests, { search: "bia lima" }).map(event => event.id), ["2"]);
  assert.deepEqual(filterAuditEvents(events, requests, { start: "2026-10-07", end: "2026-10-08" }).map(event => event.id), ["2", "3"]);
});
