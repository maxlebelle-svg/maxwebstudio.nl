const section = (heading, paragraphs = [], bullets = []) => ({ heading, paragraphs, bullets });

const modules = [
  {
    stepKey: "welcome", order: 1, title: "Welkom bij Max Webstudio", estimatedMinutes: 4,
    summary: "Dit programma bereidt je voor op een zelfstandige, transparante samenwerking.",
    acknowledgementText: "Ik heb de uitleg over het programma en de vervolgstappen gelezen en begrepen.",
    content: { sections: [
      section("Jouw route", ["Je leest zeven trainingshoofdstukken, accepteert de actuele voorwaarden, maakt een kennistoets en rondt de vereiste documenten af. Je voortgang wordt veilig opgeslagen."], ["Je account geeft tijdens onboarding nog geen toegang tot commerciële functies.", "Je kunt later verdergaan waar je bent gebleven.", "Vragen of onduidelijkheden bespreek je met je toegewezen manager."]),
      section("De samenwerking", ["Je werkt als zelfstandig salespartner en helpt ondernemers de juiste digitale oplossing te vinden. Zorgvuldigheid en klantbelang gaan voor een snelle verkoop."])
    ] }
  },
  {
    stepKey: "vision", order: 2, title: "Samen bouwen aan digitale groei", estimatedMinutes: 7,
    summary: "Onze visie, missie en kernwaarden vormen de basis van ieder klantcontact.",
    acknowledgementText: "Ik heb de visie, missie en kernwaarden gelezen en begrepen.",
    content: { sections: [
      section("Visie", ["Max Webstudio helpt ondernemers professioneel online groeien zonder dat zij voor iedere dienst met een andere leverancier hoeven te werken. Websites en webshops vormen het vertrekpunt voor een geïntegreerd platform met hosting, domeinen, zakelijke e-mail, branding, SEO, content, advertenties, telefonie, automatisering, CRM, klantportalen en online betalingen.", "We willen geen losse website verkopen, maar een langdurige groeipartner zijn die techniek, verkoop, marketing, automatisering en service samenbrengt."]),
      section("Missie", ["Professionele digitale dienstverlening bereikbaar maken voor iedere ondernemer. We laten bij demo's eerst concreet zien wat mogelijk is, zodat een ondernemer beslist op basis van zichtbare waarde."]),
      section("Kernwaarden", [], ["Eerst waarde leveren.", "Eerlijk en transparant communiceren.", "Afspraak is afspraak.", "Klantbelang boven snelle verkoop.", "Geen misleidende of ongeoorloofde verkooptechnieken.", "Relevante klantinformatie correct vastleggen.", "Continu verbeteren en bouwen aan langdurige relaties."])
    ] }
  },
  {
    stepKey: "working_principles", order: 3, title: "Werkwijze en verwachtingen", estimatedMinutes: 7,
    summary: "Werk zelfstandig binnen heldere kaders en gebruik alleen goedgekeurde proposities.",
    acknowledgementText: "Ik begrijp de werkwijze, grenzen en verwachtingen voor zelfstandige salespartners.",
    content: { sections: [
      section("Zelfstandig en verantwoordelijk", ["Je organiseert je werkzaamheden zelfstandig en bent verantwoordelijk voor een professionele uitvoering. Er is geen bevoegdheid om Max Webstudio juridisch te binden."], ["Gebruik alleen actuele, goedgekeurde prijzen en proposities.", "Beloof geen korting, resultaat, functionaliteit of levertijd zonder bevoegdheid.", "Leg belangrijke afspraken objectief vast.", "Meld fouten, klachten en risico's tijdig."]),
      section("Salesethiek", ["Druk, misleiding, ongeoorloofde claims en het verbergen van relevante voorwaarden passen niet bij Max Webstudio."], ["Onderzoek eerst de werkelijke behoefte.", "Geef ruimte voor vragen en een weloverwogen beslissing.", "Respecteer een afwijzing en contactvoorkeuren."])
    ] }
  },
  {
    stepKey: "lead_and_task_registration", order: 4, title: "Leads, agenda, taken en notities", estimatedMinutes: 9,
    summary: "Goede registratie maakt opvolging betrouwbaar, overdraagbaar en controleerbaar.",
    acknowledgementText: "Ik weet welke lead-, taak-, agenda- en contactgegevens ik tijdig moet registreren.",
    content: { sections: [
      section("Een geldige lead", ["Gebruik uitsluitend zakelijke en rechtmatige bronnen, controleer op duplicaten en leg de herkomst vast."], ["Bedrijfsnaam, contactgegevens en website waar beschikbaar.", "Vestigingsplaats, branche, bron en reden van relevantie.", "Verantwoordelijke partner, contactstatus en opvolgdatum."]),
      section("Na ieder contact", ["Werk de status direct bij zodat een collega het dossier zonder aannames kan overnemen."], ["Maak een korte, objectieve notitie.", "Leg een concrete volgende actie en eigenaar vast.", "Plan een datum als opvolging nodig is.", "Zet afspraken correct in de agenda."]),
      section("Demo, offerte en betaling", ["Deel alleen de officiële previewlink en gebruik uitsluitend offertes en betaallinks uit het systeem."], ["Wijzig bedragen niet buiten het systeem.", "Accepteer nooit betaling op een privérekening.", "Laat definitieve acceptatie via de officiële klantflow verlopen."])
    ] }
  },
  {
    stepKey: "privacy_confidentiality", order: 5, title: "Privacy, AVG en vertrouwelijkheid", estimatedMinutes: 8,
    summary: "Verwerk alleen noodzakelijke gegevens en behandel klant- en bedrijfsinformatie vertrouwelijk.",
    acknowledgementText: "Ik begrijp mijn verantwoordelijkheid voor privacy, informatiebeveiliging en vertrouwelijkheid.",
    content: { sections: [
      section("Dataminimalisatie", ["Leg alleen zakelijke en voor het verkoopproces noodzakelijke informatie vast. Vrije notities zijn geen plek voor bijzondere of irrelevante persoonsgegevens."], ["Gebruik de officiële systemen en accounts.", "Deel gegevens alleen met bevoegde personen.", "Exporteer of kopieer geen bestanden zonder zakelijke noodzaak.", "Meld een mogelijk datalek of verkeerd geadresseerd bericht direct."]),
      section("Veilig werken", ["Bescherm apparaten en sessies met sterke toegang en laat klantgegevens niet onbeheerd zichtbaar achter."], ["Gebruik geen gedeelde wachtwoorden.", "Controleer ontvangers en bijlagen vóór verzending.", "Bewaar klantdata niet structureel op privéapparaten."])
    ] }
  },
  {
    stepKey: "responsible_customer_contact", order: 6, title: "Verantwoord klantcontact", estimatedMinutes: 8,
    summary: "Benader ondernemers relevant, respectvol en via passende zakelijke kanalen.",
    acknowledgementText: "Ik zal ondernemers zorgvuldig, transparant en met respect voor hun voorkeuren benaderen.",
    content: { sections: [
      section("Professionele benadering", ["Telefonie, zakelijke e-mail, LinkedIn, WhatsApp of een afspraak kunnen passend zijn wanneer het kanaal en contact rechtmatig en redelijk zijn."], ["Maak direct duidelijk wie je bent en waarom je contact opneemt.", "Gebruik geen misleidende identiteit of schaarste.", "Respecteer bezwaren, uitschrijvingen en het verzoek niet meer te bellen.", "Noteer relevante contactvoorkeuren."]),
      section("Klantbelang", ["Adviseer alleen wat bij de situatie past en wees eerlijk over beperkingen, planning en vervolgonderzoek."], ["Stel open vragen.", "Vat de behoefte samen.", "Scheid feiten van verwachtingen.", "Escaleer inhoudelijke onzekerheid naar een bevoegde collega."])
    ] }
  },
  {
    stepKey: "sales_process_call_script", order: 7, title: "Salesproces en belstructuur", estimatedMinutes: 9,
    summary: "Een vaste structuur helpt om behoefte, waarde en vervolgafspraken eerlijk te bespreken.",
    acknowledgementText: "Ik begrijp het salesproces en gebruik de gespreksstructuur zonder ongeoorloofde druk of toezeggingen.",
    content: { sections: [
      section("Voorbereiding", ["Controleer de organisatie, website, bron en eerdere contactmomenten voordat je belt."], ["Formuleer een relevante aanleiding.", "Controleer de actuele propositie en prijsinformatie.", "Bepaal welk concreet vervolg passend kan zijn."]),
      section("Gespreksstructuur", ["Gebruik het script als professionele leidraad, niet als drukmiddel."], ["Introductie en toestemming om kort toe te lichten.", "Open vragen over doelen, huidige situatie en knelpunten.", "Samenvatting en passende waardepropositie.", "Eerlijke behandeling van vragen en bezwaren.", "Concrete vervolgactie met eigenaar en datum."]),
      section("Afronding", ["Registreer uitkomst, afspraken en vervolgstap direct. Een toezegging die niet is vastgelegd, is niet overdraagbaar."])
    ] }
  }
];

