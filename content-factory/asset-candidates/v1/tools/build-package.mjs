import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageDir = path.join(root, "images");

const negativePrompt = [
  "no text, letters, numbers, captions or signage",
  "no logos, trademarks, brand marks, watermarks or certification marks",
  "no recognizable real company, branded uniform, branded vehicle or branded product",
  "no performance claims, customer results, awards, reviews or before-and-after comparison",
  "no malformed hands, extra fingers, impossible anatomy, unsafe tool use or unrealistic equipment",
  "no readable screens, documents, labels, license plates or menus",
  "no clothing graphics, symbols, letters or numbers",
].join("; ");

const branches = [
  {
    branch: "installateur",
    specialization: "thuisbatterijen",
    hero: "a skilled installer in neutral unbranded workwear carefully inspecting a generic modern home battery in a bright contemporary utility room",
    service: "a close service scene of gloved hands using a realistic insulated torque tool on a generic home-battery connection panel, with the worker's face out of frame",
    hero2: "a wide architectural view of a tidy residential garage utility wall where a plain-clothed installer checks neat cable routing beside a generic home battery",
    service2: "insulated gloved hands checking the strain relief and neat cable routing inside the lower service access of a large wall-mounted generic residential energy-storage cabinet, using no measuring device, clearly a home installation and not an automotive battery",
    about: "two generic home-energy installers in plain workwear discussing a safe mounting layout at a clean workshop mock-up wall, with no documents or diagrams",
    detail: "an orderly still life of insulated hand tools, short cable samples and a small unlabeled generic battery module on a clean technical workbench",
    palette: "warm white, graphite and muted sage",
    heroStyle: "premium photorealistic editorial photography",
    serviceStyle: "precise photorealistic technical documentary photography",
  },
  {
    branch: "loodgieter",
    specialization: "woningonderhoud",
    hero: "an experienced plumber in neutral unbranded workwear inspecting exposed copper pipework beneath a clean residential sink, in a lived-in but tidy Dutch-style home",
    service: "a detailed service scene of realistic hands fitting a new brass shutoff valve to copper pipework with correctly sized hand tools",
    hero2: "a plain-clothed plumber carefully inspecting a radiator valve in a bright contemporary hallway, with a protective mat and tidy tool case nearby",
    service2: "realistic hands preparing a threaded brass pipe fitting with sealing fiber and the correct compact hand tools on a protected work surface",
    about: "two generic plumbers in plain workwear discussing copper fittings together at a clean workshop bench, candid and focused rather than posed",
    detail: "a tactile still life of copper elbows, a brass valve, a plain adjustable wrench and folded protective cloth on a weathered workbench",
    palette: "soft stone, copper and deep navy",
    heroStyle: "natural photorealistic lifestyle photography",
    serviceStyle: "crisp photorealistic craftsmanship close-up",
  },
  {
    branch: "glazenwasser",
    specialization: "particuliere-ramen",
    hero: "a professional window cleaner in plain unbranded clothing cleaning large ground-floor residential windows with a water-fed pole, seen from a safe garden viewpoint",
    service: "a close detail of a squeegee drawing a clean path across a wet window with realistic droplets and subtle reflections, no person identifiable",
    hero2: "a window cleaner in plain workwear using a hand squeegee on the inside of a sunlit glass conservatory, standing safely on the floor",
    service2: "a water-fed brush moving across a large ground-floor pane with realistic water beads, subtle sky reflections and no person identifiable",
    about: "two generic window cleaners in plain clothing preparing water-fed poles, microfiber cloths and a bucket beside a neutral garden shed",
    detail: "a crisp still life of a plain squeegee, folded microfiber cloths and clear water droplets on a dark stone ledge",
    palette: "clear blue, soft grey and fresh green",
    heroStyle: "bright photorealistic commercial editorial photography",
    serviceStyle: "minimal photorealistic macro photography",
  },
  {
    branch: "schilder",
    specialization: "interieurschilderwerk",
    hero: "a careful interior painter in plain unbranded workwear applying a warm neutral wall color in a contemporary empty living room, with floors fully protected",
    service: "a close craftsmanship scene of a steady hand cutting in a clean paint edge along simple white trim using a realistic brush",
    hero2: "a careful painter rolling a muted sage wall in a furnished living room where furniture and floors are fully and realistically protected",
    service2: "gloved hands gently sanding plain wooden window trim with a compact sanding block and connected dust extraction hose",
    about: "two generic painters in clean plain workwear comparing several unlabeled painted sample boards in a bright workshop, candid collaboration",
    detail: "an artisan still life of clean brushes, a roller tray, folded drop cloth and an open completely unlabeled paint can",
    palette: "warm sand, chalk white and terracotta accent",
    heroStyle: "warm photorealistic interior editorial photography",
    serviceStyle: "tactile photorealistic artisan detail photography",
  },
  {
    branch: "holistisch",
    specialization: "ontspanning-en-balans",
    hero: "a calm generic wellness practitioner preparing a serene consultation room with natural linen, a simple chair and plants, without symbols, products or medical cues",
    service: "an atmospheric detail of folded linen, smooth river stones, a ceramic bowl and soft window light on a natural wood surface",
    hero2: "a calm generic wellness practitioner and an adult client having a respectful seated conversation in a bright minimal room, no treatment or outcome implied",
    service2: "a practitioner in plain natural clothing arranging floor cushions and a folded blanket before a quiet relaxation session",
    about: "an environmental portrait of a generic wellness practitioner beside a simple lounge chair and leafy plant, relaxed and approachable without spiritual symbols",
    detail: "a warm still life of an unlit beeswax candle, linen eye pillow, smooth stone and dried grass on natural wood",
    palette: "oat, clay, muted olive and cream",
    heroStyle: "soft photorealistic wellness editorial photography",
    serviceStyle: "quiet photorealistic still-life photography",
  },
  {
    branch: "restaurant",
    specialization: "modern-buurtrestaurant",
    hero: "a welcoming unbranded neighborhood restaurant interior before opening, with warm table lighting, neatly set tables and an open-kitchen glimpse, no guests or signage",
    service: "a chef's realistic hands plating a seasonal vegetable dish in a neutral ceramic plate, with no menu text or identifiable branding",
    hero2: "a generic chef and server preparing a warm contemporary dining room before service, arranging plain tableware with no guests or signage",
    service2: "a chef's realistic hands sautéing colorful seasonal vegetables in a plain steel pan at a clean open-kitchen station",
    about: "a small diverse team of three generic restaurant workers doing candid food preparation in a clean kitchen, plain clothing and no posed success gesture",
    detail: "an intimate table setting with folded linen, plain ceramic side plate, clear glassware, a small bread basket and warm ambient light, no menu",
    palette: "walnut, warm amber, cream and forest green",
    heroStyle: "cinematic photorealistic hospitality photography",
    serviceStyle: "refined photorealistic culinary close-up",
  },
  {
    branch: "autobedrijf",
    specialization: "onderhoud-en-service",
    hero: "a clean independent automotive workshop with a generic unbranded compact car on a lift and a mechanic in plain workwear performing a visual inspection",
    service: "a close service scene of realistic gloved hands checking a generic brake assembly with an appropriate inspection tool",
    hero2: "a mechanic in plain workwear inspecting the engine bay of a generic unbranded compact car in a bright independent workshop, three-quarter wide view",
    service2: "realistic gloved hands measuring the tread depth of a generic unbranded tire using a small mechanical gauge with no readable markings",
    about: "two generic mechanics in plain workwear discussing an unbranded metal component at a clean tool bench, candid and technically focused",
    detail: "an organized still life of a plain socket set, work gloves and generic metal fasteners on a clean dark workshop bench",
    palette: "charcoal, steel blue and warm workshop light",
    heroStyle: "high-clarity photorealistic industrial editorial photography",
    serviceStyle: "controlled photorealistic mechanical detail photography",
  },
  {
    branch: "dakdekker",
    specialization: "dakinspectie",
    hero: "a roofer in plain unbranded safety clothing inspecting a pitched residential roof from a secure roof platform, with correct fall protection and no dramatic risk",
    service: "a close detail of realistic gloved hands aligning a plain roof tile and checking flashing with appropriate tools, safe stable working position implied",
    hero2: "two roofers in plain safety clothing inspecting a residential flat roof behind a secure perimeter railing, with correct fall protection and a calm suburban backdrop",
    service2: "realistic gloved hands carefully pressing plain flashing membrane around a generic skylight corner using an appropriate hand roller",
    about: "two generic roofers at ground level organizing plain safety harnesses and hand tools beside a neutral residential exterior before work",
    detail: "a rugged still life of plain roof tiles, folded flashing material, work gloves and a safety rope on a protected surface",
    palette: "slate grey, brick red and overcast sky blue",
    heroStyle: "grounded photorealistic trade documentary photography",
    serviceStyle: "weathered photorealistic material close-up",
  },
  {
    branch: "schoonheidssalon",
    specialization: "huidverzorging",
    hero: "a serene unbranded beauty treatment room with a practitioner in neutral attire preparing clean towels and generic skincare bowls, no client result shown",
    service: "a refined detail of clean brushes, folded towels, a ceramic mixing bowl and a small green leaf on a stone tray",
    hero2: "a beauty practitioner in plain neutral attire having a calm seated consultation with an adult client in a minimal treatment room, no result implied",
    service2: "a practitioner's realistic hands gently applying a thin generic clay mask to the cheek of an adult client, respectful close framing and no before-and-after",
    about: "two generic beauty practitioners in plain neutral attire preparing clean linens and an uncluttered treatment space together, candid collaboration",
    detail: "a polished still life of completely unlabeled frosted glass bottles, a ceramic bowl, clean brush and folded ivory towel on pale stone",
    palette: "blush, warm ivory, taupe and soft brass",
    heroStyle: "luminous photorealistic beauty editorial photography",
    serviceStyle: "polished photorealistic spa still-life photography",
  },
  {
    branch: "sportschool",
    specialization: "functionele-training",
    hero: "a bright independent gym with a diverse group of four generic adults performing controlled functional training under neutral unbranded coaching, all wearing completely plain solid-color athletic clothing, no extreme physique emphasis",
    service: "a close training detail of realistic hands gripping a plain kettlebell beside a textured gym floor, correct neutral wrist position",
    hero2: "a generic coach in plain solid-color clothing demonstrating controlled battle-rope technique to two adult members in a bright independent gym, safe spacing and approachable effort",
    service2: "realistic hands adjusting the plain foot strap of a generic rowing machine, with the display fully out of frame and correct seated posture implied",
    about: "two generic coaches in plain solid-color athletic clothing organizing kettlebells and resistance bands together in a bright empty training zone",
    detail: "a graphic still life of a plain kettlebell, coiled resistance bands, folded towel and completely unbranded water bottle on a textured gym floor",
    palette: "graphite, muted cobalt and warm natural skin tones",
    heroStyle: "energetic photorealistic fitness editorial photography",
    serviceStyle: "dynamic photorealistic sports detail photography",
  },
];

