const crypto = require("crypto");

const BUILD_STATUSES = new Set(["queued", "briefing", "building", "quality_check", "deploying", "completed", "quality_failed", "failed"]);

function buildWebsitePackage({ journey = {}, briefing = "", version = 1 }) {
  const businessName = cleanText(journey.businessName || journey.business_name) || "Demo bedrijf";
  const contactName = cleanText(journey.contactName || journey.contact_name) || "Contactpersoon";
  const email = cleanText(journey.email).toLowerCase();
  const phone = cleanText(journey.phone);
  const websiteUrl = cleanText(journey.websiteUrl || journey.website_url);
  const internalNotes = cleanText(journey.internalNotes || journey.internal_notes);
  const combinedBriefing = cleanText(briefing || journey.generatedBriefing || journey.generated_briefing || internalNotes);
  const industry = extractField(combinedBriefing, ["Branche/regio", "Branche"]) || inferIndustry(combinedBriefing, businessName);
  const services = extractServices(combinedBriefing, industry);
  const cta = inferCta(combinedBriefing);
  const colors = inferColors(industry);
  const style = inferStyle(combinedBriefing);
  const pages = ["Home", "Diensten", "Projecten", "Over ons", "Contact"];
  const title = `${businessName} - professionele website-preview`;
  const description = `${businessName} helpt klanten met ${services.slice(0, 2).join(" en ")}. Bekijk de eerste website-preview.`;
  const html = renderHtml({ businessName, contactName, email, phone, websiteUrl, industry, services, cta, colors, style, title, description });
  const css = renderCss(colors);
  const script = renderScript();
  const briefingJson = {
    businessName,
    contactName,
    email,
    phone,
    websiteUrl,
    industry,
    style,
    colors,
    services,
    customerWishes: combinedBriefing,
    desiredPages: pages,
    ctaPreference: cta,
    version,
  };
  const assetsMap = {
    logo: "text-brand",
    hero: "css-generated-layout",
    icons: ["services", "trust", "contact"],
  };
  const readme = [
    `# ${businessName} preview V${version}`,
    "",
    "Interne website-preview voorbereid door de Website Factory.",
    "",
    "## Inhoud",
    "- index.html",
    "- styles.css",
    "- script.js",
    "- assets-map.json",
    "- briefing.json",
    "- README.md",
    "",
    "Controleer de preview intern voordat deze naar de klant gaat.",
  ].join("\n");

  return {
    version,
    generatedAt: new Date().toISOString(),
    businessName,
    files: [
      { path: "index.html", content: html },
      { path: "styles.css", content: css },
      { path: "script.js", content: script },
      { path: "assets-map.json", content: JSON.stringify(assetsMap, null, 2) },
      { path: "briefing.json", content: JSON.stringify(briefingJson, null, 2) },
      { path: "README.md", content: readme },
    ],
    meta: briefingJson,
  };
}