const questions = [
  ["q1", "Wat gaat bij Max Webstudio voor een snelle verkoop?", ["De hoogste korting", "Het klantbelang", "Een mondelinge toezegging"]],
  ["q2", "Wanneer leg je een volgende actie vast?", ["Na ieder relevant contact", "Alleen na een verkoop", "Aan het einde van de maand"]],
  ["q3", "Welke betaallink mag je gebruiken?", ["Een eigen betaalverzoek", "Alleen de officiële betaallink", "Iedere werkende betaallink"]],
  ["q4", "Wat doe je bij onzekerheid over een toezegging?", ["Toch beloven om tempo te houden", "De klant laten gokken", "Escaleren naar een bevoegde collega"]],
  ["q5", "Welke gegevens horen in een leadnotitie?", ["Objectieve relevante afspraken", "Privémeningen over de contactpersoon", "Onnodige bijzondere persoonsgegevens"]],
  ["q6", "Hoe ga je om met een verzoek om niet meer te bellen?", ["Negeren na een week", "Respecteren en registreren", "Overdragen aan een ander account"]],
  ["q7", "Mag een salespartner zelfstandig korting toezeggen?", ["Altijd", "Alleen met vastgelegde bevoegdheid", "Als de klant direct betaalt"]],
  ["q8", "Waar bewaar je klantdata?", ["In de officiële systemen", "In een privéchat voor gemak", "Op ieder beschikbaar apparaat"]],
  ["q9", "Wat is het doel van een belscript?", ["Druk maximaliseren", "Een professionele gespreksstructuur bieden", "Bezwaren negeren"]],
  ["q10", "Wanneer opent de Sales Workspace?", ["Na accountactivatie", "Na de eerste trainingsstap", "Na volledige gecontroleerde onboarding"]]
].map(([id, prompt, options]) => ({ id, prompt, options }));

