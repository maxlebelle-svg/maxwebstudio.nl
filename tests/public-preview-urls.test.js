const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const slugApi = require("../functions/_public-preview");
const renderer = require("../functions/public-preview-render");
const publication = require("../functions/admin-preview-publication");
const actions = require("../public/admin/ui/website-factory-preview-actions");

const IDS = {
  customer: "11111111-1111-4111-8111-111111111111",
  version: "22222222-2222-4222-8222-222222222222",
};

const root = path.join(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const publicationSource = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260718110000_public_preview_slugs.sql"), "utf8");
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");

test("01 slugify zet accenten veilig om", () => assert.equal(slugApi.slugify("Héél je zélf"), "heel-je-zelf"));
test("02 slugify zet ampersand leesbaar om", () => assert.equal(slugApi.slugify("Henk & Carla"), "henk-en-carla"));
test("03 slugify verwijdert leestekens", () => assert.equal(slugApi.slugify("  Bouw! B.V.  "), "bouw-b-v"));
test("04 slugify klapt meerdere scheidingstekens in", () => assert.equal(slugApi.slugify("een___twee---drie"), "een-twee-drie"));
test("05 slugify begrenst de lengte", () => assert.ok(slugApi.slugify("a".repeat(100)).length <= 64));
test("06 geldige slug wordt geaccepteerd", () => assert.equal(slugApi.isValidPublicSlug("heeljezelf"), true));
test("07 hoofdletters worden geweigerd", () => assert.equal(slugApi.isValidPublicSlug("HeelJezelf"), false));
test("08 te korte slug wordt geweigerd", () => assert.equal(slugApi.isValidPublicSlug("ab"), false));
test("09 dubbele koppeltekens worden geweigerd", () => assert.equal(slugApi.isValidPublicSlug("heel--jezelf"), false));
test("10 gereserveerde slug wordt geweigerd", () => assert.equal(slugApi.isValidPublicSlug("admin"), false));
test("11 basis kandidaat blijft stabiel", () => assert.equal(slugApi.candidateSlug("heeljezelf", 0), "heeljezelf"));
test("12 botsingskandidaat krijgt leesbaar volgnummer", () => assert.equal(slugApi.candidateSlug("heeljezelf", 1), "heeljezelf-2"));
test("13 botsingskandidaat blijft maximaal 64 tekens", () => assert.ok(slugApi.candidateSlug("a".repeat(64), 38).length <= 64));
test("14 bedrijfsnaam heeft voorkeur voor de slug", () => assert.equal(slugApi.preferredSlug({ company: "Heel Je Zelf", name: "Carla" }), "heel-je-zelf"));
test("15 klantnaam is veilige fallback", () => assert.equal(slugApi.preferredSlug({ company: "", name: "Carla Coaching" }), "carla-coaching"));
test("16 primaire publieke URL is kort en tokenloos", () => assert.equal(slugApi.publicPreviewUrl("heeljezelf"), "https://preview.maxwebstudio.nl/heeljezelf"));
test("17 ongeldige publieke URL wordt niet gebouwd", () => assert.equal(slugApi.publicPreviewUrl("admin"), ""));
test("18 fallback-URL gebruikt de lokale route", () => assert.equal(slugApi.fallbackPreviewUrl("heeljezelf", "https://maxwebstudio.nl/admin"), "https://maxwebstudio.nl/preview/heeljezelf"));
test("19 fallback-URL weigert onbeveiligde externe origin", () => assert.equal(slugApi.fallbackPreviewUrl("heeljezelf", "http://evil.example"), ""));
test("20 resolver leest slug uit fallback-pad", () => assert.equal(slugApi.slugFromEvent({ path: "/preview/heeljezelf" }), "heeljezelf"));
test("21 resolver leest slug uit branded pad", () => assert.equal(slugApi.slugFromEvent({ path: "/heeljezelf" }), "heeljezelf"));
test("22 resolver decodeert een pad maar valideert daarna strikt", () => assert.equal(slugApi.slugFromEvent({ path: "/preview/heel%20jezelf" }), "heel jezelf"));

function baseCustomer(overrides = {}) {
  return {
    id: IDS.customer,
    metadata: { publishedPreviewVersionId: IDS.version },
    public_preview_slug: "heeljezelf",
    public_preview_enabled: true,
    public_preview_revoked_at: null,
    ...overrides,
  };
}

function baseVersion(overrides = {}) {
  return {
    id: IDS.version,
    customer_id: IDS.customer,
    title: "Heel jezelf",
    status: "approved",
    published_to_portal: true,
    generated_package: {
      entryFile: "index.html",
      files: [
        { path: "index.html", encoding: "utf8", content: '<!doctype html><link rel="stylesheet" href="assets/site.css"><img src="assets/hero.png"><a href="#contact">Contact</a><h1>Heel jezelf</h1>' },
        { path: "assets/site.css", encoding: "utf8", content: "body{background:url('../assets/hero.png')}" },
        { path: "assets/hero.png", encoding: "base64", content: "aGVsbG8=" },
      ],
    },
    ...overrides,
  };
}

async function renderWith({ customer = baseCustomer(), version = baseVersion(), event = {}, file = "" } = {}) {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: global.fetch,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    const table = new URL(url).pathname.split("/").pop();
    const body = table === "customers" ? (customer ? [customer] : []) : (version ? [version] : []);
    return { ok: true, status: 200, json: async () => body };
  };
  renderer._private.requestWindows.clear();
  try {
    const response = await renderer.handler({
      httpMethod: "GET",
      path: "/preview/heeljezelf",
      queryStringParameters: { slug: "heeljezelf", ...(file ? { file } : {}) },
      headers: { "x-forwarded-for": "203.0.113.10" },
      ...event,
    });
    return { response, calls };
  } finally {
    global.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
}

test("23 niet-GET verzoek wordt geweigerd", async () => {
  const { response } = await renderWith({ event: { httpMethod: "POST" } });
  assert.equal(response.statusCode, 405);
});

test("24 ongeldige slug stopt voor een databasequery", async () => {
  const { response, calls } = await renderWith({ event: { queryStringParameters: { slug: "../admin" } } });
  assert.equal(response.statusCode, 404);
  assert.equal(calls.length, 0);
});

test("25 onbekende slug geeft generieke 404", async () => {
  const { response } = await renderWith({ customer: null });
  assert.equal(response.statusCode, 404);
  assert.doesNotMatch(response.body, new RegExp(IDS.version));
});

test("26 ingetrokken slug geeft 410", async () => {
  const { response } = await renderWith({ customer: baseCustomer({ public_preview_enabled: false, public_preview_revoked_at: "2026-07-18T10:00:00Z" }) });
  assert.equal(response.statusCode, 410);
  assert.match(response.body, /Preview ingetrokken/);
});

test("27 ontbrekende publicatiepointer geeft 404", async () => {
  const { response } = await renderWith({ customer: baseCustomer({ metadata: {} }) });
  assert.equal(response.statusCode, 404);
});

test("28 ongeldige publicatiepointer geeft 404", async () => {
  const { response } = await renderWith({ customer: baseCustomer({ metadata: { publishedPreviewVersionId: "not-a-uuid" } }) });
  assert.equal(response.statusCode, 404);
});

test("29 ontbrekende doelversie geeft 404", async () => {
  const { response } = await renderWith({ version: null });
  assert.equal(response.statusCode, 404);
});

test("30 interne doelversie is niet publiek", async () => {
  const { response } = await renderWith({ version: baseVersion({ status: "internal" }) });
  assert.equal(response.statusCode, 404);
});

test("31 gearchiveerde doelversie is niet publiek", async () => {
  const { response } = await renderWith({ version: baseVersion({ status: "archived" }) });
  assert.equal(response.statusCode, 404);
});

test("32 HTML wordt zonder redirect gerenderd", async () => {
  const { response } = await renderWith();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.Location, undefined);
  assert.match(response.body, /Heel jezelf/);
});

