const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { HOLISTIC_ASSET_CATALOG } = require("../functions/_demo-image-assets");
const { buildWebsitePackage } = require("../functions/_website-factory-core");
const { buildIndustryProfile } = require("../functions/industry-intelligence");
const {
  createImageSelectionSession,
  selectPhotoAssetsForSlots,
} = require("../functions/industry-intelligence/photo-selection-policy");

const root = path.join(__dirname, "..");

function holisticProfile() {
  return buildIndustryProfile({
    explicitIndustry: "Energetisch",
    businessDescription: "Holistische coaching, energetische behandeling, mindfulness en persoonlijke begeleiding",
    services: ["Advies", "Behandeling", "Ontspanning", "Energetisch", "Begeleiding"],
  });
}

function candidate(id, checksum, tags, groupSlug = "holistisch") {
  return {
    assetId: id,
    checksum,
    src: `/assets/demo-images/library/${groupSlug}/${id}.png`,
    groupSlug,
    tags,
    aspectRatio: "16:9",
    imageType: "photo",
    visualSuitability: 1,
  };
}

test("holistic content library exposes ten suitable files with ten unique checksums", () => {
  assert.equal(HOLISTIC_ASSET_CATALOG.length, 10);
  assert.equal(new Set(HOLISTIC_ASSET_CATALOG.map((asset) => asset.checksum)).size, 10);
  for (const asset of HOLISTIC_ASSET_CATALOG) {
    const file = path.join(root, "public", asset.src.replace(/^\/assets\//, "assets/"));
    const checksum = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(checksum, asset.checksum, asset.src);
  }
});

test("hero and generated service cards do not all use the same asset", () => {
  const generated = buildWebsitePackage({
    journey: { businessName: "Heel je Zelf", packageType: "starter" },
    briefing: "Branche: Energetisch\nDiensten: Advies, Energetische behandeling, Ontspanning, Energetisch werk, Persoonlijke begeleiding\nDoel: Maak een website die vertrouwen opbouwt.",
    version: 1,
  });
  const html = generated.files.find((file) => file.path === "index.html").content;
  const hero = html.match(/<section class="hero"[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];
  const services = [...html.matchAll(/class="project-tile service-card"[\s\S]*?<img src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hero);
  assert.ok(services.length >= 3);
  assert.ok(new Set([hero, ...services]).size >= 4);
  assert.ok(services.some((src) => src !== hero));
});

test("five suitable unique assets produce five unique service selections", () => {
  const selected = selectPhotoAssetsForSlots(holisticProfile(), HOLISTIC_ASSET_CATALOG.slice(0, 5), ["service_1", "service_2", "service_3", "service_4", "service_5"]);
  assert.equal(selected.selections.length, 5);
  assert.equal(new Set(selected.selections.map((item) => item.selectedAssetId)).size, 5);
  assert.equal(new Set(selected.selections.map((item) => item.checksum)).size, 5);
});

test("duplicate checksum is avoided even when asset ids and filenames differ", () => {
  const candidates = [
    candidate("intake-a", "same-bytes", ["holistic", "conversation", "coaching"]),
    candidate("intake-copy", "same-bytes", ["holistic", "conversation", "coaching"]),
    candidate("meditation", "unique-bytes", ["holistic", "meditation", "mindfulness"]),
  ];
  const selected = selectPhotoAssetsForSlots(holisticProfile(), candidates, ["service_1", "service_3"]);
  assert.equal(new Set(selected.selections.map((item) => item.checksum)).size, 2);
  assert.equal(selected.selections[1].duplicateAvoided, true);
});

test("hero is not copied as the default for every service", () => {
  const selected = selectPhotoAssetsForSlots(holisticProfile(), HOLISTIC_ASSET_CATALOG, ["hero", "service_1", "service_2", "service_3", "service_4", "service_5"]);
  const heroId = selected.slots.hero.selectedAssetId;
  assert.ok(Object.values(selected.slots).slice(1).every((item) => item.selectedAssetId !== heroId));
});

test("slot tags change which otherwise valid candidate is selected", () => {
  const candidates = [
    candidate("conversation", "conversation", ["holistic", "conversation", "consultation", "guidance"]),
    candidate("meditation", "meditation", ["holistic", "meditation", "mindfulness", "relaxation", "nature"]),
  ];
  assert.equal(createImageSelectionSession(holisticProfile(), candidates).select("service_1").selectedAssetId, "conversation");
  assert.equal(createImageSelectionSession(holisticProfile(), candidates).select("service_3").selectedAssetId, "meditation");
});

test("holistic selection stays within holistic, wellness or coaching candidates", () => {
  const selected = selectPhotoAssetsForSlots(holisticProfile(), HOLISTIC_ASSET_CATALOG);
  assert.ok(selected.selections.every((item) => item.groupSlug === "holistisch"));
});

test("construction candidates are forbidden and never become a holistic fallback", () => {
  const niche = candidate("calm", "calm", ["holistic", "calm"]);
  const construction = candidate("build", "build", ["construction", "tools", "renovation"], "bouwbedrijf");
  const selected = selectPhotoAssetsForSlots(holisticProfile(), [niche, construction], ["hero", "service_1"]);
  assert.deepEqual(selected.selections.map((item) => item.selectedAssetId), ["calm", "calm"]);
  assert.equal(selected.selections[1].fallbackReason, "insufficient_unique_assets");
});

test("neutral wellness is selected before a same-niche asset is reused", () => {
  const niche = candidate("holistic-calm", "holistic-calm", ["holistic", "calm"]);
  const neutral = candidate("neutral-wellness", "neutral-wellness", ["wellness", "coaching", "calm"], "wellness-neutral");
  const selected = selectPhotoAssetsForSlots(holisticProfile(), [niche, neutral], ["hero", "service_1", "service_2"]);
  assert.deepEqual(selected.selections.map((item) => item.selectedAssetId), ["holistic-calm", "neutral-wellness", "holistic-calm"]);
  assert.equal(selected.selections[1].fallbackReason, "neutral_wellness_fallback");
  assert.equal(selected.selections[2].fallbackReason, "insufficient_unique_assets");
});

test("two assets trigger controlled and logged reuse only after both are used", () => {
  const candidates = [
    candidate("coaching", "coaching", ["holistic", "coaching", "conversation"]),
    candidate("wellness", "wellness", ["holistic", "wellness", "calm"]),
  ];
  const selected = selectPhotoAssetsForSlots(holisticProfile(), candidates, ["service_1", "service_2", "service_3"]);
  assert.deepEqual(selected.selections.map((item) => item.reusedAsset), [false, false, true]);
  assert.equal(selected.selections[2].fallbackReason, "insufficient_unique_assets");
  assert.equal(selected.fallbackCount, 1);
});

test("selection is deterministic for identical profile, catalog and slots", () => {
  const first = selectPhotoAssetsForSlots(holisticProfile(), HOLISTIC_ASSET_CATALOG);
  const second = selectPhotoAssetsForSlots(holisticProfile(), HOLISTIC_ASSET_CATALOG);
  assert.deepEqual(first, second);
});