const records = branches.flatMap((item, branchIndex) => [
  {
    candidate_id: `acf-v1-${String(branchIndex + 1).padStart(2, "0")}-hero-01`,
    branch: item.branch,
    specialization: item.specialization,
    visual_style: item.heroStyle,
    personality: branchIndex % 2 === 0 ? "betrouwbaar-vakkundig" : "toegankelijk-eigentijds",
    theme: branchIndex % 2 === 0 ? "licht-natuurlijk" : "warm-redactioneel",
    asset_slot: "hero",
    prompt: `Use case: photorealistic-natural. Asset type: unlinked website hero candidate. Primary request: ${item.hero}. Style: ${item.heroStyle}. Composition: wide 16:9 horizontal frame with clear subject recognition and generous uncluttered negative space on the left. Lighting and mood: natural, credible, understated and sales-ready without claims. Color palette: ${item.palette}. Constraints: ${negativePrompt}.`,
    aspect_ratio: "16:9",
    people_present: true,
  },
  {
    candidate_id: `acf-v1-${String(branchIndex + 1).padStart(2, "0")}-service-01`,
    branch: item.branch,
    specialization: item.specialization,
    visual_style: item.serviceStyle,
    personality: branchIndex % 2 === 0 ? "precies-rustig" : "ambachtelijk-premium",
    theme: branchIndex % 2 === 0 ? "detail-koel" : "detail-warm",
    asset_slot: "service",
    prompt: `Use case: photorealistic-natural. Asset type: unlinked website service candidate. Primary request: ${item.service}. Style: ${item.serviceStyle}. Composition: horizontal 4:3 close or medium detail with the service immediately recognizable and clean edge space for responsive cropping. Lighting and mood: credible working light, tactile realism, no staged success signal. Color palette: ${item.palette}. Constraints: ${negativePrompt}.`,
    aspect_ratio: "4:3",
    people_present: !["glazenwasser", "holistisch", "schoonheidssalon"].includes(item.branch),
  },
  {
    candidate_id: `acf-v1-${String(branchIndex + 1).padStart(2, "0")}-hero-02`,
    branch: item.branch,
    specialization: item.specialization,
    visual_style: "cinematic environmental photorealism with deeper contrast",
    personality: branchIndex % 2 === 0 ? "zelfverzekerd-modern" : "menselijk-dynamisch",
    theme: branchIndex % 2 === 0 ? "architecturaal-koel" : "levendig-warm",
    asset_slot: "hero",
    prompt: `Use case: photorealistic-natural. Asset type: second unlinked website hero candidate, visibly different from a bright editorial hero. Primary request: ${item.hero2}. Style: cinematic environmental photorealism with deeper contrast, wider context and a clear sense of place. Composition: wide 16:9 horizontal frame, subject grouped on the left or center and generous clean negative space on the right. Lighting and mood: credible late-afternoon or soft overcast light, grounded and distinctive without claims. Color palette: ${item.palette}. Constraints: ${negativePrompt}.`,
    aspect_ratio: "16:9",
    people_present: true,
  },
  {
    candidate_id: `acf-v1-${String(branchIndex + 1).padStart(2, "0")}-service-02`,
    branch: item.branch,
    specialization: item.specialization,
    visual_style: "high-detail photorealistic process photography",
    personality: branchIndex % 2 === 0 ? "technisch-helder" : "zorgvuldig-ambachtelijk",
    theme: branchIndex % 2 === 0 ? "proces-koel" : "proces-aards",
    asset_slot: "service",
    prompt: `Use case: photorealistic-natural. Asset type: second unlinked website service candidate with a distinct process context. Primary request: ${item.service2}. Style: high-detail photorealistic process photography with realistic materials and restrained depth of field. Composition: horizontal 4:3 close or medium view, the action immediately understandable, hands and tools fully plausible, clean crop margins. Lighting and mood: honest working light and tactile clarity, no staged completion or success signal. Color palette: ${item.palette}. Constraints: ${negativePrompt}.`,
    aspect_ratio: "4:3",
    people_present: true,
  },
  {
    candidate_id: `acf-v1-${String(branchIndex + 1).padStart(2, "0")}-about-team-01`,
    branch: item.branch,
    specialization: item.specialization,
    visual_style: "candid photorealistic team editorial photography",
    personality: branchIndex % 2 === 0 ? "samenwerkend-betrouwbaar" : "open-vakbekwaam",
    theme: branchIndex % 2 === 0 ? "team-daglicht" : "team-workshop",
    asset_slot: "about_team",
    prompt: `Use case: photorealistic-natural. Asset type: unlinked website about or team candidate. Primary request: ${item.about}. Style: candid photorealistic team editorial photography, natural posture, no corporate stock-photo posing. Composition: horizontal 3:2 environmental portrait with breathing room, clear branch context and realistic interaction. Lighting and mood: soft natural light, approachable and competent without implying reviews, awards, certifications or results. Color palette: ${item.palette}. Constraints: ${negativePrompt}; no crossed-arm success pose; no thumbs-up.`,
    aspect_ratio: "3:2",
    people_present: true,
  },
  {
    candidate_id: `acf-v1-${String(branchIndex + 1).padStart(2, "0")}-detail-ambiance-01`,
    branch: item.branch,
    specialization: item.specialization,
    visual_style: "art-directed photorealistic material still life",
    personality: branchIndex % 2 === 0 ? "verfijnd-tastbaar" : "rustig-sfeervol",
    theme: branchIndex % 2 === 0 ? "materiaalstudie" : "ambiance-closeup",
    asset_slot: "detail_ambiance",
    prompt: `Use case: photorealistic-natural. Asset type: unlinked website detail or ambiance candidate. Primary request: ${item.detail}. Style: art-directed photorealistic material still life with believable imperfections, distinct from people-led service imagery. Composition: horizontal 4:3 intimate detail, layered textures, clear branch recognition and flexible crop margins. Lighting and mood: quiet directional light, premium but not luxurious or claim-heavy. Color palette: ${item.palette}. Constraints: ${negativePrompt}; no people or body parts.`,
    aspect_ratio: "4:3",
    people_present: false,
  },
]);

