const { handler: customerOnboardingHandler } = require("./customer-onboarding");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createHandler(dependencies = {}) {
  const canonicalHandler = dependencies.customerOnboardingHandler || customerOnboardingHandler;
  return async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { success: false, error: "Ongeldige JSON body." });
  }

  const clean = sanitizeObject(payload);
  const validationError = validate(clean);
  if (validationError) return jsonResponse(400, { success: false, error: validationError });

  // De oude premium wizard blijft bruikbaar, maar schrijft voortaan uitsluitend
  // naar de canonieke, ingelogde klantportaal-onboarding. Daardoor bestaan er
  // geen tijdelijke /tmp-dossiers of los aanroepbare mailacties meer.
  return canonicalHandler({
    ...event,
    body: JSON.stringify(toCanonicalOnboarding(clean)),
  });
  };
}

exports.handler = createHandler();

function toCanonicalOnboarding(input) {
  const selectedExtras = [
    ...toArray(input.extraFeatures),
    ...toArray(input.extraFeatureUpsells),
    ...toArray(input.upsells).map((item) => cleanText(item?.name)),
  ].map(cleanText).filter(Boolean);
  const colors = [input.favoriteColors, input.logoColors].map(cleanText).filter(Boolean).join(" · ");
  const lookAndFeel = [...toArray(input.brandStyle), input.logoStyle].map(cleanText).filter(Boolean).join(", ");
  const notes = [
    input.styleNotes,
    input.logoDescription,
    input.photoWishes,
    input.notes,
    input.planning?.desiredStartDate ? `Gewenste start: ${input.planning.desiredStartDate}` : "",
    input.planning?.desiredLaunchDate ? `Gewenste livegang: ${input.planning.desiredLaunchDate}` : "",
  ].map(cleanText).filter(Boolean).join("\n");

  return {
    action: "submit",
    confirmed: input.confirmed === true,
    answers: {
      company: {
        companyName: cleanText(input.companyName),
        contactName: cleanText(input.contactName),
        phone: cleanText(input.phone),
        email: cleanText(input.businessEmail || input.email).toLowerCase(),
        address: cleanText(input.city),
      },
      branding: {
        colors,
        fontPreference: "",
        lookAndFeel,
        exampleWebsites: splitList(input.inspirationWebsites),
        mustHaveMustNot: [input.blockedColors && `Niet gebruiken: ${input.blockedColors}`, input.dislikedWebsites && `Niet mooi: ${input.dislikedWebsites}`, notes].filter(Boolean).join("\n"),
      },
      content: {
        pages: toArray(input.pages),
        services: splitList(input.mainServices),
        aboutText: cleanText(input.businessDescription),
        usps: cleanText(input.uniqueSellingPoints),
        ctas: [],
        faq: "",
        reviews: "",
        socialLinks: splitList(input.socialLinks),
      },
      domain: {
        currentDomain: cleanText(input.website),
      },
      marketing: {
        keywords: [],
        serviceArea: cleanText(input.city),
        competitors: [],
        audience: cleanText(input.targetAudience),
        toneOfVoice: cleanText(input.toneOfVoice),
        offer: "",
      },
      extras: { selected: selectedExtras, notes },
    },
    files: toArray(input.uploadAttachments).map((file) => ({
      name: cleanText(file?.filename).slice(0, 180),
      type: cleanText(file?.contentType),
      size: Number(file?.size || 0),
      content: cleanText(file?.content),
    })),
  };
}

function validate(payload) {
  if (!authorizationShape(payload)) return "De intake bevat ongeldige gegevens.";
  if (!payload.companyName) return "Vul de bedrijfsnaam in.";
  if (!payload.contactName) return "Vul de contactpersoon in.";
  if (!emailPattern.test(payload.businessEmail || payload.email || "")) return "Vul een geldig zakelijk e-mailadres in.";
  if (!payload.phone) return "Vul het telefoonnummer in.";
  if (!payload.industry) return "Vul de branche in.";
  if (!payload.city) return "Vul de vestigingsplaats in.";
  if (!payload.businessDescription) return "Vul een korte bedrijfsomschrijving in.";
  if (!payload.logoChoice) return "Kies een logo-optie.";
  if (!payload.textChoice) return "Kies een tekstoptie.";
  if (!payload.photoChoice) return "Kies een foto-optie.";
  if (!payload.confirmed) return "Bevestig dat Max Webstudio deze gegevens mag gebruiken.";
  return "";
}

function authorizationShape(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload);
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, sanitizeObject(item)]));
  }
  return typeof value === "string" ? value.trim().slice(0, 5000) : value;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).slice(0, 24);
  return String(value || "").split(/\n|,/).map(cleanText).filter(Boolean).slice(0, 24);
}

function cleanText(value) { return String(value || "").trim(); }
function toArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

exports._private = { createHandler, sanitizeObject, toCanonicalOnboarding, validate };
