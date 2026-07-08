const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { getCompanySettings } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStatuses = new Set(["not_started", "in_progress", "submitted", "needs_review", "approved", "sent_to_website_factory"]);
const allowedFileTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const maxUploadBytes = 8 * 1024 * 1024;

exports.handler = async (event) => {
  if (!["GET", "POST", "OPTIONS"].includes(event.httpMethod)) {
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  }
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Onboarding kon nog niet veilig worden geladen." });
  }

  try {
    const params = getQueryParams(event);
    const payload = event.httpMethod === "POST" ? parsePayload(event.body) : {};
    const action = cleanText(payload.action || params.get("action") || (event.httpMethod === "GET" ? "get" : "save"));
    const context = { supabaseUrl, serviceRoleKey };

    if (["review", "needs_review", "approve", "sent_to_website_factory", "send_to_website_factory", "reminder"].includes(action)) {
      const adminCheck = await verifyAdmin(event, jsonResponse, {
        module: "customer_onboarding",
        action,
        allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner", "support"],
        allowedStatuses: ["active", "invited"],
      });
      if (!adminCheck.success) return adminCheck.response;
      const customerId = cleanText(payload.customerId || params.get("customerId") || params.get("customer_id"));
      if (!isUuid(customerId)) return jsonResponse(400, { success: false, error: "Kies een geldige klant." });
      const records = await loadOnboardingRecords(context, { customerId });
      if (!records.customer) return jsonResponse(404, { success: false, error: "Klant niet gevonden." });
      const result = await handleAdminAction(context, records, action, payload, adminCheck.admin);
      return jsonResponse(200, { success: true, onboarding: sanitizeOnboarding(result.onboarding), factoryInput: result.factoryInput || null, factoryRun: result.factoryRun || null });
    }

    const authUser = await getAuthUserFromRequest(context, event);
    if (!authUser?.id) return jsonResponse(401, { success: false, error: "Log in om je onboarding te openen." });
    const records = await loadOnboardingRecords(context, { authUserId: authUser.id });
    if (!records.customer) return jsonResponse(404, { success: false, error: "Je klantprofiel is nog niet gekoppeld." });

    if (event.httpMethod === "GET" || action === "get") {
      const onboarding = await ensureOnboardingOpen(context, records, { openedBy: authUser.email || records.customer.email });
      return jsonResponse(200, { success: true, onboarding: sanitizeOnboarding(onboarding), factoryInput: buildFactoryInput(records, onboarding) });
    }

    if (action === "save" || action === "submit") {
      const result = await saveCustomerOnboarding(context, records, payload, authUser, action);
      return jsonResponse(200, { success: true, onboarding: sanitizeOnboarding(result.onboarding), factoryInput: result.factoryInput });
    }

    return jsonResponse(400, { success: false, error: "Onbekende onboarding actie." });
  } catch (error) {
    console.error("Customer onboarding automation failed", {
      message: error.message,
      status: error.status || error.statusCode || 500,
    });
    return jsonResponse(error.status || error.statusCode || 500, {
      success: false,
      error: error.status || error.statusCode ? error.message : "Onboarding kon niet worden verwerkt.",
    });
  }
};

