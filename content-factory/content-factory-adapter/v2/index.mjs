import { resolveWebsiteContent as resolveWebsiteContentV1 } from "../v1/index.mjs";
import { assessBlueprintQuality, assessWebsiteContentQuality, composeContentLibraryBlueprint, composePhotographyPrompt } from "../../public/v2/index.mjs";

export const CONTENT_FACTORY_ADAPTER_V2_CONTRACT = "content-factory-adapter/v2";

const ALLOWED_INPUT_KEYS = new Set(["vertical", "specialization", "style", "brandPersonality", "theme", "goal", "region", "locale", "channels", "companyName", "tone", "template", "package", "seed", "phone", "email", "websiteUrl"]);

const CTA_LABELS = Object.freeze({
  appointment: "Plan een afspraak", quote: "Vraag een offerte aan", call: "Bel direct", whatsapp: "Stuur een WhatsApp",
  demo: "Plan een demo", callback: "Laat u terugbellen", booking: "Reserveer direct", advice: "Vraag persoonlijk advies",
  contact: "Neem contact op", directions: "Bekijk de route", download: "Download de gids", view_projects: "Bekijk projecten", buy: "Bekijk het aanbod"
});

function titleForIntent(intent, subject, region) {
  const titles = {
    conversion: `${subject} professioneel geregeld`,
    storytelling: `Een persoonlijke aanpak voor ${subject.toLowerCase()}`,
    local: `${subject} in ${region}`,
    price: `Duidelijkheid over ${subject.toLowerCase()} en kosten`,
    portfolio: `Bekijk wat goed uitgevoerde ${subject.toLowerCase()} oplevert`,
    emotional: `${subject} met aandacht voor wat voor u telt`,
    proof: `Ervaren specialist in ${subject.toLowerCase()}`
  };
  return titles[intent] || titles.conversion;
}