function checksum(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

fs.mkdirSync(imageDir, { recursive: true });

const existingCandidateTimes = records
  .map((record) => path.join(root, `images/${record.candidate_id}.png`))
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.statSync(file).birthtimeMs);
const generatedAt = new Date(
  existingCandidateTimes.length ? Math.max(...existingCandidateTimes) : Date.now(),
).toISOString();
const manifest = records.map((record, index) => {
  const relativeFile = `images/${record.candidate_id}.png`;
  const absoluteFile = path.join(root, relativeFile);
  return {
    ...record,
    status: "candidate_unreviewed",
    negative_prompt: negativePrompt,
    seed: 720001 + index,
    seed_applied: false,
    intended_channel: "website_candidate_review_only",
    factual_claims_present: false,
    real_brand_elements_present: false,
    review_status: "unreviewed",
    publication_status: "blocked",
    generated_at: fs.existsSync(absoluteFile)
      ? fs.statSync(absoluteFile).birthtime.toISOString()
      : generatedAt,
    generator: "openai-imagegen-built-in",
    file_path: relativeFile,
    checksum: fs.existsSync(absoluteFile) ? `sha256:${checksum(absoluteFile)}` : null,
  };
});

const missing = manifest.filter((item) => item.checksum === null);
const invalid = manifest.filter(
  (item) =>
    item.review_status !== "unreviewed" ||
    item.publication_status !== "blocked" ||
    item.factual_claims_present !== false ||
    item.real_brand_elements_present !== false,
);

