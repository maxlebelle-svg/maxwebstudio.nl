import fs from "node:fs";
import path from "node:path";
import { paths } from "./compiler.mjs";

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function replacePlaceholders(value, context) {
  if (typeof value === "string") {
    return value.replace(/\[([A-Z]+)(?: \d+)?\]/g, (match, key) => context[key.toLowerCase()] || match);
  }
  if (Array.isArray(value)) return value.map((item) => replacePlaceholders(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, context)]));
  return value;
}

function select(items, count, offset = 0) {
  return Array.from({ length: Math.min(count, items.length) }, (_, index) => items[(index + offset) % items.length]);
}

export function loadBranch(slug) {
  const { generatedRoot } = paths();
  const contentPath = path.join(generatedRoot, "branches", slug, "content.json");
  const assetsPath = path.join(generatedRoot, "branches", slug, "asset-manifest.json");
  if (!fs.existsSync(contentPath)) throw new Error(`Onbekende branche '${slug}'. Bekijk generated/catalog.json voor geldige slugs.`);
  return { content: readJson(contentPath), assets: readJson(assetsPath) };
}

export function generateContentPackage({ branch, businessName, place, region = place, phone = "[TELEFOON]", email = "[EMAIL]", seed = 0 }) {
  const { content, assets } = loadBranch(branch);
  const context = { bedrijfsnaam: businessName, plaats: place, regio: region, telefoon: phone, email };
  const resolved = replacePlaceholders(content, context);
  const hero = resolved.hero_titles[seed % resolved.hero_titles.length];
  const services = select(resolved.service_descriptions, 6, seed);
  const ctas = select(resolved.cta, 6, seed);
  const usps = select(resolved.usps, 6, seed);
  const faq = select(resolved.faq, 12, seed);
  const reviews = select(resolved.review_examples, 6, seed);
  const projects = select(resolved.projects, 6, seed);
  const team = select(resolved.team_profiles, 4, seed);
  const blogs = select(resolved.blog_topics, 12, seed);
  const social = select(resolved.social_post_topics, 30, seed);
  const asset = (type, index = 0) => replacePlaceholders(assets.slots.filter((item) => item.type === type)[index] || null, context);
  const now = new Date().toISOString();

  return {
    manifest: {
      engine_version: "1.0.0",
      content_version: resolved.content_version,
      generated_at: now,
      branch: resolved.branch.slug,
      business: { name: businessName, place, region, phone, email },
      channels: ["homepage", "services", "about", "contact", "faq", "blogs", "seo", "social_media", "newsletter", "google_business_profile"]
    },
    homepage: {
      seo: { title: `${businessName} | ${resolved.branch.name} in ${place}`, description: `${businessName} helpt met ${services[0].name.toLowerCase()} in ${place}. Bekijk diensten, projecten en ervaringen of vraag direct advies aan.` },
      hero: { ...hero, image: asset("hero", seed % 4) },
      services,
      usps,
      projects: select(projects, 3),
      reviews: select(reviews, 3),
      faq: select(faq, 6),
      cta: ctas[0]
    },
    services: services.map((service, index) => ({ ...service, hero_asset: asset("services", index % 4), faq: faq.filter((item) => item.related_service_id === service.id).slice(0, 5), cta: ctas[index % ctas.length] })),
    about: {
      title: `Over ${businessName}`,
      introduction: `${businessName} is een ${resolved.branch.name.toLowerCase()} in ${place}, met een persoonlijke aanpak en duidelijke afspraken.`,
      values: select(usps, 4), team, images: [asset("team", 0), asset("team", 1), asset("atmosphere", 0)]
    },
    contact: {
      title: `Neem contact op met ${businessName}`,
      intro: `Vertel kort waar u hulp bij zoekt. U ontvangt snel een heldere reactie van ons team in ${place}.`,
      details: { phone, email, place, region }, ctas: select(ctas, 3), form_fields: ["naam", "email", "telefoon", "dienst", "bericht", "toestemming"]
    },
    faq,
    blogs,
    seo: {
      keywords: resolved.branch.seo_keywords,
      local_pages: select(services, 6).map((service) => ({ slug: `${service.seo_slug}-${place.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title: `${service.name} in ${place}`, primary_keyword: `${service.name.toLowerCase()} ${place}` })),
      structured_data: ["LocalBusiness", "Service", "FAQPage", "BreadcrumbList", "Review"]
    },
    social_media: social,
    newsletter: {
      subject: `${titleCase(services[0].name)}: praktische tips van ${businessName}`,
      preheader: `Ontdek wat slim is voordat u begint met ${services[0].name.toLowerCase()}.`,
      sections: [social[0], social[1], { title: "Klantvraag van de maand", body: faq[0] }],
      cta: ctas[0]
    },
    google_business_profile: {
      business_description: `${businessName} is gespecialiseerd in ${resolved.branch.description.toLowerCase()} Vanuit ${place} helpen we klanten met persoonlijk advies, heldere afspraken en professionele uitvoering.`,
      services: services.map((service) => ({ name: service.name, description: service.short_description })),
      posts: select(social, 10).map((post, index) => ({ type: index % 3 === 0 ? "offer" : "update", title: post.topic, body_direction: post.caption_direction, cta: ctas[index % ctas.length].label }))
    },
    assets: { manifest_path: `generated/branches/${branch}/asset-manifest.json`, selected: [asset("hero", seed % 4), ...services.map((_, index) => asset("services", index % 4)), asset("cta", 0)] }
  };
}

export function writeContentPackage(options, outputDirectory) {
  const generated = generateContentPackage(options);
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [channel, payload] of Object.entries(generated)) {
    fs.writeFileSync(path.join(outputDirectory, `${channel}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  }
  return generated;
}