function normalizeSeed(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  const text = String(value || "").trim();
  if (!text) return 0;
  let result = 2166136261;
  for (const character of text) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function styleAsset(asset, blueprint, fallbackSlot) {
  if (!asset || asset.fallback) return asset;
  const source = asset.sourceResolution || { width: 1600, height: 1200 };
  const prompt = composePhotographyPrompt(blueprint, {
    slot: asset.id || fallbackSlot,
    subject: asset.altText || blueprint.photography_recipe.vertical_subject,
    usage: asset.usage || fallbackSlot,
    aspectRatio: asset.aspectRatio || `${source.width}:${source.height}`,
    resolution: source,
    focalPoint: asset.focalPoint || "center"
  });
  return {
    ...asset,
    compositionSignature: blueprint.composition_signature,
    imagePrompt: {
      style: prompt.style,
      lighting: prompt.lighting,
      composition: prompt.composition,
      camera: prompt.camera,
      colorUsage: prompt.color_usage,
      subject: prompt.subject,
      personalityDirection: prompt.personality_direction,
      themeDirection: prompt.theme_direction,
      negativePrompt: prompt.negative_prompt,
      suitableFor: prompt.purpose
    },
    production: prompt.production
  };
}

function mapAssetGroup(value, blueprint, slot) {
  return Array.isArray(value) ? value.map((asset, index) => styleAsset(asset, blueprint, `${slot}-${index + 1}`)) : styleAsset(value, blueprint, slot);
}

export function resolveWebsiteContentV2(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("resolveWebsiteContentV2 verwacht een inputobject.");
  const unknownKeys = Object.keys(input).filter((key) => !ALLOWED_INPUT_KEYS.has(key));
  if (unknownKeys.length) throw new TypeError(`Onbekende Adapter v2-invoervelden: ${unknownKeys.join(", ")}.`);
  const seed = normalizeSeed(input.seed);
  const channels = Array.isArray(input.channels) && input.channels.length ? [...input.channels] : ["website"];
  if (!channels.includes("website")) channels.unshift("website");
  const blueprint = composeContentLibraryBlueprint({
    vertical: input.vertical,
    specialization: input.specialization,
    style: input.style,
    brandPersonality: input.brandPersonality,
    theme: input.theme,
    goal: input.goal,
    region: input.region,
    locale: input.locale,
    channels,
    seed
  });
  const base = resolveWebsiteContentV1({
    vertical: input.vertical,
    companyName: input.companyName,
    region: input.region,
    tone: input.tone,
    template: input.template,
    package: input.package,
    seed,
    phone: input.phone,
    email: input.email,
    websiteUrl: input.websiteUrl
  });
  const companyName = base.websiteFactoryInput.businessName;
  const region = blueprint.dimensions.region || base.seo.local.region;
  const specialization = blueprint.content_strategy.specialization;
  const subject = specialization?.name || blueprint.content_strategy.primary_service;
  const primaryCta = CTA_LABELS[blueprint.block_strategy.primary_cta_intent] || "Neem contact op";
  const secondaryCta = CTA_LABELS[blueprint.block_strategy.secondary_cta_intent] || "Vraag advies";
  const specializedService = specialization ? {
    id: `specialization-${specialization.id}`,
    name: specialization.name,
    short_description: `${companyName} helpt klanten in ${region} met ${specialization.name.toLowerCase()}, duidelijke uitleg en een aanpak die past bij de situatie.`,
    long_description: `${specialization.name} wordt afgestemd op de vraag, locatie en gewenste planning. Na inventarisatie volgt een concreet voorstel zonder niet-geverifieerde claims.`,
    benefits: blueprint.content_strategy.proof_priorities.slice(0, 3),
    cta: primaryCta,
    specialization: true
  } : null;
  const services = specializedService ? [specializedService, ...base.services.filter((service) => service.name.toLowerCase() !== specializedService.name.toLowerCase())].slice(0, base.services.length) : base.services;
  const assets = Object.fromEntries(Object.entries(base.assets).map(([group, value]) => [group, mapAssetGroup(value, blueprint, group)]));
  const hero = {
    ...base.hero,
    title: titleForIntent(blueprint.block_strategy.hero_intent, subject, region),
    subtitle: `${companyName} helpt met ${subject.toLowerCase()} in ${region}. ${blueprint.content_strategy.story_angle}`,
    primaryCta,
    secondaryCta,
    messagingIntent: blueprint.block_strategy.hero_intent,
    asset: assets.hero
  };
  const specializationKeywords = (specialization?.topics || []).flatMap((topic) => [topic, `${topic} ${region}`]);
  const seo = {
    ...base.seo,
    title: `${companyName} | ${subject} in ${region}`,
    description: `${companyName} helpt klanten in ${region} met ${subject.toLowerCase()}. Persoonlijk advies, duidelijke afspraken en een passende aanpak.`,
    keywords: [...new Set([...specializationKeywords, ...base.seo.keywords])],
    strategy: { goal: blueprint.dimensions.goal.id, specialization: specialization?.id || null, locale: blueprint.dimensions.locale }
  };
  const result = {
    ...base,
    metadata: {
      ...base.metadata,
      contractVersion: CONTENT_FACTORY_ADAPTER_V2_CONTRACT,
      compositionVersion: blueprint.contract_version,
      compositionSignature: blueprint.composition_signature,
      compatibilitySource: base.metadata.contractVersion
    },
    blueprint,
    brand: {
      ...base.brand,
      colors: blueprint.design_system.colors,
      fonts: blueprint.design_system.fonts,
      icons: blueprint.design_system.icons,
      designSystem: { ...blueprint.design_system, theme: blueprint.dimensions.theme }
    },
    hero,
    services,
    seo,
    assets,
    websiteFactoryInput: {
      ...base.websiteFactoryInput,
      services: services.map((service) => service.name),
      ctas: [primaryCta, secondaryCta, ...base.websiteFactoryInput.ctas].slice(0, 3),
      branding: {
        ...base.websiteFactoryInput.branding,
        colors: Object.values(blueprint.design_system.colors).join(", "),
        primaryColor: blueprint.design_system.colors.primary,
        secondaryColor: blueprint.design_system.colors.surface,
        accentColor: blueprint.design_system.colors.secondary,
        fontPreference: `${blueprint.design_system.fonts.heading}, ${blueprint.design_system.fonts.body}`,
        lookAndFeel: `${blueprint.dimensions.visual_style.name}; ${blueprint.dimensions.brand_personality.name}; ${blueprint.dimensions.theme}`,
        iconStyle: blueprint.design_system.icons.style
      },
      content: {
        ...base.websiteFactoryInput.content,
        hero,
        designSystem: { ...blueprint.design_system, theme: blueprint.dimensions.theme },
        contentStrategy: blueprint.content_strategy,
        blockStrategy: blueprint.block_strategy,
        assets
      },
      seo: {
        ...base.websiteFactoryInput.seo,
        keywords: seo.keywords,
        serviceArea: region,
        title: seo.title,
        description: seo.description
      },
      contentFactory: {
        ...base.websiteFactoryInput.contentFactory,
        contractVersion: CONTENT_FACTORY_ADAPTER_V2_CONTRACT,
        compositionSignature: blueprint.composition_signature,
        dimensions: blueprint.dimensions
      }
    }
  };
  result.quality = {
    blueprint: assessBlueprintQuality(blueprint),
    website: assessWebsiteContentQuality({ blueprint, content: result })
  };
  return result;
}
