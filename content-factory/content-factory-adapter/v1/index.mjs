import { CONTENT_LIBRARY_PUBLIC_VERSION, contentFactorySourceV1 } from "../../public/v1/index.mjs";

export const CONTENT_FACTORY_ADAPTER_CONTRACT = "content-factory-adapter/v1";

const PACKAGE_PROFILES = Object.freeze({
  starter: {
    id: "starter", template: "starter-one-page-v1", pages: ["index.html"],
    components: { hero: true, services: true, about: true, portfolio: false, reviews: false, faq: false, team: false, blog: false, contact: true },
    counts: { services: 3, usps: 3, projects: 0, reviews: 0, faq: 0, gallery: 0, social: 0, blogs: 0 }
  },
  business: {
    id: "business", template: "business-multi-page-v1", pages: ["index.html", "over-ons.html", "diensten.html", "projecten.html", "contact.html"],
    components: { hero: true, services: true, about: true, portfolio: true, reviews: true, faq: true, team: false, blog: false, contact: true },
    counts: { services: 4, usps: 4, projects: 4, reviews: 4, faq: 8, gallery: 6, social: 10, blogs: 6 }
  },
  professional: {
    id: "professional", template: "professional-multi-page-v1", pages: ["index.html", "over-ons.html", "diensten.html", "projecten.html", "contact.html"],
    components: { hero: true, services: true, about: true, portfolio: true, reviews: true, faq: true, team: false, blog: false, contact: true },
    counts: { services: 4, usps: 4, projects: 4, reviews: 4, faq: 8, gallery: 6, social: 10, blogs: 6 }
  },
  premium: {
    id: "premium", template: "premium-growth-site-v1", pages: ["index.html", "over-ons.html", "diensten.html", "projecten.html", "reviews.html", "team.html", "contact.html", "offerte.html"],
    components: { hero: true, services: true, about: true, portfolio: true, reviews: true, faq: true, team: true, blog: true, contact: true },
    counts: { services: 6, usps: 6, projects: 6, reviews: 6, faq: 12, gallery: 10, social: 20, blogs: 12 }
  }
});

const ALLOWED_INPUT_KEYS = new Set(["vertical", "companyName", "region", "tone", "template", "package", "seed", "phone", "email", "websiteUrl"]);

function clean(value = "") {
  return String(value ?? "").trim();
}

function slugify(value = "") {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalizeSeed(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (clean(value)) return hash(clean(value));
  return 0;
}

function deterministicGeneratedAt(seed) {
  const start = Date.UTC(2026, 0, 1);
  const offset = (seed % (365 * 24 * 60 * 60)) * 1000;
  return new Date(start + offset).toISOString();
}

function sentenceCase(value = "") {
  const text = clean(value);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function chooseIndex(length, seed, namespace) {
  if (!length) return -1;
  return hash(`${seed}:${namespace}`) % length;
}

function selectOne(items, seed, namespace) {
  const index = chooseIndex(items?.length || 0, seed, namespace);
  return index >= 0 ? structuredClone(items[index]) : null;
}

function selectMany(items, count, seed, namespace) {
  if (!Array.isArray(items) || count <= 0) return [];
  const start = chooseIndex(items.length, seed, namespace);
  return Array.from({ length: Math.min(count, items.length) }, (_, index) => structuredClone(items[(start + index) % items.length]));
}

function replaceTokens(value, context) {
  if (typeof value === "string") {
    return value.replace(/\[([A-Z]+)(?: \d+)?\]/g, (match, token) => context[token] || match);
  }
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, context)]));
  return value;
}

function packageProfile(value, fallbacks) {
  const normalized = slugify(value);
  if (PACKAGE_PROFILES[normalized]) return PACKAGE_PROFILES[normalized];
  if (normalized) fallbacks.push({ field: "package", requested: clean(value), resolved: "business", reason: "unknown_package" });
  else fallbacks.push({ field: "package", requested: "", resolved: "business", reason: "missing_package" });
  return PACKAGE_PROFILES.business;
}

function assetPlaceholder(type, reason, vertical, usage, index = null) {
  return {
    id: index === null ? `fallback-${type}` : `fallback-${type}-${String(index + 1).padStart(2, "0")}`,
    type,
    usage,
    status: "placeholder",
    placeholder: true,
    fallback: true,
    reason,
    storagePath: null,
    sourceResolution: null,
    aspectRatio: null,
    altText: `${usage} placeholder voor ${vertical}`,
    templateBindings: [],
    imagePrompt: {
      style: "professionele, authentieke Nederlandse bedrijfsfotografie",
      lighting: "natuurlijk daglicht",
      composition: "rustige webcompositie met voldoende negatieve ruimte",
      camera: "full-frame camera, realistisch perspectief",
      colorUsage: "aansluiten op het geselecteerde merkpalet",
      subject: `${usage} voor ${vertical}`,
      negativePrompt: "geen tekst, geen logo, geen watermerk, geen misvormingen, geen merknamen",
      suitableFor: usage
    }
  };
}

