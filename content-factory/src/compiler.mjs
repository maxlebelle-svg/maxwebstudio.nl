import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_PROFILES, VERTICALS } from "./verticals.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_ROOT = path.join(ROOT, "generated");
const LIBRARY_ROOT = path.join(ROOT, "content-library");
const REQUIREMENTS = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "requirements.json"), "utf8"));

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const stableId = (prefix, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`;
const pick = (values, index) => values[index % values.length];
const unique = (values) => [...new Set(values)];

const REGIONS = ["[PLAATS]", "[REGIO]", "bij u in de buurt", "in heel Nederland", "voor lokale klanten"];
const INTENTS = ["advies", "kosten", "specialist", "offerte", "prijzen", "mogelijkheden", "ervaring", "service", "kwaliteit", "afspraak"];
const QUALIFIERS = ["betrouwbaar", "professioneel", "ervaren", "lokaal", "snel", "persoonlijk", "duurzaam", "betaalbaar", "hoogwaardig", "op maat"];
const HERO_OPENERS = [
  "Kies voor", "Ontdek", "Ervaar", "Vertrouw op", "Maak werk van", "Klaar voor", "Alles voor", "Uw partner voor", "Direct geregeld:", "Vakmanschap in"
];
const HERO_ENDINGS = [
  "met aandacht voor elk detail", "zonder onduidelijke afspraken", "voor een resultaat dat blijft", "dichtbij en persoonlijk",
  "met heldere prijzen", "van eerste advies tot nazorg", "voor particulier en bedrijf", "precies zoals het hoort",
  "met één vast aanspreekpunt", "waar kwaliteit vooropstaat"
];
const FAQ_QUESTIONS = [
  "Wat kost {service}?", "Hoe snel kan ik starten met {service}?", "Hoe verloopt {service}?", "Is {service} ook mogelijk in {region}?",
  "Kan ik eerst advies krijgen over {service}?", "Wat is inbegrepen bij {service}?", "Hoe vraag ik een offerte aan voor {service}?",
  "Werken jullie ook voor zakelijke klanten?", "Werken jullie ook voor particulieren?", "Welke voorbereiding is nodig voor {service}?",
  "Hoe lang duurt {service}?", "Welke garanties gelden voor {service}?", "Kan {service} op maat worden uitgevoerd?",
  "Wat maakt jullie aanpak voor {service} anders?", "Is een kennismaking voor {service} vrijblijvend?", "Bieden jullie nazorg na {service}?",
  "Welke opties zijn er voor {service}?", "Hoe wordt de planning voor {service} bepaald?", "Kan ik voorbeelden van {service} bekijken?",
  "Wie is mijn aanspreekpunt tijdens {service}?"
];
const REVIEW_LEADS = [
  "Vanaf het eerste contact", "Tijdens het hele traject", "De uitleg vooraf", "De persoonlijke aanpak", "De duidelijke planning",
  "Het eindresultaat", "De communicatie", "De snelheid van schakelen", "De aandacht voor detail", "De service achteraf"
];
const REVIEW_ENDINGS = [
  "gaf direct vertrouwen.", "was precies wat we zochten.", "maakte het hele proces overzichtelijk.", "was professioneel en prettig.",
  "overtrof onze verwachtingen.", "zorgde voor een zorgeloze ervaring.", "was helder, eerlijk en deskundig.", "verdient absoluut een aanbeveling.",
  "liet zien dat kwaliteit echt vooropstaat.", "maakte dat we opnieuw zouden kiezen voor dit bedrijf."
];
const SOCIAL_FORMATS = ["tip", "voor-en-na", "veelgestelde-vraag", "achter-de-schermen", "klantverhaal", "mythe-of-feit", "stappenplan", "team", "poll", "checklist"];
const SOCIAL_ANGLES = [
  "De grootste fout bij {topic}", "Drie slimme keuzes voor {topic}", "Zo herken je kwaliteit bij {topic}", "Een kijkje achter de schermen bij {topic}",
  "Voor en na: het verschil bij {topic}", "Veelgestelde vraag over {topic}", "Onze aanpak van {topic} in vijf stappen", "Wat kost {topic} echt?",
  "Maak kennis met de specialist achter {topic}", "Checklist voordat je start met {topic}"
];
const BLOG_ANGLES = [
  "Complete gids voor {topic}", "Wat kost {topic} in 2026?", "10 aandachtspunten bij {topic}", "Zo kiest u de juiste specialist voor {topic}",
  "Veelgemaakte fouten bij {topic}", "Stappenplan voor succesvolle {topic}", "Wanneer is {topic} een slimme keuze?", "De nieuwste trends in {topic}",
  "Onderhoud en levensduur van {topic}", "Vergelijking: opties voor {topic}"
];
const CTA_LEADS = ["Plan", "Vraag", "Ontvang", "Start", "Ontdek", "Bekijk", "Bespreek", "Bereken", "Reserveer", "Bel voor"];
const CTA_TARGETS = ["een vrijblijvende kennismaking", "persoonlijk advies", "een offerte op maat", "uw project", "de mogelijkheden", "een afspraak", "een snelle prijsindicatie", "onze werkwijze", "beschikbaarheid", "direct contact"];
const USP_LEADS = ["Eén vast aanspreekpunt", "Heldere afspraken", "Transparante prijzen", "Ervaren specialisten", "Persoonlijk advies", "Snelle reactie", "Lokale betrokkenheid", "Maatwerk", "Zorgvuldige nazorg", "Bewezen kwaliteit"];
const USP_DETAILS = ["van aanvraag tot afronding", "zonder verrassingen achteraf", "afgestemd op uw situatie", "met aandacht voor detail", "voor particulier en bedrijf", "met duidelijke communicatie", "volgens een concreet plan", "met duurzame keuzes", "op een moment dat u past", "waarop u kunt vertrouwen"];
const PROJECT_TYPES = ["compact project", "complete vernieuwing", "zakelijke opdracht", "particuliere opdracht", "spoedopdracht", "maatwerktraject", "periodieke samenwerking", "duurzame upgrade", "premium uitvoering", "lokale case"];
const TEAM_ROLES = ["eigenaar", "senior specialist", "projectleider", "adviseur", "uitvoerend specialist", "planner", "servicemedewerker", "kwaliteitscoördinator", "klantadviseur", "vakexpert"];

function interpolate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

function buildServices(vertical, profile) {
  const subjects = unique([vertical.primaryService, ...vertical.related, ...profile.servicePatterns]);
  return Array.from({ length: REQUIREMENTS.minimums.services }, (_, index) => {
    const name = pick(subjects, index);
    return {
      id: stableId("service", index),
      name,
      short_description: `${titleCase(name)} voor klanten die kiezen voor een ${pick(QUALIFIERS, index)} resultaat en duidelijke begeleiding.`,
      long_description: `Met ${name.toLowerCase()} helpt [BEDRIJFSNAAM] klanten in ${pick(REGIONS, index)} van een heldere intake naar een zorgvuldig uitgevoerd resultaat. U krijgt vooraf duidelijkheid over aanpak, planning en vervolgstappen.`,
      benefits: [pick(USP_LEADS, index), pick(USP_LEADS, index + 3), pick(USP_LEADS, index + 6)],
      cta: `${pick(CTA_LEADS, index)} ${pick(CTA_TARGETS, index).toLowerCase()}`,
      seo_slug: `${vertical.slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`
    };
  });
}

function buildHeroVariants(vertical) {
  return Array.from({ length: REQUIREMENTS.minimums.hero_variants }, (_, index) => ({
    id: stableId("hero", index),
    title: `${pick(HERO_OPENERS, index)} ${index % 2 ? vertical.primaryService.toLowerCase() : vertical.name.toLowerCase()} ${pick(HERO_ENDINGS, index + Math.floor(index / HERO_OPENERS.length))}`,
    subtitle: `[BEDRIJFSNAAM] helpt u met ${vertical.primaryService.toLowerCase()} in [PLAATS] — persoonlijk, professioneel en met duidelijke afspraken.`,
    eyebrow: `${vertical.name} in [PLAATS]`,
    primary_cta: pick(CTA_TARGETS, index),
    secondary_cta: index % 2 ? "Bekijk onze aanpak" : "Bel direct"
  }));
}

function buildSeoKeywords(vertical, services) {
  const base = unique([vertical.name, vertical.singular, vertical.primaryService, ...vertical.related, ...services.map((service) => service.name)]);
  const candidates = [];
  for (const subject of base) {
    for (const intent of INTENTS) candidates.push(`${subject.toLowerCase()} ${intent}`);
    for (const qualifier of QUALIFIERS) candidates.push(`${qualifier} ${subject.toLowerCase()}`);
    for (const region of REGIONS) candidates.push(`${subject.toLowerCase()} ${region}`);
  }
  return unique(candidates).slice(0, REQUIREMENTS.minimums.seo_keywords).map((keyword, index) => ({
    id: stableId("keyword", index),
    keyword,
    intent: pick(["commercial", "transactional", "informational", "local"], index),
    funnel_stage: pick(["awareness", "consideration", "conversion"], index),
    landing_page: index % 5 === 0 ? "/" : `/diensten/${services[index % services.length].seo_slug}/`
  }));
}

function buildFaq(vertical, services) {
  return Array.from({ length: REQUIREMENTS.minimums.faq }, (_, index) => {
    const service = services[index % services.length].name.toLowerCase();
    const template = pick(FAQ_QUESTIONS, index);
    const baseQuestion = interpolate(template, { service, region: pick(REGIONS, index) });
    const question = template.includes("{service}") ? baseQuestion : `${baseQuestion.replace(/\?$/, "")} bij ${service}?`;
    return {
      id: stableId("faq", index),
      category: pick(["kosten", "werkwijze", "planning", "kwaliteit", "service"], index),
      question,
      answer: `[BEDRIJFSNAAM] stemt ${service} af op uw situatie. Na een korte inventarisatie ontvangt u duidelijkheid over de mogelijkheden, planning en kosten. Neem contact op voor een antwoord dat past bij uw vraag in [PLAATS].`,
      related_service_id: services[index % services.length].id
    };
  });
}

function buildReviews(vertical) {
  return Array.from({ length: REQUIREMENTS.minimums.reviews }, (_, index) => ({
    id: stableId("review", index),
    author_placeholder: `[KLANTNAAM ${index + 1}]`,
    locality_placeholder: pick(["[PLAATS]", "[REGIO]", "zakelijke klant", "particuliere klant", "terugkerende klant"], index),
    rating: 5,
      title: `${pick(USP_LEADS, index)} en ${pick(USP_DETAILS, index + Math.floor(index / 10))}`,
      text: `${pick(REVIEW_LEADS, index)} rondom ${pick([vertical.primaryService, ...vertical.related], index).toLowerCase()} ${pick(REVIEW_ENDINGS, index + Math.floor(index / 10))} De communicatie was prettig en we zijn zeer tevreden met het resultaat.`,
    disclosure: "Voorbeeldreview; vervangen door een geverifieerde klantreview voor publicatie."
  }));
}

function buildSocial(vertical, services) {
  return Array.from({ length: REQUIREMENTS.minimums.social_post_ideas }, (_, index) => {
    const topic = pick([vertical.primaryService, ...vertical.related, ...services.map((service) => service.name)], index).toLowerCase();
    return {
      id: stableId("social", index),
      format: pick(SOCIAL_FORMATS, index),
      topic: `${interpolate(pick(SOCIAL_ANGLES, index), { topic })} — ${pick(["voor starters", "praktijktip", "lokale blik", "expertadvies", "klantperspectief"], Math.floor(index / 10))}`,
      hook: `Wist u dit al over ${topic}?`,
      caption_direction: `Leg in toegankelijke taal uit wat klanten moeten weten over ${topic}, voeg één praktijkvoorbeeld toe en sluit af met een concrete vraag.`,
      channels: index % 3 === 0 ? ["instagram", "facebook", "linkedin"] : ["instagram", "facebook"],
      visual_asset_id: stableId("asset-social", index % 4)
    };
  });
}

function buildBlogs(vertical, services) {
  return Array.from({ length: REQUIREMENTS.minimums.blog_topics }, (_, index) => {
    const topic = pick([vertical.primaryService, ...vertical.related, ...services.map((service) => service.name)], index).toLowerCase();
    const title = interpolate(pick(BLOG_ANGLES, index), { topic });
    return {
      id: stableId("blog", index),
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      search_intent: pick(["informational", "commercial", "local"], index),
      outline: ["Waarom dit onderwerp belangrijk is", "Mogelijkheden en keuzes", "Kosten en planning", "Praktische tips", "Volgende stap"],
      primary_keyword: `${topic} ${pick(INTENTS, index)}`,
      cta: pick(CTA_TARGETS, index)
    };
  });
}

function buildCtas() {
  return Array.from({ length: REQUIREMENTS.minimums.calls_to_action }, (_, index) => ({
    id: stableId("cta", index),
    label: `${pick(CTA_LEADS, index)} ${pick(CTA_TARGETS, index + Math.floor(index / 10)).toLowerCase()}`,
    supporting_text: `${pick(USP_LEADS, index + Math.floor(index / 10))} — u ontvangt snel een heldere reactie.`,
    placement: pick(["hero", "service", "inline", "footer", "sticky", "contact"], index),
    intent: pick(["lead", "call", "quote", "booking", "discovery"], index)
  }));
}

function buildUsps() {
  return Array.from({ length: REQUIREMENTS.minimums.usps }, (_, index) => ({
    id: stableId("usp", index),
    title: `${pick(USP_LEADS, index)} ${pick(["vanaf dag één", "in elke fase", "voor ieder project"], Math.floor(index / 10))}`,
    description: `${pick(USP_LEADS, index)} ${pick(USP_DETAILS, index + Math.floor(index / 10))}.`,
    icon: pick(["check-circle", "shield", "clock", "star", "users", "map-pin", "sparkles", "award", "message-circle", "settings"], index)
  }));
}

function buildProjects(vertical) {
  return Array.from({ length: REQUIREMENTS.minimums.project_descriptions }, (_, index) => ({
    id: stableId("project", index),
    title: `${titleCase(pick(PROJECT_TYPES, index))}: ${pick([vertical.primaryService, ...vertical.related], index)}`,
    location_placeholder: pick(REGIONS, index),
    challenge: `De klant zocht een ${pick(QUALIFIERS, index)} oplossing voor ${pick([vertical.primaryService, ...vertical.related], index).toLowerCase()} met minimale onzekerheid over planning en uitvoering.`,
    approach: `[BEDRIJFSNAAM] bracht de situatie in kaart, adviseerde over de beste aanpak en voerde het werk volgens een helder stappenplan uit.`,
    result: `Een verzorgd resultaat, duidelijke oplevering en concrete afspraken over service en nazorg.`,
    asset_ids: [stableId("asset-project", index % 4)]
  }));
}

function buildTeam(vertical) {
  return Array.from({ length: REQUIREMENTS.minimums.team_profiles }, (_, index) => ({
    id: stableId("team", index),
    name_placeholder: `[TEAMNAAM ${index + 1}]`,
    role: titleCase(pick(TEAM_ROLES, index)),
    bio: `Als ${pick(TEAM_ROLES, index)} zorgt [TEAMNAAM ${index + 1}] voor ${pick([vertical.primaryService, ...vertical.related], index).toLowerCase()}, heldere communicatie en een prettige klantbeleving.`,
    expertise: unique([pick([vertical.primaryService, ...vertical.related], index), pick(USP_LEADS, index), pick(USP_LEADS, index + 2)]),
    quote: `“Goed werk begint met luisteren, duidelijk adviseren en doen wat is afgesproken.”`,
    asset_id: stableId("asset-team", index % 4)
  }));
}

function buildGallery(vertical) {
  return Array.from({ length: REQUIREMENTS.minimums.gallery_descriptions }, (_, index) => ({
    id: stableId("gallery", index),
    title: `${titleCase(pick([vertical.primaryService, ...vertical.related], index))} — ${pick(PROJECT_TYPES, index)}`,
    alt_text: `${vertical.name} toont ${pick([vertical.primaryService, ...vertical.related], index).toLowerCase()} bij een project in [PLAATS]`,
    caption: `Detail van een ${pick(QUALIFIERS, index)} uitgevoerd project door [BEDRIJFSNAAM].`,
    asset_id: stableId("asset-gallery", index % 4)
  }));
}

const ASSET_BLUEPRINTS = [
  ["hero", 4, "Hero", [2400, 1350], "16:9", "webp", ["webp", "avif", "jpg"]],
  ["backgrounds", 2, "Background", [2400, 1600], "3:2", "webp", ["webp", "avif", "jpg"]],
  ["team", 4, "About", [1200, 1500], "4:5", "webp", ["webp", "avif", "jpg"]],
  ["atmosphere", 2, "About", [1800, 1200], "3:2", "webp", ["webp", "avif", "jpg"]],
  ["gallery", 4, "Gallery", [1800, 1200], "3:2", "webp", ["webp", "avif", "jpg"]],
  ["services", 4, "Services", [1600, 1200], "4:3", "webp", ["webp", "avif", "jpg"]],
  ["projects", 4, "Gallery", [1800, 1200], "3:2", "webp", ["webp", "avif", "jpg"]],
  ["reviews", 1, "Reviews", [1200, 1200], "1:1", "webp", ["webp", "jpg"]],
  ["about", 2, "About", [1800, 1200], "3:2", "webp", ["webp", "avif", "jpg"]],
  ["cta", 1, "CTA", [1920, 800], "12:5", "webp", ["webp", "avif", "jpg"]],
  ["icons", 6, "Services", [512, 512], "1:1", "svg", ["svg", "png"]],
  ["brand", 2, "About", [1600, 1200], "4:3", "svg", ["svg", "png"]],
  ["illustrations", 4, "About", [1600, 1200], "4:3", "svg", ["svg", "png", "webp"]],
  ["social", 4, "Social", [1080, 1350], "4:5", "webp", ["webp", "jpg"]],
  ["logos", 4, "Hero", [1200, 400], "3:1", "svg", ["svg", "png"]],
  ["video", 3, "Hero", [1920, 1080], "16:9", "mp4", ["mp4", "webm", "jpg"]]
];

function buildAssets(vertical, profile) {
  const slots = [];
  let globalIndex = 0;
  for (const [type, count, usage, resolution, ratio, extension, formats] of ASSET_BLUEPRINTS) {
    for (let index = 0; index < count; index += 1) {
      const subject = pick([vertical.primaryService, ...vertical.related, vertical.name], globalIndex);
      slots.push({
        id: stableId(`asset-${type.replace(/s$/, "")}`, index),
        type,
        asset_kind: extension === "mp4" ? "video-placeholder" : extension === "svg" ? "vector-placeholder" : "image",
        usage,
        subject,
        required: type !== "reviews",
        storage_path: `content-library/${vertical.slug}/${type}/${String(index + 1).padStart(2, "0")}-${type.replace(/s$/, "")}.${extension}`,
        source_resolution: { width: resolution[0], height: resolution[1] },
        aspect_ratio: ratio,
        formats,
        focal_point: type === "hero" ? "right-center" : "center",
        alt_text_template: `${subject} door [BEDRIJFSNAAM] in [PLAATS]`,
        template_bindings: [`${usage.toLowerCase()}.${index}.image`, `${usage.toLowerCase()}.${index}.srcset`],
        prompt: {
          style: type === "logos" ? "neutral editable logo placeholder, simple geometric mark, no final brand claim" : type === "icons" ? "coherent rounded-outline icon system, minimal vector construction" : type === "illustrations" || type === "brand" ? "editorial vector illustration with subtle brand-color fills" : type === "video" ? `${profile.visualStyle}, seamless five-second motion loop` : profile.visualStyle,
          lighting: type === "hero" ? "zacht directioneel daglicht met gecontroleerd contrast" : "natuurlijk daglicht, realistische schaduwen",
          composition: type === "hero" ? "breed kader, onderwerp op rechter derde, rustige negatieve ruimte links voor webtekst" : "gebalanceerde editorial compositie met duidelijk hoofdonderwerp",
          camera: type === "team" ? "full-frame camera, 85mm lens, f/2.8, ooghoogte" : "full-frame camera, 35mm lens, f/5.6, hoge detailweergave",
          color_usage: `afgestemd op ${profile.palette.join(", ")}, natuurlijke huid- en materiaaltinten`,
          subject: type === "logos" ? `tijdelijke logo-placeholder voor een professioneel Nederlands ${vertical.name.toLowerCase()}, geometrisch symbool geïnspireerd op ${subject}` : `${subject} voor een professioneel Nederlands ${vertical.name.toLowerCase()}, authentiek en geloofwaardig`,
          negative_prompt: type === "logos" ? "geen bedrijfsnaam, geen leesbare tekst, geen watermerk, geen bestaand merk, geen complex detail, geen mockup" : "geen tekst, geen logo, geen watermerk, geen vervormde handen, geen extra vingers, geen onrealistische huid, geen plastic stockfoto-uitstraling, geen rommelige achtergrond, geen oververzadiging, geen zichtbare merknamen",
          suitable_for: usage
        },
        rights: { model_release_required: ["team", "reviews", "atmosphere"].includes(type), usage_license: "te registreren voor publicatie" }
      });
      globalIndex += 1;
    }
  }
  return slots;
}

function buildBrand(vertical, profile) {
  return {
    colors: {
      primary: profile.palette[1], secondary: profile.palette[2], ink: profile.palette[0], surface: profile.palette[3],
      semantic: { success: "#16845B", warning: "#D28A16", error: "#C83C3C" }
    },
    fonts: { heading: profile.fonts[0], body: profile.fonts[1], fallbacks: ["Arial", "sans-serif"] },
    icons: { style: "rounded-outline", stroke_width: 1.75, library_hint: "Lucide", custom_subjects: vertical.related },
    illustrations: {
      style: "editorial line illustration with subtle brand-color fills",
      placeholders: ["process-step-01", "process-step-02", "process-step-03", "service-explainer", "empty-state"],
      usage: ["process", "empty-state", "explanation"]
    },
    logo_placeholders: ["wordmark-light", "wordmark-dark", "symbol-light", "symbol-dark"],
    video_placeholders: ["hero-loop-16x9", "about-story-16x9", "social-reel-9x16"]
  };
}

export function compileVertical(vertical) {
  const profile = CATEGORY_PROFILES[vertical.category];
  if (!profile) throw new Error(`Onbekende categorie: ${vertical.category}`);
  const services = buildServices(vertical, profile);
  const assets = buildAssets(vertical, profile);
  return {
    schema_version: REQUIREMENTS.schema_version,
    content_version: "1.0.0",
    locale: REQUIREMENTS.locale,
    branch: {
      slug: vertical.slug,
      name: vertical.name,
      description: `${vertical.name} voor ${profile.audience}.`,
      category: vertical.category,
      tone_of_voice: profile.tone,
      audience: profile.audience,
      keywords: unique([vertical.slug, vertical.name.toLowerCase(), vertical.singular, vertical.primaryService.toLowerCase(), ...vertical.related]),
      seo_keywords: buildSeoKeywords(vertical, services),
      related_branches: VERTICALS.filter((item) => item.category === vertical.category && item.slug !== vertical.slug).slice(0, 8).map((item) => item.slug)
    },
    brand: buildBrand(vertical, profile),
    hero_titles: buildHeroVariants(vertical),
    hero_subtitles: buildHeroVariants(vertical).map(({ id, subtitle }) => ({ id, text: subtitle })),
    service_names: services.map(({ id, name }) => ({ id, name })),
    service_descriptions: services,
    review_examples: buildReviews(vertical),
    faq: buildFaq(vertical, services),
    cta: buildCtas(),
    usps: buildUsps(),
    projects: buildProjects(vertical),
    team_profiles: buildTeam(vertical),
    gallery_descriptions: buildGallery(vertical),
    social_post_topics: buildSocial(vertical, services),
    blog_topics: buildBlogs(vertical, services),
    assets: {
      manifest_version: "1.0.0",
      storage_root: `content-library/${vertical.slug}`,
      slots: assets,
      counts_by_type: Object.fromEntries(REQUIREMENTS.asset_directories.map((type) => [type, assets.filter((asset) => asset.type === type).length]))
    },
    image_prompt_library: assets.map((asset) => ({ asset_id: asset.id, ...asset.prompt })),
    placeholders: {
      required: ["BEDRIJFSNAAM", "PLAATS"],
      optional: ["REGIO", "TELEFOON", "EMAIL", "ADRES", "OPENINGSTIJDEN", "KLANTNAAM", "TEAMNAAM"]
    }
  };
}

export function buildLibrary() {
  fs.mkdirSync(GENERATED_ROOT, { recursive: true });
  fs.mkdirSync(LIBRARY_ROOT, { recursive: true });
  const compiled = VERTICALS.map(compileVertical);
  const index = {
    schema_version: REQUIREMENTS.schema_version,
    generated_at: "deterministic-build",
    source: "src/verticals.mjs",
    branch_count: compiled.length,
    categories: Object.keys(CATEGORY_PROFILES),
    requirements: REQUIREMENTS.minimums,
    branches: compiled.map((item) => ({
      slug: item.branch.slug,
      name: item.branch.name,
      category: item.branch.category,
      description: item.branch.description,
      content_path: `branches/${item.branch.slug}/content.json`,
      asset_manifest_path: `branches/${item.branch.slug}/asset-manifest.json`,
      prompt_library_path: `branches/${item.branch.slug}/image-prompts.json`
    }))
  };
  fs.writeFileSync(path.join(GENERATED_ROOT, "catalog.json"), `${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(path.join(GENERATED_ROOT, "content-library.json"), `${JSON.stringify({ ...index, branches: compiled }, null, 2)}\n`);

  for (const item of compiled) {
    const branchRoot = path.join(GENERATED_ROOT, "branches", item.branch.slug);
    fs.mkdirSync(branchRoot, { recursive: true });
    const { assets, image_prompt_library, ...content } = item;
    fs.writeFileSync(path.join(branchRoot, "content.json"), `${JSON.stringify(content, null, 2)}\n`);
    fs.writeFileSync(path.join(branchRoot, "asset-manifest.json"), `${JSON.stringify(assets, null, 2)}\n`);
    fs.writeFileSync(path.join(branchRoot, "image-prompts.json"), `${JSON.stringify(image_prompt_library, null, 2)}\n`);

    const libraryBranchRoot = path.join(LIBRARY_ROOT, item.branch.slug);
    fs.mkdirSync(libraryBranchRoot, { recursive: true });
    fs.writeFileSync(path.join(libraryBranchRoot, "manifest.json"), `${JSON.stringify({
      schema_version: REQUIREMENTS.schema_version,
      branch: item.branch.slug,
      content: `../../generated/branches/${item.branch.slug}/content.json`,
      assets: `../../generated/branches/${item.branch.slug}/asset-manifest.json`,
      prompts: `../../generated/branches/${item.branch.slug}/image-prompts.json`
    }, null, 2)}\n`);
    for (const directory of REQUIREMENTS.asset_directories) {
      const assetDirectory = path.join(libraryBranchRoot, directory);
      fs.mkdirSync(assetDirectory, { recursive: true });
      const slots = item.assets.slots.filter((asset) => asset.type === directory);
      fs.writeFileSync(path.join(assetDirectory, "README.md"), `# ${item.branch.name} — ${directory}\n\nBestandslocatie voor ${slots.length} geplande asset(s). Zie \`../../../generated/branches/${item.branch.slug}/asset-manifest.json\` voor bestandsnamen, resoluties, verhoudingen, templatekoppelingen en prompts.\n`);
    }
  }
  return { index, compiled };
}

export function loadRequirements() {
  return REQUIREMENTS;
}

export function paths() {
  return { root: ROOT, generatedRoot: GENERATED_ROOT, libraryRoot: LIBRARY_ROOT };
}
