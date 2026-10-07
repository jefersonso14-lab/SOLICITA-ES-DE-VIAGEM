import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedDocument, parseDocumentFields } from "../src/lib/document-reader.js";
import { buildCostComposition } from "../src/lib/cost-composition.js";

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
