const fs = require("fs");
const path = require("path");

const ASSET_ROOT = path.join(__dirname, "..", "..", "public", "assets", "demo-images", "library", "vm-tegelwerken");
const PUBLIC_ASSET_ROOT = "/assets/demo-images/library/vm-tegelwerken";

const company = {
  name: "Van Meetelen Tegelwerken",
  shortName: "VM Tegelwerken",
  phone: "06 21167610",
  phoneHref: "tel:+31621167610",
  email: "info@vmtegelwerken.nl",
  mailHref: "mailto:info@vmtegelwerken.nl",
  area: "Almere en omgeving",
  website: "https://www.vmtegelwerken.nl",
  facebook: "https://www.facebook.com/vmtegelwerken/",
  instagram: "https://instagram.com/vmtegelwerken",
  hours: "Maandag t/m vrijdag 08:00-17:00",
};

const assets = {
  logo: "assets/vm-tegelwerken-logo.png",
  logoWhite: "assets/vm-tegelwerken-logo-wit.png",
  hero: "assets/marmeren-vloer-almere-haven.jpg",
  marble: "assets/marmeren-vloer-almere-haven.jpg",
  toilet: "assets/toiletrenovatie-almere-stad.jpg",
  shower: "assets/douche-detail.jpg",
  work: "assets/werkbeeld-keuken.jpg",
  grayToilet: "assets/toilet-grijs.jpg",
  kitchen: "assets/keuken-hexagon.jpg",
  fallback: "assets/vm-hero.svg",
  og: "assets/og-image.svg",
  favicon: "assets/favicon.svg",
};

const projects = [
  {
    slug: "project-marmeren-vloer-almere-haven.html",
    title: "Marmeren vloer",
    location: "Almere-Haven",
    category: "Vloertegelwerk",
    image: assets.marble,
    summary: "Een rustige marmerlook vloer waarbij lijnvoering, uitsnede en aansluiting het eindbeeld bepalen.",
    detail: "Dit project laat goed zien hoe groot tegelwerk een ruimte rust kan geven wanneer de verdeling en aansluitingen zorgvuldig worden uitgewerkt.",
  },
  {
    slug: "project-toiletrenovatie-almere-stad.html",
    title: "Complete toiletrenovatie",
    location: "Almere-Stad",
    category: "Toilet renovatie",
    image: assets.toilet,
    summary: "Een compacte ruimte opnieuw opgebouwd met strak tegelwerk en verzorgde afwerking.",
    detail: "Bij een toilet ziet u elk detail van dichtbij. Juist daarom zijn nette randen, hoeken, voegen en materiaalovergangen belangrijk.",
  },
];

const services = [
  ["Badkamerrenovatie", "Complete vernieuwing van tegelwerk en sanitair, met aandacht voor indeling, gebruiksgemak en afwerking.", assets.shower],
  ["Toilet renovatie", "Een compacte ruimte volledig vernieuwd en slim afgewerkt, zonder drukke of onnodige keuzes.", assets.toilet],
  ["Wand- en vloertegelwerk", "Voor badkamer, keuken, hal, woonruimte en andere geschikte toepassingen.", assets.marble],
  ["Woonvloeren", "Duurzame tegelvloeren met rustige lijnen en een verzorgde aansluiting op plinten en overgangen.", assets.marble],
  ["Keukentegelwerk", "Functionele en stijlvolle wand- of vloerafwerking rond de keuken.", assets.kitchen],
  ["Sanitair plaatsen", "Sanitair plaatsen als onderdeel van badkamer- en toiletrenovaties, passend bij het afgesproken werk.", assets.shower],
];

function isVmTegelwerkenJourney(input = {}) {
  const text = `${input.businessName || ""} ${input.websiteUrl || ""} ${input.briefing || ""}`.toLowerCase();
  return /vmtegelwerken|vm tegelwerken|van meetelen tegelwerken|vanmeetelen/.test(text);
}

