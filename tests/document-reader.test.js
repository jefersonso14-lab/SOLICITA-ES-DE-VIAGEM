import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedDocument, parseDocumentFields } from "../src/lib/document-reader.js";

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
