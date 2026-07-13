import { SocialStudioAIAdapter, normalizeAIOutput, validateAIOutput } from "./ai-contracts.mjs";
import { summarizeAIRequestContext } from "./ai-prompt-builder.mjs";

const platformNotes = {
  instagram: ["Open sterk in de eerste regel.", "Gebruik witruimte en maximaal 8 relevante hashtags."],
  facebook: ["Houd de opening lokaal en herkenbaar.", "Eindig met één laagdrempelige vraag of actie."],
  linkedin: ["Maak het inzicht zakelijk, maar menselijk.", "Beperk hashtags tot 3-5 relevante termen."],
  google: ["Noem dienst en regio concreet.", "Vermijd hashtags; stuur naar bellen, route of website."],
  story: ["Gebruik één boodschap per frame.", "Plaats de CTA op het laatste frame."],
  reel: ["Zet de hook in de eerste twee seconden.", "Werk met korte scènes en tekst in beeld."],
  carousel: ["Eén inzicht per slide.", "Laat de laatste slide samenvatten en activeren."],
};

function clean(value) { return String(value || "").trim(); }
function slug(value) { return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 24); }

function claimWarnings(request) {
  const text = request.facts.join(" ");
  const warnings = [];
  if (/garandeer|altijd|nooit|beste|nummer\s*1/i.test(text)) warnings.push("Controleer de absolute of superlatieve claim voordat je publiceert.");
  if (/\b\d+\s*%/.test(text)) warnings.push("Controleer of het genoemde percentage met een betrouwbare bron kan worden onderbouwd.");
  if (!request.facts.length) warnings.push("Er zijn geen geverifieerde feiten meegegeven; houd resultaten en claims algemeen.");
  return warnings;
}

export class LocalMockSocialStudioAIAdapter extends SocialStudioAIAdapter {
  constructor() { super({ id: "local-structured-mock", mode: "local-preview" }); }
  isAvailable() { return true; }
  async generate(request, options = {}) {
    const topic = clean(request.topic);
    const brand = request.brandVoice?.brandName || request.relationshipContext?.brand?.brandName || "jouw merk";
    const audience = clean(request.audience) || "ondernemers";
    const variation = Number(options.variation || 0);
    const hooks = [
      `${topic}: dit is wat ${audience} vaak over het hoofd zien`,
      `Wat verandert er als je ${topic.toLowerCase()} écht helder maakt?`,
      variation % 2 ? `Een nuchtere kijk op ${topic.toLowerCase()}` : `Stop met moeilijk doen over ${topic.toLowerCase()}`,
    ];
    const cta = request.desiredCta || request.brandVoice?.standardCtas?.[0] || "Ontdek wat er mogelijk is";
    const hashtags = request.platform === "google" ? [] : [slug(topic), slug(request.contentPillar), slug(brand)].filter(Boolean).map((item) => `#${item}`);
    const caption = `${hooks[variation % hooks.length]}\n\n${topic} hoeft niet ingewikkeld te zijn. Begin bij wat ${audience} nodig hebben, maak de waarde concreet en kies één duidelijke vervolgstap. ${brand} helpt om die stap professioneel en begrijpelijk te maken.\n\n${cta}.`;
    const output = normalizeAIOutput({
      requestId: request.requestId,
      generator: this.id,
      mode: this.mode,
      mainIdea: `Maak ${topic.toLowerCase()} concreet vanuit één herkenbaar probleem en één haalbare vervolgstap.`,
      hookVariants: hooks,
      caption,
      cta,
      hashtags,
      imagePrompt: `Premium editorial visual over ${topic.toLowerCase()}, passend bij ${brand}, ${request.brandVoice?.visualDirection || "rustige professionele stijl"}, authentiek licht, geen generieke stockfoto`,
      visualDirection: `Eén duidelijk onderwerp, veel rust, merkaccenten uit de beschikbare branding en voldoende ruimte voor een korte hook.`,
      reelScript: ["0-2 sec: scherpe hook in beeld", `2-7 sec: herkenbaar probleem rond ${topic}`, "7-14 sec: praktische oplossing", `14-18 sec: ${cta}`],
      storyStructure: [`Frame 1: ${hooks[0]}`, `Frame 2: waarom ${topic.toLowerCase()} ertoe doet`, "Frame 3: één praktische tip", `Frame 4: ${cta}`],
      carouselStructure: [`Slide 1: ${hooks[1]}`, "Slide 2: herkenbare startsituatie", "Slide 3: veelgemaakte fout", "Slide 4: betere aanpak", "Slide 5: praktisch voorbeeld", `Slide 6: ${cta}`],
      altText: `Professionele merkvisual over ${topic.toLowerCase()} voor ${brand}.`,
      platformNotes: platformNotes[request.platform] || platformNotes.instagram,
      claimWarnings: claimWarnings(request),
      brandContextSummary: summarizeAIRequestContext(request),
    }, request);
    const validation = validateAIOutput(output, request);
    if (!validation.valid) throw Object.assign(new Error("Lokale AI-preview leverde onvolledige output."), { validation });
    return validation.output;
  }
}