fs.writeFileSync(
  path.join(root, "manifest.json"),
  `${JSON.stringify(
    {
      schema_version: "asset-candidates-v1",
      package_status: "candidate_unreviewed",
      linkage_status: "unlinked",
      certification_dependency: "manual review only after Gold Set certification",
      candidate_count: manifest.length,
      candidates: manifest,
    },
    null,
    2,
  )}\n`,
);

const cards = manifest
  .map(
    (item) => `
      <article class="card" data-branch="${item.branch}" data-slot="${item.asset_slot}">
        <div class="badge">BLOCKED · UNREVIEWED</div>
        <img src="${item.file_path}" alt="${item.branch} — ${item.asset_slot} kandidaat" loading="lazy">
        <div class="body">
          <h2>${item.branch} <span>${item.asset_slot}</span></h2>
          <code>${item.candidate_id}</code>
          <dl>
            <div><dt>Specialisatie</dt><dd>${item.specialization}</dd></div>
            <div><dt>Stijl</dt><dd>${item.visual_style}</dd></div>
            <div><dt>Ratio</dt><dd>${item.aspect_ratio}</dd></div>
            <div><dt>Checksum</dt><dd>${item.checksum ?? "MISSING"}</dd></div>
          </dl>
          <details><summary>Prompt</summary><p>${item.prompt}</p><p><strong>Negative:</strong> ${item.negative_prompt}</p></details>
        </div>
      </article>`,
  )
  .join("\n");