test("33 HTML-assets blijven achter dezelfde korte route", async () => {
  const { response } = await renderWith();
  assert.match(response.body, /href="\?file=assets%2Fsite\.css"/);
  assert.match(response.body, /src="\?file=assets%2Fhero\.png"/);
  assert.match(response.body, /href="#contact"/);
});

test("34 CSS-assets blijven achter dezelfde korte route", async () => {
  const { response } = await renderWith({ file: "assets/site.css" });
  assert.equal(response.headers["Content-Type"], "text/css; charset=utf-8");
  assert.match(response.body, /\?file=assets%2Fhero\.png/);
});

test("35 binair asset blijft base64 response", async () => {
  const { response } = await renderWith({ file: "assets/hero.png" });
  assert.equal(response.isBase64Encoded, true);
  assert.equal(response.body, "aGVsbG8=");
});

test("36 padtraversal in fileparameter wordt geweigerd", async () => {
  const { response } = await renderWith({ file: "../../secret" });
  assert.equal(response.statusCode, 404);
});

test("37 publieke responses hebben noindex en no-store", async () => {
  const { response } = await renderWith();
  assert.match(response.headers["X-Robots-Tag"], /noindex/);
  assert.match(response.headers["Cache-Control"], /no-store/);
  assert.equal(response.headers["Referrer-Policy"], "no-referrer");
});

