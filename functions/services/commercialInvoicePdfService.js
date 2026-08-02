const { _test: pdf } = require("./commercialOfferPdfService");

const W = 595;
const H = 842;
const C = {
  navy: [0.024, 0.071, 0.122],
  navy2: [0.043, 0.125, 0.204],
  cyan: [0.098, 0.761, 1],
  white: [1, 1, 1],
  ink: [0.078, 0.129, 0.188],
  muted: [0.4, 0.439, 0.522],
  line: [0.851, 0.89, 0.925],
  paper: [0.961, 0.973, 0.984],
  green: [0.051, 0.608, 0.439],
  soft: [0.749, 0.816, 0.867],
};

function generateCommercialInvoicePdf(input = {}) {
  const invoice = input.invoice || {};
  const customer = input.customer || {};
  const company = input.company || {};
  const lines = Array.isArray(input.lines) && input.lines.length ? input.lines.slice(0, 5) : [fallbackLine(invoice)];
  const number = clean(invoice.invoiceNumber || invoice.invoice_number) || "Factuur";
  const status = statusLabel(invoice.status);
  const commands = [
    rect(0, 0, W, H, C.white),
    rect(0, 732, W, 110, C.navy),
    roundedRect(42, 766, 38, 38, 11, C.navy2),
    centerText("M", 61, 778, 20, "F2", C.white),
    strokeLine(68, 796, 75, 796, C.cyan, 2.2), strokeLine(75, 796, 75, 789, C.cyan, 2.2),
    text("Max Webstudio", 92, 788, 18, "F2", C.white),
    text("BUILD BETTER ONLINE", 92, 773, 6.5, "F2", C.cyan),
    rightText("FACTUUR", 553, 790, 8, "F2", C.cyan),
    rightText(number, 553, 764, 14, "F2", C.white),
    text("FACTUUR AAN", 42, 697, 7, "F2", C.muted),
    text(truncate(clean(customer.company || customer.name) || "Klant", 42), 42, 672, 15, "F2", C.navy),
    text(truncate(clean(customer.name), 48), 42, 652, 8.5, "F1", C.muted),
    text(truncate(clean(customer.email), 56), 42, 636, 8.5, "F1", C.muted),
    text("AFZENDER", 330, 697, 7, "F2", C.muted),
    text(truncate(clean(company.legalName || company.companyName) || "Max Webstudio", 36), 330, 672, 10.5, "F2", C.navy),
    ...companyAddress(company, 330, 653),
    roundedRect(42, 555, 511, 55, 11, C.paper, C.line, 0.7),
    meta("Factuurdatum", dateLabel(invoice.issuedAt || invoice.invoice_date || invoice.createdAt), 62, 580),
    meta("Vervaldatum", dateLabel(invoice.dueAt || invoice.due_date), 232, 580),
    meta("Status", status, 402, 580, status === "Betaald" ? C.green : C.navy),
    text("OMSCHRIJVING", 52, 520, 7, "F2", C.muted),
    rightText("EXCL. BTW", 420, 520, 7, "F2", C.muted),
    rightText("BTW", 486, 520, 7, "F2", C.muted),
    rightText("INCL. BTW", 543, 520, 7, "F2", C.muted),
    strokeLine(42, 509, 553, 509, C.line, 0.7),
  ];

  let y = 482;
  lines.forEach((line, index) => {
    if (index > 0) commands.push(strokeLine(42, y + 14, 553, y + 14, C.line, 0.45));
    commands.push(text(truncate(clean(line.description) || "Factuurregel", 54), 52, y, 8.8, "F2", C.ink));
    if (Number(line.quantity || 1) !== 1) commands.push(text(`${Number(line.quantity)} x`, 52, y - 14, 7.2, "F1", C.muted));
    commands.push(rightText(money(line.subtotal), 420, y, 8.5, "F1", C.ink));
    commands.push(rightText(`${numberValue(line.vatRate)}%`, 486, y, 8.5, "F1", C.ink));
    commands.push(rightText(money(line.total ?? numberValue(line.subtotal) + numberValue(line.vat)), 543, y, 8.8, "F2", C.ink));
    y -= 38;
  });

  // Reserve a clear band between the final invoice line and the payment/totals
  // section. Automatic fulfilment invoices currently contain one exact line,
  // but this also keeps manually composed invoices readable up to five lines.
  const totalY = Math.max(185, y - 130);
  commands.push(roundedRect(315, totalY, 238, 106, 12, C.navy));
  commands.push(text("Subtotaal", 334, totalY + 76, 8, "F1", C.soft), rightText(money(invoice.subtotal), 533, totalY + 76, 8.5, "F2", C.white));
  commands.push(text("Btw", 334, totalY + 52, 8, "F1", C.soft), rightText(money(invoice.vatAmount ?? invoice.vat), 533, totalY + 52, 8.5, "F2", C.white));
  commands.push(strokeLine(334, totalY + 39, 533, totalY + 39, [0.153, 0.267, 0.353], 0.7));
  commands.push(text("Totaal incl. btw", 334, totalY + 17, 9, "F2", C.white), rightText(money(invoice.total), 533, totalY + 17, 14, "F2", C.cyan));

  commands.push(text("BETALING", 42, totalY + 82, 7, "F2", C.muted));
  if (status === "Betaald") {
    commands.push(circle(48, totalY + 54, 6, C.green), text("Betaling ontvangen", 62, totalY + 51, 9, "F2", C.green));
    commands.push(text(`Betaald op ${dateLabel(invoice.paidAt || invoice.paid_at)}`, 42, totalY + 29, 8, "F1", C.muted));
  } else {
    commands.push(text("Betaal veilig via de Mollie-link in de e-mail of het klantportaal.", 42, totalY + 54, 8.2, "F1", C.ink));
    const iban = clean(company.iban);
    if (iban) commands.push(text(`IBAN ${iban}${clean(company.ibanAccountName) ? ` t.n.v. ${clean(company.ibanAccountName)}` : ""}`, 42, totalY + 33, 7.5, "F1", C.muted));
    commands.push(text(`Vermeld bij handmatige betaling: ${number}`, 42, totalY + 14, 7.5, "F1", C.muted));
  }

  commands.push(strokeLine(42, 62, 553, 62, C.line, 0.6));
  commands.push(text(companyFooter(company), 42, 42, 6.8, "F1", C.muted));
  commands.push(rightText("Pagina 1 / 1", 553, 42, 6.8, "F1", C.muted));
  const content = commands.flat().filter(Boolean).join("\n");
  return {
    bytes: pdf.buildPdf([content], number, `invoice:${clean(invoice.id)} | status:${clean(invoice.status)}`, { title: `Factuur ${number}`, subject: "Zakelijke factuur Max Webstudio" }),
    pageCount: 1,
    reference: number,
  };
}