function buildVmTegelwerkenDemo({ version = 1, editorManifest = null } = {}) {
  const generatedAt = new Date().toISOString();
  const pages = [
    "index.html",
    "diensten.html",
    "projecten.html",
    "project-marmeren-vloer-almere-haven.html",
    "project-toiletrenovatie-almere-stad.html",
    "werkwijze.html",
    "over-vm.html",
    "contact.html",
    "offerte.html",
    "privacy.html",
  ];
  const files = [
    { path: "index.html", content: renderHome() },
    { path: "diensten.html", content: renderStandardPage("Diensten", "Tegelwerk en renovatie voor ruimtes die dagelijks gebruikt worden.", renderServices()) },
    { path: "projecten.html", content: renderStandardPage("Projecten", "Echte beelden uit de bestaande VM Tegelwerken-presentatie, zonder verzonnen projectclaims.", renderProjects()) },
    ...projects.map((project) => ({ path: project.slug, content: renderProject(project) })),
    { path: "werkwijze.html", content: renderStandardPage("Werkwijze", "Rustige stappen van eerste contact tot nette uitvoering.", renderProcess()) },
    { path: "over-vm.html", content: renderStandardPage("Over VM", "Persoonlijk vakmanschap, zonder onnodige tussenlagen.", renderAbout()) },
    { path: "contact.html", content: renderStandardPage("Contact", "Bel, mail of start een aanvraag voor tegelwerk in Almere en omgeving.", renderContact()) },
    { path: "offerte.html", content: renderStandardPage("Vrijblijvende offerte", "Vertel kort om welke ruimte het gaat.", renderQuoteForm()) },
    { path: "privacy.html", content: renderStandardPage("Privacy", "Een nette tijdelijke privacyweergave op basis van de bekende contactgegevens.", renderPrivacy()) },
    { path: "styles.css", content: renderCss() },
    { path: "script.js", content: renderScript() },
    { path: "robots.txt", content: `User-agent: *\nAllow: /\nSitemap: ${company.website}/sitemap.xml\n` },
    { path: "sitemap.xml", content: renderSitemap(pages) },
    { path: ".htaccess", content: "Options -Indexes\n" },
    { path: "assets/logo.svg", content: renderLogoSvg() },
    { path: "assets/favicon.svg", content: renderFaviconSvg() },
    { path: "assets/og-image.svg", content: renderOgSvg() },
    { path: "assets/vm-hero.svg", content: renderHeroSvg() },
    { path: "assets/hero.svg", content: renderHeroSvg() },
    ...imageFiles(),
    { path: "assets-map.json", content: JSON.stringify(renderAssetsMap(), null, 2) },
    { path: "briefing.json", content: JSON.stringify({ ...renderBriefing({ version, generatedAt, pages }), editorManifest }, null, 2) },
    { path: "README.md", content: renderReadme(version) },
  ];
  return {
    version,
    generatedAt,
    businessName: company.name,
    packageType: "premium",
    files,
    meta: { ...renderBriefing({ version, generatedAt, pages }), editorManifest },
  };
}

function renderHome() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["LocalBusiness", "HomeAndConstructionBusiness"],
        "@id": `${company.website}/#business`,
        name: company.name,
        alternateName: company.shortName,
        url: company.website,
        telephone: company.phone,
        email: company.email,
        areaServed: company.area,
        openingHours: "Mo-Fr 08:00-17:00",
        sameAs: [company.facebook, company.instagram],
        priceRange: "Op aanvraag",
      },
      {
        "@type": "WebSite",
        "@id": `${company.website}/#website`,
        url: company.website,
        name: company.name,
      },
    ],
  };
  return pageShell({
    title: "Tegelzetter Almere | VM Tegelwerken",
    description: "Van Meetelen Tegelwerken realiseert strak tegelwerk, vloeren, sanitair en badkamerrenovaties in Almere en omgeving.",
    jsonLd,
    body: `
      <section class="hero" id="home" data-mws-section-id="home.hero" data-mws-section-type="hero" data-mws-section-label="Hero">
        <img data-mws-field="image" src="${assets.hero}" alt="Marmeren vloer in Almere-Haven door Van Meetelen Tegelwerken">
        <div class="hero-shade"></div>
        <div class="hero-copy reveal">
          <span class="eyebrow" data-mws-field="eyebrow">Tegelzetter in Almere en omgeving</span>
          <h1 data-mws-field="title">Tegelwerk dat klopt tot in ieder detail.</h1>
          <p data-mws-field="description">Van badkamer en toilet tot woonvloer en keuken. Van Meetelen Tegelwerken realiseert strak en duurzaam tegelwerk met persoonlijke aandacht van voorbereiding tot afwerking.</p>
          <div class="hero-actions">
            <a class="button" data-mws-field="primary-cta" href="offerte.html">Vraag een vrijblijvende offerte aan</a>
            <a class="button secondary" data-mws-field="secondary-cta" href="projecten.html">Bekijk gerealiseerde projecten</a>
          </div>
          <div class="trust-row" aria-label="Feitelijke sterke punten">
            <span>Almere en omgeving</span>
            <span>Persoonlijk vakmanschap</span>
            <span>Badkamer, toilet, keuken en vloer</span>
          </div>
        </div>
      </section>
      <section class="intro section split" data-mws-section-id="home.introduction" data-mws-section-type="text" data-mws-section-label="Introductie">
        <div class="section-copy reveal">
          <span class="eyebrow" data-mws-field="eyebrow">Goed tegelwerk blijft rustig</span>
          <h2 data-mws-field="title">Mooi op de dag van oplevering. Prettig in gebruik in de jaren daarna.</h2>
          <div data-mws-field="body"><p>Een rustige tegelverdeling, nette aansluitingen en een verzorgde afwerking bepalen hoe de ruimte straks aanvoelt. VM Tegelwerken kan meedenken over voorbereiding, tegelwerk, sanitair, afwerking en volledige renovatie.</p></div>
        </div>
        <div class="image-stack reveal">
          <img src="${assets.shower}" alt="Detail van douchevloer en afvoer">
          <img src="${assets.kitchen}" alt="Keukenwand met hexagontegels">
        </div>
      </section>
      ${renderServices()}
      <section class="featured section dark split">
        <div class="project-photo reveal"><img src="${assets.marble}" alt="Marmeren vloer in Almere-Haven"></div>
        <div class="section-copy reveal">
          <span class="eyebrow">Uitgelicht project</span>
          <h2>Marmeren vloer - Almere-Haven</h2>
          <p>Een echt projectbeeld uit de bestaande VM Tegelwerken-presentatie. De vloer laat zien hoe materiaalkeuze, verdeling en rustige aansluitingen samen het eindbeeld bepalen.</p>
          <dl class="facts"><div><dt>Locatie</dt><dd>Almere-Haven</dd></div><div><dt>Type</dt><dd>Vloertegelwerk</dd></div></dl>
          <a class="button" href="project-marmeren-vloer-almere-haven.html">Bekijk project</a>
        </div>
      </section>
      ${renderProjects()}
      ${renderCraft()}
      ${renderProcess()}
      ${renderAbout()}
      <section class="reviews section">
        <div class="section-copy">
          <span class="eyebrow">Klantervaringen</span>
          <h2>Echte reviews zijn nog niet betrouwbaar gekoppeld.</h2>
          <p>Deze demo toont daarom geen verzonnen reviewteksten, namen of scores. Echte klantervaringen kunnen later direct vanuit de bedrijfsbron worden toegevoegd.</p>
        </div>
      </section>
      ${renderCta()}
      ${renderContact()}
    `,
  });
}