function runQualityCheck({ generatedPackage = {}, journey = {} }) {
  const files = Array.isArray(generatedPackage.files) ? generatedPackage.files : [];
  const html = fileContent(files, "index.html");
  const css = fileContent(files, "styles.css");
  const script = fileContent(files, "script.js");
  const businessName = cleanText(generatedPackage.businessName || journey.businessName || journey.business_name);
  const services = generatedPackage.meta?.services || [];
  const checks = [
    check("Hero aanwezig", /<header[\s\S]*class="[^"]*hero/i.test(html) || /<section[\s\S]*class="[^"]*hero/i.test(html), 10),
    check("CTA aanwezig", /class="[^"]*button/i.test(html) && /(contact|advies|afspraak|kennismaking|offerte)/i.test(html), 10),
    check("Dienstensectie aanwezig", /id="diensten"|Diensten|Onze aanpak/i.test(html), 10),
    check("Contactsectie aanwezig", /id="contact"|mailto:|tel:/i.test(html), 10),
    check("Footer aanwezig", /<footer/i.test(html), 8),
    check("Meta title aanwezig", /<title>[^<]{8,}<\/title>/i.test(html), 7),
    check("Meta description aanwezig", /<meta\s+name="description"\s+content="[^"]{20,}"/i.test(html), 7),
    check("Responsive viewport aanwezig", /<meta\s+name="viewport"/i.test(html), 7),
    check("Geen lorem ipsum", !/lorem ipsum|dolor sit amet/i.test(html), 8),
    check("Geen placeholders", !/\[placeholder\]|\{\{|\}\}|TODO/i.test(html), 8),
    check("Bedrijfsnaam aanwezig", businessName && html.toLowerCase().includes(businessName.toLowerCase()), 7),
    check("CTA niet leeg", />\s*(Plan|Vraag|Neem|Bel|Start|Bekijk)[^<]+</i.test(html), 4),
    check("HTML basis klopt", /<!doctype html>/i.test(html) && /<\/html>/i.test(html) && /<\/body>/i.test(html), 6),
    check("Script statisch veilig", script ? !/document\.write|eval\(|fetch\(/i.test(script) : true, 4),
    check("Branche of diensten aanwezig", services.some((service) => html.toLowerCase().includes(String(service).toLowerCase())) || /branche|diensten/i.test(html), 8),
    check("CSS aanwezig", css.length > 500, 6),
  ];
  const maxScore = checks.reduce((sum, item) => sum + item.weight, 0);
  const earned = checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const score = Math.round((earned / maxScore) * 100);
  return {
    score,
    passed: score >= 70,
    status: score >= 70 ? "completed" : "quality_failed",
    summary: score >= 70 ? "Preview klaar voor interne controle." : "Preview heeft aandacht nodig voordat deze klantklaar is.",
    checks,
  };
}

function buildLogs(...entries) {
  return entries.flat().filter(Boolean).map((entry, index) => ({
    index: index + 1,
    at: entry.at || new Date().toISOString(),
    step: entry.step || "factory",
    message: entry.message || String(entry),
  }));
}

function nextPreviewVersion(versions = [], jobs = []) {
  const versionNumbers = [
    ...versions.map((item) => Number(item.version || item.preview_version || 0)),
    ...jobs.map((item) => Number(item.previewVersion || item.preview_version || 0)),
  ].filter(Number.isFinite);
  return Math.max(0, ...versionNumbers) + 1;
}

function previewUrlFor({ journeyId, token }) {
  return `/.netlify/functions/demo-preview?id=${encodeURIComponent(journeyId)}&token=${encodeURIComponent(token)}`;
}

function makePreviewToken() {
  return crypto.randomBytes(18).toString("hex");
}

