import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const bridge = require("../functions/services/contentFactoryWebsiteFactoryAdapter");
const { buildWebsitePackage } = require("../functions/_website-factory-core");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_JSON = path.join(ROOT, "docs", "evidence", "CONTENT_FACTORY_V2_RENDERER_SHADOW_REPORT.json");
const OUTPUT_MD = path.join(ROOT, "docs", "evidence", "CONTENT_FACTORY_V2_RENDERER_SHADOW_REPORT.md");

const CASES = [
  { id: "installateur-thuisbatterijen-premium-dark", vertical: "installateur", specialization: "thuisbatterijen", style: "premium", brandPersonality: "innovatief", theme: "dark", goal: "leadgeneratie", region: "Utrecht", seed: 0 },
  { id: "holistisch-warm-light", vertical: "holistisch", specialization: "coaching", style: "warm", brandPersonality: "persoonlijk", theme: "light", goal: "afspraken", region: "Amersfoort", seed: 1 },
  { id: "loodgieter-modern-leadgeneratie", vertical: "loodgieter", specialization: "lekkage", style: "modern", brandPersonality: "jong", theme: "light", goal: "leadgeneratie", region: "Rotterdam", seed: 2 },
  { id: "restaurant-luxe-reserveringen", vertical: "restaurant", specialization: "sushi", style: "luxe", brandPersonality: "persoonlijk", theme: "light", goal: "afspraken", region: "Amsterdam", seed: 3 },
  { id: "autobedrijf-zakelijk-occasions", vertical: "autobedrijf", specialization: "occasions", style: "zakelijk", brandPersonality: "corporate", theme: "light", goal: "portfolio", region: "Almere", seed: 4 },
  { id: "glazenwasser-lokaal-offerte", vertical: "glazenwasser", specialization: "", style: "minimalistisch", brandPersonality: "lokaal", theme: "light", goal: "leadgeneratie", region: "Kampen", seed: 0 }
];

