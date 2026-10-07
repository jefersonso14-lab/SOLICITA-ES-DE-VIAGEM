const MIME_BY_EXTENSION = {
  pdf: "application/pdf", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png"
};

export function isSupportedDocument(file) {
  const extension = file?.name?.split(".").pop()?.toLowerCase();
  return Boolean(extension && MIME_BY_EXTENSION[extension]);
}

function foldText(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function parseDocumentFields(text, context = {}) {
  const normalized = text.replace(/\s+/g, " ");
  const moneyCandidates = [...normalized.matchAll(/(?:R\$\s*)?\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\b/g)]
    .map(match => Number(match[1].replace(/\./g, "").replace(",", "."))).filter(Number.isFinite);
  const dateMatch = normalized.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/);
  const date = dateMatch ? (dateMatch[4] ? `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}` : `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`) : "";
  const taxId = normalized.match(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{11}|\d{14})\b/)?.[0] || "";
  const number = normalized.match(/(?:nota fiscal|n[úu]mero|documento|nf-e|nfe)\s*(?:n[ºo.]?\s*)?[:#-]?\s*([\w./-]{3,})/i)?.[1] || "";
  const supplier = normalized.match(/(?:fornecedor|emitente|raz[aã]o social)\s*[:\-]\s*([^,;]{3,100}?)(?=\s+(?:nota fiscal|n[úu]mero|documento|nf-e|nfe|cpf|cnpj|data|total|valor)\b|[,;]|$)/i)?.[1]?.trim() || "";
  const categoryText = foldText(normalized);
  const category = /hotel|hosped|pousada/.test(categoryText) ? "hotel"
    : /uber|taxi|\b99\b/.test(categoryText) ? "uber"
      : /combust|posto|gasolina|diesel/.test(categoryText) ? "fuel"
        : /passagem|aereo|bilhete/.test(categoryText) ? "ticket"
          : /lavanderia|lavagem de roupa/.test(categoryText) ? "laundry"
            : /refeicao|restaurante|lanchonete|almoco|jantar/.test(categoryText) ? "meal"
              : /locacao de (veiculo|carro)|aluguel de (veiculo|carro)/.test(categoryText) ? "vehicle"
                : /pedagio|toll/.test(categoryText) ? "toll"
                  : /estacionamento|parking/.test(categoryText) ? "parking" : "other";
  const collaboratorNames = [...(context.collaborators || [])].map(item => typeof item === "string" ? item : item?.name).filter(Boolean).sort((a, b) => b.length - a.length);
  const foldedText = foldText(normalized);
  const collaborator = context.collaborator || collaboratorNames.find(name => {
    const foldedName = foldText(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${foldedName}($|[^\\p{L}\\p{N}])`, "u").test(foldedText);
  }) || "";
  return {
    amount: moneyCandidates.length ? Math.max(...moneyCandidates) : null,
    date, supplier, document_number: number, tax_id: taxId,
    category, collaborator, os: context.os || ""
  };
}

async function ocrImage(image) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por");
  try { return (await worker.recognize(image)).data.text || ""; }
  finally { await worker.terminate(); }
}

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 10); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map(item => item.str).join(" "));
  }
  let text = pageTexts.join("\n").trim();
  let method = "text";
  if (text.replace(/\s/g, "").length < 20) {
    method = "ocr";
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
    text = await ocrImage(canvas);
  }
  return { text, method };
}

export async function readDocument(file, context = {}) {
  if (!isSupportedDocument(file)) throw new Error("Formato não suportado.");
  const extension = file.name.split(".").pop().toLowerCase();
  let text = "";
  let method = "text";
  if (extension === "pdf") {
    const result = await extractPdf(file);
    text = result.text;
    method = result.method;
  } else if (["jpg", "jpeg", "png"].includes(extension)) {
    text = await ocrImage(file); method = "ocr";
  } else {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    text = workbook.SheetNames.map(name => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n");
  }
  return { fields: parseDocumentFields(text, context), text: text.slice(0, 20000), method };
}
