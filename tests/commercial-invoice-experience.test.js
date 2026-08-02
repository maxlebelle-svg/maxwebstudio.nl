const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { generateCommercialInvoicePdf } = require("../functions/services/commercialInvoicePdfService");
const invoiceApi = require("../functions/client-invoice");
const { _private: fulfilment } = require("../functions/services/commercialOfferFulfilmentService");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function sample() {
  return {
    invoice: { id: "11111111-1111-4111-8111-111111111111", invoiceNumber: "OFF-20260802-AB12CD34", title: "Aanbetaling ondertekende opdracht", status: "sent", issuedAt: "2026-08-02", dueAt: "2026-08-16", subtotal: 150, vatAmount: 31.5, total: 181.5 },
    customer: { name: "Jan Jansen", company: "Voorbeeld BV", email: "jan@voorbeeld.nl", address: ["Voorbeeldstraat 1", "1234 AB Amsterdam"] },
    company: { companyName: "Max Webstudio", legalName: "Max Webstudio", primaryEmail: "info@maxwebstudio.nl", phoneDisplay: "085 130 5282", phoneInternational: "+31851305282", websiteUrl: "https://maxwebstudio.nl", kvkNumber: "12345678", vatNumber: "NL123456789B01", iban: "NL00 BANK 0000 0000 00", ibanAccountName: "Max Webstudio" },
    lines: [{ description: "Aanbetaling Starter Site", quantity: 1, unitPrice: 150, vatRate: 21, subtotal: 150, vat: 31.5, total: 181.5 }],
  };
}

test("automatic signed-offer invoices store one exact due-now line instead of full-offer rows", () => {
  const lines = fulfilment.invoiceLines({ lines: [{ componentType: "one_time", productName: "Starter Site" }] }, { subtotal: 150, vat: 31.5, total: 181.5 }, "deposit");
  assert.deepEqual(lines, [{ description: "Aanbetaling Starter Site", quantity: 1, unitPrice: 150, vatRate: 21, subtotal: 150, vat: 31.5, total: 181.5 }]);
});

test("client invoice view exposes exact lines, totals and payment URL only from the owned record", () => {
  const notes = `Ondertekende offerte.\n---\nFactuurregels: ${JSON.stringify({ invoiceLines: sample().lines, commercialOfferVersionId: "22222222-2222-4222-8222-222222222222" })}`;
  const view = invoiceApi._test.buildInvoiceView({ id: sample().invoice.id, invoice_number: sample().invoice.invoiceNumber, title: sample().invoice.title, status: "sent", invoice_date: "2026-08-02", due_date: "2026-08-16", subtotal: 150, vat: 31.5, total: 181.5, mollie_checkout_url: "https://www.mollie.com/paymentscreen/test", notes }, { name: "Jan Jansen", company: "Voorbeeld BV", email: "jan@voorbeeld.nl", metadata: {} }, sample().company);
  assert.equal(view.lines[0].description, "Aanbetaling Starter Site");
  assert.equal(view.invoice.total, 181.5);
  assert.equal(view.invoice.paymentAvailable, true);
  assert.equal(view.company.phoneDisplay, "085 130 5282");
  assert.equal(view.company.phoneInternational, "+31851305282");
  assert.match(view.invoice.paymentUrl, /^https:\/\/www\.mollie\.com\//);
});

test("branded invoice PDF is valid, one page and contains business and payment evidence", () => {
  const result = generateCommercialInvoicePdf(sample());
  const source = result.bytes.toString("latin1");
  assert.equal(result.pageCount, 1);
  assert.equal(result.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.match(result.bytes.subarray(-20).toString("latin1"), /%%EOF/);
  assert.match(source, /Max Webstudio/);
  assert.match(source, /OFF-20260802-AB12CD34/);
  assert.match(source, /Aanbetaling Starter Site/);
  assert.match(source, /KvK 12345678/);
  assert.match(source, /085 130 5282/);
});

test("invoice page uses authenticated server data, Mollie payment and a protected PDF download", () => {
  const page = read("public/factuur.html");
  const script = read("public/src/invoice-view.js");
  const css = read("public/invoice-view.css");
  assert.match(page, /max-webstudio-logo-full\.svg/);
  assert.match(page, /src\/invoice-view\.js/);
  assert.match(script, /\/api\/client-invoice/);
  assert.match(script, /Authorization: `Bearer \$\{token\}`/);
  assert.match(script, /Betaal veilig via Mollie/);
  assert.match(script, /Download PDF/);
  assert.match(script, /phoneInternational: company\.phoneInternational/);
  assert.match(css, /@media print/);
  assert.match(css, /@page\{size:A4/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
});

test("invoice API keeps financial data behind auth and customer ownership checks", () => {
  const api = read("functions/client-invoice.js");
  assert.match(api, /authUser\(context, token\)/);
  assert.match(api, /authorizedCustomer\(context, invoice\.customer_id, user\.id\)/);
  assert.match(api, /customer\.auth_user_id/);
  assert.match(api, /profile\?\.auth_user_id/);
  assert.match(api, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(api, /serviceRoleKey\s*:/i);
});
