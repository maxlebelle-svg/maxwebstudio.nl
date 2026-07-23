import { blocksForChannels } from "./content-blocks.mjs";
import { DEFAULT_PERSONALITY_ID, resolveBrandPersonality } from "./personalities.mjs";
import { DEFAULT_STYLE_ID, resolveStyleProfile } from "./styles.mjs";
import { CATEGORY_PROFILES, VERTICALS } from "./verticals.mjs";

export const CONTENT_LIBRARY_COMPOSITION_VERSION = "2.0.0-alpha.1";
export const SUPPORTED_CHANNELS = Object.freeze(["website", "social", "blog", "newsletter", "google_business_profile"]);
export const SUPPORTED_THEMES = Object.freeze(["light", "dark"]);

function slugify(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveVertical(value) {
  const normalized = slugify(value);
  return VERTICALS.find((vertical) => vertical.slug === normalized || slugify(vertical.name) === normalized || [vertical.singular, vertical.primaryService, ...vertical.related].some((term) => slugify(term) === normalized)) || null;
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeChannels(channels) {
  const requested = Array.isArray(channels) && channels.length ? channels : ["website"];
  const normalized = unique(requested.map(slugify).map((channel) => channel === "social-media" ? "social" : channel));
  const unknown = normalized.filter((channel) => !SUPPORTED_CHANNELS.includes(channel));
  if (unknown.length) throw new Error(`Onbekende kanalen: ${unknown.join(", ")}`);
  return normalized;
}

function themeTokens(style, theme) {
  const colors = structuredClone(style.brand.colors);
  if (theme === "dark") {
    colors.ink = "#F7F7F5";
    colors.surface = "#101317";
  }
  return colors;
}

export function composeContentLibraryBlueprint({ vertical, style, brandPersonality, theme = "light", channels = ["website"], seed = 0 } = {}) {
  const resolvedVertical = resolveVertical(vertical);
  if (!resolvedVertical) throw new Error(`Onbekende branche '${vertical || ""}'.`);
  const resolvedStyle = resolveStyleProfile(style);
  if (!resolvedStyle) throw new Error(`Onbekende stijl '${style}'.`);
  const resolvedPersonality = resolveBrandPersonality(brandPersonality);
  if (!resolvedPersonality) throw new Error(`Onbekende merkpersoonlijkheid '${brandPersonality}'.`);
  const resolvedTheme = slugify(theme || "light");
  if (!SUPPORTED_THEMES.includes(resolvedTheme)) throw new Error(`Onbekend thema '${theme}'.`);
  const resolvedChannels = normalizeChannels(channels);
  const category = CATEGORY_PROFILES[resolvedVertical.category];
  const branchStyle = {
    ...structuredClone(resolvedStyle),
    brand: {
      colors: {
        primary: resolvedStyle.colors.primary || category.palette[1],
        secondary: resolvedStyle.colors.secondary || category.palette[2],
        ink: resolvedStyle.colors.ink || category.palette[0],
        surface: resolvedStyle.colors.surface || category.palette[3]
      },
      fonts: {
        heading: resolvedStyle.typography.heading || category.fonts[0],
        body: resolvedStyle.typography.body || category.fonts[1],
        fallbacks: ["Arial", "sans-serif"]
      },
      icon_style: resolvedStyle.icon_style
    }
  };
  branchStyle.brand.colors = themeTokens(branchStyle, resolvedTheme);
  const selectedBlocks = blocksForChannels(resolvedChannels);
  const signature = [resolvedVertical.slug, branchStyle.id, resolvedPersonality.id, resolvedTheme, ...resolvedChannels.sort()].join(":");

  return {
    contract_version: CONTENT_LIBRARY_COMPOSITION_VERSION,
    composition_signature: signature,
    deterministic_seed: Number.isSafeInteger(seed) && seed >= 0 ? seed : 0,
    dimensions: {
      vertical: { slug: resolvedVertical.slug, name: resolvedVertical.name, category: resolvedVertical.category },
      visual_style: { id: branchStyle.id, name: branchStyle.name },
      brand_personality: { id: resolvedPersonality.id, name: resolvedPersonality.name },
      theme: resolvedTheme,
      channels: resolvedChannels
    },
    design_system: {
      colors: branchStyle.brand.colors,
      fonts: branchStyle.brand.fonts,
      icons: { style: branchStyle.brand.icon_style },
      layout: branchStyle.layout,
      buttons: {
        shape: branchStyle.layout.corners,
        primary_treatment: branchStyle.id === "minimalistisch-licht" ? "outline-or-solid" : "solid-high-contrast",
        label_style: resolvedPersonality.cta_style
      },
      spacing: { density: branchStyle.layout.density, scale: branchStyle.layout.density === "compact" ? [4, 8, 12, 20, 32, 48] : [4, 8, 16, 24, 40, 64, 96] },
      motion: {
        level: resolvedStyle.id === "minimalistisch-licht" || resolvedPersonality.id === "traditioneel" ? "subtle" : "moderate",
        allowed: ["fade", "reveal", "micro-interaction"],
        reduced_motion_required: true
      },
      illustrations: {
        style: `${branchStyle.icon_style}, passend bij ${branchStyle.name.toLowerCase()}`,
        color_usage: "gebruik uitsluitend semantische designtokens"
      }
    },
    content_strategy: {
      base_tone: category.tone,
      personality_voice: resolvedPersonality.voice,
      story_angle: resolvedPersonality.story_angle,
      proof_priorities: resolvedPersonality.proof_priorities,
      cta_style: resolvedPersonality.cta_style,
      priority_blocks: resolvedPersonality.content_priorities,
      audience: category.audience,
      primary_service: resolvedVertical.primaryService,
      related_topics: resolvedVertical.related
    },
    blocks: selectedBlocks,
    photography_recipe: {
      vertical_subject: `${resolvedVertical.name}: ${resolvedVertical.primaryService} en ${resolvedVertical.related.join(", ")}`,
      visual_style: branchStyle.photography,
      personality_modifier: resolvedPersonality.photography_modifier,
      theme_modifier: resolvedTheme === "dark" ? "donkere maar realistische omgeving, gecontroleerde highlights en voldoende details in schaduwen" : "lichte realistische omgeving, natuurlijke highlights en heldere huid- en materiaaltinten",
      universal_negative_prompt: "geen tekst, geen logo, geen watermerk, geen zichtbare merknamen, geen vervormde anatomie, geen extra vingers, geen onveilige werkwijze, geen generieke plastic stockfoto-uitstraling, geen oververzadiging",
      human_review_required: true,
      rights_and_release_review_required: true
    },
    consumers: {
      neutral_contract: true,
      supported: resolvedChannels,
      adapters: ["website_factory", "social_studio", "newsletter", "google_business_profile"]
    }
  };
}

export function composePhotographyPrompt(blueprint, { slot, subject, usage, aspectRatio, resolution, focalPoint = "center" }) {
  if (!blueprint?.photography_recipe || !blueprint?.dimensions) throw new TypeError("Een geldige Content Library-compositie is verplicht.");
  const recipe = blueprint.photography_recipe;
  const branch = blueprint.dimensions.vertical.name;
  return {
    id: `${blueprint.composition_signature}:${slugify(slot)}`,
    combination: {
      vertical: blueprint.dimensions.vertical.slug,
      style: blueprint.dimensions.visual_style.id,
      brand_personality: blueprint.dimensions.brand_personality.id,
      theme: blueprint.dimensions.theme,
      slot
    },
    purpose: usage,
    subject: `${subject} voor een professioneel Nederlands ${branch.toLowerCase()}, authentiek en branchespecifiek`,
    style: recipe.visual_style.style,
    lighting: recipe.visual_style.lighting,
    composition: `${recipe.visual_style.composition}; focuspunt ${focalPoint}; geschikt voor ${usage}`,
    camera: recipe.visual_style.camera,
    color_usage: `${recipe.visual_style.treatment}; aansluiten op ${Object.values(blueprint.design_system.colors).join(", ")}`,
    personality_direction: recipe.personality_modifier,
    theme_direction: recipe.theme_modifier,
    negative_prompt: recipe.universal_negative_prompt,
    technical: { aspect_ratio: aspectRatio, resolution, focal_point: focalPoint },
    production: { status: "planned", human_review_required: true, rights_review_required: true }
  };
}

export const COMPOSITION_DEFAULTS = Object.freeze({ style: DEFAULT_STYLE_ID, brandPersonality: DEFAULT_PERSONALITY_ID, theme: "light", channels: ["website"] });