function renderServices() {
  return `
    <section class="services section" id="diensten" data-mws-section-id="home.services" data-mws-section-type="services" data-mws-section-label="Diensten">
      <div class="section-head reveal">
        <span class="eyebrow" data-mws-field="eyebrow">Diensten</span>
        <h2 data-mws-field="title">Voor badkamers, toiletten, keukens en vloeren.</h2>
      </div>
      <div class="service-grid" data-mws-field="items">
        ${services.map(([title, text, image]) => `
          <article class="service-card reveal">
            <img src="${image}" alt="${escapeHtml(title)} door VM Tegelwerken">
            <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p><a href="offerte.html">Bespreek dit werk</a></div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderProjects() {
  return `
    <section class="projects section" id="projecten">
      <div class="section-head reveal">
        <span class="eyebrow">Projecten</span>
        <h2>Echte beelden, eerlijk omschreven.</h2>
      </div>
      <div class="project-grid">
        ${projects.map((project) => `
          <a class="project-card reveal" href="${project.slug}">
            <img src="${project.image}" alt="${escapeHtml(project.title)} in ${escapeHtml(project.location)}">
            <span>${escapeHtml(project.category)} - ${escapeHtml(project.location)}</span>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.summary)}</p>
          </a>
        `).join("")}
        <article class="project-card reveal">
          <img src="${assets.kitchen}" alt="Keukenwand met hexagontegels">
          <span>Keukentegelwerk</span><h3>Keukenwand met hexagontegels</h3><p>Projectbeeld uit de bestaande presentatie, zonder extra plaats- of specificatieclaims.</p>
        </article>
        <article class="project-card reveal">
          <img src="${assets.shower}" alt="Douchevloer met afvoerdetail">
          <span>Badkamerdetail</span><h3>Douchevloer en afwerking</h3><p>Detailbeeld dat aansluit bij het werkgebied badkamer en tegelafwerking.</p>
        </article>
      </div>
    </section>
  `;
}

function renderCraft() {
  return `
    <section class="craft section dark">
      <div class="section-head reveal">
        <span class="eyebrow">Vakmanschap in detail</span>
        <h2>Het verschil zit in wat u straks iedere dag ziet.</h2>
      </div>
      <div class="detail-grid">
        ${[
          ["Voorbereiding", "Een goede ondergrond helpt om tegelwerk strak en duurzaam te kunnen uitvoeren."],
          ["Lijnvoering", "Rustige tegelverdeling voorkomt dat snijlijnen en patronen onnodig onrustig worden."],
          ["Aansluitingen", "Hoeken, randen, nissen en overgangen vragen om aandacht voordat er wordt gezet."],
          ["Afwerking", "Voegen, kitnaden en afwerking rond sanitair bepalen de dagelijkse indruk."],
        ].map(([title, text]) => `<article class="detail-card benefit-card reveal"><span></span><h3>${title}</h3><p>${text}</p></article>`).join("")}
      </div>
    </section>
  `;
}

function renderProcess() {
  return `
    <section class="process section" id="werkwijze">
      <div class="section-head reveal">
        <span class="eyebrow">Werkwijze</span>
        <h2>Duidelijkheid voordat het werk begint.</h2>
      </div>
      <div class="steps">
        ${[
          ["01", "Kennismaken", "U vertelt wat er vernieuwd moet worden en deelt wensen, maten en eventueel foto's."],
          ["02", "Bekijken en adviseren", "De situatie, gewenste afwerking en materiaalkeuzes worden besproken."],
          ["03", "Duidelijke offerte", "U ontvangt een passend voorstel voor het afgesproken werk."],
          ["04", "Vakkundige uitvoering", "Het werk wordt zorgvuldig gerealiseerd en netjes afgewerkt."],
        ].map(([number, title, text]) => `<article class="step reveal"><span>${number}</span><h3>${title}</h3><p>${text}</p></article>`).join("")}
      </div>
    </section>
  `;
}

function renderAbout() {
  return `
    <section class="about section split" id="over-vm">
      <div class="section-copy reveal">
        <span class="eyebrow">Over VM Tegelwerken</span>
        <h2>Persoonlijk vakmanschap, zonder onnodige tussenlagen.</h2>
        <p>De huidige website presenteert VM Tegelwerken als specialist met vakkennis, geduld, passie, ervaring en service. Deze demo vertaalt dat naar een heldere, rustige presentatie waarin direct contact en zorgvuldige uitvoering centraal staan.</p>
        <p>Er is geen losse biografie of teaminformatie bevestigd. Daarom blijft deze sectie bewust zakelijk en feitelijk.</p>
      </div>
      <img class="rounded-media reveal" src="${assets.kitchen}" alt="Werkbeeld en tegelafwerking in een keuken">
    </section>
  `;
}