const stepKeys = [...modules.map(({ stepKey }) => stepKey), "commission_system", "knowledge_assessment", "document_acceptance"];

export const partnerPreviewData = {
  access: { allowed: false },
  onboarding: { status: "in_progress" },
  steps: stepKeys.map((stepKey) => ({ stepKey, status: "pending" })),
  training: {
    version: { title: "Max Webstudio Partnertraining", code: "partner_training_nl_v1" },
    modules
  },
  certification: {
    assessment: { available: true, title: "Kennistoets Partnertraining V1", versionCode: "partner_knowledge_nl_v1", passScore: 80, maxAttempts: 3, questions },
    attempts: [], certificate: null
  },
  commercial: {
    plan: {
      versionCode: "partner_commission_nl_v1", calculationMethod: "progressive", includeSubscriptions: false,
      tiers: [{ upToCents: 250000, rateBps: 1000 }, { upToCents: 500000, rateBps: 1500 }, { upToCents: null, rateBps: 2000 }]
    },
    documents: [
      { title: "Gedragscode en salesrichtlijnen", versionCode: "partner_conduct_nl_v1", reviewStatus: "internally_approved", accepted: false, content: "Werk transparant, registreer afspraken zorgvuldig en stel het klantbelang altijd voorop." },
      { title: "Privacy- en vertrouwelijkheidsverklaring", versionCode: "partner_privacy_nl_v1", reviewStatus: "internally_approved", accepted: false, content: "Gebruik klantgegevens uitsluitend voor het afgesproken zakelijke doel en alleen binnen de officiële systemen." },
      { title: "Commissievoorwaarden", versionCode: "partner_commission_terms_nl_v1", reviewStatus: "internally_approved", accepted: false, content: "Commissie ontstaat uitsluitend uit de geregistreerde, daadwerkelijk ontvangen en controleerbare omzet." },
      { title: "Opdrachtovereenkomst — concept", versionCode: "partner_agreement_nl_v1", reviewStatus: "legal_review_required", accepted: false, content: "Concept voor de zelfstandige samenwerking. De definitieve juridische versie wordt afzonderlijk beoordeeld en ondertekend." }
    ]
  }
};
