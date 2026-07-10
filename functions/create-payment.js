const {
  WEBSITE_PACKAGES,
  CARE_PACKAGES,
  getAmounts,
  getBaseUrl,
  getMollieApiKey,
} = require("./mollie-products");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      success: false,
      error: "Alleen POST-verzoeken zijn toegestaan.",
    });
  }

  if (!isLegacyCreatePaymentAllowed()) {
    return jsonResponse(410, {
      success: false,
      error: "Deze betaalpagina is vervangen. Vraag je persoonlijke betaallink aan bij Max Webstudio.",
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: "Ongeldige JSON body.",
    });
  }

  const validationError = validatePayload(payload);

  if (validationError) {
    return jsonResponse(400, {
      success: false,
      error: validationError,
    });
  }

  const websitePackage = WEBSITE_PACKAGES[payload.websitePackage];
  const carePackage = CARE_PACKAGES[payload.carePackage];

  const depositAmounts = getAmounts(websitePackage.depositExVatCents);
  const remainingAmounts = getAmounts(websitePackage.remainingExVatCents);
  const careAmounts = getAmounts(carePackage.priceExVatCents);
  const apiKey = getMollieApiKey();

  if (!apiKey) {
    return jsonResponse(500, {
      success: false,
      error: "Betaalconfiguratie ontbreekt. Neem contact op met Max Webstudio.",
    });
  }

  const baseUrl = getBaseUrl();
  const createdAt = new Date().toISOString();

  const metadata = {
    websitePackage: payload.websitePackage,
    websitePackageName: websitePackage.websitePackageName,
    depositAmountExVat: depositAmounts.amountExVat,
    depositAmountInclVat: depositAmounts.amountInclVat,
    remainingAmountExVat: remainingAmounts.amountExVat,
    remainingAmountInclVat: remainingAmounts.amountInclVat,
    carePackage: payload.carePackage,
    carePackageName: carePackage.carePackageName,
    carePriceExVat: careAmounts.amountExVat,
    carePriceInclVat: careAmounts.amountInclVat,
    customerName: cleanText(payload.customerName),
    customerEmail: cleanText(payload.customerEmail).toLowerCase(),
    customerPhone: cleanText(payload.customerPhone),
    companyName: cleanText(payload.companyName || ""),
    notes: cleanText(payload.notes || ""),
    createdAt,
  };

  try {
    const mollieResponse = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: depositAmounts.amountInclVat,
        },
        description: `Max Webstudio - Aanbetaling ${websitePackage.websitePackageName}`,
        redirectUrl: `${baseUrl}/bedankt.html`,
        webhookUrl: `${baseUrl}/.netlify/functions/mollie-webhook`,
        metadata,
      }),
    });

    const data = await mollieResponse.json();

    if (!mollieResponse.ok) {
      console.error("Mollie create payment failed", {
        status: mollieResponse.status,
        title: data.title,
        detail: data.detail,
      });

      return jsonResponse(mollieResponse.status, {
        success: false,
        error: "Mollie kon de betaling niet aanmaken. Probeer het opnieuw of neem contact op.",
      });
    }

    const checkoutUrl = data?._links?.checkout?.href;

    if (!checkoutUrl) {
      console.error("Mollie create payment missing checkout URL", {
        paymentId: data.id,
      });

      return jsonResponse(502, {
        success: false,
        error: "Mollie gaf geen checkoutlink terug. Probeer het opnieuw of neem contact op.",
      });
    }

    return jsonResponse(200, {
      success: true,
      checkoutUrl,
      paymentId: data.id,
    });
  } catch (error) {
    console.error("Create payment error", error.message);

    return jsonResponse(500, {
      success: false,
      error: "Er ging iets mis bij het starten van de betaling.",
    });
  }
};

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Vul het formulier volledig in.";
  }

  if (!payload.websitePackage || !WEBSITE_PACKAGES[payload.websitePackage]) {
    return "Kies een geldig websitepakket.";
  }

  if (!payload.carePackage || !CARE_PACKAGES[payload.carePackage]) {
    return "Kies een geldig onderhoudspakket.";
  }

  if (!cleanText(payload.customerName)) {
    return "Vul je naam in.";
  }

  if (!emailPattern.test(cleanText(payload.customerEmail))) {
    return "Vul een geldig e-mailadres in.";
  }

  if (!cleanText(payload.customerPhone)) {
    return "Vul je telefoonnummer in.";
  }

  return "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function isLegacyCreatePaymentAllowed() {
  if (String(process.env.ALLOW_LEGACY_CREATE_PAYMENT || "").toLowerCase() === "true") return true;
  const runtime = String(process.env.APP_ENV || process.env.CONTEXT || process.env.NETLIFY_ENV || "").toLowerCase();
  return runtime && !["production", "prod"].includes(runtime);
}