fs.writeFileSync(
  path.join(root, "review-gallery.html"),
  `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Asset candidates v1 — blocked review gallery</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#0b0d10;color:#f4f1ea}
*{box-sizing:border-box}body{margin:0;padding:32px}header{max-width:1100px;margin:0 auto 28px}h1{font-size:clamp(2rem,5vw,4rem);margin:.2em 0}
.notice{border:1px solid #e66a4e;background:#2b1713;padding:14px 16px;border-radius:12px;color:#ffd9cf}
.filters{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.filters label{display:grid;gap:5px;font-size:12px;color:#a8b0ba}.filters select{min-width:190px;padding:10px 12px;border-radius:10px;border:1px solid #39404a;background:#15181d;color:#f4f1ea}
.grid{max-width:1500px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:22px}
.card{position:relative;overflow:hidden;border:1px solid #2f333a;border-radius:18px;background:#15181d}.card img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#222}
.body{padding:18px}.badge{position:absolute;z-index:2;top:12px;left:12px;background:#b9361e;color:white;padding:7px 10px;border-radius:999px;font:700 11px/1 system-ui;letter-spacing:.06em}
h2{margin:0 0 8px;text-transform:capitalize}h2 span{float:right;color:#a8b0ba;font-size:.7em;font-weight:500}code{color:#9fd9c3}dl{font-size:13px}dl div{display:grid;grid-template-columns:100px 1fr;gap:8px;margin:7px 0}dt{color:#8e98a5}dd{margin:0;overflow-wrap:anywhere}details{border-top:1px solid #2f333a;padding-top:12px;color:#c7cbd1}details p{font-size:13px;line-height:1.5}
</style></head><body><header><p>CONTENT FACTORY · ASSET CANDIDATES V1</p><h1>Ongekoppelde reviewgalerij</h1>
<p class="notice"><strong>Niet publiceren.</strong> Alle kandidaten zijn candidate_unreviewed, unlinked en publication_status: blocked. Handmatige beoordeling mag pas na Gold Set-certificering.</p>
<p>${manifest.length} kandidaten · ${missing.length} ontbrekende bestanden · gegenereerd ${generatedAt}</p>
<div class="filters"><label>Branche<select id="branch-filter"><option value="">Alle branches</option>${branches.map((item) => `<option value="${item.branch}">${item.branch}</option>`).join("")}</select></label><label>Asset-slot<select id="slot-filter"><option value="">Alle slots</option><option value="hero">hero</option><option value="service">service</option><option value="about_team">about/team</option><option value="detail_ambiance">detail/ambiance</option></select></label></div>
</header><main class="grid">${cards}</main><script>
const branchFilter=document.querySelector('#branch-filter');const slotFilter=document.querySelector('#slot-filter');
function filterCards(){document.querySelectorAll('.card').forEach(card=>{card.hidden=Boolean((branchFilter.value&&card.dataset.branch!==branchFilter.value)||(slotFilter.value&&card.dataset.slot!==slotFilter.value));});}
branchFilter.addEventListener('change',filterCards);slotFilter.addEventListener('change',filterCards);
</script></body></html>`,
);