function renderCta() {
  return `
    <section class="cta section" data-mws-section-id="home.contact-cta" data-mws-section-type="cta" data-mws-section-label="Contact en call-to-action">
      <div class="cta-panel reveal">
        <span class="eyebrow" data-mws-field="eyebrow">Offerte aanvragen</span>
        <h2 data-mws-field="title">Plannen voor nieuw tegelwerk of een renovatie?</h2>
        <p data-mws-field="description">Vertel kort om welke ruimte het gaat. Deel uw wensen en eventueel enkele foto's, dan kan Van Meetelen Tegelwerken gericht contact met u opnemen.</p>
        <div class="hero-actions" data-mws-field="form"><a class="button" href="offerte.html">Start uw aanvraag</a><a class="button secondary dark-button" href="${company.phoneHref}">Bel ${company.phone}</a></div>
      </div>
    </section>
  `;
}

function renderContact() {
  return `
    <section class="contact section" id="contact">
      <div class="section-copy reveal">
        <span class="eyebrow">Contact</span>
        <h2>Direct overleggen over tegelwerk in Almere.</h2>
        <p>Neem contact op voor vragen over badkamer, toilet, keuken, woonvloer of ander tegelwerk.</p>
      </div>
      <div class="contact-grid contact-bar reveal">
        <a href="${company.phoneHref}"><strong>${company.phone}</strong><span>Direct bellen</span></a>
        <a href="${company.mailHref}"><strong>${company.email}</strong><span>Stuur een e-mail</span></a>
        <div><strong>${company.area}</strong><span>Werkgebied bevestigd op huidige site</span></div>
        <div><strong>${company.hours}</strong><span>Gevonden in huidige websitemetadata</span></div>
        <a href="${company.facebook}"><strong>Facebook</strong><span>Officieel gelinkt profiel</span></a>
        <a href="${company.instagram}"><strong>Instagram</strong><span>Officieel gelinkt profiel</span></a>
      </div>
    </section>
  `;
}

function renderQuoteForm() {
  return `
    <form class="quote-form reveal" id="quoteForm" novalidate>
      ${formStep("1", "Type project", `
        ${choice("projectType", "Badkamer")}${choice("projectType", "Toilet")}${choice("projectType", "Keuken")}${choice("projectType", "Woonvloer")}${choice("projectType", "Overig tegelwerk")}
      `)}
      ${formStep("2", "Omvang", `
        ${choice("scope", "Complete renovatie")}${choice("scope", "Alleen tegelwerk")}${choice("scope", "Vloer")}${choice("scope", "Wand")}${choice("scope", "Sanitair en tegelwerk")}${choice("scope", "Nog niet zeker")}
      `)}
      ${formStep("3", "Locatie en planning", `
        <label>Postcode<input name="zip" autocomplete="postal-code" required></label>
        <label>Plaats<input name="plaats" autocomplete="address-level2" required></label>
        <label>Gewenste startperiode<input name="startperiode" aria-label="Bijvoorbeeld voorjaar of nog flexibel"></label>
        <label class="wide">Toelichting<textarea name="toelichting" rows="4" aria-label="Beschrijf kort de ruimte en wat u wilt laten doen."></textarea></label>
      `)}
      ${formStep("4", "Foto's", `
        <p class="form-note wide">Upload is voorbereid in de interface. Voor verzending via deze statische demo opent de aanvraag als e-mail; foto's kunnen daarna direct worden meegestuurd.</p>
        <label>Huidige situatie<input type="file" name="huidigeSituatie" accept="image/*"></label>
        <label>Inspiratie<input type="file" name="inspiratie" accept="image/*"></label>
        <label>Plattegrond<input type="file" name="plattegrond" accept="image/*,.pdf"></label>
        <label>Gekozen tegels<input type="file" name="tegels" accept="image/*"></label>
      `)}
      ${formStep("5", "Contactgegevens", `
        <label>Naam<input name="naam" autocomplete="name" required></label>
        <label>Telefoon<input name="telefoon" autocomplete="tel" required></label>
        <label>E-mail<input type="email" name="email" autocomplete="email" required></label>
        <label>Voorkeur voor contact<select name="contactVoorkeur"><option>Telefonisch</option><option>E-mail</option><option>Geen voorkeur</option></select></label>
        <label class="check wide"><input type="checkbox" name="privacy" required> Ik ga akkoord dat VM Tegelwerken contact opneemt naar aanleiding van deze aanvraag.</label>
      `)}
      <div class="form-actions"><button type="button" data-prev>Terug</button><button type="button" data-next>Verder</button><button type="submit">Aanvraag versturen</button></div>
      <p class="form-status" role="status"></p>
    </form>
  `;
}

function formStep(step, title, body) {
  return `<fieldset class="form-step" data-step="${step}"><legend><span>Stap ${step}</span>${title}</legend><div class="form-grid">${body}</div></fieldset>`;
}

function choice(name, value) {
  return `<label class="choice"><input type="radio" name="${name}" value="${escapeHtml(value)}" required><span>${escapeHtml(value)}</span></label>`;
}

