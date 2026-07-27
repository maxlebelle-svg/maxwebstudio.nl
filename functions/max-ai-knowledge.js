const KNOWLEDGE_VERSION = "maxwebstudio-public-facts-2026-07-27";

const FACTS = [
  "Max Webstudio maakt websites voor ondernemers.",
  "Starter Site kost €495 exclusief btw.",
  "Business Website kost €995 exclusief btw.",
  "Premium Growth kost €1.750 exclusief btw.",
  "Hosting en onderhoud zijn beschikbaar vanaf €19,95 per maand.",
  "Een eenvoudige website kan gemiddeld binnen 5 werkdagen live, afhankelijk van snelle aanlevering en feedback.",
  "Een preview of eerste demo is vrijblijvend; een definitieve prijs of planning wordt door een medewerker bevestigd.",
  "Het zakelijke WhatsApp-nummer van Max Webstudio is 085 130 2326.",
];

function renderKnowledge() {
  return FACTS.map((fact, index) => `${index + 1}. ${fact}`).join("\n");
}

module.exports = { KNOWLEDGE_VERSION, FACTS, renderKnowledge };