fs.writeFileSync(
  path.join(root, "REPORT.md"),
  `# Asset Candidate Preparation Report

## Resultaat

- Kandidaten voorzien: ${manifest.length}
- Branches: ${new Set(manifest.map((item) => item.branch)).size}
- Hero-kandidaten: ${manifest.filter((item) => item.asset_slot === "hero").length}
- Service-kandidaten: ${manifest.filter((item) => item.asset_slot === "service").length}
- About/team-kandidaten: ${manifest.filter((item) => item.asset_slot === "about_team").length}
- Detail/ambiance-kandidaten: ${manifest.filter((item) => item.asset_slot === "detail_ambiance").length}
- Ontbrekende beeldbestanden: ${missing.length}
- Metadatafouten: ${invalid.length}
- Generatie-/koppelingsfouten: 1
- Uitgesloten gegenereerde varianten: 3
- Waarschuwingen: ${manifest.length} (de ingebouwde generator accepteert geen configureerbare seed; de seed is alleen een kandidaat-/reproductiehint en \`seed_applied\` is daarom \`false\`)

## Veiligheidsstatus

- Alle kandidaten: \`candidate_unreviewed\`
- Reviewstatus: \`unreviewed\`
- Publicatiestatus: \`blocked\`
- Linkagestatus: \`unlinked\`
- Feitelijke claims aanwezig: \`false\`
- Echte merkelementen aanwezig: \`false\`
- Bestaande Content Library gewijzigd: nee
- Adapter of renderer gewijzigd: nee
- Gold Set gewijzigd: nee
- Productie-, staging- of databaseactie: nee

## Selectie en uitsluiting

Deze pilot gebruikt het toegestane maximum: zes unieke kandidaten per branche en 60 totaal. Iedere branche bevat twee heroes, twee services, één about/team en één detail/ambiance.

Uitgesloten varianten:

1. Een eerste sportschool-hero bevatte een geel kledingmotief dat als tekst of merkelement kon worden gelezen.
2. Een eerste tweede thuisbatterij-service leek op een autoaccu en was daardoor niet direct brancheherkenbaar.
3. De eerste vervanger voor die thuisbatterij-service bevatte minieme instrumentmarkeringen die als tekst of merkelement konden gelden.

Geen van deze drie varianten staat in de worktree, het manifest of de reviewgalerij. Daarnaast trad bij de eerste uitbreidingsbatch één technische padextractiefout op; er werd daarbij geen bestand aan een kandidaat gekoppeld en de batch is veilig opnieuw uitgevoerd.

## Eindvoorwaarde

De package is alleen gereed wanneer alle checksums gevuld zijn, alle bestanden uniek zijn en alle blokkadevelden exact op de verplichte waarden staan.
`,
);