function renderPrivacy() {
  return `
    <section class="section-copy readable reveal">
      <p>Deze demo gebruikt alleen de feitelijk bekende gegevens: ${company.name}, ${company.phone}, ${company.email} en ${company.area}. Een juridisch definitieve privacyverklaring vraagt nog controle van de ondernemer.</p>
      <p>Voor offerteaanvragen worden naam, telefoonnummer, e-mailadres, projecttype en toelichting gebruikt om contact op te nemen over de aanvraag. In deze demo wordt de aanvraag via e-mail voorbereid.</p>
      <p>Er worden geen beoordelingscijfers, bezoekadres of niet-bevestigde verwerkingsdetails toegevoegd.</p>
    </section>
  `;
}

function renderProject(project) {
  const other = projects.find((item) => item.slug !== project.slug);
  return pageShell({
    title: `${project.title} ${project.location} | VM Tegelwerken`,
    description: `${project.category} door VM Tegelwerken in ${project.location}.`,
    body: `
      <section class="subhero project-hero">
        <img src="${project.image}" alt="${escapeHtml(project.title)} in ${escapeHtml(project.location)}">
        <div><span class="eyebrow">${escapeHtml(project.category)}</span><h1>${escapeHtml(project.title)} - ${escapeHtml(project.location)}</h1><p>${escapeHtml(project.summary)}</p></div>
      </section>
      <section class="section split">
        <div class="section-copy reveal"><span class="eyebrow">Projectinformatie</span><h2>Feitelijk projectbeeld, zonder verzonnen specificaties.</h2><p>${escapeHtml(project.detail)}</p><dl class="facts"><div><dt>Plaats</dt><dd>${escapeHtml(project.location)}</dd></div><div><dt>Categorie</dt><dd>${escapeHtml(project.category)}</dd></div></dl></div>
        <div class="gallery-mini reveal"><img src="${project.image}" alt="${escapeHtml(project.title)} detail"><img src="${assets.shower}" alt="Detail van tegelwerk"><img src="${assets.kitchen}" alt="Werkbeeld tegelzetten"></div>
      </section>
      ${renderCta()}
      <section class="section next-project"><a class="button secondary dark-button" href="projecten.html">Terug naar projecten</a>${other ? `<a class="button" href="${other.slug}">Bekijk ${escapeHtml(other.title)}</a>` : ""}</section>
    `,
  });
}

function renderStandardPage(title, intro, content) {
  return pageShell({
    title: `${title} | VM Tegelwerken`,
    description: intro,
    body: `<section class="subhero"><img src="${assets.hero}" alt="Tegelwerk door VM Tegelwerken"><div><span class="eyebrow">${company.area}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div></section>${content}${renderCta()}`,
  });
}

function pageShell({ title, description, body, jsonLd = null }) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${assets.og}">
  <link rel="icon" href="${assets.favicon}" type="image/svg+xml">
  <link rel="stylesheet" href="styles.css">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
  <header class="site-header" data-header>
    <a class="brand" href="index.html"><img src="${assets.logo}" alt="Van Meetelen Tegelwerken logo"><span>VM Tegelwerken</span></a>
    <nav class="desktop-nav" aria-label="Hoofdnavigatie">${navLinks()}</nav>
    <a class="phone-link" href="${company.phoneHref}">${company.phone}</a>
    <a class="header-cta" href="offerte.html">Vrijblijvende offerte</a>
    <button class="menu-toggle" type="button" data-menu-toggle aria-label="Menu openen" aria-expanded="false"><span></span><span></span></button>
    <nav class="mobile-nav" data-mobile-nav aria-label="Mobiele navigatie">${navLinks()}</nav>
  </header>
  <main>${body}</main>
  ${footer()}
  <script src="script.js"></script>