function sha(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function briefingFor(item) {
  return [
    `Branche: ${item.vertical}`,
    ...(item.specialization ? [`Subspecialisatie: ${item.specialization}`] : []),
    `Regio: ${item.region}`,
    `Visuele stijl: ${item.style}`,
    `Merkpersoonlijkheid: ${item.brandPersonality}`,
    `Thema: ${item.theme}`,
    `Contentdoel: ${item.goal}`,
    "Locale: nl-NL",
    "Kanalen: website, social",
    "Diensten: Advies, Uitvoering, Service"
  ].join("\n");
}

function journeyFor(item) {
  return {
    id: `shadow-${item.id}`,
    businessName: `Demo ${item.vertical}`,
    email: `${item.vertical}@example.test`,
    phone: "030-1234567",
    websiteUrl: `https://${item.vertical}.example.test`,
    packageType: "premium",
    factoryInput: {
      specialization: item.specialization,
      style: item.style,
      brandPersonality: item.brandPersonality,
      theme: item.theme,
      goal: item.goal,
      locale: "nl-NL",
      channels: ["website", "social"]
    }
  };
}

function indexHtml(generated) {
  return generated.files.find((file) => file.path === "index.html")?.content || "";
}

function fileDigest(generated) {
  return sha(generated.files.map((file) => `${file.path}:${sha(file.content)}`).join("|"));
}

function cssDigest(generated) {
  return sha(generated.files.filter((file) => file.path.endsWith(".css")).map((file) => `${file.path}:${file.content}`).join("|"));
}

async function prepare(item, adapter, mode = "active", resolverV2) {
  return bridge.prepareWebsiteFactoryRenderRequest({
    journey: journeyFor(item),
    briefing: briefingFor(item),
    packageType: "premium",
    version: 1,
    environment: {
      WEBSITE_FACTORY_CONTENT_ADAPTER: adapter,
      WEBSITE_FACTORY_CONTENT_ADAPTER_MODE: mode
    },
    ...(resolverV2 ? { resolverV2 } : {})
  });
}

async function evaluateCase(item) {
  const [v1Prepared, v2Prepared, shadowPrepared, v2Repeated] = await Promise.all([
    prepare(item, "v1"),
    prepare(item, "v2"),
    prepare(item, "v2", "shadow"),
    prepare(item, "v2")
  ]);
  const v1Render = buildWebsitePackage(v1Prepared.request);
  const v2Render = buildWebsitePackage(v2Prepared.request);
  const repeatedRender = buildWebsitePackage(v2Repeated.request);
  const v2Output = v2Prepared.adapterOutput;
  const dimensions = v2Output.blueprint.dimensions;
  const specializationName = dimensions.specialization?.name || "";
  const html = indexHtml(v2Render);
  const prompt = v2Output.assets.hero?.imagePrompt || {};
  const design = v2Output.blueprint.design_system;
  const checks = {
    branchCorrect: dimensions.vertical.slug === item.vertical,
    specializationCorrect: item.specialization ? dimensions.specialization?.id === item.specialization : dimensions.specialization === null,
    copySpecific: item.specialization ? [v2Output.hero.title, v2Output.hero.subtitle, v2Output.seo.title, ...v2Output.seo.keywords].some((value) => String(value).toLowerCase().includes(specializationName.toLowerCase())) : v2Output.hero.subtitle.toLowerCase().includes(item.region.toLowerCase()),
    photographyCombinationSpecific: Boolean(prompt.style && prompt.personalityDirection && prompt.themeDirection && v2Output.assets.hero.compositionSignature === v2Output.blueprint.composition_signature),
    designTokensResolved: Boolean(design.colors.primary && design.colors.surface && design.fonts.heading && design.layout.hero),
    heroIntentAligned: v2Output.hero.messagingIntent === v2Output.blueprint.block_strategy.hero_intent,
    ctaIntentAligned: Boolean(v2Output.hero.primaryCta && v2Output.blueprint.block_strategy.primary_cta_intent),
    seoSpecific: v2Output.seo.title.includes(item.region) && v2Output.seo.keywords.length >= 5,
    reviewsBlocked: v2Output.reviews.items.every((review) => review.publishable === false) && v2Output.websiteFactoryInput.texts.reviews.length === 0,
    rendererCompatible: Boolean(html) && v2Render.files.some((file) => file.path === "briefing.json") && html.includes(v2Output.hero.title),
    deterministic: fileDigest(v2Render) === fileDigest(repeatedRender),
    shadowUsesV1: shadowPrepared.integration.rendererAdapterVersion === "v1" && shadowPrepared.request.factoryInput.contentFactory.contractVersion === "content-factory-adapter/v1",
    v1Available: v1Prepared.request.factoryInput.contentFactory.contractVersion === "content-factory-adapter/v1"
  };
  return {
    id: item.id,
    input: item,
    passed: Object.values(checks).every(Boolean),
    checks,
    evidence: {
      v1Adapter: v1Prepared.request.factoryInput.contentFactory.contractVersion,
      v2Adapter: v2Prepared.request.factoryInput.contentFactory.contractVersion,
      shadowRendererAdapter: shadowPrepared.integration.rendererAdapterVersion,
      dimensions,
      seed: v2Output.metadata.seed,
      fallbackChoices: v2Output.metadata.fallbacks,
      compositionSignature: v2Output.blueprint.composition_signature,
      heroTitle: v2Output.hero.title,
      primaryCta: v2Output.hero.primaryCta,
      seoTitle: v2Output.seo.title,
      designSignature: sha(JSON.stringify(design)),
      photographyPromptSignature: sha(JSON.stringify(prompt)),
      v1RenderSignature: fileDigest(v1Render),
      v2RenderSignature: fileDigest(v2Render),
      renderChanged: fileDigest(v1Render) !== fileDigest(v2Render),
      quality: v2Output.quality,
      aiConfidence: v2Output.quality.website.ai_confidence.score,
      publicationReady: v2Output.quality.website.publication_ready
    }
  };
}

const results = [];
for (const item of CASES) results.push(await evaluateCase(item));

const styleVariantBase = CASES[0];
const styleVariants = [];
for (const style of ["premium", "warm", "modern", "minimalistisch"]) {
  const input = { ...styleVariantBase, style, id: `${styleVariantBase.id}-${style}` };
  const prepared = await prepare(input, "v2");
  const rendered = buildWebsitePackage(prepared.request);
  styleVariants.push({
    requestedStyle: style,
    resolvedStyle: prepared.adapterOutput.blueprint.dimensions.visual_style.id,
    designSignature: sha(JSON.stringify(prepared.adapterOutput.blueprint.design_system)),
    cssSignature: cssDigest(rendered),
    photographyPromptSignature: sha(JSON.stringify(prepared.adapterOutput.assets.hero.imagePrompt)),
    renderSignature: fileDigest(rendered)
  });
}
const styleVariationCheck = {
  passed: new Set(styleVariants.map((item) => item.designSignature)).size === styleVariants.length
    && new Set(styleVariants.map((item) => item.cssSignature)).size === styleVariants.length
    && new Set(styleVariants.map((item) => item.photographyPromptSignature)).size === styleVariants.length,
  sameLeadInput: `${styleVariantBase.vertical}:${styleVariantBase.specialization}:${styleVariantBase.region}:${styleVariantBase.seed}`,
  variants: styleVariants
};

const fallbackPrepared = await prepare(CASES[0], "v2", "active", async () => { throw new Error("shadow-certification-v2-failure"); });
const fallbackRender = buildWebsitePackage(fallbackPrepared.request);
const fallbackCheck = {
  passed: fallbackPrepared.integration.status === "v2_fallback_v1"
    && fallbackPrepared.integration.rendererAdapterVersion === "v1"
    && fallbackPrepared.request.factoryInput.contentFactory.contractVersion === "content-factory-adapter/v1"
    && fallbackRender.files.filter((file) => file.path === "index.html").length === 1,
  status: fallbackPrepared.integration.status,
  rendererAdapterVersion: fallbackPrepared.integration.rendererAdapterVersion,
  fallbackFrom: fallbackPrepared.integration.fallbackFrom,
  fallbackTo: fallbackPrepared.integration.fallbackTo,
  renderedIndexCount: fallbackRender.files.filter((file) => file.path === "index.html").length
};

const distinctDesigns = new Set(results.map((result) => result.evidence.designSignature)).size;
const summaryChecks = {
  allCasesPassed: results.every((result) => result.passed),
  sixRepresentativeCases: results.length === 6,
  visibleDesignVariation: distinctDesigns >= 5 && styleVariationCheck.passed,
  controlledFallbackPassed: fallbackCheck.passed,
  noPublicationClaims: results.every((result) => result.evidence.publicationReady === false && result.evidence.aiConfidence === null)
};
const passed = Object.values(summaryChecks).every(Boolean);
const status = passed ? "PASS_CONTENT_FACTORY_V2_RENDERER_SHADOW_READY" : "STOPPED_CONTENT_FACTORY_V2_RENDERER_SHADOW_NOT_READY";
const report = {
  report_version: "1.0.0",
  generated_at: "deterministic-local-certification",
  status,
  scope: "local renderer shadow certification; no production activation, writes or database changes",
  feature_flags: {
    version: "WEBSITE_FACTORY_CONTENT_ADAPTER=v1|v2 (default v1)",
    mode: "WEBSITE_FACTORY_CONTENT_ADAPTER_MODE=off|shadow|active (default preserves legacy off mode)",
    production_default_changed: false
  },
  summaryChecks,
  distinctDesigns,
  styleVariationCheck,
  fallbackCheck,
  cases: results
};

fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
const rows = results.map((result) => `| ${result.id} | ${result.passed ? "PASS" : "STOP"} | ${result.evidence.dimensions.visual_style.name} | ${result.evidence.dimensions.brand_personality.name} | ${result.evidence.heroTitle} | ${result.evidence.primaryCta} | ${result.evidence.quality.website.overall} |`).join("\n");
const styleRows = styleVariants.map((item) => `| ${item.requestedStyle} | ${item.resolvedStyle} | \`${item.designSignature.slice(0, 12)}\` | \`${item.cssSignature.slice(0, 12)}\` | \`${item.photographyPromptSignature.slice(0, 12)}\` |`).join("\n");
const markdown = `# Content Factory v2 renderer shadow report\n\n**${status}**\n\nScope: lokale side-by-side renderercertificering. Geen productieactivering, databasewijzigingen, productie-write, bulkcontent of bulkfoto's.\n\n## Featureflags\n\n- \`WEBSITE_FACTORY_CONTENT_ADAPTER\`: standaard \`v1\`, gecontroleerde test \`v2\`.\n- \`WEBSITE_FACTORY_CONTENT_ADAPTER_MODE\`: \`off\`, \`shadow\` of \`active\`.\n- In \`v2 + shadow\` rendert v1; v2 wordt alleen opgelost en vergeleken.\n- Bij een v2-fout rendert dezelfde build één keer met de voorbereide v1-input.\n\n## Matrix\n\n| Case | Status | Stijl | Persoonlijkheid | Hero | CTA | Quality |\n| --- | --- | --- | --- | --- | --- | ---: |\n${rows}\n\n## Dezelfde lead, vier stijlen\n\n| Gevraagd | Opgelost | Design | CSS | Fotografieprompt |\n| --- | --- | --- | --- | --- |\n${styleRows}\n\nStijlvariatie voor exact dezelfde leadinput: ${styleVariationCheck.passed ? "PASS" : "STOP"}.\n\n## Samenvatting\n\n- Cases: ${results.length}/6\n- Unieke designsystemen in de branchematrix: ${distinctDesigns}\n- Premium/warm/modern/minimalistisch voor dezelfde lead: ${styleVariationCheck.passed ? "PASS" : "STOP"}\n- Gecontroleerde v2 → v1 fallback: ${fallbackCheck.passed ? "PASS" : "STOP"}\n- Determinisme, renderercompatibiliteit, SEO, CTA, reviewblokkade en fotografiepromptbinding: ${results.every((result) => result.passed) ? "PASS" : "STOP"}\n- AI-confidence: niet gemeten\n- Publication ready: false; menselijke review blijft verplicht\n\nVolledige evidence met adapterversies, dimensies, seeds, fallbackkeuzes en SHA-256-signatures staat in \`CONTENT_FACTORY_V2_RENDERER_SHADOW_REPORT.json\`.\n`;
fs.writeFileSync(OUTPUT_MD, markdown);
console.log(status);
if (!passed) process.exitCode = 1;