function normalizeBuildJob(row = {}) {
  return {
    id: cleanText(row.id),
    demoJourneyId: cleanText(row.demo_journey_id),
    leadId: cleanText(row.lead_id),
    customerId: cleanText(row.customer_id),
    status: cleanText(row.status),
    currentStep: cleanText(row.current_step),
    progress: Number(row.progress || 0),
    previewVersion: Number(row.preview_version || 1),
    previewUrl: cleanText(row.preview_url),
    previewToken: cleanText(row.preview_token),
    previewScore: row.preview_score === null || row.preview_score === undefined ? null : Number(row.preview_score),
    qualityReport: row.quality_report && typeof row.quality_report === "object" ? row.quality_report : null,
    generatedPackage: row.generated_package && typeof row.generated_package === "object" ? row.generated_package : null,
    buildLogs: Array.isArray(row.build_logs) ? row.build_logs : [],
    errorMessage: cleanText(row.error_message),
    startedAt: cleanText(row.started_at),
    finishedAt: cleanText(row.finished_at),
    createdBy: cleanText(row.created_by),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizePreviewVersion(row = {}) {
  return {
    id: cleanText(row.id),
    demoJourneyId: cleanText(row.demo_journey_id),
    buildJobId: cleanText(row.build_job_id),
    version: Number(row.version || 1),
    previewUrl: cleanText(row.preview_url),
    previewToken: cleanText(row.preview_token),
    previewScore: row.preview_score === null || row.preview_score === undefined ? null : Number(row.preview_score),
    qualityReport: row.quality_report && typeof row.quality_report === "object" ? row.quality_report : null,
    generatedPackage: row.generated_package && typeof row.generated_package === "object" ? row.generated_package : null,
    isActive: row.is_active !== false,
    createdAt: cleanText(row.created_at),
    createdBy: cleanText(row.created_by),
  };
}

function isBuildStatus(value = "") {
  return BUILD_STATUSES.has(cleanText(value));
}

function check(label, passed, weight) {
  return { label, passed: Boolean(passed), weight };
}

function fileContent(files, path) {
  return String(files.find((file) => file.path === path)?.content || "");
}

function extractField(text = "", labels = []) {
  const lines = String(text || "").split(/\r?\n/);
  for (const label of labels) {
    const line = lines.find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
    if (line) return cleanText(line.split(":").slice(1).join(":"));
  }
  return "";
}

function extractServices(text = "", industry = "") {
  const normalized = `${text} ${industry}`.toLowerCase();
  if (/bouw|timmer|renovatie|aannemer/.test(normalized)) return ["Renovatie", "Maatwerk", "Projectbegeleiding"];
  if (/restaurant|horeca|cafe|catering/.test(normalized)) return ["Menu", "Reserveren", "Catering"];
  if (/kapper|salon|beauty/.test(normalized)) return ["Behandelingen", "Afspraak maken", "Stylingadvies"];
  if (/installatie|elektra|loodgieter/.test(normalized)) return ["Installatie", "Onderhoud", "Spoedservice"];
  if (/coach|advies|consult/.test(normalized)) return ["Coaching", "Strategie", "Trajecten"];
  return ["Advies", "Uitvoering", "Service"];
}

function inferIndustry(text = "", businessName = "") {
  const normalized = `${text} ${businessName}`.toLowerCase();
  if (/bouw|timmer|renovatie|aannemer/.test(normalized)) return "bouw en renovatie";
  if (/restaurant|horeca|cafe/.test(normalized)) return "horeca";
  if (/kapper|salon|beauty/.test(normalized)) return "beauty en verzorging";
  if (/installatie|elektra|loodgieter/.test(normalized)) return "installatie en onderhoud";
  if (/coach|advies|consult/.test(normalized)) return "advies en coaching";
  return "dienstverlening";
}

function inferCta(text = "") {
  const normalized = text.toLowerCase();
  if (/offerte/.test(normalized)) return "Vraag een offerte aan";
  if (/afspraak|bel/.test(normalized)) return "Plan een kennismaking";
  if (/reserver/.test(normalized)) return "Reserveer direct";
  return "Neem contact op";
}

function inferColors(industry = "") {
  const normalized = industry.toLowerCase();
  if (/bouw|installatie/.test(normalized)) return { ink: "#172033", brand: "#1d7c68", accent: "#f1b84b", soft: "#f5f7fb" };
  if (/horeca/.test(normalized)) return { ink: "#201a17", brand: "#9a3f2f", accent: "#e3b261", soft: "#fbf7f2" };
  if (/beauty/.test(normalized)) return { ink: "#241b2f", brand: "#8a5574", accent: "#d6ad8f", soft: "#fbf7fa" };
  return { ink: "#132238", brand: "#2563eb", accent: "#14b8a6", soft: "#f6f8fb" };
}

function inferStyle(text = "") {
  if (/modern|strak|minimal/i.test(text)) return "modern en strak";
  if (/warm|persoonlijk|vertrouwen/i.test(text)) return "warm en betrouwbaar";
  return "premium en conversiegericht";
}

function renderHtml({ businessName, contactName, email, phone, websiteUrl, industry, services, cta, colors, style, title, description }) {
  const serviceCards = services.map((service) => `<article><span>${escapeHtml(service)}</span><p>${escapeHtml(serviceText(service, industry))}</p></article>`).join("");
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body style="--brand:${escapeHtml(colors.brand)};--accent:${escapeHtml(colors.accent)};--ink:${escapeHtml(colors.ink)};--soft:${escapeHtml(colors.soft)}">
    <header class="hero">
      <nav><strong>${escapeHtml(businessName)}</strong><a href="#contact">Contact</a></nav>
      <section class="hero-content">
        <span>${escapeHtml(style)}</span>
        <h1>${escapeHtml(businessName)} maakt kiezen makkelijk.</h1>
        <p>${escapeHtml(description)}</p>
        <div class="hero-actions"><a class="button" href="#contact">${escapeHtml(cta)}</a><a class="button secondary" href="#diensten">Bekijk diensten</a></div>
      </section>
    </header>
    <main>
      <section class="trust"><strong>Website-preview voor ${escapeHtml(industry)}</strong><p>Deze eerste versie combineert vertrouwen, duidelijke informatie en een directe route naar contact.</p></section>
      <section class="services" id="diensten"><div><span>Diensten</span><h2>Waar ${escapeHtml(businessName)} klanten mee helpt</h2></div><div class="service-grid">${serviceCards}</div></section>
      <section class="split"><div><span>Aanpak</span><h2>Rustig, helder en gericht op aanvragen.</h2></div><p>Bezoekers zien direct wie u bent, wat u aanbiedt en hoe ze de volgende stap zetten. De structuur is klaar om later uit te breiden met projecten, reviews en veelgestelde vragen.</p></section>
      <section class="contact" id="contact"><div><span>Contact</span><h2>${escapeHtml(cta)}</h2><p>${escapeHtml(contactName)} kan deze preview intern beoordelen en klantfeedback verwerken.</p><p>${email ? `E-mail: ${escapeHtml(email)}` : ""}${phone ? ` · Telefoon: ${escapeHtml(phone)}` : ""}</p><p>${websiteUrl ? `Huidige website: ${escapeHtml(websiteUrl)}` : ""}</p></div><a class="button" href="${email ? `mailto:${escapeHtml(email)}` : "#"}">${escapeHtml(cta)}</a></section>
    </main>
    <footer><strong>${escapeHtml(businessName)}</strong><span>Eerste website-preview</span></footer>
    <script src="script.js"></script>
  </body>
</html>`;
}

function renderCss() {
  return `:root{color-scheme:light;--paper:#fff;--line:#dde6f1;--muted:#607086}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--soft);color:var(--ink)}a{color:inherit}.hero{min-height:78vh;background:linear-gradient(180deg,#fff 0%,var(--soft) 100%);border-bottom:1px solid var(--line)}nav{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:24px clamp(20px,5vw,76px)}nav strong{font-size:1.08rem}nav a{text-decoration:none;font-weight:800}.hero-content{padding:clamp(42px,9vw,118px) clamp(20px,5vw,76px);max-width:960px}.hero span,main span,footer span{display:inline-flex;color:var(--brand);font-weight:900;text-transform:uppercase;font-size:.78rem;letter-spacing:.08em}h1{font-size:clamp(2.6rem,7vw,6rem);line-height:.94;margin:16px 0 22px;max-width:880px}h2{font-size:clamp(1.8rem,4vw,3.2rem);line-height:1.04;margin:10px 0 12px}p{font-size:1.08rem;line-height:1.72;color:var(--muted);max-width:720px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:13px 18px;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:900}.button.secondary{background:transparent;color:var(--ink);border:1px solid var(--line)}.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}main{width:min(1120px,calc(100% - 40px));margin:0 auto;padding:44px 0 74px}.trust,.services,.split,.contact{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:clamp(22px,4vw,34px);margin-bottom:18px}.services{display:grid;gap:24px}.service-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.service-grid article{border:1px solid var(--line);border-radius:8px;padding:20px;background:#fff}.split,.contact{display:grid;grid-template-columns:.9fr 1.1fr;gap:28px;align-items:center}footer{display:flex;justify-content:space-between;gap:20px;padding:26px clamp(20px,5vw,76px);border-top:1px solid var(--line);background:#fff}@media(max-width:780px){.service-grid,.split,.contact{grid-template-columns:1fr}.hero-actions{display:grid}nav,footer{align-items:flex-start;flex-direction:column}}`;
}

function renderScript() {
  return `document.documentElement.classList.add("preview-ready");`;
}

function serviceText(service, industry) {
  return `${service} voor ${industry}, helder uitgelegd en gekoppeld aan een duidelijke vervolgstap.`;
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

module.exports = {
  BUILD_STATUSES,
  buildLogs,
  buildWebsitePackage,
  isBuildStatus,
  makePreviewToken,
  nextPreviewVersion,
  normalizeBuildJob,
  normalizePreviewVersion,
  previewUrlFor,
  runQualityCheck,
};