</body>
</html>`;
}

function navLinks() {
  return [
    ["index.html", "Home"],
    ["diensten.html", "Diensten"],
    ["projecten.html", "Projecten"],
    ["werkwijze.html", "Werkwijze"],
    ["over-vm.html", "Over VM"],
    ["contact.html", "Contact"],
  ].map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
}

function footer() {
  return `<footer class="site-footer" data-mws-section-id="global.footer" data-mws-section-type="footer" data-mws-section-label="Footer"><div><img src="${assets.logoWhite}" alt="Van Meetelen Tegelwerken logo"><p data-mws-field="description">De zorgvuldige tegel- en renovatiespecialist voor Almere en omgeving.</p><strong data-mws-field="business-name">${company.name}</strong></div><nav data-mws-field="navigation">${navLinks()}<a href="privacy.html">Privacy</a></nav><address><a href="${company.phoneHref}">${company.phone}</a><a href="${company.mailHref}">${company.email}</a><span>${company.area}</span><span>${company.hours}</span></address></footer>`;
}

function renderCss() {
  return `:root{--paper:#f5f0e8;--white:#fffaf3;--ink:#161719;--muted:#68625b;--stone:#8b847a;--line:rgba(22,23,25,.14);--dark:#1d1c1a;--accent:#a86f42;--soft:#ded1c0;--shadow:0 28px 80px rgba(22,23,25,.16)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,Arial,sans-serif}body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(22,23,25,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(22,23,25,.025) 1px,transparent 1px);background-size:72px 72px;z-index:-1}a{color:inherit}.site-header{position:sticky;top:0;z-index:50;display:grid;grid-template-columns:auto 1fr auto auto auto;gap:18px;align-items:center;padding:12px clamp(18px,3vw,46px);background:rgba(245,240,232,.88);border-bottom:1px solid var(--line);backdrop-filter:blur(16px)}.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:900}.brand img{width:76px;height:34px;object-fit:contain}.desktop-nav{display:flex;justify-content:center;gap:20px}.desktop-nav a,.mobile-nav a,.phone-link{text-decoration:none;font-size:14px;font-weight:800;color:var(--muted)}.header-cta,.button{display:inline-flex;justify-content:center;align-items:center;min-height:46px;padding:13px 20px;border:1px solid transparent;border-radius:4px;background:var(--accent);color:white;text-decoration:none;font-weight:900}.button{min-height:54px;padding:15px 24px}.button.secondary{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.45)}.dark-button{background:var(--dark);color:white;border-color:var(--dark)}.menu-toggle{display:none}.mobile-nav{display:none}.hero{position:relative;min-height:calc(100vh - 70px);display:grid;align-items:center;padding:clamp(78px,10vw,140px) clamp(22px,5vw,84px);color:white;overflow:hidden}.hero img,.subhero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(15,14,13,.78),rgba(15,14,13,.44) 52%,rgba(15,14,13,.14)),linear-gradient(0deg,rgba(15,14,13,.36),transparent)}.hero-copy,.subhero div{position:relative;z-index:1;max-width:880px}.eyebrow{display:block;margin-bottom:18px;color:var(--accent);font-size:13px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}h1,h2,h3,p{letter-spacing:0}h1{margin:0 0 22px;font-size:clamp(48px,8vw,106px);line-height:.94;font-weight:950}h2{margin:0 0 20px;font-size:clamp(34px,5.4vw,70px);line-height:1;font-weight:950}h3{margin:0 0 10px;font-size:clamp(22px,2vw,30px);line-height:1.12}.hero p,.subhero p,.section-copy p,.section-head p,.cta-panel p{font-size:clamp(18px,1.7vw,23px);line-height:1.7;color:rgba(255,255,255,.86)}.section-copy p,.section-head p,.cta-panel p{color:var(--muted)}.hero-actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:32px}.trust-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:52px}.trust-row span{padding:14px 18px;background:rgba(255,255,255,.12);border-left:1px solid rgba(255,255,255,.34);font-weight:800;color:rgba(255,255,255,.86)}.section{width:min(1180px,calc(100% - 44px));margin:auto;padding:clamp(72px,8vw,122px) 0}.split{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(28px,5vw,72px);align-items:center}.image-stack{display:grid;grid-template-columns:1fr .66fr;gap:14px;align-items:end}.image-stack img,.rounded-media,.project-photo img,.gallery-mini img{width:100%;object-fit:cover;background:#ddd}.image-stack img:first-child{height:560px}.image-stack img:last-child{height:360px}.service-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px}.service-card,.project-card,.detail-card,.step,.contact-grid>*{background:var(--white);border:1px solid var(--line);box-shadow:0 22px 60px rgba(22,23,25,.07)}.service-card{overflow:hidden}.service-card img{width:100%;height:260px;object-fit:cover;display:block}.service-card div{padding:24px}.service-card p,.project-card p,.detail-card p,.step p,.contact-grid span,.facts dd{color:var(--muted);line-height:1.65}.service-card a{font-weight:900;color:var(--accent);text-decoration:none}.dark{width:100%;max-width:none;background:var(--dark);color:white;padding-left:max(22px,calc((100vw - 1180px)/2));padding-right:max(22px,calc((100vw - 1180px)/2))}.dark .section-copy p,.dark .section-head p,.dark .detail-card p{color:rgba(255,255,255,.72)}.project-photo img{height:640px}.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:28px 0}.facts div{padding:18px;border:1px solid var(--line);background:rgba(255,255,255,.75)}.dark .facts div{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.06)}.facts dt{font-weight:950;color:var(--accent)}.facts dd{margin:4px 0 0}.project-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:34px}.project-card{position:relative;min-height:360px;display:flex;flex-direction:column;justify-content:flex-end;padding:20px;text-decoration:none;overflow:hidden;color:white;background:#111}.project-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .35s ease}.project-card:hover img{transform:scale(1.045)}.project-card::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,.06))}.project-card span,.project-card h3,.project-card p{position:relative;z-index:1}.project-card span{color:#e5b58e;font-weight:950}.detail-grid,.steps,.contact-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:34px}.detail-card,.step,.contact-grid>*{padding:26px}.detail-card span{display:block;width:72px;height:72px;margin-bottom:44px;border:1px solid rgba(255,255,255,.26);background:linear-gradient(135deg,transparent 48%,rgba(255,255,255,.28) 49%,rgba(255,255,255,.28) 52%,transparent 53%)}.process .step span{display:block;margin-bottom:46px;color:var(--accent);font-weight:950}.about .rounded-media{height:560px}.reviews{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.cta-panel{padding:clamp(30px,5vw,66px);background:var(--white);border:1px solid var(--line);box-shadow:var(--shadow)}.contact-grid{grid-template-columns:repeat(3,1fr)}.contact-grid a{text-decoration:none}.contact-grid strong{display:block;font-size:24px;margin-bottom:8px}.site-footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;padding:42px clamp(22px,5vw,70px);background:var(--dark);color:rgba(255,255,255,.72)}.site-footer img{width:160px;height:auto}.site-footer nav,.site-footer address{display:grid;gap:10px;font-style:normal}.site-footer a{text-decoration:none;color:rgba(255,255,255,.82)}.subhero{position:relative;min-height:54vh;display:grid;align-items:end;padding:clamp(80px,10vw,150px) clamp(22px,5vw,84px);color:white;overflow:hidden;background:#111}.subhero::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(15,14,13,.76),rgba(15,14,13,.22))}.project-hero{min-height:76vh}.gallery-mini{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.gallery-mini img:first-child{grid-column:1/-1;height:440px}.gallery-mini img{height:240px}.next-project{display:flex;gap:14px}.quote-form{background:var(--white);border:1px solid var(--line);box-shadow:var(--shadow);padding:clamp(22px,4vw,44px)}.form-step{display:none;border:0;padding:0;margin:0}.form-step.is-active{display:block}.form-step legend{margin-bottom:24px;font-size:clamp(28px,3vw,42px);font-weight:950}.form-step legend span{display:block;color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:.06em}.form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.wide{grid-column:1/-1}label{display:grid;gap:8px;font-weight:850}.choice span{display:block;padding:18px 20px;border:1px solid var(--line);background:var(--paper)}.choice input{position:absolute;opacity:0;width:1px;min-height:0;height:1px;padding:0;margin:0;overflow:hidden}.choice input:checked+span{border-color:var(--accent);box-shadow:inset 0 0 0 2px var(--accent);background:#fff}input,select,textarea{width:100%;min-height:54px;border:1px solid var(--line);background:var(--paper);padding:0 15px;font:inherit;color:var(--ink)}textarea{padding-top:14px;resize:vertical}.check{display:flex;grid-template-columns:auto 1fr;align-items:center}.check input{width:auto;min-height:auto}.form-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:26px}.form-actions button{min-height:48px;padding:0 18px;border:1px solid var(--line);background:var(--dark);color:white;font:inherit;font-weight:900}.form-actions button[type=submit]{display:none;background:var(--accent);border-color:var(--accent)}.quote-form.is-last .form-actions button[type=submit]{display:inline-flex}.quote-form.is-last [data-next]{display:none}.form-note,.form-status{color:var(--muted);line-height:1.6}.readable{max-width:820px}.reveal{opacity:0;transform:translateY(22px);transition:opacity .5s ease,transform .5s ease}.reveal.is-visible{opacity:1;transform:none}@media(max-width:1050px){.desktop-nav,.phone-link,.header-cta{display:none}.menu-toggle{display:grid;gap:5px;width:44px;height:44px;place-content:center;border:1px solid var(--line);background:white}.menu-toggle span{display:block;width:22px;height:2px;background:var(--ink)}.site-header{grid-template-columns:auto 1fr auto}.mobile-nav{grid-column:1/-1;display:none;grid-template-columns:1fr;gap:8px;padding:16px 0}.mobile-nav.is-open{display:grid}.split,.project-grid,.detail-grid,.steps,.contact-grid,.site-footer{grid-template-columns:1fr 1fr}.service-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.hero{min-height:78vh}.split,.service-grid,.project-grid,.detail-grid,.steps,.contact-grid,.site-footer,.form-grid,.gallery-mini{grid-template-columns:1fr}.image-stack{grid-template-columns:1fr}.image-stack img:first-child,.image-stack img:last-child,.about .rounded-media,.project-photo img{height:360px}.facts{grid-template-columns:1fr}.hero-actions,.next-project,.form-actions{display:grid}.project-card{min-height:300px}.section{width:min(100% - 32px,1180px)}h1{font-size:clamp(42px,15vw,70px)}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}.reveal{opacity:1;transform:none}}`;
}