async function handleAdminAction(context, records, action, payload, admin) {
  const current = currentOnboarding(records);
  let status = current.status || "submitted";
  let eventType = "onboarding_updated";
  let title = "Onboarding bijgewerkt";
  let description = "De onboarding is bijgewerkt.";
  if (action === "needs_review" || action === "review") {
    status = "needs_review";
    eventType = "onboarding_needs_review";
    title = "Onboarding wacht op review";
    description = "De onboarding is klaar voor interne review.";
  }
  if (action === "approve") {
    status = "approved";
    eventType = "onboarding_approved";
    title = "Onboarding goedgekeurd";
    description = "De onboarding is goedgekeurd.";
  }
  if (action === "sent_to_website_factory" || action === "send_to_website_factory") {
    status = "sent_to_website_factory";
    eventType = "onboarding_sent_to_website_factory";
    title = "Onboarding naar Website Factory";
    description = "De onboarding is voorbereid als Website Factory input.";
  }
  const onboarding = normalizeOnboarding({
    ...current,
    status,
    reviewNote: cleanText(payload.reviewNote || payload.note || current.reviewNote),
    reviewedAt: ["needs_review", "review", "approve", "sent_to_website_factory", "send_to_website_factory"].includes(action) ? new Date().toISOString() : current.reviewedAt,
    reviewedBy: admin?.email || admin?.id || current.reviewedBy || "",
  }, records);
  const factoryInput = buildFactoryInput(records, onboarding);
  await persistOnboarding(context, records, onboarding, factoryInput);
  await safeTimeline({
    eventType,
    title,
    description,
    module: "onboarding",
    referenceType: "project",
    referenceId: records.project?.id || records.customer.id,
    customerId: records.customer.id,
    actorName: admin?.email || "Max Webstudio",
    actorRole: admin?.role || "admin",
    severity: status === "needs_review" ? "warning" : "success",
    metadata: { dedupeKey: `${eventType}:${records.customer.id}:${onboarding.updatedAt}`, status },
  });
  await createNotificationForOnboarding(records, eventType, title, description, status);
  let factoryRun = null;
  if (["approved", "sent_to_website_factory"].includes(status)) {
    factoryRun = await startWebsiteFactoryPipeline(context, records, factoryInput, admin).catch((error) => {
      console.error("Onboarding factory pipeline start failed", {
        message: error.message,
        customerId: records.customer.id,
        projectId: records.project?.id || "",
      });
      return { failed: true, message: "Website Factory kon nog niet automatisch starten." };
    });
  }
  return { onboarding, factoryInput, factoryRun };
}

async function startWebsiteFactoryPipeline(context, records, factoryInput, admin) {
  if (!records.project?.id) return null;
  const { startOnboardingFactoryPipeline } = require("./website-factory");
  return startOnboardingFactoryPipeline({
    ...context,
    admin: {
      id: admin?.id || admin?.authUserId || "",
      email: admin?.email || "",
      role: admin?.role || "admin",
    },
  }, {
    customerId: records.customer.id,
    projectId: records.project.id,
    factoryInput,
    factoryRunId: `factory-${records.project.id}-${Date.now()}`,
  });
}

async function saveCustomerOnboarding(context, records, payload, authUser, action) {
  const current = currentOnboarding(records);
  const answers = normalizeAnswers({ ...(current.answers || {}), ...(payload.answers || payload.onboarding || {}) });
  const uploadedFiles = await processUploads(context, records, toArray(payload.files || payload.uploads));
  const files = [...toArray(current.files), ...uploadedFiles];
  const completeness = calculateCompleteness(answers);
  const missingFields = requiredMissingFields(answers);
  const submitted = action === "submit";
  const status = submitted ? (missingFields.length ? "needs_review" : "submitted") : (current.status === "not_started" ? "in_progress" : (current.status || "in_progress"));
  const onboarding = normalizeOnboarding({
    ...current,
    answers,
    files,
    status,
    completeness,
    missingFields,
    startedAt: current.startedAt || new Date().toISOString(),
    submittedAt: submitted ? new Date().toISOString() : current.submittedAt,
    confirmed: Boolean(payload.confirmed || current.confirmed),
  }, records);
  const factoryInput = buildFactoryInput(records, onboarding);
  await persistOnboarding(context, records, onboarding, factoryInput);

  await safeTimeline({
    eventType: submitted ? "onboarding_submitted" : current.status === "not_started" ? "onboarding_started" : "onboarding_saved",
    title: submitted ? "Onboarding ingediend" : "Onboarding opgeslagen",
    description: submitted ? "De klant heeft de onboarding ingediend." : "De klant heeft onboardinggegevens opgeslagen.",
    module: "onboarding",
    referenceType: "project",
    referenceId: records.project?.id || records.customer.id,
    customerId: records.customer.id,
    actorName: authUser.email || records.customer.email || "Klant",
    actorRole: "customer",
    severity: submitted ? "success" : "info",
    metadata: { dedupeKey: `onboarding_${submitted ? "submitted" : "saved"}:${records.customer.id}:${onboarding.updatedAt}`, completeness },
  });
  await Promise.all(uploadedFiles.map((file) => safeTimeline({
    eventType: "onboarding_file_uploaded",
    title: "Onboarding bestand toegevoegd",
    description: `${file.name} is toegevoegd aan de onboarding.`,
    module: "onboarding",
    referenceType: "project",
    referenceId: records.project?.id || records.customer.id,
    customerId: records.customer.id,
    actorName: authUser.email || records.customer.email || "Klant",
    actorRole: "customer",
    severity: "info",
    metadata: { dedupeKey: `onboarding_file:${records.customer.id}:${file.id}`, fileType: file.type, storageStatus: file.storageStatus },
  })));
  await createNotificationForOnboarding(records, submitted ? "onboarding_submitted" : "onboarding_saved", submitted ? "Onboarding ingediend" : "Onboarding opgeslagen", submitted ? "De onboarding staat klaar voor review." : "De klant heeft onboardinginformatie opgeslagen.", status);
  if (submitted) await sendOnboardingSubmittedEmails(records, onboarding);
  return { onboarding, factoryInput };
}

