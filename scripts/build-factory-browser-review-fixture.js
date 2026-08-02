"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { buildWebsitePackage, runQualityCheck } = require("../functions/_website-factory-core");

const outputDirectory = path.resolve(process.argv[2] || "");
if (!process.argv[2] || outputDirectory === path.parse(outputDirectory).root) {
  throw new Error("Geef een veilige, expliciete outputmap op.");
}
if (!fs.existsSync(outputDirectory) || fs.readdirSync(outputDirectory).length > 0) {
  throw new Error("De outputmap moet bestaan en leeg zijn.");
}

const generatedPackage = buildWebsitePackage({
  journey: {
    websiteBrief: {
      schemaVersion: "mws.website-brief.v1",
      source: { kind: "browser_review_fixture" },
      identity: { businessName: "Studio Morgen", contactName: "Mila" },
      business: {
        industry: "Schoonheidssalon",
        audience: "Klanten die deskundige huidverzorging zoeken",
        region: "Utrecht",
        services: ["Huidanalyse", "Gezichtsbehandeling", "Huidadvies"],
        uniqueValue: "Persoonlijke behandelplannen met rustige, duidelijke begeleiding",
        goals: ["Meer passende afspraken"],
        toneOfVoice: "Warm, deskundig en helder",
      },
      brand: {
        desiredStyle: "Licht, verfijnd en rustig",
        colors: { ink: "#241b22", brand: "#765667", accent: "#d3a98f", soft: "#fbf6f5", dark: "#30232b" },
      },
      site: { primaryCta: "Plan een huidanalyse", packageType: "starter" },
      seo: { keywords: ["huidanalyse Utrecht", "gezichtsbehandeling Utrecht"], serviceArea: "Utrecht" },
      contact: { email: "info@studiomorgen.example", phone: "030-1234567" },
    },
  },
  version: 1,
});

for (const file of generatedPackage.files) {
  const relativePath = String(file.path || "").replace(/^\/+/, "");
  const target = path.resolve(outputDirectory, relativePath);
  if (!relativePath || !target.startsWith(`${outputDirectory}${path.sep}`)) throw new Error(`Onveilig pakketpad: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.encoding === "base64" ? Buffer.from(file.content, "base64") : String(file.content || ""));
}

const artifactHash = crypto.createHash("sha256").update(JSON.stringify(
  generatedPackage.files.map((file) => [file.path, file.encoding || "utf8", file.content]),
)).digest("hex");
const qualityReport = runQualityCheck({ generatedPackage, journey: { businessName: generatedPackage.businessName } });

process.stdout.write(`${JSON.stringify({
  outputDirectory,
  artifactHash,
  fileCount: generatedPackage.files.length,
  staticQuality: {
    version: qualityReport.version,
    score: qualityReport.score,
    passed: qualityReport.passed,
    readiness: qualityReport.readiness,
  },
})}\n`);