test("38 limiter blokkeert boven de lokale minuutgrens", () => {
  renderer._private.requestWindows.clear();
  const event = { headers: { "x-forwarded-for": "198.51.100.22" } };
  for (let index = 0; index < renderer._private.REQUEST_LIMIT; index += 1) assert.equal(renderer._private.allowRequest(event, 1000), true);
  assert.equal(renderer._private.allowRequest(event, 1000), false);
});

test("39 Factory-acties kiezen de korte URL voor de gepubliceerde versie", () => {
  const context = actions.actionContext({
    version: { id: IDS.version, sourceType: "manual_zip", previewUrl: `https://maxwebstudio.nl/.netlify/functions/manual-preview-render?version=${IDS.version}&token=secret&source=manual_zip&previewVersionId=${IDS.version}`, previewToken: "secret" },
    previewUrl: `https://maxwebstudio.nl/.netlify/functions/manual-preview-render?version=${IDS.version}&token=secret&source=manual_zip&previewVersionId=${IDS.version}`,
    customerId: IDS.customer,
    publishedPreviewVersionId: IDS.version,
    publicPreviewSlug: "heeljezelf",
    publicPreviewUrl: "https://preview.maxwebstudio.nl/heeljezelf",
  });
  assert.equal(context.shareUrl, "https://preview.maxwebstudio.nl/heeljezelf");
  assert.equal(context.usesPublicPreviewUrl, true);
  assert.doesNotMatch(context.shareUrl, /token|version/i);
});

test("40 Factory-acties weigeren een vervalste korte URL", () => {
  assert.equal(actions.safePublicPreviewUrl({ publicPreviewSlug: "heeljezelf", publicPreviewUrl: "https://evil.example/heeljezelf" }), "");
});

test("41 migratie legt unieke slug en intrekstatus vast zonder RLS open te zetten", () => {
  assert.match(migration, /unique index[\s\S]*lower\(public_preview_slug\)/i);
  assert.match(migration, /public_preview_revoked_at/);
  assert.doesNotMatch(migration, /create policy|disable row level security/i);
});

test("42 fallback route rendert intern en redirect niet", () => {
  assert.match(netlify, /from = "\/preview\/:slug"[\s\S]*public-preview-render\?slug=:slug[\s\S]*status = 200/);
  assert.doesNotMatch(netlify, /from = "\/preview\/:slug"[\s\S]{0,180}status = 30[1278]/);
});

test("43 publicatie-API ondersteunt wijzigen en intrekken", () => {
  assert.match(publicationSource, /set_public_preview_slug/);
  assert.match(publicationSource, /revoke_public_preview/);
  assert.match(publicationSource, /persistPublicPreviewPointer/);
});

test("44 Factory-UI toont de korte link en alle deelacties", () => {
  assert.match(adminHtml, /Publieke previewlink/);
  assert.match(adminHtml, /Link kopiëren/);
  assert.match(adminHtml, /WhatsApp/);
  assert.match(adminHtml, /Slug wijzigen/);
  assert.match(adminHtml, /Delen intrekken/);
});

async function withPublicationStore(customer, callback, collisions = new Set()) {
  const previousFetch = global.fetch;
  const stored = JSON.parse(JSON.stringify(customer));
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || "GET";
    if (method === "PATCH") {
      Object.assign(stored, JSON.parse(options.body || "{}"));
      return { ok: true, status: 200, text: async () => JSON.stringify([stored]) };
    }
    const slugFilter = String(parsed.searchParams.get("public_preview_slug") || "").replace(/^eq\./, "");
    if (slugFilter && collisions.has(slugFilter) && slugFilter !== stored.public_preview_slug) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "33333333-3333-4333-8333-333333333333" }]) };
    }
    if (slugFilter) {
      const rows = stored.public_preview_slug === slugFilter ? [{ id: stored.id }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify([stored]) };
  };
  try {
    return await callback(stored);
  } finally {
    global.fetch = previousFetch;
  }
}

