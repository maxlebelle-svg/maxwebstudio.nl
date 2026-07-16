"use strict";

const { deepFreeze } = require("./schema");

const BUILD_TAGS = ["construction", "carpenter", "tools", "timber", "windows", "renovation", "solar", "plumbing", "bathroom", "industrial"];
const WELLNESS_TAGS = ["holistic", "wellness", "mindfulness", "meditation", "coaching", "nature", "calm", "treatment-room", "balance", "personal-growth"];

function profile(id, input) {
  return {
    id,
    industry: input.industry || id,
    subcategory: input.subcategory || id,
    aliases: input.aliases || [],
    positiveSignals: input.positiveSignals || input.aliases || [],
    negativeSignals: input.negativeSignals || [],
    businessDNA: {
      targetAudience: input.targetAudience || ["lokale klanten"],
      personality: input.personality || ["professioneel", "betrouwbaar"],
      tone: input.tone || ["helder", "betrouwbaar"],
      trustSignals: input.trustSignals || ["duidelijke afspraken", "persoonlijke service"],
      uspStyle: input.uspStyle || ["concreet", "geloofwaardig"],
      ctaStyle: input.ctaStyle || "laagdrempelig en duidelijk",
    },
    visualProfile: {
      visualStyle: input.visualStyle || ["rustig", "professioneel"],
      colorPalette: input.colorPalette || ["#132238", "#2563eb", "#14b8a6", "#f6f8fb"],
      typographyStyle: input.typographyStyle || "moderne, goed leesbare sans-serif",
      photoStyle: input.photoStyle || ["menselijk", "authentiek", "rustig"],
      iconStyle: input.iconStyle || "subtiele lijniconen",
      preferredPhotoTags: input.preferredPhotoTags || [],
      forbiddenPhotoTags: input.forbiddenPhotoTags || [],
    },
    contentProfile: {
      services: input.services || [],
      preferredSections: input.preferredSections || ["hero", "over-ons", "diensten", "werkwijze", "reviews", "contact"],
      forbiddenSections: input.forbiddenSections || [],
      ctaExamples: input.ctaExamples || ["Neem contact op"],
      copyGuidelines: input.copyGuidelines || ["schrijf helder", "doe geen onbewezen claims"],
    },
    seoProfile: {
      primaryTopics: input.primaryTopics || input.services || [],
      keywords: input.keywords || input.services || [],
      localKeywordPatterns: input.localKeywordPatterns || ["{dienst} in {plaats}", "{branche} {plaats}"],
      relatedTopics: input.relatedTopics || [],
    },
    templateProfile: {
      recommendedTemplates: input.recommendedTemplates || ["starter-one-page-v1", "business-multi-page-v1"],
      preferredLayouts: input.preferredLayouts || ["trust-first", "service-led"],
    },
    assetGroup: input.assetGroup || null,
  };
}

