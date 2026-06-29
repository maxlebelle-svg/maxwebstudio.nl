export const AI_WEBSITE_WIZARD_STATUS = Object.freeze({
  PREPARED: "prepared",
  IN_PROGRESS: "in_progress",
  READY_FOR_REVIEW: "ready_for_review",
  BLOCKED: "blocked",
});

export const AI_WEBSITE_WIZARD_STEP_STATUS = Object.freeze({
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETE: "complete",
  BLOCKED: "blocked",
});

/**
 * @typedef {Object} AiWebsiteWizardPhase
 * @property {string} id
 * @property {string} title
 * @property {string} description
 */

/**
 * @typedef {Object} AiWebsiteWizardStep
 * @property {string} id
 * @property {string} phase
 * @property {string} title
 * @property {string} description
 * @property {string[]} requiredInputs
 * @property {string[]} futureAutomation
 */

export const AI_WEBSITE_WIZARD_PHASES = Object.freeze([
  {
    id: "intake",
    title: "Intake",
    description: "Verzamel de basisinformatie die nodig is om een websiteproject goed te starten.",
  },
  {
    id: "brand",
    title: "Huisstijl",
    description: "Leg merkidentiteit, kleuren, logo en visuele richting vast.",
  },
  {
    id: "content",
    title: "Content & SEO",
    description: "Bereid pagina's, diensten, SEO en toekomstige AI-content voor.",
  },
  {
    id: "conversion",
    title: "Conversie",
    description: "Bepaal CTA's, contactmogelijkheden en klantreis.",
  },
  {
    id: "delivery",
    title: "Publicatie",
    description: "Bereid hosting, domein, preview, feedback en livegang voor.",
  },
]);

export const AI_WEBSITE_WIZARD_STEPS = Object.freeze([
  {
    id: "business_information",
    phase: "intake",
    title: "Bedrijfsinformatie",
    description: "Naam, bedrijf, propositie, doelgroep en tone of voice.",
    requiredInputs: ["companyName", "audience", "offer"],
    futureAutomation: ["AI intake samenvatten", "projectbrief genereren"],
  },
  {
    id: "industry_selection",
    phase: "intake",
    title: "Branchekeuze",
    description: "Branche, concurrenten, voorbeeldsites en relevante demo-template.",
    requiredInputs: ["industry", "references"],
    futureAutomation: ["branche-template voorstellen", "concurrentiescan"],
  },
  {
    id: "brand_style",
    phase: "brand",
    title: "Huisstijl",
    description: "Merkpersoonlijkheid, uitstraling, typografie en designrichting.",
    requiredInputs: ["brandPersonality", "styleDirection"],
    futureAutomation: ["designrichting adviseren", "stijlkaart maken"],
  },
  {
    id: "colors",
    phase: "brand",
    title: "Kleuren",
    description: "Primaire, secundaire en accentkleuren voor website en CTA's.",
    requiredInputs: ["primaryColor", "accentColor"],
    futureAutomation: ["kleurpalet genereren", "contrastcheck"],
  },
  {
    id: "logo",
    phase: "brand",
    title: "Logo",
    description: "Bestaand logo, logo-eisen of toekomstige logo-generatie.",
    requiredInputs: ["logoStatus"],
    futureAutomation: ["logo brief maken", "logo-generatie aansluiten"],
  },
  {
    id: "pages",
    phase: "content",
    title: "Pagina's",
    description: "Sitemap, paginavolgorde en belangrijkste templates.",
    requiredInputs: ["pageList"],
    futureAutomation: ["sitemap genereren", "pagina-outline maken"],
  },
  {
    id: "services",
    phase: "content",
    title: "Diensten",
    description: "Dienstenaanbod, pakketten, USP's en bewijspunten.",
    requiredInputs: ["services"],
    futureAutomation: ["dienstencontent schrijven", "USP's aanscherpen"],
  },
  {
    id: "contact_details",
    phase: "conversion",
    title: "Contactgegevens",
    description: "Telefoon, e-mail, WhatsApp, locatie en openingstijden.",
    requiredInputs: ["email", "phone"],
    futureAutomation: ["schema.org contactdata voorbereiden"],
  },
  {
    id: "seo",
    phase: "content",
    title: "SEO",
    description: "Zoekwoorden, titels, meta descriptions en lokale vindbaarheid.",
    requiredInputs: ["keywords", "serviceArea"],
    futureAutomation: ["SEO brief", "meta titles/descriptions genereren"],
  },
  {
    id: "images",
    phase: "brand",
    title: "Afbeeldingen",
    description: "Eigen foto's, stock-richting, alt-teksten en beeldstijl.",
    requiredInputs: ["imageSources"],
    futureAutomation: ["beeldbrief", "alt-teksten genereren"],
  },
  {
    id: "ai_content",
    phase: "content",
    title: "AI-content",
    description: "Voorbereiding voor toekomstige AI-tekstgeneratie en reviewflow.",
    requiredInputs: ["contentApprovalMode"],
    futureAutomation: ["homepage copy", "dienstenpagina's", "FAQ's"],
  },
  {
    id: "ctas",
    phase: "conversion",
    title: "CTA's",
    description: "Primaire actie, secundaire actie en conversiemomenten.",
    requiredInputs: ["primaryCta", "secondaryCta"],
    futureAutomation: ["CTA's optimaliseren", "conversiestructuur adviseren"],
  },
  {
    id: "hosting",
    phase: "delivery",
    title: "Hosting",
    description: "Hostingpakket, onderhoudsplan, performance en monitoring.",
    requiredInputs: ["hostingPlan"],
    futureAutomation: ["hostingcheck", "monitoringprofiel voorbereiden"],
  },
  {
    id: "domain",
    phase: "delivery",
    title: "Domeinnaam",
    description: "Domeinstatus, DNS, redirects en e-mailimpact.",
    requiredInputs: ["domainName", "dnsStatus"],
    futureAutomation: ["DNS checklist", "redirectplan"],
  },
  {
    id: "publication",
    phase: "delivery",
    title: "Publicatie",
    description: "Preview, feedback, livegang, analytics en overdracht.",
    requiredInputs: ["launchApproval"],
    futureAutomation: ["launch checklist", "post-launch mail"],
  },
]);

export function getAiWebsiteWizardWorkflow() {
  return {
    version: "15.0",
    phases: [...AI_WEBSITE_WIZARD_PHASES],
    steps: [...AI_WEBSITE_WIZARD_STEPS],
    status: AI_WEBSITE_WIZARD_STATUS.PREPARED,
  };
}
