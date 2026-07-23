import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const bridge = require("../functions/services/contentFactoryWebsiteFactoryAdapter");
const { buildWebsitePackage } = require("../functions/_website-factory-core");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "2026.1";
const GOLD_ROOT = path.join(ROOT, "content-factory", "gold-set", VERSION);
const MANIFEST_PATH = path.join(GOLD_ROOT, "manifest.json");
const LOCK_PATH = path.join(GOLD_ROOT, "manifest.lock.json");
const EVIDENCE_ROOT = path.join(ROOT, "docs", "evidence", "gold-set", VERSION);
const REVIEW_ROOT = path.join(EVIDENCE_ROOT, "review");
const PRIVATE_ROOT = path.join(ROOT, ".gold-set-private", VERSION);
const PRIVATE_SECRET_PATH = path.join(PRIVATE_ROOT, "blinding-secret.txt");
const PRIVATE_REVEAL_PATH = path.join(PRIVATE_ROOT, "reveal.json");
const ASSESSMENT_ROOT = path.join(GOLD_ROOT, "assessments");

const SCORE_CRITERIA = [
  ["visual_quality", "Visuele kwaliteit"],
  ["premium_appearance", "Premium-uitstraling"],
  ["trust", "Vertrouwen"],
  ["conversion", "Conversiekracht"],
  ["branch_feel", "Branchegevoel"],
  ["custom_feel", "Maatwerkgevoel"]
];
const CUSTOMER_SUCCESS = [
  ["send_today", "Zou u deze vandaag naar een klant sturen?"],
  ["open_with_pride", "Zou u deze met trots in een verkoopgesprek openen?"],
  ["feels_custom", "Voelt deze als een maatwerkwebsite?"],
  ["no_obvious_ai_errors", "Zijn er geen opvallende AI-fouten?"],
  ["expected_to_pay", "Verwacht u dat de klant hiervoor wil betalen?"]
];

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileContent(generated, filePath) {
  return generated.files.find((file) => file.path === filePath)?.content || "";
}

function assertFrozenManifest(manifest, lock) {
  const actualHash = sha(fs.readFileSync(MANIFEST_PATH));
  if (manifest.gold_set_version !== VERSION || lock.gold_set_version !== VERSION) throw new Error("Gold Set version mismatch");
  if (manifest.status !== "frozen" || lock.status !== "frozen") throw new Error("Gold Set is not frozen");
  if (actualHash !== lock.manifest_sha256) throw new Error(`Frozen manifest hash mismatch: ${actualHash}`);
  if (manifest.cases.length !== lock.case_count || manifest.cases.length < 20 || manifest.cases.length > 30) throw new Error("Gold Set case count is invalid");
  if (new Set(manifest.cases.map((item) => item.id)).size !== manifest.cases.length) throw new Error("Gold Set case ids are not unique");
  return actualHash;
}