const PROFILES = [
  profile("holistic-practice", {
    industry: "holistisch", subcategory: "holistische-praktijk", assetGroup: "holistisch",
    aliases: ["holistisch", "holistische praktijk", "healing", "bewustwording", "lichaam en geest"],
    positiveSignals: ["holistisch", "healing", "bewustwording", "meditatie", "reiki", "balans", "lichaam en geest", "persoonlijke ontwikkeling", "energetisch"],
    negativeSignals: ["kozijnen", "timmerwerk", "zonnepanelen", "loodgieter", "elektra", "renovatie", "badkamer", "gereedschap"],
    targetAudience: ["mensen die rust, balans of persoonlijke groei zoeken"],
    personality: ["warm", "persoonlijk", "rustig", "zorgvuldig", "uitnodigend"], tone: ["warm", "persoonlijk", "rustig", "vertrouwenwekkend"],
    trustSignals: ["veilige begeleiding", "persoonlijke afstemming", "heldere werkwijze"], uspStyle: ["zacht", "ervaringsgericht", "zonder harde claims"], ctaStyle: "rustig en uitnodigend",
    visualStyle: ["zacht", "rustig", "natuurlijk"], colorPalette: ["#4f5f4b", "#c7b79b", "#f5efe4", "#dfe7dc"], photoStyle: ["warme menselijke fotografie", "natuur", "rustige praktijkruimte", "meditatie"],
    preferredPhotoTags: WELLNESS_TAGS, forbiddenPhotoTags: BUILD_TAGS,
    services: ["Holistische coaching", "Energetische begeleiding", "Ontspanning en balans", "Mindfulness"],
    preferredSections: ["hero", "over-mij", "behandelingen", "werkwijze", "ervaringen", "tarieven", "contact"], forbiddenSections: ["projecten", "offerteprojecten", "bouwportfolio", "renovatiecases"],
    ctaExamples: ["Plan een kennismaking", "Ontdek wat bij u past", "Neem rustig contact op", "Bekijk de werkwijze"],
    copyGuidelines: ["warm en concreet", "geen agressieve verkoop", "geen medische claims zonder expliciete bron"],
    primaryTopics: ["holistische begeleiding", "balans", "bewustwording"], keywords: ["holistische coaching", "energetische begeleiding", "mindfulness", "balans"], relatedTopics: ["persoonlijke groei", "ontspanning", "lichaam en geest"],
    recommendedTemplates: ["starter-one-page-v1", "business-multi-page-v1"], preferredLayouts: ["calm-storytelling", "personal-practice"],
  }),
  profile("energy-practice", {
    industry: "holistisch", subcategory: "energetische-praktijk", assetGroup: "holistisch",
    aliases: ["energetisch", "energetische praktijk", "energiebehandeling", "healer"], positiveSignals: ["energetisch", "energiebehandeling", "healing", "reiki", "chakra", "aura", "balans"], negativeSignals: BUILD_TAGS,
    personality: ["zacht", "persoonlijk", "integer"], tone: ["rustig", "warm", "zorgvuldig"], visualStyle: ["natuurlijk", "licht", "verstild"], colorPalette: ["#536452", "#cbbd9f", "#f7f1e8", "#e4eadf"],
    preferredPhotoTags: WELLNESS_TAGS.concat(["energy-work"]), forbiddenPhotoTags: BUILD_TAGS, services: ["Energetische behandeling", "Persoonlijke begeleiding", "Ontspanning en balans"],
    preferredSections: ["hero", "over-mij", "sessies", "werkwijze", "ervaringen", "tarieven", "contact"], forbiddenSections: ["projecten", "bouwportfolio"], ctaExamples: ["Plan een kennismaking", "Bekijk de sessies", "Neem rustig contact op"],
    copyGuidelines: ["geen medische werking beloven", "beschrijf ervaring en werkwijze zorgvuldig"], primaryTopics: ["energetische begeleiding", "balans"], keywords: ["energetische behandeling", "energetische begeleiding"], relatedTopics: ["ontspanning", "bewustwording"],
  }),
  profile("coaching", {
    industry: "coaching", subcategory: "coach", assetGroup: "holistisch", aliases: ["coach", "coaching", "coachpraktijk", "persoonlijke ontwikkeling"], positiveSignals: ["coach", "coaching", "persoonlijke ontwikkeling", "traject", "doelen", "loopbaan", "mindset"], negativeSignals: ["timmerwerk", "zonnepanelen", "loodgieter"],
    targetAudience: ["mensen of professionals met een ontwikkelvraag"], personality: ["persoonlijk", "helder", "motiverend"], tone: ["warm", "direct", "ondersteunend"], preferredPhotoTags: ["coaching", "conversation", "personal-growth", "calm", "professional"], forbiddenPhotoTags: BUILD_TAGS,
    services: ["Persoonlijke coaching", "Ontwikkeltraject", "Kennismakingsgesprek"], preferredSections: ["hero", "over-mij", "coaching", "werkwijze", "ervaringen", "contact"], forbiddenSections: ["bouwportfolio", "renovatiecases"], ctaExamples: ["Plan een kennismaking", "Bekijk de werkwijze"], primaryTopics: ["coaching", "persoonlijke ontwikkeling"], keywords: ["coach", "persoonlijke coaching", "coachingstraject"],
  }),
  profile("wellness", {
    industry: "wellness", subcategory: "wellness-praktijk", assetGroup: "schoonheidssalon", aliases: ["wellness", "massage", "ontspanning", "spa"], positiveSignals: ["wellness", "massage", "ontspanning", "spa", "selfcare", "behandeling"], negativeSignals: BUILD_TAGS,
    personality: ["verzorgd", "warm", "rustgevend"], tone: ["zacht", "uitnodigend", "duidelijk"], visualStyle: ["licht", "zacht", "verzorgd"], colorPalette: ["#655d52", "#d6c4aa", "#fbf7f0", "#dbe5dc"], preferredPhotoTags: ["wellness", "massage", "treatment-room", "calm", "selfcare", "nature"], forbiddenPhotoTags: BUILD_TAGS,
    services: ["Massage", "Ontspanningsbehandeling", "Wellness arrangement"], preferredSections: ["hero", "behandelingen", "over-ons", "ervaringen", "tarieven", "contact"], forbiddenSections: ["bouwportfolio"], ctaExamples: ["Plan een behandeling", "Bekijk de behandelingen"], primaryTopics: ["wellness", "ontspanning", "massage"], keywords: ["wellness", "massage", "ontspanningsbehandeling"],
  }),
  profile("beauty-salon", {
    industry: "beauty", subcategory: "schoonheidssalon", assetGroup: "schoonheidssalon", aliases: ["schoonheidssalon", "beautysalon", "gezichtsbehandeling", "huidadvies"], positiveSignals: ["schoonheidssalon", "beauty", "gezichtsbehandeling", "huidadvies", "huidverbetering", "salon"], negativeSignals: BUILD_TAGS,
    personality: ["verzorgd", "persoonlijk", "stijlvol"], tone: ["warm", "deskundig", "uitnodigend"], preferredPhotoTags: ["beauty", "salon", "facial", "skincare", "treatment-room"], forbiddenPhotoTags: BUILD_TAGS,
    services: ["Gezichtsbehandeling", "Huidadvies", "Huidverzorging"], preferredSections: ["hero", "behandelingen", "salon", "resultaten", "tarieven", "contact"], forbiddenSections: ["bouwportfolio"], ctaExamples: ["Plan een behandeling", "Bekijk behandelingen"], primaryTopics: ["schoonheidsbehandeling", "huidverzorging"], keywords: ["schoonheidssalon", "gezichtsbehandeling", "huidadvies"],
  }),
  profile("physiotherapy", {
    industry: "zorg", subcategory: "fysiotherapie", assetGroup: "fysiotherapie", aliases: ["fysiotherapie", "fysiotherapeut", "fysio"], positiveSignals: ["fysiotherapie", "fysiotherapeut", "fysio", "revalidatie", "bewegen", "herstel", "pijnklachten"], negativeSignals: ["beautysalon", "timmerwerk", "restaurant"],
    targetAudience: ["mensen met beweeg- of herstelvragen"], personality: ["deskundig", "toegankelijk", "zorgvuldig"], tone: ["helder", "geruststellend", "professioneel"], preferredPhotoTags: ["physiotherapy", "movement", "rehabilitation", "consultation", "healthcare"], forbiddenPhotoTags: ["construction", "beauty", "restaurant", "tools"],
    services: ["Fysiotherapie", "Revalidatie", "Beweegadvies"], preferredSections: ["hero", "klachten", "behandelingen", "team", "werkwijze", "contact"], forbiddenSections: ["projecten", "bouwportfolio"], ctaExamples: ["Plan een afspraak", "Bekijk behandelmogelijkheden"], copyGuidelines: ["geen diagnose of resultaat beloven", "gebruik alleen expliciet onderbouwde specialisaties"], primaryTopics: ["fysiotherapie", "bewegen", "herstel"], keywords: ["fysiotherapeut", "fysiotherapie"],
  }),
  profile("dental-practice", {
    industry: "zorg", subcategory: "tandarts", assetGroup: "tandarts", aliases: ["tandarts", "tandartspraktijk", "mondzorg"], positiveSignals: ["tandarts", "tandartspraktijk", "mondzorg", "gebitscontrole", "preventie", "mondhygiene"], negativeSignals: BUILD_TAGS,
    targetAudience: ["patiënten die mondzorg zoeken"], personality: ["deskundig", "zorgzaam", "geruststellend"], tone: ["helder", "rustig", "professioneel"], preferredPhotoTags: ["dentist", "dental-practice", "oral-care", "consultation", "clean"], forbiddenPhotoTags: BUILD_TAGS.concat(["beauty"]),
    services: ["Controle", "Preventieve mondzorg", "Mondhygiëne"], preferredSections: ["hero", "behandelingen", "team", "werkwijze", "spoed", "contact"], forbiddenSections: ["projecten"], ctaExamples: ["Plan een afspraak", "Neem contact op met de praktijk"], copyGuidelines: ["geen medische claims zonder bron"], primaryTopics: ["tandarts", "mondzorg", "preventie"], keywords: ["tandarts", "mondzorg", "tandartspraktijk"],
  }),
  profile("law-firm", {
    industry: "juridisch", subcategory: "advocaat", assetGroup: "advocaat", aliases: ["advocaat", "advocatenkantoor", "advocatuur", "juridisch"], positiveSignals: ["advocaat", "advocatenkantoor", "advocatuur", "juridisch advies", "rechtsgebied", "recht"], negativeSignals: ["beauty", "massage", "timmerwerk"],
    targetAudience: ["particulieren en organisaties met een juridische vraag"], personality: ["deskundig", "integer", "daadkrachtig"], tone: ["zakelijk", "helder", "vertrouwenwekkend"], visualStyle: ["professioneel", "rustig", "gezaghebbend"], colorPalette: ["#172033", "#294b6f", "#b79a62", "#f4f6f8"], preferredPhotoTags: ["law", "legal", "professional", "consultation", "office"], forbiddenPhotoTags: ["construction", "wellness", "beauty", "restaurant"],
    services: ["Juridisch advies", "Zaakbeoordeling", "Persoonlijke intake"], preferredSections: ["hero", "expertise", "rechtsgebieden", "werkwijze", "team", "contact"], forbiddenSections: ["projecten", "behandelingen"], ctaExamples: ["Plan een intake", "Bespreek uw situatie"], primaryTopics: ["juridisch advies", "advocatuur"], keywords: ["advocaat", "juridisch advies", "advocatenkantoor"],
  }),
  profile("restaurant", {
    industry: "horeca", subcategory: "restaurant", assetGroup: "restaurant", aliases: ["restaurant", "eetcafe", "lunchroom", "brasserie"], positiveSignals: ["restaurant", "menu", "reserveren", "diner", "lunch", "chef", "gerecht"], negativeSignals: ["timmerwerk", "fysiotherapie", "zonnepanelen"],
    targetAudience: ["gasten die willen eten of reserveren"], personality: ["gastvrij", "sfeervol", "smakelijk"], tone: ["gastvrij", "warm", "activerend"], visualStyle: ["sfeervol", "culinair", "menselijk"], colorPalette: ["#2b211c", "#7b3e2f", "#d2a35b", "#fbf5ec"], preferredPhotoTags: ["restaurant", "food", "dish", "interior", "hospitality", "table"], forbiddenPhotoTags: ["construction", "healthcare", "beauty", "tools"],
    services: ["Menu", "Reserveren", "Arrangementen"], preferredSections: ["hero", "menu", "sfeer", "over-ons", "reserveren", "contact"], forbiddenSections: ["bouwportfolio", "behandelingen"], ctaExamples: ["Reserveer een tafel", "Bekijk het menu"], primaryTopics: ["restaurant", "menu", "reserveren"], keywords: ["restaurant", "reserveren", "diner", "lunch"],
  }),
  profile("carpentry", {
    industry: "bouw", subcategory: "timmerbedrijf", assetGroup: "timmerwerk", aliases: ["timmerbedrijf", "timmerman", "timmerwerk", "maatwerk hout"], positiveSignals: ["timmerbedrijf", "timmerman", "timmerwerk", "houtwerk", "maatwerk", "dakkapel", "zolder", "kozijnen"], negativeSignals: ["wellness", "meditatie", "massage", "beautysalon"],
    targetAudience: ["woningeigenaren met timmer- of verbouwwensen"], personality: ["vakkundig", "praktisch", "betrouwbaar"], tone: ["duidelijk", "concreet", "professioneel"], visualStyle: ["robuust", "verzorgd", "projectgericht"], colorPalette: ["#101820", "#1f352d", "#d88b36", "#f4efe7"], preferredPhotoTags: ["carpenter", "timber", "woodwork", "tools", "renovation", "windows"], forbiddenPhotoTags: ["wellness", "meditation", "beauty", "massage", "treatment-room"],
    services: ["Timmerwerk", "Maatwerk", "Zolderverbouwing", "Kozijnen"], preferredSections: ["hero", "diensten", "projecten", "werkwijze", "reviews", "offerte", "contact"], forbiddenSections: ["behandelingen", "sessies"], ctaExamples: ["Vraag een timmerofferte aan", "Plan een opname"], primaryTopics: ["timmerwerk", "maatwerk", "verbouw"], keywords: ["timmerbedrijf", "timmerman", "timmerwerk", "maatwerk"],
  }),
  profile("installation", {
    industry: "techniek", subcategory: "installatiebedrijf", assetGroup: "installatiebedrijf", aliases: ["installatiebedrijf", "installateur", "installatietechniek"], positiveSignals: ["installatiebedrijf", "installateur", "installatie", "elektra", "warmtepomp", "zonnepanelen", "laadpaal", "loodgieter"], negativeSignals: ["wellness", "meditatie", "beautysalon", "restaurant"],
    targetAudience: ["particulieren en bedrijven met een technische installatievraag"], personality: ["technisch", "betrouwbaar", "snel"], tone: ["deskundig", "helder", "praktisch"], visualStyle: ["technisch", "schoon", "professioneel"], colorPalette: ["#0d1f2f", "#0f4c81", "#16b8d9", "#eef7fb"], preferredPhotoTags: ["installation", "electrician", "solar", "heat-pump", "technical", "tools"], forbiddenPhotoTags: ["wellness", "meditation", "beauty", "restaurant"],
    services: ["Installatie", "Onderhoud", "Storingen", "Verduurzaming"], preferredSections: ["hero", "diensten", "certificering", "werkwijze", "projecten", "service", "contact"], forbiddenSections: ["behandelingen", "sessies"], ctaExamples: ["Plan service", "Vraag een offerte aan"], primaryTopics: ["installatietechniek", "onderhoud", "verduurzaming"], keywords: ["installatiebedrijf", "installateur", "installatie"],
  }),
  profile("webshop", {
    industry: "retail", subcategory: "webshop", assetGroup: null, aliases: ["webshop", "online winkel", "e-commerce", "ecommerce"], positiveSignals: ["webshop", "online winkel", "e-commerce", "winkelmand", "bestellen", "producten", "checkout"], negativeSignals: ["timmerbedrijf", "fysiotherapie", "advocaat"],
    targetAudience: ["online shoppers"], personality: ["duidelijk", "betrouwbaar", "servicegericht"], tone: ["compact", "behulpzaam", "activerend"], visualStyle: ["productgericht", "overzichtelijk", "snel"], preferredPhotoTags: ["product", "ecommerce", "shopping", "packaging", "lifestyle"], forbiddenPhotoTags: ["construction", "healthcare", "legal", "treatment-room"],
    services: ["Productassortiment", "Bestellen en bezorgen", "Klantenservice"], preferredSections: ["hero", "categorieen", "producten", "voordelen", "reviews", "service", "contact"], forbiddenSections: ["bouwportfolio", "behandelingen"], ctaExamples: ["Bekijk producten", "Ontdek de collectie"], primaryTopics: ["producten", "online bestellen", "bezorgen"], keywords: ["webshop", "online bestellen"], recommendedTemplates: ["business-multi-page-v1", "premium-growth-site-v1"], preferredLayouts: ["product-grid", "category-led"],
  }),
  profile("business-services", {
    industry: "zakelijke-dienstverlening", subcategory: "advies", assetGroup: "financieel-adviseur", aliases: ["zakelijke dienstverlening", "consultancy", "adviesbureau"], positiveSignals: ["zakelijke dienstverlening", "consultancy", "adviesbureau", "strategie", "organisatieadvies", "b2b"], negativeSignals: ["timmerwerk", "massage", "restaurant"],
    targetAudience: ["ondernemers en organisaties"], personality: ["deskundig", "professioneel", "resultaatgericht"], tone: ["zakelijk", "helder", "vertrouwenwekkend"], preferredPhotoTags: ["professional", "business", "consultation", "office", "team"], forbiddenPhotoTags: ["construction", "wellness", "beauty", "restaurant"],
    services: ["Advies", "Strategie", "Begeleiding"], preferredSections: ["hero", "expertise", "diensten", "werkwijze", "cases", "contact"], ctaExamples: ["Plan een kennismaking", "Bespreek uw vraag"], primaryTopics: ["zakelijk advies", "strategie"], keywords: ["adviesbureau", "zakelijke dienstverlening"],
  }),
  profile("local-service", {
    industry: "lokale-dienstverlening", subcategory: "neutrale-lokale-dienstverlener", assetGroup: "neutral-professional", aliases: ["lokale dienstverlener"], positiveSignals: ["lokale dienstverlener", "servicebedrijf"], negativeSignals: [],
    targetAudience: ["lokale klanten"], personality: ["toegankelijk", "betrouwbaar", "professioneel"], tone: ["helder", "neutraal", "laagdrempelig"], visualStyle: ["neutraal", "menselijk", "professioneel"], preferredPhotoTags: ["neutral", "professional", "human", "local-service"], forbiddenPhotoTags: BUILD_TAGS.concat(["healthcare", "restaurant", "beauty"]),
    services: ["Advies", "Service", "Contact"], preferredSections: ["hero", "over-ons", "diensten", "werkwijze", "contact"], forbiddenSections: [], ctaExamples: ["Neem contact op", "Plan een kennismaking"], primaryTopics: ["lokale dienstverlening"], keywords: [], recommendedTemplates: ["starter-one-page-v1"], preferredLayouts: ["neutral-service"],
  }),
];

module.exports = { BUILD_TAGS: deepFreeze(BUILD_TAGS), PROFILES: deepFreeze(PROFILES), WELLNESS_TAGS: deepFreeze(WELLNESS_TAGS) };
