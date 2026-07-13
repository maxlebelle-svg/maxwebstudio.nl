const CATEGORIES = Object.freeze(["general", "text", "image", "design", "technical", "multiple"]);

function classifyFeedback(input = {}) {
  const count = boundedCount(input.feedbackPointCount);
  if (count > 1) return { key: "multiple", label: "Meerdere wijzigingen", count };
  const value = normalize([input.category, input.page, input.section].join(" "));
  if (/tekst|copy|inhoud|spelling|zin|woord/.test(value)) return { key: "text", label: "Tekstwijziging", count };
  if (/foto|beeld|image|logo|video/.test(value)) return { key: "image", label: "Beeldwijziging", count };
  if (/ontwerp|design|layout|kleur|stijl|opmaak/.test(value)) return { key: "design", label: "Ontwerpwijziging", count };
  if (/techn|fout|bug|link|formulier|mobiel|responsive/.test(value)) return { key: "technical", label: "Technische opmerking", count };
  return { key: "general", label: "Algemene feedback", count };
}

function boundedCount(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? Math.min(number, 100) : 1; }
function normalize(value) { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 360); }

module.exports = { CATEGORIES, classifyFeedback };
