import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildLibrary, compileVertical, loadRequirements, paths } from "../src/compiler.mjs";
import { validateLibrary } from "../src/validator.mjs";
import { CATEGORY_PROFILES, VERTICALS } from "../src/verticals.mjs";

test("catalogus heeft unieke branches en geldige categorieën", () => {
  assert.equal(VERTICALS.length, 101);
  assert.equal(new Set(VERTICALS.map((item) => item.slug)).size, VERTICALS.length);
  for (const vertical of VERTICALS) assert.ok(CATEGORY_PROFILES[vertical.category], `${vertical.slug} gebruikt een onbekende categorie`);
});

test("iedere gecompileerde branche haalt alle minimumaantallen", () => {
  const requirements = loadRequirements().minimums;
  for (const vertical of VERTICALS) {
    const item = compileVertical(vertical);
    assert.ok(item.hero_titles.length >= requirements.hero_variants);
    assert.ok(item.branch.seo_keywords.length >= requirements.seo_keywords);
    assert.ok(item.faq.length >= requirements.faq);
    assert.ok(item.review_examples.length >= requirements.reviews);
    assert.ok(item.social_post_topics.length >= requirements.social_post_ideas);
    assert.ok(item.blog_topics.length >= requirements.blog_topics);
    assert.ok(item.cta.length >= requirements.calls_to_action);
    assert.ok(item.usps.length >= requirements.usps);
    assert.ok(item.projects.length >= requirements.project_descriptions);
    assert.ok(item.team_profiles.length >= requirements.team_profiles);
    assert.ok(item.assets.slots.length >= requirements.asset_slots);
    assert.equal(item.image_prompt_library.length, item.assets.slots.length);
  }
});

test("build is valideerbaar en maakt de uniforme structuur", () => {
  buildLibrary();
  const result = validateLibrary();
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(result.stats.branches, VERTICALS.length);
  assert.ok(result.stats.content_items > 50_000);
  for (const slug of ["loodgieter", "restaurant", "tandarts", "graafmachineverhuur"]) {
    assert.ok(fs.existsSync(path.join(paths().libraryRoot, slug, "hero", "README.md")));
    assert.ok(fs.existsSync(path.join(paths().generatedRoot, "branches", slug, "asset-manifest.json")));
  }
});

test("gegenereerde centrale bibliotheek is reproduceerbaar", () => {
  buildLibrary();
  const catalogPath = path.join(paths().generatedRoot, "catalog.json");
  const first = fs.readFileSync(catalogPath, "utf8");
  buildLibrary();
  const second = fs.readFileSync(catalogPath, "utf8");
  assert.equal(second, first);
});