function getBlindingSecret() {
  fs.mkdirSync(PRIVATE_ROOT, { recursive: true });
  if (!fs.existsSync(PRIVATE_SECRET_PATH)) fs.writeFileSync(PRIVATE_SECRET_PATH, `${crypto.randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
  return fs.readFileSync(PRIVATE_SECRET_PATH, "utf8").trim();
}

function blindMapping(secret, caseId) {
  const digest = crypto.createHmac("sha256", secret).update(`${VERSION}:${caseId}`).digest();
  return digest[0] % 2 === 0 ? { A: "v1", B: "v2" } : { A: "v2", B: "v1" };
}

function briefingFor(item) {
  return [
    `Branche: ${item.vertical}`,
    ...(item.specialization ? [`Subspecialisatie: ${item.specialization}`] : []),
    `Regio: ${item.region}`,
    `Visuele stijl: ${item.style}`,
    `Merkpersoonlijkheid: ${item.brand_personality}`,
    `Thema: ${item.theme}`,
    `Contentdoel: ${item.goal}`,
    "Locale: nl-NL",
    "Kanalen: website"
  ].join("\n");
}

function journeyFor(item) {
  return {
    id: `gold-set-${VERSION}-${item.id}`,
    businessName: item.company_name,
    packageType: "premium",
    contentFactorySeed: String(item.seed),
    factoryInput: {
      vertical: item.vertical,
      region: item.region,
      specialization: item.specialization || "",
      style: item.style,
      brandPersonality: item.brand_personality,
      theme: item.theme,
      goal: item.goal,
      locale: "nl-NL",
      channels: ["website"],
      contentFactorySeed: String(item.seed)
    }
  };
}

async function prepare(item, version) {
  return bridge.prepareWebsiteFactoryRenderRequest({
    journey: journeyFor(item),
    briefing: briefingFor(item),
    packageType: "premium",
    version: 1,
    environment: {
      WEBSITE_FACTORY_CONTENT_ADAPTER: version,
      WEBSITE_FACTORY_CONTENT_ADAPTER_MODE: "active"
    }
  });
}

function outputDigest(generated) {
  return sha(generated.files.map((file) => `${file.path}:${file.encoding || "utf8"}:${sha(String(file.content))}`).join("|"));
}

function forbiddenRenderedClaims(html) {
  const patterns = [
    ["founding_year", /\bsinds\s+(?:19|20)\d{2}\b/i],
    ["customer_count", /\b(?:meer dan\s+)?\d{2,}\+?\s+(?:tevreden\s+)?klanten\b/i],
    ["project_count", /\b(?:meer dan\s+)?\d{2,}\+?\s+projecten\b/i],
    ["experience_years", /\b\d{1,2}\+?\s+jaar\s+ervaring\b/i],
    ["unverified_experience", /\bervaren specialist\b|\bjarenlange ervaring\b/i],
    ["certification", /\b(?:gecertificeerd|erkend|keurmerk|aangesloten bij)\b/i],
    ["market_leadership", /\b(?:marktleider|nummer 1|de beste)\b/i]
  ];
  return patterns.filter(([, pattern]) => pattern.test(html)).map(([id]) => id);
}

function noHallucinationEvidence(output, generated) {
  const html = fileContent(generated, "index.html");
  const unverifiedProjects = (output.projects || []).filter((item) => !String(item.publicationStatus || item.publication_status || "").startsWith("blocked") && item.publishable !== false);
  const reviewLeak = (output.websiteFactoryInput?.texts?.reviews || []).length > 0
    || (output.reviews?.items || []).some((item) => item.publishable !== false);
  const renderedTestimonialsWithoutSource = /class="[^"]*review-card/i.test(html)
    && (output.websiteFactoryInput?.texts?.reviews || []).length === 0;
  const renderedClaims = forbiddenRenderedClaims(html);
  const blockers = [
    ...(unverifiedProjects.length ? ["unverified_generated_projects"] : []),
    ...(reviewLeak ? ["review_placeholder_leak"] : []),
    ...(renderedTestimonialsWithoutSource ? ["unverified_rendered_testimonials"] : []),
    ...renderedClaims
  ];
  return {
    passed: blockers.length === 0,
    blockers,
    unverified_project_count: unverifiedProjects.length,
    review_placeholders_blocked: !reviewLeak,
    unverified_rendered_testimonials: renderedTestimonialsWithoutSource,
    rendered_claim_flags: renderedClaims
  };
}

function goalCtaMatches(goal, cta) {
  const value = String(cta || "").toLowerCase();
  const words = {
    leadgeneratie: ["offerte", "contact", "bel", "whatsapp", "advies"],
    afspraken: ["afspraak", "reserveer", "boek", "plan", "bel"],
    "lokale-zichtbaarheid": ["contact", "bel", "route", "afspraak", "advies"],
    autoriteit: ["advies", "contact", "lees", "ontdek", "download"],
    portfolio: ["project", "bekijk", "offerte", "contact", "advies"],
    "directe-verkoop": ["koop", "bestel", "offerte", "bel", "whatsapp", "proefrit"]
  }[goal] || [];
  return words.some((word) => value.includes(word));
}

function objectiveChecks(item, version, prepared, generated) {
  const output = prepared.adapterOutput;
  const html = fileContent(generated, "index.html");
  const dimensions = output.blueprint?.dimensions || null;
  const heroText = `${output.hero?.title || ""} ${output.hero?.subtitle || ""}`.toLowerCase();
  const expectedSpecialization = String(item.expected.specialization || "").replace(/-/g, " ").toLowerCase();
  const branchCorrect = output.metadata?.resolvedVertical === item.expected.vertical;
  const specializationCorrect = item.expected.specialization
    ? version === "v2" && dimensions?.specialization?.id === item.expected.specialization
    : version === "v2" ? dimensions?.specialization === null : true;
  const heroSpecific = item.expected.specialization
    ? heroText.includes(expectedSpecialization) || heroText.includes(String(dimensions?.specialization?.name || "").toLowerCase())
    : heroText.includes(item.region.toLowerCase()) || heroText.includes(item.vertical.toLowerCase());
  const seo = output.seo || {};
  const seoStructured = String(seo.title || "").includes(item.region) && Array.isArray(seo.keywords) && seo.keywords.length >= 5;
  const rendererCorrect = html.length > 6000
    && /<!doctype html>/i.test(html)
    && generated.files.some((file) => file.path === "styles.css")
    && generated.files.some((file) => file.path === "sitemap.xml")
    && !/\{\{|\}\}|\[placeholder\]|lorem ipsum/i.test(html);
  const ctaIntent = goalCtaMatches(item.goal, output.hero?.primaryCta || output.websiteFactoryInput?.ctas?.[0]);
  const heroIntent = version === "v2"
    ? output.hero?.messagingIntent === output.blueprint?.block_strategy?.hero_intent
    : Boolean(output.hero?.title && output.hero?.subtitle);
  const truth = noHallucinationEvidence(output, generated);
  return {
    branch_correct: branchCorrect,
    specialization_correct: specializationCorrect,
    renderer_correct: rendererCorrect,
    seo_structured: seoStructured,
    hero_specific: heroSpecific,
    hero_intent: heroIntent,
    cta_intent: ctaIntent,
    no_hallucinations: truth.passed,
    truth_evidence: truth
  };
}

function compareChecks(v1, v2) {
  const comparable = ["branch_correct", "specialization_correct", "renderer_correct", "seo_structured", "hero_specific", "hero_intent", "cta_intent", "no_hallucinations"];
  const regressions = comparable.filter((key) => v1[key] === true && v2[key] !== true);
  const improvements = comparable.filter((key) => v1[key] !== true && v2[key] === true);
  return { passed: regressions.length === 0, regressions, improvements };
}

function imageSourceLookup() {
  const root = path.join(ROOT, "public", "assets", "demo-images");
  const lookup = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const itemPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(itemPath);
      else lookup.set(sha(fs.readFileSync(itemPath)), itemPath);
    }
  };
  visit(root);
  return lookup;
}

function reviewerHomepage(generated, destination, sourceLookup) {
  let html = fileContent(generated, "index.html");
  const css = fileContent(generated, "styles.css");
  html = html.replace(/<link rel="stylesheet" href="styles\.css"\s*\/?>/i, `<style>${css}</style>`);
  html = html.replace(/<script src="script\.js"><\/script>/i, "");
  for (const file of generated.files.filter((item) => item.path.startsWith("assets/"))) {
    let replacement = "";
    if (file.encoding === "base64") {
      const raw = Buffer.from(file.content, "base64");
      const sourcePath = sourceLookup.get(sha(raw));
      if (sourcePath) replacement = path.relative(path.dirname(destination), sourcePath).split(path.sep).join("/");
      else replacement = `data:image/${path.extname(file.path).slice(1) || "png"};base64,${file.content}`;
    } else if (file.path.endsWith(".svg")) {
      replacement = `data:image/svg+xml;base64,${Buffer.from(file.content).toString("base64")}`;
    }
    if (replacement) html = html.split(file.path).join(replacement);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
}

function assessmentTemplate(caseCount) {
  const scores = Object.fromEntries(SCORE_CRITERIA.map(([id]) => [id, { A: 0, B: 0 }]));
  const customerSuccess = Object.fromEntries(CUSTOMER_SUCCESS.map(([id]) => [id, { A: null, B: null }]));
  return Array.from({ length: caseCount }, (_, index) => ({
    case_number: index + 1,
    preference: "",
    scores: structuredClone(scores),
    customer_success: structuredClone(customerSuccess),
    notes: ""
  }));
}

function loadAssessments(caseCount) {
  if (!fs.existsSync(ASSESSMENT_ROOT)) return [];
  const files = fs.readdirSync(ASSESSMENT_ROOT)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const assessments = files.map((name) => ({ file: name, value: readJson(path.join(ASSESSMENT_ROOT, name)) }));
  const reviewerIds = new Set();
  for (const assessment of assessments) {
    const value = assessment.value;
    if (value.gold_set_version !== VERSION || value.blinded !== true) throw new Error(`Invalid blinded assessment: ${assessment.file}`);
    if (!String(value.reviewer_id || "").trim() || reviewerIds.has(value.reviewer_id)) throw new Error(`Missing or duplicate reviewer: ${assessment.file}`);
    reviewerIds.add(value.reviewer_id);
    if (!Array.isArray(value.cases) || value.cases.length !== caseCount) throw new Error(`Incomplete assessment: ${assessment.file}`);
    const numbers = new Set();
    for (const item of value.cases) {
      if (!Number.isInteger(item.case_number) || item.case_number < 1 || item.case_number > caseCount || numbers.has(item.case_number)) throw new Error(`Invalid case numbering: ${assessment.file}`);
      numbers.add(item.case_number);
      if (!new Set(["A", "B", "equal"]).has(item.preference)) throw new Error(`Missing preference: ${assessment.file} case ${item.case_number}`);
      for (const [criterion] of SCORE_CRITERIA) {
        for (const side of ["A", "B"]) {
          const score = item.scores?.[criterion]?.[side];
          if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`Invalid score: ${assessment.file} case ${item.case_number}`);
        }
      }
      for (const [gate] of CUSTOMER_SUCCESS) {
        for (const side of ["A", "B"]) {
          if (typeof item.customer_success?.[gate]?.[side] !== "boolean") throw new Error(`Incomplete Customer Success gate: ${assessment.file} case ${item.case_number}`);
        }
      }
    }
  }
  return assessments;
}

function evaluateHumanAssessments(assessments, reveal, minimumReviewers) {
  const ready = assessments.length >= minimumReviewers;
  if (!ready) return {
    ready: false,
    reviewer_count: assessments.length,
    minimum_reviewers: minimumReviewers,
    no_regression_passed: false,
    customer_success_passed: false,
    cases: []
  };
  const cases = reveal.map((revealed) => {
    const v1Side = revealed.mapping.A === "v1" ? "A" : "B";
    const v2Side = v1Side === "A" ? "B" : "A";
    const scoreRegressions = [];
    const customerSuccessFailures = [];
    const preferences = { v1: 0, v2: 0, equal: 0 };
    for (const assessment of assessments) {
      const item = assessment.value.cases.find((candidate) => candidate.case_number === revealed.case_number);
      for (const [criterion] of SCORE_CRITERIA) {
        if (item.scores[criterion][v2Side] < item.scores[criterion][v1Side]) scoreRegressions.push({ reviewer_id: assessment.value.reviewer_id, criterion });
      }
      for (const [gate] of CUSTOMER_SUCCESS) {
        if (item.customer_success[gate][v2Side] !== true) customerSuccessFailures.push({ reviewer_id: assessment.value.reviewer_id, gate });
      }
      if (item.preference === "equal") preferences.equal += 1;
      else if (item.preference === v2Side) preferences.v2 += 1;
      else preferences.v1 += 1;
    }
    const preferenceNotWorse = preferences.v2 + preferences.equal >= preferences.v1;
    return {
      case_number: revealed.case_number,
      case_id: revealed.case_id,
      passed: scoreRegressions.length === 0 && customerSuccessFailures.length === 0 && preferenceNotWorse,
      score_regressions: scoreRegressions,
      customer_success_failures: customerSuccessFailures,
      preference_counts: preferences,
      preference_not_worse: preferenceNotWorse
    };
  });
  return {
    ready: true,
    reviewer_count: assessments.length,
    minimum_reviewers: minimumReviewers,
    no_regression_passed: cases.every((item) => item.score_regressions.length === 0 && item.preference_not_worse),
    customer_success_passed: cases.every((item) => item.customer_success_failures.length === 0),
    cases
  };
}

function reviewApp(caseCount) {
  const scoreRows = SCORE_CRITERIA.map(([id, label]) => `<tr><th>${label}</th><td><select data-score="${id}" data-side="A">${scoreOptions()}</select></td><td><select data-score="${id}" data-side="B">${scoreOptions()}</select></td></tr>`).join("");
  const gateRows = CUSTOMER_SUCCESS.map(([id, label]) => `<tr><th>${label}</th><td><select data-gate="${id}" data-side="A"><option value="">—</option><option value="true">Ja</option><option value="false">Nee</option></select></td><td><select data-gate="${id}" data-side="B"><option value="">—</option><option value="true">Ja</option><option value="false">Nee</option></select></td></tr>`).join("");
  const template = JSON.stringify(assessmentTemplate(caseCount));
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gold Set blinde beoordeling</title><style>:root{font-family:Inter,Arial,sans-serif;color:#eaf2ff;background:#07111f}*{box-sizing:border-box}body{margin:0}.top{position:sticky;top:0;z-index:5;display:flex;gap:14px;align-items:center;padding:14px 22px;background:#0b1b30;border-bottom:1px solid #27415f}.top strong{font-size:18px}.top span{color:#9eb4cc}.top input{margin-left:auto;padding:10px;border:1px solid #355475;background:#07111f;color:#fff}.top button,.nav button{padding:10px 15px;border:0;border-radius:8px;background:#1875ff;color:#fff;font-weight:800}.frames{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}.site{background:#0b1b30;border:1px solid #27415f;border-radius:12px;overflow:hidden}.site h2{margin:0;padding:12px 16px}.site iframe{display:block;width:100%;height:760px;border:0;background:white}.form{margin:0 12px 24px;padding:20px;background:#0b1b30;border:1px solid #27415f;border-radius:12px}.form table{width:100%;border-collapse:collapse}.form th,.form td{padding:10px;border-bottom:1px solid #203750;text-align:left}.form th{width:54%}.form select,.form textarea{width:100%;padding:9px;background:#07111f;color:#fff;border:1px solid #355475}.form textarea{min-height:90px}.nav{display:flex;justify-content:space-between;align-items:center;margin-top:18px}.warning{color:#ffc66d}@media(max-width:900px){.frames{grid-template-columns:1fr}.site iframe{height:620px}.top{flex-wrap:wrap}.top input{margin-left:0}}</style></head><body><div class="top"><strong>Gold Set 2026.1</strong><span>Blinde beoordeling — alleen Website A en B</span><span id="progress"></span><input id="reviewer" placeholder="Naam beoordelaar"><button id="export">Beoordeling exporteren</button></div><main><div class="frames"><section class="site"><h2>Website A</h2><iframe id="frameA" title="Website A"></iframe></section><section class="site"><h2>Website B</h2><iframe id="frameB" title="Website B"></iframe></section></div><section class="form"><p class="warning">Beoordeel uitsluitend wat u ziet. Raadpleeg geen onderliggende metadata.</p><h3>Voorkeur</h3><select id="preference"><option value="">— Kies —</option><option value="A">Website A</option><option value="B">Website B</option><option value="equal">Gelijkwaardig</option></select><h3>Scores (1–5)</h3><table><thead><tr><th>Criterium</th><th>A</th><th>B</th></tr></thead><tbody>${scoreRows}</tbody></table><h3>Customer Success Gate</h3><table><thead><tr><th>Vraag</th><th>A</th><th>B</th></tr></thead><tbody>${gateRows}</tbody></table><h3>Motivatie en opvallende fouten</h3><textarea id="notes"></textarea><div class="nav"><button id="previous">← Vorige</button><strong id="caseLabel"></strong><button id="next">Volgende →</button></div></section></main><script>const count=${caseCount};const key='mws-gold-set-${VERSION}';const blank=${template};let state=JSON.parse(localStorage.getItem(key)||'null')||{reviewer_id:'',cases:blank};let current=0;const q=s=>document.querySelector(s);const qa=s=>[...document.querySelectorAll(s)];function save(){const item=state.cases[current];item.preference=q('#preference').value;qa('[data-score]').forEach(el=>item.scores[el.dataset.score][el.dataset.side]=Number(el.value)||0);qa('[data-gate]').forEach(el=>item.customer_success[el.dataset.gate][el.dataset.side]=el.value===''?null:el.value==='true');item.notes=q('#notes').value;state.reviewer_id=q('#reviewer').value.trim();localStorage.setItem(key,JSON.stringify(state))}function load(){const item=state.cases[current];const folder='case-'+String(current+1).padStart(2,'0');q('#frameA').src=folder+'/A.html';q('#frameB').src=folder+'/B.html';q('#preference').value=item.preference;qa('[data-score]').forEach(el=>el.value=item.scores[el.dataset.score][el.dataset.side]||'');qa('[data-gate]').forEach(el=>{const v=item.customer_success[el.dataset.gate][el.dataset.side];el.value=v===null?'':String(v)});q('#notes').value=item.notes;q('#reviewer').value=state.reviewer_id;q('#caseLabel').textContent='Case '+(current+1)+' van '+count;q('#progress').textContent=state.cases.filter(x=>x.preference).length+'/'+count+' beoordeeld';q('#previous').disabled=current===0;q('#next').disabled=current===count-1}q('#previous').onclick=()=>{save();current--;load()};q('#next').onclick=()=>{save();current++;load()};q('#export').onclick=()=>{save();const incomplete=state.cases.some(x=>!x.preference||Object.values(x.scores).some(v=>!v.A||!v.B)||Object.values(x.customer_success).some(v=>v.A===null||v.B===null));if(!state.reviewer_id)return alert('Vul eerst de naam van de beoordelaar in.');if(incomplete)return alert('Beoordeel eerst alle 24 cases volledig.');const payload={gold_set_version:'${VERSION}',reviewer_id:state.reviewer_id,blinded:true,submitted_at:new Date().toISOString(),cases:state.cases};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\\n'],{type:'application/json'}));a.download='gold-set-${VERSION}-assessment-'+state.reviewer_id.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.json';a.click();URL.revokeObjectURL(a.href)};window.addEventListener('beforeunload',save);load();</script></body></html>`;
}

function scoreOptions() {
  return '<option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>';
}

const manifest = readJson(MANIFEST_PATH);
const lock = readJson(LOCK_PATH);
const manifestHash = assertFrozenManifest(manifest, lock);
const secret = getBlindingSecret();
const sourceLookup = imageSourceLookup();
const reveal = [];
const cases = [];

for (const [index, item] of manifest.cases.entries()) {
  const mapping = blindMapping(secret, item.id);
  const [v1Prepared, v2Prepared, v1Repeat, v2Repeat] = await Promise.all([
    prepare(item, "v1"), prepare(item, "v2"), prepare(item, "v1"), prepare(item, "v2")
  ]);
  const versions = {
    v1: { prepared: v1Prepared, generated: buildWebsitePackage(v1Prepared.request) },
    v2: { prepared: v2Prepared, generated: buildWebsitePackage(v2Prepared.request) }
  };
  const repeated = {
    v1: buildWebsitePackage(v1Repeat.request),
    v2: buildWebsitePackage(v2Repeat.request)
  };
  const checks = {
    v1: objectiveChecks(item, "v1", versions.v1.prepared, versions.v1.generated),
    v2: objectiveChecks(item, "v2", versions.v2.prepared, versions.v2.generated)
  };
  const comparison = compareChecks(checks.v1, checks.v2);
  const caseFolder = `case-${String(index + 1).padStart(2, "0")}`;
  reviewerHomepage(versions[mapping.A].generated, path.join(REVIEW_ROOT, caseFolder, "A.html"), sourceLookup);
  reviewerHomepage(versions[mapping.B].generated, path.join(REVIEW_ROOT, caseFolder, "B.html"), sourceLookup);
  reveal.push({ case_number: index + 1, case_id: item.id, mapping });
  cases.push({
    case_number: index + 1,
    case_id: item.id,
    expected_dimensions: item.expected,
    adapter_contracts: {
      v1: v1Prepared.adapterOutput.metadata.contractVersion,
      v2: v2Prepared.adapterOutput.metadata.contractVersion
    },
    composition_signature: v2Prepared.adapterOutput.metadata.compositionSignature,
    seed: {
      frozen_input: item.seed,
      v1_resolved: v1Prepared.adapterOutput.metadata.seed,
      v2_resolved: v2Prepared.adapterOutput.metadata.seed
    },
    deterministic: {
      v1: outputDigest(versions.v1.generated) === outputDigest(repeated.v1),
      v2: outputDigest(versions.v2.generated) === outputDigest(repeated.v2)
    },
    objective_checks: checks,
    no_regression: comparison,
    render_signatures: {
      v1: outputDigest(versions.v1.generated),
      v2: outputDigest(versions.v2.generated)
    }
  });
}

fs.mkdirSync(REVIEW_ROOT, { recursive: true });
fs.writeFileSync(path.join(REVIEW_ROOT, "index.html"), reviewApp(manifest.cases.length));
const mappingCommitment = sha(`${secret}:${JSON.stringify(reveal)}`);
fs.writeFileSync(PRIVATE_REVEAL_PATH, `${JSON.stringify({ gold_set_version: VERSION, blinding_secret: secret, mapping_commitment: mappingCommitment, reveal }, null, 2)}\n`, { mode: 0o600 });

const automatedPassed = cases.every((item) => item.no_regression.passed
  && item.deterministic.v1
  && item.deterministic.v2
  && Object.entries(item.objective_checks.v2).filter(([key]) => key !== "truth_evidence").every(([, value]) => value === true));
const truthPassed = cases.every((item) => item.objective_checks.v2.no_hallucinations);
const assessments = loadAssessments(manifest.cases.length);
const human = evaluateHumanAssessments(assessments, reveal, manifest.minimum_blind_reviewers);
const certified = automatedPassed
  && truthPassed
  && human.ready
  && human.no_regression_passed
  && human.customer_success_passed;
const status = certified ? "GOLD_SET_V1_V2_BENCHMARK_CERTIFIED" : "STOPPED_GOLD_SET_CERTIFICATION";
const blockers = [
  ...(!automatedPassed ? ["automated_gold_set_gate_failed"] : []),
  ...(!truthPassed ? ["no_hallucination_gate_failed"] : []),
  ...(!human.ready ? ["blind_human_assessments_pending"] : []),
  ...(human.ready && !human.no_regression_passed ? ["human_v2_no_regression_gate_failed"] : []),
  ...(!human.ready || !human.customer_success_passed ? ["customer_success_gate_pending_or_failed"] : [])
];
const truthBlockerCounts = {};
for (const item of cases) {
  for (const blocker of item.objective_checks.v2.truth_evidence.blockers) {
    truthBlockerCounts[blocker] = (truthBlockerCounts[blocker] || 0) + 1;
  }
}
if (human.ready) {
  fs.writeFileSync(path.join(EVIDENCE_ROOT, "REVEALED_MAPPING.json"), `${JSON.stringify({
    gold_set_version: VERSION,
    mapping_commitment: mappingCommitment,
    blinding_secret: secret,
    reveal
  }, null, 2)}\n`);
}
const report = {
  report_version: "1.0.0",
  gold_set_version: VERSION,
  manifest_sha256: manifestHash,
  case_count: cases.length,
  status,
  certified,
  protocol: {
    blinded: true,
    reviewer_visible_labels: ["Website A", "Website B"],
    hidden_until_submission: ["adapter_version", "seed", "branch", "style", "commit", "date"],
    no_average_compensation: true,
    per_case_rule: "V2 must be equal or better than V1 for every case",
    mapping_commitment: mappingCommitment,
    private_reveal_path: ".gold-set-private/2026.1/reveal.json"
  },
  gates: {
    frozen_manifest: true,
    automated_gold_set: automatedPassed,
    no_hallucination: truthPassed,
    blind_human_assessment: human.ready && human.no_regression_passed,
    customer_success: human.ready && human.customer_success_passed
  },
  blockers,
  truth_blocker_counts: truthBlockerCounts,
  human_assessment: human,
  cases
};
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_ROOT, "AUTOMATED_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
const failedTruthCases = cases.filter((item) => !item.objective_checks.v2.no_hallucinations);
const regressionCases = cases.filter((item) => !item.no_regression.passed);
const markdown = `# Gold Set ${VERSION} — V1/V2 certificeringsbenchmark\n\n**${status}**\n\nDe set is bevroren op \`${manifestHash}\` met ${cases.length} cases. De A/B-koppeling blijft privé tot minimaal ${manifest.minimum_blind_reviewers} volledige beoordelingen zijn ingeleverd.\n\n## Gates\n\n- Frozen manifest: PASS\n- Automatische Gold Set: ${automatedPassed ? "PASS" : "STOP"}\n- No Hallucination Gate: ${truthPassed ? "PASS" : "STOP"}\n- Blinde menselijke beoordeling: ${human.ready ? (human.no_regression_passed ? "PASS" : "STOP") : "PENDING"}\n- Customer Success Gate: ${human.ready ? (human.customer_success_passed ? "PASS" : "STOP") : "PENDING"}\n\n## Harde regel\n\nIedere afzonderlijke V2-case moet bij iedere beoordelaar op ieder criterium minimaal gelijk zijn aan V1. Resultaten worden niet over cases of beoordelaars gemiddeld om regressies te compenseren.\n\n## Automatische bevindingen\n\n- Cases met een objectieve regressie: ${regressionCases.length}\n- V2-cases geblokkeerd door Truth Quality: ${failedTruthCases.length}\n- Ongemarkeerde gegenereerde projectcases: ${truthBlockerCounts.unverified_generated_projects || 0}/${cases.length}\n- Onbewezen testimonialblokken in de render: ${truthBlockerCounts.unverified_rendered_testimonials || 0}/${cases.length}\n- Onbewezen ervaringsclaims in de render: ${truthBlockerCounts.unverified_experience || 0}/${cases.length}\n- Deterministische V1-renders: ${cases.filter((item) => item.deterministic.v1).length}/${cases.length}\n- Deterministische V2-renders: ${cases.filter((item) => item.deterministic.v2).length}/${cases.length}\n- Volledige blinde beoordelingen: ${human.reviewer_count}/${human.minimum_reviewers}\n\nTruth Quality-blockers worden per case volledig vastgelegd in \`AUTOMATED_REPORT.json\`. Geen menselijke beoordeling of certificering is door de benchmark gesimuleerd.\n\n## Beoordelen\n\nOpen lokaal \`review/index.html\`. De beoordelaar ziet uitsluitend Website A en Website B en exporteert na 24 complete beoordelingen één JSON-bestand volgens \`assessment.schema.json\`. Plaats goedgekeurde exports in \`content-factory/gold-set/${VERSION}/assessments/\` en voer de benchmark opnieuw uit. De mapping wordt pas onthuld wanneer het minimumaantal volledige beoordelingen aanwezig is.\n`;
fs.writeFileSync(path.join(EVIDENCE_ROOT, "README.md"), markdown);
console.log(status);
console.log(JSON.stringify({ automatedPassed, truthPassed, regressionCases: regressionCases.length, failedTruthCases: failedTruthCases.length, review: path.relative(ROOT, path.join(REVIEW_ROOT, "index.html")) }, null, 2));
process.exitCode = status === "GOLD_SET_V1_V2_BENCHMARK_CERTIFIED" ? 0 : 2;