function renderScript() {
  return `const header=document.querySelector("[data-header]");const toggle=document.querySelector("[data-menu-toggle]");const mobile=document.querySelector("[data-mobile-nav]");toggle?.addEventListener("click",()=>{const open=mobile.classList.toggle("is-open");toggle.setAttribute("aria-expanded",String(open));});const observer=new IntersectionObserver((entries)=>entries.forEach((entry)=>{if(entry.isIntersecting)entry.target.classList.add("is-visible");}),{threshold:.12});document.querySelectorAll(".reveal").forEach((item)=>observer.observe(item));const form=document.getElementById("quoteForm");const requestForm=form;if(form){let step=0;const steps=[...form.querySelectorAll(".form-step")];const prev=form.querySelector("[data-prev]");const next=form.querySelector("[data-next]");const status=form.querySelector(".form-status");const render=()=>{steps.forEach((item,index)=>item.classList.toggle("is-active",index===step));form.classList.toggle("is-last",step===steps.length-1);prev.disabled=step===0;status.textContent="";};const valid=()=>{const fields=[...steps[step].querySelectorAll("input,select,textarea")];const invalid=fields.find((field)=>!field.checkValidity());if(invalid){invalid.focus();status.textContent="Vul de verplichte velden in voordat u verdergaat.";return false;}return true;};prev.addEventListener("click",()=>{step=Math.max(0,step-1);render();});next.addEventListener("click",()=>{if(!valid())return;step=Math.min(steps.length-1,step+1);render();});requestForm.addEventListener("submit",(event)=>{event.preventDefault();if(!valid())return;const data=new FormData(form);const lines=["Nieuwe offerteaanvraag via VM Tegelwerken","",...["projectType","scope","zip","plaats","startperiode","toelichting","naam","telefoon","email","contactVoorkeur"].map((key)=>key+": "+(data.get(key)||"")),"","Foto's kunnen als bijlage op deze e-mail worden meegestuurd."];window.location.href="mailto:info@vmtegelwerken.nl?subject="+encodeURIComponent("Offerteaanvraag tegelwerk")+"&body="+encodeURIComponent(lines.join("\\n"));status.textContent="Uw e-mailprogramma wordt geopend met de aanvraag.";});render();}`;
}