async function ensureOnboardingOpen(context, records, meta = {}) {
  const onboarding = normalizeOnboarding(currentOnboarding(records), records);
  if (onboarding.status === "not_started") {
    onboarding.status = "in_progress";
    onboarding.openedAt = onboarding.openedAt || new Date().toISOString();
    onboarding.startedAt = onboarding.startedAt || new Date().toISOString();
    await persistOnboarding(context, records, onboarding, buildFactoryInput(records, onboarding));
    await safeTimeline({
      eventType: "onboarding_opened",
      title: "Onboarding geopend",
      description: "De klant heeft de onboarding in het portaal geopend.",
      module: "onboarding",
      referenceType: "project",
      referenceId: records.project?.id || records.customer.id,
      customerId: records.customer.id,
      actorName: meta.openedBy || records.customer.email || "Klant",
      actorRole: "customer",
      severity: "info",
      metadata: { dedupeKey: `onboarding_opened:${records.customer.id}` },
    });
  }
  return onboarding;
}

async function persistOnboarding(context, records, onboarding, factoryInput) {
  const customerMetadata = {
    ...(records.customer.metadata || {}),
    onboarding,
    onboardingStatus: onboarding.status,
    onboardingCompleteness: onboarding.completeness,
  };
  await patchRecord(context, "customers", records.customer.id, {
    metadata: customerMetadata,
    updated_at: onboarding.updatedAt,
  });
  if (records.project?.id) {
    const projectMetadata = {
      ...(records.project.metadata || {}),
      onboarding,
      websiteFactoryInput: factoryInput,
      websiteFactoryInputStatus: onboarding.status === "sent_to_website_factory" ? "ready" : onboarding.status === "approved" ? "prepared" : "draft",
    };
    const patch = {
      metadata: projectMetadata,
      updated_at: onboarding.updatedAt,
      phase: phaseForStatus(onboarding.status),
      progress: Math.max(Number(records.project.progress) || 0, progressForStatus(onboarding.status)),
    };
    if (["submitted", "needs_review"].includes(onboarding.status)) patch.status = "in_ontwikkeling";
    if (onboarding.status === "approved" || onboarding.status === "sent_to_website_factory") patch.status = "in_ontwikkeling";
    await patchRecord(context, "projects", records.project.id, patch);
  }
}

async function processUploads(context, records, files) {
  const valid = [];
  for (const file of files.slice(0, 12)) {
    const name = cleanText(file.name || file.filename).slice(0, 180);
    const type = cleanText(file.type || file.mimeType);
    const size = Number(file.size || 0);
    if (!name || !allowedFileTypes.has(type) || size > maxUploadBytes) continue;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `customers/${records.customer.id}/onboarding/${id}-${safeFilename(name)}`;
    let storageStatus = "registered";
    if (file.content || file.base64) {
      storageStatus = await tryUploadToStorage(context, storagePath, type, file.content || file.base64);
    }
    valid.push({ id, name, type, size, storagePath, storageStatus, uploadedAt: new Date().toISOString() });
  }
  return valid;
}

