import {
  getCompanySettings,
  getMailtoLink,
  getTelephoneLink,
  getWhatsappLink,
} from "./services/companySettingsService.js";

const settings = getCompanySettings();
const params = new URLSearchParams(window.location.search);
const quoteId = params.get("quoteId") || params.get("supabaseQuoteId") || "";
const title = document.getElementById("quote-page-title");
const subtitle = document.getElementById("quote-page-subtitle");
const card = document.getElementById("quote-card");
let acceptanceKey = globalThis.crypto?.randomUUID?.() || `quote-acceptance-${quoteId}-${Date.now()}`;

const money = (value, currency = "EUR") => new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency,
}).format(Number(value || 0));

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return withTime
    ? parsed.toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" })
    : parsed.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function bearer() {
  for (const key of ["maxwebstudioSupabaseAuthSession", "maxwebstudioCurrentSession"]) {
    try {
      const session = JSON.parse(localStorage.getItem(key) || "null");
      const token = session?.access_token || session?.session?.access_token || session?.accessToken || "";
      if (token) return token;
    } catch { /* Een onleesbare sessie is geen geldige sessie. */ }
  }
  return "";
}

async function request(method = "GET", payload = null) {
  const token = bearer();
  if (!token) throw Object.assign(new Error("Log in om deze offerte veilig te bekijken."), { status: 401 });
  const endpoint = method === "GET"
    ? `/api/client-quote?quoteId=${encodeURIComponent(quoteId)}`
    : "/api/client-quote";
  const response = await fetch(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw Object.assign(new Error(data.error || "De offerte kon niet worden geladen."), { status: response.status });
  }
  return data;
}

function detail(label, value) {
  const item = element("div", "offer-detail");
  item.append(element("dt", "", label), element("dd", "", value || "—"));
  return item;
}

function section(kicker, heading) {
  const wrap = element("section", "offer-section");
  const header = element("header", "offer-section-heading");
  header.append(element("p", "section-kicker", kicker), element("h3", "", heading));
  wrap.append(header);
  return wrap;
}

