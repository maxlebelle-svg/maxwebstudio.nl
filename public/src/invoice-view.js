import { getCompanySettings, getMailtoLink, getTelephoneLink, getWhatsappLink } from "./services/companySettingsService.js";

const settings = getCompanySettings();
const params = new URLSearchParams(window.location.search);
const invoiceId = params.get("supabaseInvoiceId") || params.get("invoiceId") || "";
const title = document.getElementById("invoice-page-title");
const subtitle = document.getElementById("invoice-page-subtitle");
const card = document.getElementById("invoice-card");

const money = (value) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const formatDate = (value) => { if (!value) return "—"; const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value; const date = new Date(normalized); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); };
function element(tag, className = "", value = "") { const node = document.createElement(tag); if (className) node.className = className; if (value !== "") node.textContent = value; return node; }
function bearer() { for (const key of ["maxwebstudioSupabaseAuthSession", "maxwebstudioCurrentSession"]) { try { const session = JSON.parse(localStorage.getItem(key) || "null"); const token = session?.access_token || session?.session?.access_token || session?.accessToken || ""; if (token) return token; } catch { /* Ongeldige browserdata verleent nooit toegang. */ } } return ""; }

async function request(format = "json") {
  const token = bearer();
  if (!token) throw Object.assign(new Error("Log in om deze factuur veilig te bekijken."), { status: 401 });
  const query = new URLSearchParams({ invoiceId });
  if (format === "pdf") query.set("format", "pdf");
  const response = await fetch(`/api/client-invoice?${query}`, { headers: { Accept: format === "pdf" ? "application/pdf" : "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (format === "pdf") { if (!response.ok) { const data = await response.json().catch(() => ({})); throw Object.assign(new Error(data.error || "De PDF kon niet worden gemaakt."), { status: response.status }); } return response.blob(); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw Object.assign(new Error(data.error || "De factuur kon niet worden geladen."), { status: response.status });
  return data;
}

function statusInfo(status) {
  const map = { paid: ["paid", "Betaald"], expired: ["expired", "Verlopen"], canceled: ["canceled", "Geannuleerd"], failed: ["failed", "Aandacht nodig"], draft: ["sent", "Openstaand"], sent: ["sent", "Openstaand"] };
  const [code, label] = map[status] || ["sent", "Openstaand"];
  return { code, label };
}
function detail(label, value) { const item = document.createElement("div"); item.append(element("dt", "", label), element("dd", "", value || "—")); return item; }
function party(label, heading, values) { const wrap = element("section", "invoice-party"); wrap.append(element("span", "invoice-label", label), element("h3", "", heading || "—")); values.filter(Boolean).forEach((value) => wrap.append(element("p", "", value))); return wrap; }
function lineTable(lines) { const table = element("div", "invoice-line-table"); table.setAttribute("role", "table"); table.setAttribute("aria-label", "Factuurregels"); const head = element("div", "invoice-line-row invoice-line-head"); ["Omschrijving", "Aantal", "Excl. btw", "Btw", "Incl. btw"].forEach((value) => head.append(element("span", "", value))); table.append(head); lines.forEach((line) => { const row = element("div", "invoice-line-row"); [line.description, String(line.quantity), money(line.subtotal), `${line.vatRate}%`, money(line.total)].forEach((value) => row.append(element("span", "", value))); table.append(row); }); return table; }
function totals(invoice) { const wrap = element("div", "invoice-totals"); [["Subtotaal excl. btw", money(invoice.subtotal)], ["Btw", money(invoice.vatAmount)]].forEach(([label, value]) => { const row = element("div", "invoice-total-row"); row.append(element("span", "", label), element("strong", "", value)); wrap.append(row); }); const grand = element("div", "invoice-total-row invoice-total-row-grand"); grand.append(element("span", "", "Totaal incl. btw"), element("strong", "", money(invoice.total))); wrap.append(grand); return wrap; }
function buttonLink(label, href, className = "button secondary", external = false) { const link = element("a", className, label); link.href = href; if (external) { link.target = "_blank"; link.rel = "noopener"; } return link; }

async function downloadPdf(invoice, button, feedback) {
  const original = button.textContent;
  button.disabled = true; button.textContent = "PDF maken..."; feedback.textContent = "De beveiligde PDF wordt samengesteld.";
  try { const blob = await request("pdf"); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${String(invoice.invoiceNumber || "factuur").replace(/[^a-z0-9_-]+/gi, "-")}.pdf`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); feedback.textContent = "De PDF is gedownload."; }
  catch (error) { feedback.textContent = error.message || "De PDF kon niet worden gedownload."; }
  finally { button.disabled = false; button.textContent = original; }
}

function renderInvoice(data) {
  const { invoice, customer, company, lines } = data;
  const invoiceContact = {
    ...settings,
    phoneDisplay: company.phoneDisplay || settings.phoneDisplay,
    phoneInternational: company.phoneInternational || settings.phoneInternational,
  };
  const status = statusInfo(invoice.status);
  title.textContent = invoice.invoiceNumber;
  subtitle.textContent = `${customer.company || customer.name} · ${status.label}`;
  card.className = "invoice-document"; card.setAttribute("aria-busy", "false"); card.replaceChildren();

  const header = element("header", "invoice-document-header");
  const brand = element("div", "invoice-brand"); const logo = document.createElement("img"); logo.src = company.logoUrl || "/max-webstudio-logo-full.svg"; logo.alt = company.companyName || "Max Webstudio"; brand.append(logo);
  const heading = element("div", "invoice-heading"); heading.append(element("h2", "", "Factuur"), element("p", "", invoice.invoiceNumber), element("span", `invoice-status invoice-status-${status.code}`, status.label)); header.append(brand, heading);

  const parties = element("div", "invoice-parties");
  parties.append(
    party("Factuur aan", customer.company || customer.name, [customer.name !== customer.company ? customer.name : "", ...customer.address, customer.email]),
    party("Afzender", company.legalName || company.companyName, [company.addressLine1, company.addressLine2, company.primaryEmail, company.phoneDisplay]),
  );

  const meta = element("dl", "invoice-meta");
  meta.append(detail("Factuurdatum", formatDate(invoice.issuedAt)), detail("Vervaldatum", formatDate(invoice.dueAt)), detail("Referentie", invoice.reference), detail("Status", status.label));

  const payment = element("section", "invoice-payment");
  const paymentCopy = element("div", ""); paymentCopy.append(element("span", "invoice-label", invoice.status === "paid" ? "Betaling ontvangen" : "Veilig betalen"), element("h3", "", invoice.status === "paid" ? "Deze factuur is betaald" : "Rond de betaling af via Mollie"), element("p", "", invoice.status === "paid" ? `Ontvangen op ${formatDate(invoice.paidAt)}. De opdracht kan verder in productie.` : "Na bevestiging door Mollie wordt de betaalstatus automatisch bijgewerkt en de opdracht vrijgegeven aan productie."));
  const paymentActions = element("div", "invoice-payment-actions");
  if (invoice.paymentAvailable && invoice.paymentUrl) paymentActions.append(buttonLink("Betaal veilig via Mollie", invoice.paymentUrl, "button primary", true));
  const pdfButton = element("button", invoice.paymentAvailable ? "button secondary" : "button primary", "Download PDF"); pdfButton.type = "button";
  const feedback = element("p", "admin-form-message", ""); feedback.setAttribute("role", "status"); pdfButton.addEventListener("click", () => downloadPdf(invoice, pdfButton, feedback)); paymentActions.append(pdfButton); payment.append(paymentCopy, paymentActions);

  const companyDetails = element("section", "invoice-company-details");
  const businessValues = [["KvK-nummer", company.kvkNumber], ["Btw-nummer", company.vatNumber], ["IBAN", company.iban], ["Rekeninghouder", company.ibanAccountName], ["E-mail", company.primaryEmail], ["Website", company.websiteUrl?.replace(/^https?:\/\//, "")]];
  businessValues.filter(([, value]) => value).forEach(([label, value]) => { const wrap = document.createElement("div"); wrap.append(element("span", "", label), element("strong", "", value)); companyDetails.append(wrap); });

  const footer = element("nav", "invoice-footer-actions"); footer.setAttribute("aria-label", "Contact en factuurnavigatie"); footer.append(buttonLink("Terug naar klantportaal", "/klantportaal.html#facturen"), buttonLink(invoiceContact.phoneDisplay, getTelephoneLink(invoiceContact)), buttonLink("WhatsApp Max", getWhatsappLink(settings), "button secondary", true));
  card.append(header, parties, meta, element("h3", "", "Factuurregels"), lineTable(lines), totals(invoice), payment, feedback);
  if (companyDetails.childElementCount) card.append(companyDetails);
  card.append(footer);
}

function renderError(error) {
  title.textContent = error.status === 401 ? "Log in om je factuur te bekijken" : "Factuur niet beschikbaar";
  subtitle.textContent = "Factuurgegevens worden uitsluitend na controle van het gekoppelde klantaccount getoond.";
  card.className = "invoice-document invoice-error"; card.setAttribute("aria-busy", "false"); card.replaceChildren(element("p", "section-kicker", "Beveiligde factuur"), element("h2", "", error.message || "De factuur kon niet worden geladen."), element("p", "", "Open de factuur opnieuw vanuit je klantportaal of neem contact op met Max Webstudio."));
  const actions = element("div", "invoice-footer-actions"); actions.append(buttonLink("Naar klantlogin", `/login.html?mode=client&redirect=${encodeURIComponent(location.pathname + location.search)}`, "button primary"), buttonLink(settings.primaryEmail, getMailtoLink(settings, "Vraag over factuur")), buttonLink("WhatsApp Max", getWhatsappLink(settings), "button secondary", true)); card.append(actions);
}

if (!invoiceId) renderError(Object.assign(new Error("Er is geen geldige factuur geselecteerd."), { status: 400 }));
else request().then(renderInvoice).catch(renderError);