async function tryUploadToStorage(context, storagePath, contentType, base64) {
  try {
    const body = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ""), "base64");
    const response = await fetch(`${context.supabaseUrl}/storage/v1/object/onboarding-uploads/${encodeStoragePath(storagePath)}`, {
      method: "POST",
      headers: {
        apikey: context.serviceRoleKey,
        Authorization: `Bearer ${context.serviceRoleKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body,
    });
    return response.ok ? "stored" : "registered";
  } catch {
    return "registered";
  }
}

function buildFactoryInput(records, onboarding) {
  const answers = onboarding.answers || {};
  const branding = answers.branding || {};
  const content = answers.content || {};
  const domain = answers.domain || {};
  const marketing = answers.marketing || {};
  const company = answers.company || {};
  return {
    source: "customer_onboarding",
    customerId: records.customer.id,
    projectId: records.project?.id || "",
    invoiceId: onboarding.invoiceId || "",
    status: onboarding.status,
    completeness: onboarding.completeness,
    businessName: company.companyName || records.customer.company || records.customer.name || "",
    contactName: company.contactName || records.customer.name || "",
    email: company.email || records.customer.email || "",
    phone: company.phone || records.customer.phone || "",
    websiteUrl: domain.currentDomain || records.website?.domain || records.customer.website || "",
    packageType: records.customer.package || records.project?.metadata?.packageLabel || "",
    generatedBriefing: buildFactoryBriefing(records, onboarding),
    branding,
    pages: cleanList(content.pages),
    services: cleanList(content.services),
    texts: {
      about: cleanText(content.aboutText),
      usps: cleanText(content.usps),
      faq: cleanText(content.faq),
      reviews: cleanText(content.reviews),
    },
    uploads: toArray(onboarding.files).map((file) => ({ name: file.name, type: file.type, storagePath: file.storagePath, storageStatus: file.storageStatus })),
    domain,
    seo: {
      keywords: cleanList(marketing.keywords),
      serviceArea: cleanText(marketing.serviceArea),
      competitors: cleanList(marketing.competitors),
      audience: cleanText(marketing.audience),
      toneOfVoice: cleanText(marketing.toneOfVoice),
      offer: cleanText(marketing.offer),
    },
    toneOfVoice: cleanText(marketing.toneOfVoice),
    ctas: cleanList(content.ctas),
    socialLinks: cleanList(content.socialLinks),
    preparedAt: new Date().toISOString(),
  };
}

function buildFactoryBriefing(records, onboarding) {
  const answers = onboarding.answers || {};
  const rows = [
    ["Bedrijf", answers.company?.companyName || records.customer.company],
    ["Contactpersoon", answers.company?.contactName || records.customer.name],
    ["Openingstijden", answers.company?.openingHours],
    ["Kleuren", answers.branding?.colors],
    ["Lettertype voorkeur", answers.branding?.fontPreference],
    ["Sfeer/uitstraling", answers.branding?.lookAndFeel],
    ["Voorbeeldwebsites", cleanList(answers.branding?.exampleWebsites).join(", ")],
    ["Wel/niet", answers.branding?.mustHaveMustNot],
    ["Pagina's", cleanList(answers.content?.pages).join(", ")],
    ["Diensten", cleanList(answers.content?.services).join(", ")],
    ["Over ons", answers.content?.aboutText],
    ["USP's", answers.content?.usps],
    ["CTA's", cleanList(answers.content?.ctas).join(", ")],
    ["Veelgestelde vragen", answers.content?.faq],
    ["Reviews", answers.content?.reviews],
    ["Social links", cleanList(answers.content?.socialLinks).join(", ")],
    ["Huidig domein", answers.domain?.currentDomain],
    ["Domeinprovider", answers.domain?.provider],
    ["Domein overzetten", answers.domain?.transferDomain],
    ["E-mail op domein", answers.domain?.domainEmail],
    ["Nieuwe domeinnaam", answers.domain?.desiredDomain],
    ["Agenda", answers.domain?.calendarLink],
    ["WhatsApp", answers.domain?.whatsapp],
    ["Google Maps", answers.domain?.mapsLocation],
    ["Zoekwoorden", cleanList(answers.marketing?.keywords).join(", ")],
    ["Werkgebied", answers.marketing?.serviceArea],
    ["Concurrenten", cleanList(answers.marketing?.competitors).join(", ")],
    ["Doelgroep", answers.marketing?.audience],
    ["Tone of voice", answers.marketing?.toneOfVoice],
    ["Actie/aanbieding", answers.marketing?.offer],
    ["Extra opties", cleanList(answers.extras?.selected).join(", ")],
    ["Bestanden", toArray(onboarding.files).map((file) => file.name).join(", ")],
  ];
  return rows.filter(([, value]) => cleanText(value)).map(([label, value]) => `${label}: ${value}`).join("\n");
}

function normalizeOnboarding(input = {}, records = {}) {
  const status = allowedStatuses.has(cleanText(input.status)) ? cleanText(input.status) : "not_started";
  const answers = normalizeAnswers(input.answers || {});
  const now = new Date().toISOString();
  return {
    id: cleanText(input.id) || `onboarding-${records.customer?.id || Date.now()}`,
    customerId: records.customer?.id || cleanText(input.customerId),
    projectId: records.project?.id || cleanText(input.projectId),
    invoiceId: cleanText(input.invoiceId || input.orderId),
    status,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : calculateCompleteness(answers),
    missingFields: toArray(input.missingFields).length ? toArray(input.missingFields) : requiredMissingFields(answers),
    answers,
    files: toArray(input.files),
    confirmed: Boolean(input.confirmed),
    openedAt: cleanText(input.openedAt),
    startedAt: cleanText(input.startedAt),
    submittedAt: cleanText(input.submittedAt),
    reviewedAt: cleanText(input.reviewedAt),
    reviewedBy: cleanText(input.reviewedBy),
    reviewNote: cleanText(input.reviewNote),
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: now,
  };
}

function normalizeAnswers(input = {}) {
  return {
    company: {
      companyName: cleanText(input.company?.companyName || input.companyName),
      contactName: cleanText(input.company?.contactName || input.contactName),
      phone: cleanText(input.company?.phone || input.phone),
      email: cleanText(input.company?.email || input.email).toLowerCase(),
      address: cleanText(input.company?.address || input.address),
      kvk: cleanText(input.company?.kvk || input.kvk),
      vat: cleanText(input.company?.vat || input.btw || input.vat),
      openingHours: cleanText(input.company?.openingHours || input.openingHours),
    },
    branding: {
      colors: cleanText(input.branding?.colors || input.colors),
      fontPreference: cleanText(input.branding?.fontPreference || input.fontPreference),
      lookAndFeel: cleanText(input.branding?.lookAndFeel || input.lookAndFeel),
      exampleWebsites: cleanList(input.branding?.exampleWebsites || input.exampleWebsites),
      mustHaveMustNot: cleanText(input.branding?.mustHaveMustNot || input.mustHaveMustNot),
    },
    content: {
      pages: cleanList(input.content?.pages || input.pages),
      services: cleanList(input.content?.services || input.services),
      aboutText: cleanText(input.content?.aboutText || input.aboutText),
      usps: cleanText(input.content?.usps || input.usps),
      ctas: cleanList(input.content?.ctas || input.ctas),
      faq: cleanText(input.content?.faq || input.faq),
      reviews: cleanText(input.content?.reviews || input.reviews),
      socialLinks: cleanList(input.content?.socialLinks || input.socialLinks),
    },
    domain: {
      currentDomain: cleanText(input.domain?.currentDomain || input.currentDomain),
      provider: cleanText(input.domain?.provider || input.domainProvider),
      transferDomain: cleanText(input.domain?.transferDomain || input.transferDomain),
      domainEmail: cleanText(input.domain?.domainEmail || input.domainEmail),
      desiredDomain: cleanText(input.domain?.desiredDomain || input.desiredDomain),
      calendarLink: cleanText(input.domain?.calendarLink || input.calendarLink),
      whatsapp: cleanText(input.domain?.whatsapp || input.whatsapp),
      mapsLocation: cleanText(input.domain?.mapsLocation || input.mapsLocation),
    },
    marketing: {
      keywords: cleanList(input.marketing?.keywords || input.keywords),
      serviceArea: cleanText(input.marketing?.serviceArea || input.serviceArea),
      competitors: cleanList(input.marketing?.competitors || input.competitors),
      audience: cleanText(input.marketing?.audience || input.audience),
      toneOfVoice: cleanText(input.marketing?.toneOfVoice || input.toneOfVoice),
      offer: cleanText(input.marketing?.offer || input.offer),
    },
    extras: {
      selected: cleanList(input.extras?.selected || input.extras || input.extraOptions),
      notes: cleanText(input.extras?.notes || input.extraNotes),
    },
  };
}

function calculateCompleteness(answers = {}) {
  const required = [
    answers.company?.companyName,
    answers.company?.contactName,
    answers.company?.email,
    answers.company?.phone,
    answers.branding?.lookAndFeel,
    answers.content?.pages?.length,
    answers.content?.services?.length,
    answers.content?.ctas?.length,
    answers.domain?.currentDomain || answers.domain?.desiredDomain,
    answers.marketing?.audience,
    answers.marketing?.toneOfVoice,
  ];
  return Math.round((required.filter(Boolean).length / required.length) * 100);
}

function requiredMissingFields(answers = {}) {
  const fields = [
    ["Bedrijfsnaam", answers.company?.companyName],
    ["Contactpersoon", answers.company?.contactName],
    ["E-mail", answers.company?.email],
    ["Telefoon", answers.company?.phone],
    ["Sfeer/uitstraling", answers.branding?.lookAndFeel],
    ["Gewenste pagina's", answers.content?.pages?.length],
    ["Diensten", answers.content?.services?.length],
    ["Call-to-actions", answers.content?.ctas?.length],
    ["Domein", answers.domain?.currentDomain || answers.domain?.desiredDomain],
    ["Doelgroep", answers.marketing?.audience],
    ["Tone of voice", answers.marketing?.toneOfVoice],
  ];
  return fields.filter(([, value]) => !value).map(([label]) => label);
}

async function createNotificationForOnboarding(records, eventType, title, description, status) {
  const severity = ["needs_review"].includes(status) ? "warning" : eventType === "onboarding_submitted" ? "success" : "info";
  return safeTimeline({
    eventType,
    title,
    description,
    module: "notifications",
    referenceType: "customer_onboarding",
    referenceId: records.project?.id || records.customer.id,
    customerId: records.customer.id,
    actorName: "Max Webstudio",
    actorRole: "system",
    severity,
    isGlobal: true,
    metadata: {
      dedupeKey: `notification:${eventType}:${records.customer.id}:${Date.now()}`,
      notificationType: eventType,
      customerCompany: records.customer.company || records.customer.name || "",
    },
  });
}

async function sendOnboardingSubmittedEmails(records, onboarding) {
  const companySettings = getCompanySettings();
  const adminEmail = cleanText(process.env.ADMIN_EMAIL || companySettings.primaryEmail);
  const customerEmail = cleanText(records.customer.email);
  const company = records.customer.company || records.customer.name || "Klant";
  const summary = `Onboarding ontvangen voor ${company}. Status: ${statusLabel(onboarding.status)}. Compleetheid: ${onboarding.completeness}%.`;
  const mails = [];
  if (adminEmail) {
    mails.push(sendEmail({
      to: adminEmail,
      subject: `Onboarding klaar voor review - ${company}`,
      text: summary,
      html: renderMail("Onboarding klaar voor review", summary),
      customerId: records.customer.id,
      projectId: records.project?.id,
      templateKey: "onboarding_ready_for_review",
      templateName: "Onboarding klaar voor review",
      triggeredBy: "customer_onboarding",
    }));
  }
  if (customerEmail) {
    mails.push(sendEmail({
      to: customerEmail,
      subject: "Je onboarding is ontvangen - Max Webstudio",
      text: `Bedankt. We hebben je onboarding ontvangen en controleren alles voor de volgende stap.\n\n${summary}`,
      html: renderMail("Je onboarding is ontvangen", "Bedankt. We hebben je onboarding ontvangen en controleren alles voor de volgende stap."),
      customerId: records.customer.id,
      projectId: records.project?.id,
      templateKey: "onboarding_customer_confirmation",
      templateName: "Onboarding klantbevestiging",
      triggeredBy: "customer_onboarding",
    }));
  }
  await Promise.allSettled(mails);
}

async function loadOnboardingRecords(context, input = {}) {
  const customer = input.customerId
    ? await fetchOne(context, "customers", "id,profile_id,auth_user_id,name,company,email,phone,website,package,status,portal_status,metadata,updated_at,created_at", `id=eq.${encodeURIComponent(input.customerId)}`)
    : await fetchOne(context, "customers", "id,profile_id,auth_user_id,name,company,email,phone,website,package,status,portal_status,metadata,updated_at,created_at", `auth_user_id=eq.${encodeURIComponent(input.authUserId)}`);
  if (!customer) return { customer: null };
  const project = await fetchOne(context, "projects", "id,customer_id,website_id,name,type,status,phase,progress,metadata,updated_at,created_at", `customer_id=eq.${encodeURIComponent(customer.id)}&order=updated_at.desc`);
  const website = project?.website_id
    ? await fetchOne(context, "websites", "id,customer_id,profile_id,name,domain,live_url,status,metadata", `id=eq.${encodeURIComponent(project.website_id)}`)
    : await fetchOne(context, "websites", "id,customer_id,profile_id,name,domain,live_url,status,metadata", `customer_id=eq.${encodeURIComponent(customer.id)}&order=updated_at.desc`);
  return { customer: normalizeRecord(customer), project: normalizeRecord(project), website: normalizeRecord(website) };
}

async function getAuthUserFromRequest(context, event) {
  const authorization = cleanText(event.headers?.authorization || event.headers?.Authorization);
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: context.serviceRoleKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data;
}

async function fetchOne(context, table, select, filter) {
  const url = `${context.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&${filter}&limit=1`;
  const rows = await supabaseFetch(context, url, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patchRecord(context, table, id, patch) {
  return supabaseFetch(context, `${context.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

async function supabaseFetch(context, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: context.serviceRoleKey,
      Authorization: `Bearer ${context.serviceRoleKey}`,
      Accept: "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Onboarding data kon niet worden geladen.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function safeTimeline(input) {
  try {
    return createTimelineEvent(input);
  } catch (error) {
    console.error("Onboarding timeline event skipped", { message: error.message });
    return null;
  }
}

function currentOnboarding(records = {}) {
  return records.project?.metadata?.onboarding || records.customer?.metadata?.onboarding || {
    status: records.customer?.metadata?.onboardingStatus || "not_started",
    answers: {},
    files: [],
  };
}

function sanitizeOnboarding(onboarding = {}) {
  return {
    id: onboarding.id,
    customerId: onboarding.customerId,
    projectId: onboarding.projectId,
    invoiceId: onboarding.invoiceId,
    status: onboarding.status,
    statusLabel: statusLabel(onboarding.status),
    completeness: onboarding.completeness,
    missingFields: onboarding.missingFields,
    answers: onboarding.answers,
    files: toArray(onboarding.files).map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      storageStatus: file.storageStatus,
      uploadedAt: file.uploadedAt,
    })),
    confirmed: onboarding.confirmed,
    openedAt: onboarding.openedAt,
    startedAt: onboarding.startedAt,
    submittedAt: onboarding.submittedAt,
    reviewedAt: onboarding.reviewedAt,
    reviewNote: onboarding.reviewNote,
    updatedAt: onboarding.updatedAt,
  };
}

function normalizeRecord(row) {
  if (!row) return null;
  return { ...row, metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {} };
}

function phaseForStatus(status) {
  if (status === "submitted") return "Onboarding review";
  if (status === "needs_review") return "Review nodig";
  if (status === "approved") return "Klaar voor Website Factory";
  if (status === "sent_to_website_factory") return "Website Factory input klaar";
  return "Onboarding";
}

function progressForStatus(status) {
  if (status === "submitted") return 35;
  if (status === "needs_review") return 40;
  if (status === "approved") return 45;
  if (status === "sent_to_website_factory") return 50;
  return 20;
}

function statusLabel(status) {
  return {
    not_started: "Nog niet gestart",
    in_progress: "Mee bezig",
    submitted: "Ingediend",
    needs_review: "Wacht op review",
    approved: "Goedgekeurd",
    sent_to_website_factory: "Naar Website Factory",
  }[status] || "Onboarding";
}

function renderMail(title, text) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#102033;"><main style="max-width:640px;margin:0 auto;padding:32px;"><section style="background:#fff;border:1px solid #dce6ef;padding:28px;"><h1 style="margin-top:0;">${escapeHtml(title)}</h1><p style="line-height:1.6;">${escapeHtml(text)}</p></section></main></body></html>`;
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Verzoek kon niet worden gelezen.");
    error.status = 400;
    throw error;
  }
}

function getQueryParams(event) {
  if (event.rawQuery) return new URLSearchParams(event.rawQuery);
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, value);
  });
  return params;
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).slice(0, 24);
  return String(value || "").split(/\n|,/).map(cleanText).filter(Boolean).slice(0, 24);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isUuid(value) {
  return uuidPattern.test(cleanText(value));
}

function cleanText(value) {
  return String(value || "").trim();
}

function safeFilename(value) {
  return cleanText(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 120) || "bestand";
}

function encodeStoragePath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
