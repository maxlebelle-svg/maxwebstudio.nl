import assert from "node:assert/strict";
import test from "node:test";
import { listContentLibraryDimensionsV2 } from "../public/v2/index.mjs";
import { composeContentLibraryBlueprint, composePhotographyPrompt } from "../src/composition.mjs";

test("v2 publiceert onafhankelijke dimensies zonder combinaties vooraf te materialiseren", () => {
  const dimensions = listContentLibraryDimensionsV2();
  assert.equal(dimensions.verticals.length, 101);
  assert.equal(dimensions.styles.length, 8);
  assert.equal(dimensions.brandPersonalities.length, 7);
  assert.equal(dimensions.contentBlocks.length, 14);
  assert.deepEqual(dimensions.themes, ["light", "dark"]);
  assert.ok(dimensions.channels.includes("website"));
  assert.ok(dimensions.channels.includes("social"));
});

test("dezelfde branche kan deterministisch verschillende merkcomposities krijgen", () => {
  const premiumFamily = composeContentLibraryBlueprint({ vertical: "loodgieter", style: "premium", brandPersonality: "familiebedrijf", theme: "light", channels: ["website", "social"], seed: 7 });
  const modernCorporate = composeContentLibraryBlueprint({ vertical: "loodgieter", style: "modern", brandPersonality: "corporate", theme: "dark", channels: ["website"], seed: 7 });
  assert.equal(premiumFamily.dimensions.visual_style.id, "premium-editorial");
  assert.equal(premiumFamily.dimensions.brand_personality.id, "familiebedrijf");
  assert.equal(modernCorporate.dimensions.visual_style.id, "modern-scherp");
  assert.notDeepEqual(modernCorporate.design_system, premiumFamily.design_system);
  assert.notEqual(modernCorporate.composition_signature, premiumFamily.composition_signature);
});

test("fotografieprompt ontstaat pas voor de aangevraagde combinatie en het slot", () => {
  const blueprint = composeContentLibraryBlueprint({ vertical: "restaurant", style: "modern", brandPersonality: "jong", channels: ["website", "social"] });
  const prompt = composePhotographyPrompt(blueprint, {
    slot: "team-01",
    subject: "keukenteam tijdens de voorbereiding",
    usage: "About teamfoto",
    aspectRatio: "4:5",
    resolution: { width: 1200, height: 1500 },
    focalPoint: "center"
  });
  assert.equal(prompt.combination.vertical, "restaurant");
  assert.equal(prompt.combination.style, "modern-scherp");
  assert.equal(prompt.combination.brand_personality, "jong");
  assert.match(prompt.personality_direction, /jong team/i);
  assert.match(prompt.negative_prompt, /geen tekst/);
  assert.equal(prompt.production.status, "planned");
});

test("kanaalselectie levert alleen relevante herbruikbare contentblokken", () => {
  const blueprint = composeContentLibraryBlueprint({ vertical: "holistisch", style: "warm", brandPersonality: "persoonlijk", channels: ["newsletter"] });
  assert.ok(blueprint.blocks.some((block) => block.id === "newsletter"));
  assert.ok(blueprint.blocks.some((block) => block.id === "cta"));
  assert.ok(!blueprint.blocks.some((block) => block.id === "footer"));
});

test("onbekende dimensies worden fail-closed geweigerd", () => {
  assert.throws(() => composeContentLibraryBlueprint({ vertical: "onbekend" }), /Onbekende branche/);
  assert.throws(() => composeContentLibraryBlueprint({ vertical: "loodgieter", style: "space-opera" }), /Onbekende stijl/);
  assert.throws(() => composeContentLibraryBlueprint({ vertical: "loodgieter", brandPersonality: "mysterieus" }), /Onbekende merkpersoonlijkheid/);
  assert.throws(() => composeContentLibraryBlueprint({ vertical: "loodgieter", channels: ["televisie"] }), /Onbekende kanalen/);
});

