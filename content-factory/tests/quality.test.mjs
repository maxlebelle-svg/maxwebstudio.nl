import assert from "node:assert/strict";
import test from "node:test";
import { composeContentLibraryBlueprint } from "../src/composition.mjs";
import { assessBlueprintQuality } from "../src/quality.mjs";

test("quality score is uitlegbaar en verzint geen AI-confidence", () => {
  const blueprint = composeContentLibraryBlueprint({
    vertical: "installateur", specialization: "thuisbatterijen", style: "premium", brandPersonality: "innovatief",
    theme: "dark", goal: "leadgeneratie", region: "Utrecht", locale: "nl-NL", channels: ["website", "social"]
  });
  const quality = assessBlueprintQuality(blueprint);
  assert.ok(quality.overall >= 90);
  assert.equal(quality.ai_confidence.score, null);
  assert.equal(quality.ai_confidence.status, "not_measured");
  assert.equal(quality.publication_ready, false);
  assert.ok(quality.metrics.every((metric) => metric.checks.length > 0));
});

test("ontbrekende specialisatie en regio verlagen alleen de specificiteit", () => {
  const quality = assessBlueprintQuality(composeContentLibraryBlueprint({ vertical: "installateur" }));
  const specificity = quality.metrics.find((metric) => metric.id === "specificity");
  const completeness = quality.metrics.find((metric) => metric.id === "completeness");
  assert.ok(specificity.score < 100);
  assert.equal(completeness.score, 100);
});