function actionLink(label, href, className = "button secondary", external = false) {
  const link = element("a", className, label);
  link.href = href;
  if (external) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

function contactActions(subject) {
  const actions = element("div", "offer-contact-actions");
  actions.append(
    actionLink("WhatsApp Max", getWhatsappLink(settings), "button secondary", true),
    actionLink(settings.phoneDisplay, getTelephoneLink(settings)),
    actionLink(settings.primaryEmail, getMailtoLink(settings, subject)),
  );
  return actions;
}

function statusInfo(quote) {
  if (quote.acceptance) return { code: "accepted", label: "Geaccepteerd" };
  const normalized = String(quote.status || "").toLowerCase();
  const expired = quote.validUntil && new Date(`${quote.validUntil}T23:59:59`) < new Date();
  if (expired) return { code: "expired", label: "Verlopen" };
  const labels = {
    draft: "Concept",
    concept: "Concept",
    sent: "Ter beoordeling",
    verzonden: "Ter beoordeling",
    viewed: "Bekeken",
    bekeken: "Bekeken",
    declined: "Afgewezen",
    afgewezen: "Afgewezen",
    archived: "Gearchiveerd",
    gearchiveerd: "Gearchiveerd",
  };
  return { code: normalized || "unknown", label: labels[normalized] || quote.status || "Onbekend" };
}

function lineTable(quote) {
  const table = element("div", "offer-line-table");
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", "Offertregels");
  const head = element("div", "offer-line-row offer-line-head");
  head.setAttribute("role", "row");
  ["Omschrijving", "Aantal", "Prijs excl. btw", "Btw", "Bedrag excl. btw"].forEach((value) => {
    const cell = element("span", "", value);
    cell.setAttribute("role", "columnheader");
    head.append(cell);
  });
  table.append(head);
  quote.lines.forEach((line) => {
    const row = element("div", "offer-line-row");
    row.setAttribute("role", "row");
    const values = [
      line.description,
      String(line.quantity),
      money(line.unitPrice, quote.currency),
      `${line.vatRate}%`,
      money(line.lineTotal || line.quantity * line.unitPrice, quote.currency),
    ];
    values.forEach((value) => {
      const cell = element("span", "", value);
      cell.setAttribute("role", "cell");
      row.append(cell);
    });
    table.append(row);
  });
  return table;
}

function totals(quote) {
  const wrap = element("dl", "offer-totals");
  wrap.append(
    detail("Subtotaal excl. btw", money(quote.subtotal, quote.currency)),
    detail("Btw", money(quote.vat, quote.currency)),
  );
  const total = detail("Totaal incl. btw", money(quote.total, quote.currency));
  total.classList.add("offer-grand-total");
  wrap.append(total);
  return wrap;
}

function linkedDocuments(quote) {
  const links = element("nav", "offer-document-links");
  links.setAttribute("aria-label", "Gekoppelde voorwaarden en documenten");
  links.append(
    actionLink("Algemene voorwaarden", "algemene-voorwaarden.html", "offer-document-link"),
    actionLink("Privacyverklaring", "privacyverklaring.html", "offer-document-link"),
  );
  if (/hosting|onderhoud/i.test(`${quote.type || ""} ${quote.title || ""} ${quote.proposal || ""}`)) {
    links.append(actionLink("Hosting- en onderhoudsvoorwaarden", "hosting-onderhoud-voorwaarden.html", "offer-document-link"));
  }
  return links;
}

function acceptanceSection(quote) {
  const wrap = section("Digitaal akkoord", quote.acceptance ? "Acceptatie vastgelegd" : "Deze offerteversie accepteren");
  if (quote.acceptance) {
    const notice = element("div", "offer-acceptance-success");
    notice.append(
      element("strong", "", `Akkoord ontvangen op ${formatDate(quote.acceptance.acceptedAt, true)}`),
      element("p", "", `Versie ${quote.acceptance.quoteVersion} en totaal ${money(quote.acceptance.total, quote.acceptance.currency)} zijn onveranderlijk aan dit akkoord gekoppeld.`),
      element("small", "", `Bewijsreferentie ${quote.acceptance.quoteChecksum || quote.checksum}`),
    );
    wrap.append(notice);
    return wrap;
  }

  if (!quote.acceptable) {
    const notice = element("div", "offer-acceptance-unavailable");
    notice.append(
      element("strong", "", "Deze versie kan niet meer worden geaccepteerd."),
      element("p", "", "De geldigheid kan zijn verlopen of de offerte kan zijn vervangen, ingetrokken of nog niet definitief verzonden. Vraag Max Webstudio om de actuele versie."),
    );
    wrap.append(notice, contactActions(`Actuele offerte aanvragen · ${quote.quoteNumber}`));
    return wrap;
  }

  const intro = element("p", "offer-section-intro", "Controleer de scope, bedragen, geldigheid en gekoppelde documenten. Na bevestiging wordt het akkoord server-side aan precies deze versie en checksum gekoppeld.");
  const form = element("form", "offer-accept-form");
  const consentLabel = element("label", "quote-consent");
  const consent = document.createElement("input");
  consent.type = "checkbox";
  consent.required = true;
  const statement = element("span", "", quote.acceptanceStatement || `Ik ga akkoord met offerte ${quote.quoteNumber}, versie ${quote.version}. Dit is geen betaling.`);
  consentLabel.append(consent, statement);
  const proof = element("p", "offer-proof-note", `Vastgelegd worden onder meer versie ${quote.version}, de offertechecksum, het tijdstip en je beveiligde accountsessie. Er wordt geen betaling gestart.`);
  const feedback = element("p", "offer-form-feedback", "Je kunt het akkoord pas bevestigen nadat je de verklaring hebt aangevinkt.");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  const button = element("button", "button primary", "Offerteversie accepteren");
  button.type = "submit";
  button.disabled = true;
  consent.addEventListener("change", () => {
    button.disabled = !consent.checked;
    feedback.textContent = consent.checked
      ? "Klaar om het akkoord veilig vast te leggen."
      : "Je kunt het akkoord pas bevestigen nadat je de verklaring hebt aangevinkt.";
  });
  form.append(consentLabel, proof, feedback, button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!consent.checked) return;
    button.disabled = true;
    button.textContent = "Akkoord controleren en vastleggen...";
    feedback.textContent = "De actuele versie, checksum en bedragen worden opnieuw server-side gecontroleerd.";
    try {
      const data = await request("POST", {
        action: "accept",
        quoteId: quote.id,
        expectedVersion: quote.version,
        expectedChecksum: quote.checksum,
        idempotencyKey: acceptanceKey,
      });
      renderQuote(data.quote);
    } catch (error) {
      feedback.textContent = error.message || "Akkoord kon niet worden vastgelegd.";
      button.disabled = false;
      button.textContent = "Opnieuw proberen";
    }
  });
  wrap.append(intro, form);
  return wrap;
}

function renderError(error) {
  card.className = "offer-document offer-error";
  card.setAttribute("aria-busy", "false");
  title.textContent = error.status === 401 ? "Log in om je offerte te bekijken" : "Offerte niet beschikbaar";
  subtitle.textContent = "De offerte wordt uitsluitend vanuit de beveiligde serveromgeving geladen.";
  card.replaceChildren(
    element("p", "section-kicker", error.status === 401 ? "Beveiligde toegang" : "Niet beschikbaar"),
    element("h2", "", error.message || "De offerte kon niet worden geladen."),
    element("p", "offer-section-intro", "Open de offerte opnieuw vanuit je klantportaal. Blijft dit gebeuren, neem dan contact op met Max Webstudio."),
  );
  if (error.status === 401) {
    const login = actionLink("Inloggen en offerte openen", `login.html?mode=client&next=${encodeURIComponent(location.pathname + location.search)}`, "button primary");
    card.append(login);
  }
  card.append(contactActions("Offerte niet beschikbaar"));
}