const publicationContext = { available: true, supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: {} };

test("45 eerste publicatie reserveert een slug uit de bedrijfsnaam", { concurrency: false }, async () => {
  const customer = { id: IDS.customer, company: "Heel Jezelf", name: "Carla", metadata: {} };
  await withPublicationStore(customer, async () => {
    const updated = await publication._private.persistPublicPreviewPointer(publicationContext, customer, IDS.version, "2026-07-18T10:00:00Z");
    assert.equal(updated.public_preview_slug, "heel-jezelf");
    assert.equal(updated.public_preview_enabled, true);
  });
});

test("46 opnieuw publiceren hergebruikt exact dezelfde slug", { concurrency: false }, async () => {
  const customer = { id: IDS.customer, company: "Nieuwe bedrijfsnaam", metadata: { publishedPreviewVersionId: IDS.version }, public_preview_slug: "heel-jezelf", public_preview_enabled: true, public_preview_created_at: "2026-07-17T10:00:00Z" };
  await withPublicationStore(customer, async () => {
    const updated = await publication._private.persistPublicPreviewPointer(publicationContext, customer, "44444444-4444-4444-8444-444444444444", "2026-07-18T10:00:00Z");
    assert.equal(updated.public_preview_slug, "heel-jezelf");
    assert.equal(updated.metadata.publishedPreviewVersionId, "44444444-4444-4444-8444-444444444444");
    assert.equal(updated.public_preview_created_at, "2026-07-17T10:00:00Z");
  });
});

test("47 slugbotsing krijgt server-side een uniek volgnummer", { concurrency: false }, async () => {
  const customer = { id: IDS.customer, company: "Heel Jezelf", metadata: {} };
  await withPublicationStore(customer, async () => {
    const updated = await publication._private.persistPublicPreviewPointer(publicationContext, customer, IDS.version, "2026-07-18T10:00:00Z");
    assert.equal(updated.public_preview_slug, "heel-jezelf-2");
  }, new Set(["heel-jezelf"]));
});

test("48 publieke URL blijft gelijk wanneer de doelversie beweegt", { concurrency: false }, async () => {
  const customer = { id: IDS.customer, company: "Heel Jezelf", metadata: { publishedPreviewVersionId: IDS.version }, public_preview_slug: "heel-jezelf", public_preview_enabled: true };
  await withPublicationStore(customer, async () => {
    const before = publication._private.publicPreviewDetails(customer).publicPreviewUrl;
    const updated = await publication._private.persistPublicPreviewPointer(publicationContext, customer, "55555555-5555-4555-8555-555555555555", "2026-07-18T11:00:00Z");
    const after = publication._private.publicPreviewDetails(updated).publicPreviewUrl;
    assert.equal(after, before);
    assert.equal(updated.metadata.publishedPreviewVersionId, "55555555-5555-4555-8555-555555555555");
  });
});

test("49 ingetrokken deelstatus presenteert geen actieve URL", () => {
  const details = publication._private.publicPreviewDetails({ public_preview_slug: "heeljezelf", public_preview_enabled: false, public_preview_revoked_at: "2026-07-18T12:00:00Z" });
  assert.equal(details.publicPreviewEnabled, false);
  assert.equal(details.publicPreviewUrl, "");
  assert.equal(details.publicPreviewSlug, "heeljezelf");
});

test("50 handmatige slugwijziging weigert gereserveerde namen voor databasewerk", { concurrency: false }, async () => {
  await assert.rejects(
    () => publication._private.setPublicPreviewSlug(publicationContext, { customerId: IDS.customer, slug: "admin" }),
    (error) => error.code === "PUBLIC_PREVIEW_SLUG_INVALID" && error.status === 400
  );
});

test("51 intrekken bewaart de publicatiepointer", { concurrency: false }, async () => {
  const customer = { id: IDS.customer, metadata: { publishedPreviewVersionId: IDS.version }, public_preview_slug: "heeljezelf", public_preview_enabled: true };
  await withPublicationStore(customer, async (stored) => {
    const result = await publication._private.revokePublicPreview(publicationContext, { customerId: IDS.customer });
    assert.equal(result.statusCode, 200);
    assert.equal(stored.public_preview_enabled, false);
    assert.equal(stored.metadata.publishedPreviewVersionId, IDS.version);
  });
});