function mapAsset(asset, context, type, vertical, usage) {
  if (!asset) return assetPlaceholder(type, "missing_asset_slot", vertical, usage);
  const resolved = replaceTokens(asset, context);
  return {
    id: resolved.id,
    type: resolved.type,
    usage: resolved.usage,
    status: "planned",
    placeholder: true,
    fallback: false,
    storagePath: resolved.storage_path,
    sourceResolution: resolved.source_resolution,
    aspectRatio: resolved.aspect_ratio,
    formats: resolved.formats,
    focalPoint: resolved.focal_point,
    altText: resolved.alt_text_template,
    templateBindings: resolved.template_bindings,
    rights: resolved.rights,
    imagePrompt: {
      style: resolved.prompt?.style,
      lighting: resolved.prompt?.lighting,
      composition: resolved.prompt?.composition,
      camera: resolved.prompt?.camera,
      colorUsage: resolved.prompt?.color_usage,
      subject: resolved.prompt?.subject,
      negativePrompt: resolved.prompt?.negative_prompt,
      suitableFor: resolved.prompt?.suitable_for
    }
  };
}

function assetSelector(assets, context, seed, vertical, fallbackFlags) {
  const byType = (type) => (assets?.slots || []).filter((asset) => asset.type === type);
  const one = (type, usage, namespace = type) => {
    const mapped = mapAsset(selectOne(byType(type), seed, `asset:${namespace}`), context, type, vertical, usage);
    if (mapped.fallback) fallbackFlags.add(`asset:${type}`);
    return mapped;
  };
  const many = (type, count, usage) => {
    const selected = selectMany(byType(type), count, seed, `assets:${type}`);
    if (!selected.length && count > 0) {
      fallbackFlags.add(`asset:${type}`);
      return Array.from({ length: count }, (_, index) => assetPlaceholder(type, "missing_asset_collection", vertical, usage, index));
    }
    const mapped = selected.map((asset) => mapAsset(asset, context, type, vertical, usage));
    while (mapped.length < count) {
      fallbackFlags.add(`asset:${type}`);
      mapped.push(assetPlaceholder(type, "insufficient_asset_collection", vertical, usage, mapped.length));
    }
    return mapped;
  };
  return { one, many };
}

function makeReviews(items, context) {
  return items.map((review) => ({
    id: review.id,
    title: replaceTokens(review.title, context),
    exampleText: replaceTokens(review.text, context),
    authorLabel: "Voorbeeldklant — niet publiceren",
    disclosure: review.disclosure,
    placeholder: true,
    publishable: false,
    requiresVerifiedReplacement: true,
    publicationStatus: "blocked_until_verified_review"
  }));
}

function makeProjects(items) {
  return items.map((project) => ({
    ...project,
    disclosure: "Voorbeeldproject — niet publiceren zonder geverifieerde klantbron",
    placeholder: true,
    publishable: false,
    requiresVerifiedReplacement: true,
    publicationStatus: "blocked_until_verified_project"
  }));
}

function isSafeDefaultUsp(usp) {
  const text = `${usp?.title || ""} ${usp?.description || usp?.text || ""}`;
  return !/\b(ervaren|bewezen|gecertificeerd|erkend|marktleider|nummer 1)\b/i.test(text);
}

function outputValidation(output) {
  const errors = [];
  const required = ["metadata", "brand", "hero", "services", "about", "usps", "projects", "reviews", "faq", "contactCta", "seo", "assets", "multichannel", "websiteFactoryInput"];
  for (const key of required) if (!(key in output)) errors.push(`output.${key} ontbreekt`);
  if (output.metadata?.contractVersion !== CONTENT_FACTORY_ADAPTER_CONTRACT) errors.push("ongeldige contractVersion");
  if (!output.hero?.title || !output.hero?.subtitle || !output.hero?.primaryCta) errors.push("hero is incompleet");
  if (!Array.isArray(output.services) || !output.services.length) errors.push("services ontbreken");
  if (output.reviews?.publicationPolicy !== "placeholder_only_requires_verified_replacement") errors.push("reviewbeleid ontbreekt");
  if (output.reviews?.items?.some((item) => item.publishable !== false || item.placeholder !== true || item.requiresVerifiedReplacement !== true)) errors.push("onveilige review gevonden");
  if (output.projects?.some((item) => item.publishable !== false || item.placeholder !== true || item.requiresVerifiedReplacement !== true)) errors.push("onveilig project gevonden");
  if (output.websiteFactoryInput?.content?.projects?.length) errors.push("projectplaceholder lekt naar Website Factory-input");
  for (const group of ["hero", "services", "about", "gallery", "social"]) if (!(group in (output.assets || {}))) errors.push(`assets.${group} ontbreekt`);
  return { valid: errors.length === 0, errors };
}