function renderQuote(quote) {
  card.className = "offer-document";
  card.setAttribute("aria-busy", "false");
  card.replaceChildren();
  const status = statusInfo(quote);
  title.textContent = quote.title || quote.quoteNumber || "Jouw offerte";
  subtitle.textContent = `${quote.quoteNumber} · versie ${quote.version} · ${status.label}`;

  const header = element("header", "offer-document-header");
  const heading = element("div", "");
  heading.append(element("p", "section-kicker", "Max Webstudio · zakelijke offerte"), element("h2", "", quote.quoteNumber));
  const badge = element("span", `offer-status offer-status-${status.code}`, status.label);
  header.append(heading, badge);

  const overview = element("section", "offer-overview");
  const overviewCopy = element("div", "offer-overview-copy");
  overviewCopy.append(
    element("span", "offer-label", quote.type || "Persoonlijk voorstel"),
    element("h3", "", quote.title || "Voorstel van Max Webstudio"),
    element("p", "", quote.proposal || "Hieronder staat de scope zoals deze server-side in de offerte is vastgelegd."),
  );
  const investment = element("div", "offer-investment");
  investment.append(element("span", "", "Totale investering incl. btw"), element("strong", "", money(quote.total, quote.currency)), element("small", "", `${money(quote.subtotal, quote.currency)} excl. btw`));
  overview.append(overviewCopy, investment);

  const meta = element("dl", "offer-meta");
  meta.append(
    detail("Offertenummer", quote.quoteNumber),
    detail("Versie", String(quote.version)),
    detail("Offertedatum", formatDate(quote.quoteDate)),
    detail("Geldig tot en met", formatDate(quote.validUntil)),
  );

  const scope = section("Scope en investering", "Wat is opgenomen in deze offerte?");
  scope.append(lineTable(quote), totals(quote));

  const conditions = section("Afspraken", "Duidelijkheid vóór akkoord");
  const conditionGrid = element("div", "offer-condition-grid");
  [
    ["Scope", "Alleen de hierboven opgenomen onderdelen, aantallen en bedragen behoren tot deze offerteversie."],
    ["Geldigheid", `Deze versie is geldig tot en met ${formatDate(quote.validUntil)}. Daarna kan een nieuwe prijs- of scopecontrole nodig zijn.`],
    ["Betaling", "Het accepteren van deze offerte start geen betaling. Facturatie en betaling volgen de gekoppelde overeenkomst en voorwaarden."],
    ["Wijzigingen", "Een inhoudelijke wijziging van scope of prijs vereist een nieuwe offerteversie, zodat het akkoord controleerbaar blijft."],
  ].forEach(([headingText, body]) => {
    const item = element("article", "offer-condition");
    item.append(element("strong", "", headingText), element("p", "", body));
    conditionGrid.append(item);
  });
  conditions.append(conditionGrid, linkedDocuments(quote));

  const integrity = section("Versie en integriteit", "Controleerbare documentreferentie");
  const integrityGrid = element("dl", "offer-integrity");
  integrityGrid.append(
    detail("Offerteversie", `${quote.quoteNumber} · versie ${quote.version}`),
    detail("Template", "Offerteweergave 2026-08 B2B"),
  );
  const checksumItem = detail("Checksum", quote.checksum);
  checksumItem.classList.add("offer-checksum");
  integrityGrid.append(checksumItem);
  integrity.append(integrityGrid, element("p", "offer-proof-note", "Bij acceptatie worden deze versie, checksum, bedragen, het tijdstip en de beschikbare technische bewijsgegevens vastgelegd."));

  const actions = element("footer", "offer-document-footer");
  const print = element("button", "button secondary", "Printen of opslaan als PDF");
  print.type = "button";
  print.addEventListener("click", () => window.print());
  actions.append(print, actionLink("Terug naar klantportaal", "klantportaal.html", "button secondary"));

  card.append(header, overview, meta, scope, conditions, integrity, acceptanceSection(quote), actions, contactActions(`Vraag over ${quote.quoteNumber}`));
}

if (!quoteId) {
  renderError(Object.assign(new Error("Offerte-ID ontbreekt in de link."), { status: 400 }));
} else {
  request().then(({ quote }) => renderQuote(quote)).catch(renderError);
}