function imageFiles() {
  const map = [
    ["logo.png", assets.logo],
    ["logo-white.png", assets.logoWhite],
    ["marble-floor-almere-haven.jpg", assets.marble],
    ["toilet-renovatie-almere-stad.jpg", assets.toilet],
    ["douche-detail.jpg", assets.shower],
    ["werkbeeld-keuken.jpg", assets.work],
    ["toilet-grijs.jpg", assets.grayToilet],
    ["keuken-hexagon.jpg", assets.kitchen],
  ];
  return map.map(([file, target]) => {
    const source = path.join(ASSET_ROOT, file);
    return {
      path: target,
      content: fs.existsSync(source) ? fs.readFileSync(source).toString("base64") : "",
      encoding: "base64",
    };
  });
}

function renderAssetsMap() {
  return {
    source: "current_vmtegelwerken_public_site_assets",
    company,
    projects,
    assets,
    originalAssetRoot: PUBLIC_ASSET_ROOT,
    unverified: ["reviewteksten", "reviewscore", "aantal jaren ervaring", "teamgrootte", "keurmerken", "prijzen", "concrete garantietermijn"],
  };
}

function renderBriefing({ version, generatedAt, pages }) {
  return {
    businessName: company.name,
    packageType: "premium",
    packageId: "premium",
    packageLabel: "Premium Growth",
    industryProfile: "tiling",
    industryId: "tegelzetter",
    industryName: "Tegelzetbedrijf",
    generatedPages: pages,
    version,
    generatedAt,
    services: services.map(([title]) => title),
    projectSlug: "vm-tegelwerken",
    siteUrl: company.website,
    currentWebsiteFindings: {
      confirmed: ["Almere en omstreken", company.phone, company.email, "tegels zetten", "vloeren leggen", "sanitair plaatsen", "complete badkamerrenovaties"],
      incompletePages: ["diensten", "projecten"],
      placeholders: ["binnenkort", "druk bezig met onze website"],
      realProjects: projects.map((project) => `${project.title} - ${project.location}`),
      reviews: "Niet betrouwbaar bevestigd; geen fictieve reviews geplaatst.",
    },
  };
}

function renderReadme(version) {
  return `# ${company.name} premium demo V${version}\n\nDeze preview gebruikt het bestaande Website Factory-pakket met een bedrijfsspecifieke VM Tegelwerken showcase.\n\nControlepunten: echte projectbeelden, geen fictieve reviews, geen verzonnen aantallen, premium tegelzetterpositionering.`;
}

function renderSitemap(pages) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((page) => `  <url><loc>${company.website}/${page === "index.html" ? "" : page}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function renderLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 80" role="img" aria-label="VM Tegelwerken"><rect width="180" height="80" fill="#f5f0e8"/><text x="20" y="48" font-family="Arial,sans-serif" font-size="34" font-weight="900" fill="#1d1c1a">VM</text><text x="82" y="34" font-family="Arial,sans-serif" font-size="15" font-weight="800" fill="#1d1c1a">Tegel</text><text x="82" y="52" font-family="Arial,sans-serif" font-size="15" font-weight="800" fill="#a86f42">werken</text></svg>`;
}

function renderFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#1d1c1a"/><path d="M14 15h17v17H14zM33 15h17v17H33zM14 34h17v17H14zM33 34h17v17H33z" fill="#a86f42"/></svg>`;
}

function renderOgSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#1d1c1a"/><path d="M0 500h1200v130H0z" fill="#a86f42"/><text x="80" y="230" font-family="Arial,sans-serif" font-size="88" font-weight="900" fill="#fff">VM Tegelwerken</text><text x="80" y="330" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#ded1c0">Tegelwerk dat klopt tot in ieder detail.</text><path d="M820 90h260v260H820zM900 170h260v260H900z" fill="none" stroke="#ded1c0" stroke-width="10"/></svg>`;
}

function renderHeroSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#ded1c0"/><path d="M0 0h1600v1000H0z" fill="#f5f0e8"/><g stroke="#c9b9a5" stroke-width="3">${Array.from({ length: 12 }).map((_, i) => `<path d="M${i * 145} 0v1000"/>`).join("")}${Array.from({ length: 8 }).map((_, i) => `<path d="M0 ${i * 145}h1600"/>`).join("")}</g><text x="120" y="520" font-family="Arial,sans-serif" font-size="90" font-weight="900" fill="#1d1c1a">VM Tegelwerken</text></svg>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

module.exports = {
  buildVmTegelwerkenDemo,
  isVmTegelwerkenJourney,
};