function companyAddress(company, x, y) {
  const values = [company.addressLine1, company.addressLine2, company.primaryEmail, company.websiteUrl].map(clean).filter(Boolean).slice(0, 4);
  return values.map((value, index) => text(truncate(value, 45), x, y - index * 15, 7.7, "F1", C.muted));
}
function companyFooter(company) { return [clean(company.tradeName || company.companyName), clean(company.kvkNumber) && `KvK ${clean(company.kvkNumber)}`, clean(company.vatNumber) && `Btw ${clean(company.vatNumber)}`, clean(company.primaryEmail)].filter(Boolean).join("  |  "); }
function fallbackLine(invoice) { return { description: clean(invoice.title) || "Factuur", quantity: 1, subtotal: numberValue(invoice.subtotal), vatRate: numberValue(invoice.subtotal) ? Math.round((numberValue(invoice.vatAmount ?? invoice.vat) / numberValue(invoice.subtotal)) * 10000) / 100 : 0, vat: numberValue(invoice.vatAmount ?? invoice.vat), total: numberValue(invoice.total) }; }
function meta(label, value, x, y, color = C.navy) { return [text(label.toUpperCase(), x, y + 8, 6.5, "F2", C.muted), text(value || "-", x, y - 10, 8.8, "F2", color)]; }
function statusLabel(value) { const status = clean(value).toLowerCase(); return status === "paid" || status === "betaald" ? "Betaald" : status === "expired" || status === "verlopen" ? "Verlopen" : status === "canceled" || status === "cancelled" ? "Geannuleerd" : "Openstaand"; }
function dateLabel(value) { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) return "-"; return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(date); }
function money(value) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(numberValue(value)); }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function clean(value) { return String(value ?? "").trim(); }
function truncate(value, max) { const result = clean(value); return result.length > max ? `${result.slice(0, max - 3)}...` : result; }
function pdfText(value) { return pdf.pdfText(value); }
function n(value) { return Number(value).toFixed(2); }
function rect(x, y, w, h, fill) { return `${fill.join(" ")} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`; }
function roundedRect(x, y, w, h, r, fill, stroke = null, width = 1) { const k = 0.55228475; const c = r * k; const path = `${n(x + r)} ${n(y)} m ${n(x + w - r)} ${n(y)} l ${n(x + w - r + c)} ${n(y)} ${n(x + w)} ${n(y + r - c)} ${n(x + w)} ${n(y + r)} c ${n(x + w)} ${n(y + h - r)} l ${n(x + w)} ${n(y + h - r + c)} ${n(x + w - r + c)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c ${n(x + r)} ${n(y + h)} l ${n(x + r - c)} ${n(y + h)} ${n(x)} ${n(y + h - r + c)} ${n(x)} ${n(y + h - r)} c ${n(x)} ${n(y + r)} l ${n(x)} ${n(y + r - c)} ${n(x + r - c)} ${n(y)} ${n(x + r)} ${n(y)} c h`; return `${fill.join(" ")} rg ${stroke ? `${stroke.join(" ")} RG ${n(width)} w ` : ""}${path} ${stroke ? "B" : "f"}`; }
function circle(x, y, r, fill) { const c = r * 0.55228475; return `${fill.join(" ")} rg ${n(x + r)} ${n(y)} m ${n(x + r)} ${n(y + c)} ${n(x + c)} ${n(y + r)} ${n(x)} ${n(y + r)} c ${n(x - c)} ${n(y + r)} ${n(x - r)} ${n(y + c)} ${n(x - r)} ${n(y)} c ${n(x - r)} ${n(y - c)} ${n(x - c)} ${n(y - r)} ${n(x)} ${n(y - r)} c ${n(x + c)} ${n(y - r)} ${n(x + r)} ${n(y - c)} ${n(x + r)} ${n(y)} c f`; }
function strokeLine(x1, y1, x2, y2, color, width = 1) { return `${color.join(" ")} RG ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`; }
function text(value, x, y, size, font, color) { return `${color.join(" ")} rg BT /${font} ${n(size)} Tf 1 0 0 1 ${n(x)} ${n(y)} Tm (${pdfText(value)}) Tj ET`; }
function estimateWidth(value, size, font) { const factor = font === "F2" ? 0.55 : 0.5; return Array.from(clean(value)).reduce((total, character) => total + (character === " " ? 0.45 : character === "i" || character === "l" ? 0.28 : character === "W" || character === "M" ? 0.88 : factor), 0) * size; }
function rightText(value, x, y, size, font, color) { return text(value, x - estimateWidth(value, size, font), y, size, font, color); }
function centerText(value, x, y, size, font, color) { return text(value, x - estimateWidth(value, size, font) / 2, y, size, font, color); }

module.exports = { generateCommercialInvoicePdf, _test: { statusLabel, fallbackLine, companyFooter } };
