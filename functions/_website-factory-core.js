const crypto = require("crypto");

const BUILD_STATUSES = new Set(["queued", "briefing", "building", "quality_check", "deploying", "completed", "quality_failed", "failed"]);
const PACKAGE_RULES = {
  starter: {
    label: "Starter Website",
    price: 495,
    template: "starter-one-page-v1",
    pages: ["index.html"],
    sections: ["hero", "over-ons", "diensten", "waarom", "cta", "contact", "footer"],
    navigation: "scroll",
  },
  professional: {
    label: "Professional Website",
    price: 995,
    template: "professional-multi-page-v1",
    pages: ["index.html", "over-ons.html", "diensten.html", "contact.html"],
    sections: ["hero", "diensten", "voordelen", "werkwijze", "cta", "contact", "footer"],
    navigation: "multi-page",
  },
  premium: {
    label: "Premium Website",
    price: 1750,
    template: "premium-growth-site-v1",
    pages: ["index.html", "over-ons.html", "diensten.html", "projecten.html", "reviews.html", "contact.html", "offerte.html"],
    sections: ["hero", "diensten", "voordelen", "werkwijze", "projecten", "reviews", "offerte", "contact", "footer"],
    navigation: "premium-multi-page",
  },
};

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
  const benefits = inferBenefits(industry);
  const processSteps = inferProcessSteps(industry);
  const cta = inferCta(combinedBriefing);
  const colors = inferColors(industry);
  const style = inferStyle(combinedBriefing);
  const packageType = normalizePackageType(journey.packageType || journey.package_type || journey.package || journey.packageName || journey.package_name || extractField(combinedBriefing, ["Websitepakket", "Pakket"]));
  const packageRules = PACKAGE_RULES[packageType];
  const inputSignals = [combinedBriefing, websiteUrl, email, phone].filter((value) => cleanText(value).length > 12).length;
  const lowInputWarning = inputSignals < 2;
  const templateSections = packageRules.sections;
  const pages = packageRules.pages;
  const title = `${businessName} - professionele website-preview`;
  const description = `${businessName} helpt klanten met ${services.slice(0, 2).join(" en ")}. Een heldere preview met vertrouwen, structuur en een directe route naar contact.`;
  const html = renderHtml({ businessName, contactName, email, phone, websiteUrl, industry, services, benefits, processSteps, cta, colors, style, title, description, lowInputWarning, packageType, packageRules });
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
    benefits,
    processSteps,
    packageType,
    packageLabel: packageRules.label,
    packagePrice: packageRules.price,
    packageRules,
    generatedPages: pages,
    generatedSections: templateSections,
    template: packageRules.template,
    templateUsed: packageRules.template,
    templateSections,
    lowInputWarning,
    warnings: lowInputWarning ? ["Weinig klantinput beschikbaar; neutrale professionele standaardtekst gebruikt."] : [],
    customerWishes: combinedBriefing,
    desiredPages: pages,
    ctaPreference: cta,
    version,
  };
  const assetsMap = {
    logo: "text-brand",
    hero: {
      type: "css-visual-placeholder",
      promptReady: true,
      subject: `${businessName} ${industry}`,
    },
    sectionVisuals: ["hero-dashboard-card", "service-cards", "trust-stat-cards"],
    futureImageSlots: ["hero", "service-detail", "review-background"],
  };
  const contentFiles = [
    { path: "index.html", content: html },
    ...pages.filter((page) => page !== "index.html").map((page) => ({
      path: page,
      content: renderSubPage({ page, businessName, email, phone, industry, services, benefits, processSteps, cta, colors, packageRules }),
    })),
  ];
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
    `Pakket: ${packageRules.label} (€${packageRules.price})`,
    `Template: ${packageRules.template}`,
    `Pagina's: ${pages.join(", ")}`,
    lowInputWarning ? "Let op: weinig klantinput beschikbaar; de preview gebruikt neutrale standaardtekst." : "Inputniveau: voldoende voor branchegerichte eerste preview.",
    "",
    "Controleer de preview intern voordat deze naar de klant gaat.",
  ].join("\n");

  return {
    version,
    generatedAt: new Date().toISOString(),
    businessName,
    packageType,
    files: [
      ...contentFiles,
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
  const packageRules = generatedPackage.meta?.packageRules || PACKAGE_RULES[generatedPackage.meta?.packageType] || PACKAGE_RULES.starter;
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const serviceCardCount = (html.match(/class="[^"]*service-card/gi) || []).length;
  const benefitCount = (html.match(/class="[^"]*benefit-card/gi) || []).length;
  const htmlPageCount = files.filter((file) => file.path.endsWith(".html")).length;
  const checks = [
    check("Hero aanwezig", /<header[\s\S]*class="[^"]*hero/i.test(html) || /<section[\s\S]*class="[^"]*hero/i.test(html), 10),
    check("Hero visual aanwezig", /class="[^"]*hero-visual/i.test(html) && /class="[^"]*visual-card/i.test(html), 10),
    check("CTA aanwezig", /class="[^"]*button/i.test(html) && /(contact|advies|afspraak|kennismaking|offerte)/i.test(html), 10),
    check("Dienstensectie aanwezig", /id="diensten"|Diensten|Onze aanpak/i.test(html), 10),
    check("Minimaal vijf secties", sectionCount >= 5, 10),
    check("Pakket pagina-aantal klopt", htmlPageCount >= packageRules.pages.length, 12),
    check("Minimaal drie diensten", serviceCardCount >= 3, 8),
    check("Minimaal drie voordelen", benefitCount >= 3, 8),
    check("Werkwijze aanwezig", /id="werkwijze"|Zo werkt|Werkwijze/i.test(html), 8),
    check("Reviews of vertrouwen aanwezig", /id="reviews"|review|vertrouwen/i.test(html), 8),
    check("Contactsectie aanwezig", /id="contact"|mailto:|tel:/i.test(html), 10),
    check("Footer aanwezig", /<footer/i.test(html), 8),
    check("Meta title aanwezig", /<title>[^<]{8,}<\/title>/i.test(html), 7),
    check("Meta description aanwezig", /<meta\s+name="description"\s+content="[^"]{20,}"/i.test(html), 7),
    check("Responsive viewport aanwezig", /<meta\s+name="viewport"/i.test(html), 7),
    check("Geen lorem ipsum", !/lorem ipsum|dolor sit amet/i.test(html), 8),
    check("Geen lege placeholders", !/\[placeholder\]|\{\{|\}\}|TODO|Preview wordt voorbereid/i.test(html), 8),
    check("Geen interne AI-termen", !/\bAI\b|Codex/i.test(html), 8),
    check("Bedrijfsnaam aanwezig", businessName && html.toLowerCase().includes(businessName.toLowerCase()), 7),
    check("CTA niet leeg", />\s*(Plan|Vraag|Neem|Bel|Start|Bekijk)[^<]+</i.test(html), 4),
    check("HTML basis klopt", /<!doctype html>/i.test(html) && /<\/html>/i.test(html) && /<\/body>/i.test(html), 6),
    check("Script statisch veilig", script ? !/document\.write|eval\(|fetch\(/i.test(script) : true, 4),
    check("Branche of diensten aanwezig", services.some((service) => html.toLowerCase().includes(String(service).toLowerCase())) || /branche|diensten/i.test(html), 8),
    check("Geen kale preview", css.length > 1800 && html.length > 4500, 10),
    check("CSS aanwezig", css.length > 1200, 6),
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

function normalizePackageType(value = "") {
  const text = cleanText(value).toLowerCase();
  if (/premium|1750|uitgebreid|growth|enterprise/.test(text)) return "premium";
  if (/professional|professioneel|995|plus|business|multi/.test(text)) return "professional";
  return "starter";
}

function navigationLinks(packageRules = PACKAGE_RULES.starter) {
  if (packageRules.navigation === "scroll") {
    return [
      { href: "#diensten", label: "Diensten" },
      { href: "#contact", label: "Contact" },
    ];
  }
  const links = [
    { href: "index.html", label: "Home" },
    { href: "over-ons.html", label: "Over ons" },
    { href: "diensten.html", label: "Diensten" },
  ];
  if (packageRules.pages.includes("projecten.html")) links.push({ href: "projecten.html", label: "Projecten" });
  if (packageRules.pages.includes("reviews.html")) links.push({ href: "reviews.html", label: "Reviews" });
  if (packageRules.pages.includes("offerte.html")) links.push({ href: "offerte.html", label: "Offerte" });
  links.push({ href: "contact.html", label: "Contact" });
  return links;
}

function renderHtml({ businessName, contactName, email, phone, websiteUrl, industry, services, benefits, processSteps, cta, colors, style, title, description, lowInputWarning, packageRules }) {
  const serviceCards = services.map((service, index) => `
        <article class="service-card">
          <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(service)}</h3>
          <p>${escapeHtml(serviceText(service, industry))}</p>
        </article>`).join("");
  const benefitCards = benefits.map((benefit) => `
        <article class="benefit-card">
          <strong>${escapeHtml(benefit.title)}</strong>
          <p>${escapeHtml(benefit.text)}</p>
        </article>`).join("");
  const processCards = processSteps.map((step, index) => `
        <article class="process-card">
          <span>${index + 1}</span>
          <div><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.text)}</p></div>
        </article>`).join("");
  const contactLine = [email ? `E-mail: ${email}` : "", phone ? `Telefoon: ${phone}` : ""].filter(Boolean).join(" | ");
  const websiteLine = websiteUrl ? `Huidige website: ${websiteUrl}` : "Website-informatie kan later worden aangevuld.";
  const navLinks = navigationLinks(packageRules).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
  const premiumSections = packageRules.pages.length >= 7 ? `
      <section class="section-band project-section" id="projecten">
        <span class="eyebrow">Projecten</span>
        <h2>Ruimte voor cases, resultaten en vertrouwen.</h2>
        <div class="service-grid">
          <article class="service-card"><span class="card-index">01</span><h3>Uitgelicht project</h3><p>Toon een afgeronde opdracht met duidelijke voor/na-context.</p></article>
          <article class="service-card"><span class="card-index">02</span><h3>Resultaatgericht</h3><p>Leg uit wat de klant bereikt en waarom dat vertrouwen geeft.</p></article>
          <article class="service-card"><span class="card-index">03</span><h3>Volgende stap</h3><p>Leid bezoekers naar advies, offerte of contact.</p></article>
        </div>
      </section>
      <section class="section-band offer-section" id="offerte">
        <span class="eyebrow">Offerte</span>
        <h2>Een duidelijke aanvraagroute voor serieuze klanten.</h2>
        <p>Deze premium preview bevat extra conversieblokken voor offerteaanvragen, cases en bewijsvoering.</p>
      </section>` : "";
  const professionalNote = packageRules.pages.length >= 4 ? `<p class="package-note">${escapeHtml(packageRules.label)} bevat aparte SEO-pagina's voor aanbod, over ons en contact.</p>` : `<p class="package-note">${escapeHtml(packageRules.label)} is opgezet als snelle one-page preview met scrollnavigatie.</p>`;
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
    <header class="site-header">
      <a class="brand" href="#top">${escapeHtml(businessName)}</a>
      <nav aria-label="Hoofdnavigatie">
        ${navLinks}
      </nav>
    </header>
    <main id="top">
      <section class="hero section-band">
        <div class="hero-copy">
          <span class="eyebrow">${escapeHtml(style)} voor ${escapeHtml(industry)}</span>
          <h1>${escapeHtml(businessName)} presenteert helder wat klanten direct willen weten.</h1>
          <p>${escapeHtml(description)}</p>
          ${professionalNote}
          <div class="hero-actions">
            <a class="button" href="#contact">${escapeHtml(cta)}</a>
            <a class="button secondary" href="#diensten">Bekijk aanbod</a>
          </div>
          <div class="hero-proof">
            <span><strong>3</strong> duidelijke diensten</span>
            <span><strong>24/7</strong> online vindbaar</span>
            <span><strong>1</strong> helder contactmoment</span>
          </div>
        </div>
        <aside class="hero-visual" aria-label="Visuele preview">
          <div class="visual-card visual-card-main">
            <span>Homepage preview</span>
            <strong>${escapeHtml(businessName)}</strong>
            <p>${escapeHtml(services.slice(0, 2).join(" | "))}</p>
          </div>
          <div class="visual-card visual-card-floating">
            <span>Contact klaar</span>
            <strong>${escapeHtml(cta)}</strong>
          </div>
          <div class="visual-grid">
            <i></i><i></i><i></i><i></i>
          </div>
        </aside>
      </section>

      <section class="trust-strip section-band" aria-label="Vertrouwen">
        <div><strong>Professionele uitstraling</strong><span>Rustige structuur en moderne typografie</span></div>
        <div><strong>Snel naar contact</strong><span>CTA's en contactblok staan duidelijk in beeld</span></div>
        <div><strong>Branchegericht</strong><span>Tekst en accenten sluiten aan op ${escapeHtml(industry)}</span></div>
      </section>

      <section class="section-band section-heading" id="diensten">
        <span class="eyebrow">Diensten</span>
        <h2>Een aanbod dat bezoekers snel begrijpen.</h2>
        <p>Deze eerste homepage maakt duidelijk waarvoor klanten bij ${escapeHtml(businessName)} terechtkunnen en welke vervolgstap logisch is.</p>
        <div class="service-grid">${serviceCards}</div>
      </section>

      <section class="section-band benefits-section">
        <div>
          <span class="eyebrow">Voordelen</span>
          <h2>Waarom klanten vertrouwen krijgen.</h2>
          <p>De pagina legt de nadruk op duidelijkheid, betrouwbaarheid en een laagdrempelige route naar contact.</p>
        </div>
        <div class="benefit-grid">${benefitCards}</div>
      </section>

      <section class="section-band process-section" id="werkwijze">
        <span class="eyebrow">Werkwijze</span>
        <h2>Van eerste vraag naar duidelijke afspraak.</h2>
        <div class="process-grid">${processCards}</div>
      </section>

      <section class="section-band reviews-section" id="reviews">
        <div>
          <span class="eyebrow">Vertrouwen</span>
          <h2>Gericht op een sterke eerste indruk.</h2>
        </div>
        <article class="review-card">
          <strong>"Duidelijk, professioneel en makkelijk om contact op te nemen."</strong>
          <p>Voorbeeldreview voor de eerste preview. Vervang deze later door echte klantreacties of projectcases.</p>
        </article>
        <article class="review-card">
          <strong>"De belangrijkste informatie staat meteen goed op volgorde."</strong>
          <p>Deze sectie is klaar om uit te breiden met reviews, keurmerken of afgeronde projecten.</p>
        </article>
      </section>
      ${premiumSections}

      <section class="contact-section section-band" id="contact">
        <div>
          <span class="eyebrow">Contact</span>
          <h2>${escapeHtml(cta)}</h2>
          <p>${escapeHtml(contactName)} kan deze preview intern controleren en daarna aanvullen met klantfeedback.</p>
          <p>${escapeHtml(contactLine || "Contactgegevens kunnen later worden aangevuld.")}</p>
          <p>${escapeHtml(websiteLine)}</p>
        </div>
        <a class="button" href="${email ? `mailto:${escapeHtml(email)}` : "#"}">${escapeHtml(cta)}</a>
      </section>
      ${lowInputWarning ? '<section class="section-band preview-note"><strong>Interne notitie</strong><p>Er was weinig klantinput beschikbaar. Deze preview gebruikt daarom neutrale professionele standaardtekst die later makkelijk kan worden aangescherpt.</p></section>' : ""}
    </main>
    <footer class="site-footer"><strong>${escapeHtml(businessName)}</strong><span>Eerste website-preview</span></footer>
    <script src="script.js"></script>
  </body>
</html>`;
}

function renderSubPage({ page, businessName, email, phone, industry, services, benefits, processSteps, cta, colors, packageRules }) {
  const titleMap = {
    "over-ons.html": "Over ons",
    "diensten.html": "Diensten",
    "projecten.html": "Projecten",
    "reviews.html": "Reviews",
    "contact.html": "Contact",
    "offerte.html": "Offerte aanvragen",
  };
  const title = titleMap[page] || "Pagina";
  const body = page === "diensten.html"
    ? services.map((service) => `<article class="service-card"><h3>${escapeHtml(service)}</h3><p>${escapeHtml(serviceText(service, industry))}</p></article>`).join("")
    : page === "reviews.html"
      ? benefits.map((benefit) => `<article class="review-card"><strong>${escapeHtml(benefit.title)}</strong><p>${escapeHtml(benefit.text)}</p></article>`).join("")
      : page === "projecten.html"
        ? processSteps.map((step) => `<article class="service-card"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></article>`).join("")
        : `<article class="service-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(businessName)} presenteert hier extra informatie passend bij ${escapeHtml(packageRules.label)}.</p></article>`;
  const contact = [email ? `E-mail: ${email}` : "", phone ? `Telefoon: ${phone}` : ""].filter(Boolean).join(" | ");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex,nofollow" /><title>${escapeHtml(title)} - ${escapeHtml(businessName)}</title><link rel="stylesheet" href="styles.css" /></head><body style="--brand:${escapeHtml(colors.brand)};--accent:${escapeHtml(colors.accent)};--ink:${escapeHtml(colors.ink)};--soft:${escapeHtml(colors.soft)}"><header class="site-header"><a class="brand" href="index.html">${escapeHtml(businessName)}</a><nav>${navigationLinks(packageRules).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}</nav></header><main><section class="section-band section-heading"><span class="eyebrow">${escapeHtml(packageRules.label)}</span><h1>${escapeHtml(title)}</h1><p>Deze pagina is onderdeel van de ${escapeHtml(packageRules.label)} preview en geeft meer diepte dan een one-page opzet.</p><div class="service-grid">${body}</div></section><section class="contact-section section-band"><div><span class="eyebrow">Contact</span><h2>${escapeHtml(cta)}</h2><p>${escapeHtml(contact || "Contactgegevens kunnen later worden aangevuld.")}</p></div><a class="button" href="${email ? `mailto:${escapeHtml(email)}` : "#"}">${escapeHtml(cta)}</a></section></main><footer class="site-footer"><strong>${escapeHtml(businessName)}</strong><span>${escapeHtml(packageRules.label)}</span></footer><script src="script.js"></script></body></html>`;
}

function renderCss() {
  return `:root{color-scheme:light;--paper:#fff;--line:#dbe5ef;--muted:#5f6f84;--shadow:0 24px 70px rgba(15,23,42,.11)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:linear-gradient(180deg,#fff,var(--soft));color:var(--ink)}a{color:inherit}.site-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(20px,5vw,76px);border-bottom:1px solid rgba(219,229,239,.86);background:rgba(255,255,255,.88);backdrop-filter:blur(18px)}.brand{font-weight:900;text-decoration:none}.site-header nav{display:flex;gap:18px;align-items:center}.site-header nav a{text-decoration:none;color:var(--muted);font-size:14px;font-weight:850}.section-band{width:min(1160px,calc(100% - 40px));margin:0 auto}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:clamp(28px,5vw,64px);align-items:center;min-height:calc(100vh - 78px);padding:clamp(56px,8vw,110px) 0}.eyebrow{display:inline-flex;align-items:center;min-height:30px;padding:0 11px;border:1px solid color-mix(in srgb,var(--brand) 24%,transparent);border-radius:999px;color:var(--brand);background:color-mix(in srgb,var(--brand) 8%,#fff);font-size:12px;font-weight:900;text-transform:uppercase}h1,h2,h3,p{letter-spacing:0}h1{max-width:820px;margin:18px 0 22px;font-size:clamp(42px,7vw,86px);line-height:.94}h2{max-width:760px;margin:12px 0 14px;font-size:clamp(30px,4.5vw,56px);line-height:1}h3{margin:0 0 10px;font-size:22px;line-height:1.14}p{max-width:720px;color:var(--muted);font-size:18px;line-height:1.72}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:13px 18px;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:900;box-shadow:0 14px 34px color-mix(in srgb,var(--brand) 24%,transparent)}.button.secondary{border:1px solid var(--line);color:var(--ink);background:#fff;box-shadow:none}.hero-actions,.hero-proof{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.hero-proof span{display:grid;gap:2px;min-width:132px;padding:14px 16px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.74);color:var(--muted);font-size:13px;font-weight:850}.hero-proof strong{color:var(--ink);font-size:24px}.hero-visual{position:relative;min-height:520px;border:1px solid var(--line);border-radius:8px;background:radial-gradient(circle at 72% 16%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 34%),linear-gradient(145deg,#fff,color-mix(in srgb,var(--brand) 9%,#fff));box-shadow:var(--shadow);overflow:hidden}.hero-visual::before{content:"";position:absolute;inset:36px;border:1px solid color-mix(in srgb,var(--brand) 16%,transparent);border-radius:8px;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 14%,transparent),transparent)}.visual-card{position:absolute;display:grid;gap:8px;border:1px solid rgba(255,255,255,.72);border-radius:8px;background:rgba(255,255,255,.86);box-shadow:0 20px 52px rgba(15,23,42,.12);backdrop-filter:blur(14px)}.visual-card span{color:var(--brand);font-size:12px;font-weight:900;text-transform:uppercase}.visual-card-main{left:44px;right:44px;top:70px;padding:28px}.visual-card-main strong{font-size:34px;line-height:1}.visual-card-main p{margin:0;font-size:15px}.visual-card-floating{right:28px;bottom:66px;width:min(260px,58%);padding:22px}.visual-grid{position:absolute;left:44px;right:44px;bottom:178px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.visual-grid i{height:72px;border-radius:8px;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 16%,#fff),#fff);border:1px solid rgba(255,255,255,.7)}.trust-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}.trust-strip div,.service-card,.benefit-card,.process-card,.review-card,.contact-section,.preview-note{border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.86);box-shadow:0 14px 40px rgba(15,23,42,.06)}.trust-strip div{display:grid;gap:6px;padding:20px}.trust-strip strong{font-size:16px}.trust-strip span{color:var(--muted);font-size:14px;font-weight:750}.section-heading,.benefits-section,.process-section,.reviews-section,.contact-section,.preview-note{padding:clamp(34px,5vw,58px) 0}.service-grid,.benefit-grid,.process-grid{display:grid;gap:16px}.service-grid{grid-template-columns:repeat(3,1fr);margin-top:26px}.service-card,.benefit-card{padding:24px}.card-index{display:inline-flex;margin-bottom:26px;color:var(--brand);font-size:13px;font-weight:950}.benefits-section{display:grid;grid-template-columns:.85fr 1.15fr;gap:28px;align-items:start}.benefit-grid{grid-template-columns:repeat(2,1fr)}.benefit-card strong{font-size:19px}.process-grid{grid-template-columns:repeat(3,1fr);margin-top:24px}.process-card{display:flex;gap:16px;padding:22px}.process-card span{display:grid;place-items:center;width:38px;height:38px;flex:0 0 auto;border-radius:999px;color:#fff;background:var(--brand);font-weight:900}.process-card p,.benefit-card p,.service-card p,.review-card p{margin:0;font-size:15px}.reviews-section{display:grid;grid-template-columns:.9fr 1fr 1fr;gap:16px;align-items:stretch}.review-card{padding:24px}.review-card strong{display:block;margin-bottom:14px;font-size:22px;line-height:1.2}.contact-section{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;margin-bottom:34px;padding:34px}.contact-section p{margin:0 0 10px}.preview-note{padding:20px 24px;margin-bottom:34px}.preview-note p{margin:8px 0 0;font-size:14px}.site-footer{display:flex;justify-content:space-between;gap:20px;padding:26px clamp(20px,5vw,76px);border-top:1px solid var(--line);background:#fff;color:var(--muted);font-weight:850}.site-footer strong{color:var(--ink)}@media(max-width:900px){.site-header,.site-header nav,.site-footer{align-items:flex-start;flex-direction:column}.hero,.benefits-section,.reviews-section,.contact-section{grid-template-columns:1fr}.hero{min-height:0}.hero-visual{min-height:420px}.trust-strip,.service-grid,.benefit-grid,.process-grid{grid-template-columns:1fr}.contact-section .button{width:100%}}`;
}

function renderScript() {
  return `document.documentElement.classList.add("preview-ready");`;
}

function serviceText(service, industry) {
  return `${service} voor ${industry}, helder uitgelegd en gekoppeld aan een duidelijke vervolgstap.`;
}

function inferBenefits(industry = "") {
  const normalized = industry.toLowerCase();
  if (/bouw|renovatie|installatie/.test(normalized)) {
    return [
      { title: "Duidelijke afspraken", text: "Bezoekers zien direct hoe het traject wordt opgepakt en wat ze kunnen verwachten." },
      { title: "Vertrouwen in vakwerk", text: "De opbouw geeft ruimte aan projecten, garanties en praktische informatie." },
      { title: "Snel contact", text: "Telefoon en aanvraagmomenten staan logisch verspreid over de pagina." },
      { title: "Professionele indruk", text: "Rustige vormgeving helpt om kwaliteit en betrouwbaarheid uit te stralen." },
    ];
  }
  if (/horeca/.test(normalized)) {
    return [
      { title: "Sfeer snel voelbaar", text: "De preview geeft ruimte aan menu, reserveren en een warme eerste indruk." },
      { title: "Reserveren centraal", text: "Bezoekers worden subtiel naar de belangrijkste actie geleid." },
      { title: "Aanbod overzichtelijk", text: "Diensten en arrangementen zijn makkelijk scanbaar." },
      { title: "Mobiel sterk", text: "De structuur werkt goed voor bezoekers die onderweg zoeken." },
    ];
  }
  return [
    { title: "Heldere positionering", text: "Bezoekers begrijpen snel wat het bedrijf doet en voor wie." },
    { title: "Meer vertrouwen", text: "Voordelen, werkwijze en reviews ondersteunen de eerste indruk." },
    { title: "Betere conversie", text: "Elke sectie stuurt rustig richting contact of afspraak." },
    { title: "Uitbreidbaar ontwerp", text: "De preview is klaar voor echte beelden, cases en klantreviews." },
  ];
}

function inferProcessSteps(industry = "") {
  const normalized = industry.toLowerCase();
  if (/horeca/.test(normalized)) {
    return [
      { title: "Bekijk het aanbod", text: "Gasten zien snel wat er mogelijk is." },
      { title: "Neem contact op", text: "Reserveren of aanvragen kan zonder zoeken." },
      { title: "Ontvang bevestiging", text: "De volgende stap is duidelijk en laagdrempelig." },
    ];
  }
  return [
    { title: "Vraag of wens bespreken", text: "De bezoeker legt kort uit waar hij hulp bij zoekt." },
    { title: "Advies of voorstel ontvangen", text: "Het bedrijf reageert met een passende aanpak." },
    { title: "Samen plannen", text: "Daarna worden timing, inhoud en vervolgstappen afgestemd." },
  ];
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