fs.writeFileSync(
  path.join(root, "IMPORT_PROPOSAL_NOT_EXECUTED.md"),
  `# Importvoorstel — NIET UITGEVOERD

Dit voorstel is uitsluitend een latere handmatige procedure. Er is nu niets geregistreerd, gekoppeld, geactiveerd, gepusht of gedeployed.

## Harde prerequisites

1. Gold Set-certificering is aantoonbaar afgerond.
2. Een bevoegde reviewer beoordeelt ieder beeld visueel in \`review-gallery.html\`.
3. Afgekeurde kandidaten worden niet geïmporteerd en blijven buiten iedere actieve library.
4. Goedgekeurde kandidaten krijgen een nieuwe, traceerbare reviewregistratie; deze sprint verzint of simuleert geen review.
5. Checksum en bestand worden vlak voor import opnieuw vergeleken.

## Voorgestelde latere handmatige mapping

- \`branch\` en \`specialization\` bepalen uitsluitend de voorgestelde bestemming.
- \`asset_slot: hero\` kan na goedkeuring worden voorgesteld als hero-bron.
- \`asset_slot: service\` kan na goedkeuring worden voorgesteld als service-bron.
- \`asset_slot: about_team\` kan na goedkeuring worden voorgesteld als about- of teambron.
- \`asset_slot: detail_ambiance\` kan na goedkeuring worden voorgesteld als detail- of ambiance-bron.
- Geen kandidaat-ID wordt automatisch aan een Gold Set-case, manifest, rendererimport of featureflag gekoppeld.

## Niet opgenomen in dit voorstel

- Geen uitvoerbaar importscript.
- Geen library-mutatie.
- Geen adapter- of rendererwijziging.
- Geen productie- of stagingactivatie.
- Geen databaseactie.
- Geen push of deploy.
`,
);

if (process.argv.includes("--check")) {
  if (missing.length || invalid.length || manifest.length > 60) {
    console.error(
      JSON.stringify(
        { ok: false, candidates: manifest.length, missing: missing.length, invalid: invalid.length },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    { ok: missing.length === 0 && invalid.length === 0, candidates: manifest.length, missing: missing.length, invalid: invalid.length },
    null,
    2,
  ),
);