export function validateAdapterInputV1(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: ["input moet een object zijn"] };
  if (!clean(input.vertical)) errors.push("vertical is verplicht; lokale fallback wordt gebruikt");
  for (const key of Object.keys(input)) if (!ALLOWED_INPUT_KEYS.has(key)) errors.push(`onbekend veld: ${key}`);
  if (input.seed !== undefined && !(Number.isSafeInteger(input.seed) && input.seed >= 0) && !clean(input.seed)) errors.push("seed moet een niet-negatief geheel getal of niet-lege tekenreeks zijn");
  return { valid: errors.length === 0, errors };
}

export function validateAdapterOutputV1(output) {
  return outputValidation(output);
}

export function createWebsiteContentAdapterV1({ contentSource = contentFactorySourceV1 } = {}) {
  if (!contentSource || typeof contentSource.getBranchDefinition !== "function" || typeof contentSource.resolveBranchSlug !== "function") {
    throw new TypeError("contentSource moet de publieke Content Factory v1-interface implementeren");
  }

  return function resolveWebsiteContent(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("resolveWebsiteContent verwacht een inputobject");
    const inputValidation = validateAdapterInputV1(input);
    const fallbacks = [];
    const fallbackFlags = new Set();
    const requestedVertical = clean(input.vertical);
    const resolvedVertical = contentSource.resolveBranchSlug(requestedVertical) || "lokale-specialist";
    if (!requestedVertical || resolvedVertical !== contentSource.resolveBranchSlug(requestedVertical)) {
      fallbacks.push({ field: "vertical", requested: requestedVertical, resolved: resolvedVertical, reason: requestedVertical ? "unknown_vertical" : "missing_vertical" });
    }
    let definition = contentSource.getBranchDefinition(resolvedVertical);
    if (!definition && resolvedVertical !== "lokale-specialist") definition = contentSource.getBranchDefinition("lokale-specialist");
    if (!definition) throw new Error("Content Factory publieke bron bevat geen lokale fallbackbranche");

    const branch = definition.content.branch;
    const companyMissing = !clean(input.companyName);
    const regionMissing = !clean(input.region);
    const companyName = clean(input.companyName) || "Uw bedrijf";
    const region = clean(input.region) || "Nederland";
    if (companyMissing) fallbacks.push({ field: "companyName", requested: "", resolved: companyName, reason: "missing_company_name" });
    if (regionMissing) fallbacks.push({ field: "region", requested: "", resolved: region, reason: "missing_region" });
    const profile = packageProfile(input.package, fallbacks);
    const seed = normalizeSeed(input.seed);
    const template = clean(input.template) || profile.template;
    const tone = clean(input.tone) || branch.tone_of_voice;
    const context = {
      BEDRIJFSNAAM: companyName,
      PLAATS: region,
      REGIO: region,
      TELEFOON: clean(input.phone) || "[TELEFOON]",
      EMAIL: clean(input.email) || "[EMAIL]"
    };
    const content = replaceTokens(definition.content, context);
    const assets = assetSelector(definition.assets, context, seed, content.branch.name, fallbackFlags);
    const hero = selectOne(content.hero_titles, seed, "hero");
    const services = selectMany(content.service_descriptions, profile.counts.services, seed, "services").map((service) => ({ ...service, name: sentenceCase(service.name) }));
    const usps = selectMany(content.usps.filter(isSafeDefaultUsp), profile.counts.usps, seed, "usps");
    const projects = makeProjects(selectMany(content.projects, profile.counts.projects, seed, "projects"));
    const faqs = selectMany(content.faq, profile.counts.faq, seed, "faq");
    const ctas = selectMany(content.cta, 4, seed, "ctas");
    const team = selectMany(content.team_profiles, profile.id === "premium" ? 4 : 2, seed, "team");
    const socialTopics = selectMany(content.social_post_topics, profile.counts.social, seed, "social");
    const blogTopics = selectMany(content.blog_topics, profile.counts.blogs, seed, "blogs");
    const reviews = makeReviews(selectMany(content.review_examples, profile.counts.reviews, seed, "reviews"), context);
    const heroAsset = assets.one("hero", "Hero");
    const serviceAssets = assets.many("services", services.length, "Services");
    const aboutAssets = [assets.one("about", "About", "about"), ...assets.many("team", Math.min(team.length, 2), "About")];
    const galleryAssets = assets.many("gallery", profile.counts.gallery, "Gallery");
    const socialAssets = assets.many("social", Math.min(profile.counts.social, 4), "Social");
    for (const assetFallback of fallbackFlags) {
      fallbacks.push({ field: assetFallback, requested: "asset_slot", resolved: "prompt_ready_placeholder", reason: "missing_asset" });
    }
    const keywordItems = selectMany(content.branch.seo_keywords, 25, seed, "seo-keywords");
    const keywords = keywordItems.map((item) => item.keyword);
    const primaryService = services[0]?.name || content.service_names[0]?.name || content.branch.name;
    const phoneMissing = !clean(input.phone);
    const emailMissing = !clean(input.email);
    const unresolvedTokens = JSON.stringify({ hero, services, faqs, ctas }).match(/\[[A-Z]+(?: \d+)?\]/g) || [];
    const placeholderFlags = {
      companyName: companyMissing,
      region: regionMissing,
      phone: phoneMissing,
      email: emailMissing,
      reviews: reviews.length > 0,
      assets: fallbackFlags.size > 0 || heroAsset.placeholder,
      missingAssetTypes: [...fallbackFlags].map((item) => item.replace(/^asset:/, "")),
      unresolvedTokens: [...new Set(unresolvedTokens)],
      requiresHumanReview: true
    };
    const metadata = {
      contractVersion: CONTENT_FACTORY_ADAPTER_CONTRACT,
      source: `@maxwebstudio/content-factory/public/v1`,
      sourceVersion: contentSource.version || CONTENT_LIBRARY_PUBLIC_VERSION,
      generatedAt: deterministicGeneratedAt(seed),
      contentVersion: content.content_version,
      verticalVersion: `${content.schema_version}:${content.content_version}`,
      requestedVertical,
      resolvedVertical: content.branch.slug,
      verticalFallbackUsed: requestedVertical !== content.branch.slug && slugify(requestedVertical) !== content.branch.slug,
      seed,
      template,
      package: profile.id,
      fallbacks,
      placeholderFlags,
      inputValidation
    };

    const result = {
      metadata,
      brand: {
        colors: content.brand.colors,
        fonts: content.brand.fonts,
        toneOfVoice: tone,
        sourceToneOfVoice: content.branch.tone_of_voice,
        icons: content.brand.icons,
        illustrations: content.brand.illustrations,
        logoPlaceholders: content.brand.logo_placeholders,
        videoPlaceholders: content.brand.video_placeholders
      },
      hero: {
        title: hero.title,
        subtitle: hero.subtitle,
        eyebrow: hero.eyebrow,
        primaryCta: hero.primary_cta,
        secondaryCta: hero.secondary_cta,
        asset: heroAsset,
        imagePrompt: heroAsset.imagePrompt
      },
      services: services.map((service, index) => ({ ...service, asset: serviceAssets[index] || assetPlaceholder("services", "service_asset_unavailable", content.branch.name, "Services", index) })),
      about: {
        title: `Over ${companyName}`,
        description: `${companyName} is actief als ${content.branch.name.toLowerCase()} voor klanten in ${region}. ${content.branch.description}`,
        toneOfVoice: tone,
        team,
        assets: aboutAssets
      },
      usps,
      projects,
      projectPolicy: {
        publicationPolicy: "placeholder_only_requires_verified_replacement",
        safeFallbackText: "Projecten worden zichtbaar zodra de klant geverifieerde projectinformatie heeft aangeleverd."
      },
      reviews: {
        publicationPolicy: "placeholder_only_requires_verified_replacement",
        safeFallbackText: "Geverifieerde klantreviews worden toegevoegd zodra deze door de klant zijn aangeleverd en gecontroleerd.",
        items: reviews
      },
      faq: faqs,
      contactCta: {
        primary: ctas[0] || { label: "Neem contact op", supporting_text: "U ontvangt snel een heldere reactie." },
        secondary: ctas[1] || { label: "Bel direct", supporting_text: "Bespreek uw vraag met een specialist." },
        phone: clean(input.phone) || null,
        email: clean(input.email) || null
      },
      seo: {
        title: `${companyName} | ${content.branch.name} in ${region}`,
        description: `${companyName} helpt klanten in ${region} met ${primaryService.toLowerCase()}. Bekijk de mogelijkheden en vraag persoonlijk advies aan.`,
        keywords,
        local: {
          region,
          regionFallbackUsed: regionMissing,
          primaryKeyword: `${primaryService.toLowerCase()} ${region}`,
          landingPages: services.slice(0, 4).map((service) => ({
            slug: `${service.seo_slug}-${slugify(region)}`,
            title: `${service.name} in ${region}`,
            keyword: `${service.name.toLowerCase()} ${region}`
          })),
          structuredData: ["LocalBusiness", "Service", "FAQPage", "BreadcrumbList"]
        }
      },
      assets: {
        hero: heroAsset,
        services: serviceAssets,
        about: aboutAssets,
        gallery: galleryAssets,
        social: socialAssets
      },
      multichannel: {
        socialTopics,
        blogTopics,
        newsletter: {
          subject: `${primaryService}: praktische tips van ${companyName}`,
          preheader: `Ontdek wat belangrijk is bij ${primaryService.toLowerCase()} in ${region}.`,
          sections: [socialTopics[0], blogTopics[0]].filter(Boolean),
          cta: ctas[0] || null
        },
        googleBusinessProfile: {
          description: `${companyName} is een ${content.branch.name.toLowerCase()} voor ${region}. Persoonlijk advies, heldere afspraken en professionele uitvoering staan centraal.`,
          services: services.map((service) => ({ name: service.name, description: service.short_description })),
          posts: socialTopics.slice(0, 10).map((topic, index) => ({ type: index % 3 === 0 ? "offer" : "update", title: topic.topic, cta: ctas[index % Math.max(ctas.length, 1)]?.label || "Meer informatie" }))
        }
      },
      websiteFactoryInput: {
        businessName: companyName,
        phone: clean(input.phone),
        email: clean(input.email),
        websiteUrl: clean(input.websiteUrl),
        packageType: profile.id,
        template,
        services: services.map((service) => service.name),
        pages: profile.pages,
        ctas: ctas.slice(0, 3).map((cta) => cta.label),
        branding: {
          colors: [content.brand.colors.primary, content.brand.colors.secondary, content.brand.colors.ink].join(", "),
          primaryColor: content.brand.colors.primary,
          secondaryColor: content.brand.colors.surface,
          accentColor: content.brand.colors.secondary,
          fontPreference: `${content.brand.fonts.heading}, ${content.brand.fonts.body}`,
          lookAndFeel: tone,
          iconStyle: content.brand.icons.style
        },
        texts: {
          about: `${companyName} is actief als ${content.branch.name.toLowerCase()} voor klanten in ${region}.`,
          usps: usps.map((usp) => usp.title),
          faq: faqs,
          reviews: [],
          reviewPolicy: "verified_reviews_only"
        },
        seo: {
          keywords,
          serviceArea: region,
          audience: content.branch.audience,
          toneOfVoice: tone,
          title: `${companyName} | ${content.branch.name} in ${region}`,
          description: `${companyName} helpt klanten in ${region} met ${primaryService.toLowerCase()}.`
        },
        content: {
          hero: {
            title: hero.title,
            subtitle: hero.subtitle,
            eyebrow: hero.eyebrow,
            primaryCta: hero.primary_cta,
            secondaryCta: hero.secondary_cta
          },
          about: {
            title: `Over ${companyName}`,
            description: `${companyName} is actief als ${content.branch.name.toLowerCase()} voor klanten in ${region}.`
          },
          usps,
          projects: [],
          projectPolicy: "verified_projects_only",
          projectPlaceholderText: "Projecten worden zichtbaar zodra de klant geverifieerde projectinformatie heeft aangeleverd.",
          faq: faqs,
          assets: {
            hero: heroAsset,
            services: serviceAssets,
            about: aboutAssets,
            gallery: galleryAssets,
            social: socialAssets
          },
          multichannel: {
            socialTopics,
            blogTopics
          }
        },
        contentFactory: metadata
      }
    };
    const validation = outputValidation(result);
    if (!validation.valid) throw new Error(`Content Factory adapter produceerde ongeldige output: ${validation.errors.join("; ")}`);
    return result;
  };
}

export const resolveWebsiteContent = createWebsiteContentAdapterV1();
