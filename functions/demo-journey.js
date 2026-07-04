const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const crypto = require("crypto");

const staffRoles = ["super_admin", "admin", "sales_manager", "sales_partner"];
const managerRoles = new Set(["super_admin", "admin", "sales_manager"]);
const demoStatuses = [
  "geen_demo",
  "aanvraag_ontvangen",
  "briefing_klaar",
  "intern_in_productie",
  "interne_preview_klaar",
  "preview_ingepland_voor_klant",
  "preview_verstuurd",
  "feedback_ontvangen",
  "aanpassingen_bezig",
  "definitieve_versie_klaar",
  "belafspraak_gepland",
  "verkocht",
  "afgewezen",
];
const customerVisibleStatuses = new Set([
  "aanvraag_ontvangen",
  "briefing_klaar",
  "intern_in_productie",
  "interne_preview_klaar",
  "preview_ingepland_voor_klant",
  "preview_verstuurd",
  "feedback_ontvangen",
  "aanpassingen_bezig",
  "definitieve_versie_klaar",
  "belafspraak_gepland",
  "verkocht",
]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const isClientRequest = event.queryStringParameters?.scope === "customer";
  if (isClientRequest && event.httpMethod === "GET") return readCustomerJourney(event);
  if (isClientRequest && event.httpMethod === "POST") return saveCustomerFeedback(event);

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "demo_journey",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: staffRoles,
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Demo klantreis API is nog niet geconfigureerd." });
  }

  try {
    if (event.httpMethod === "GET") return readAdminJourney({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "POST") return upsertJourney({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "PATCH") return upsertJourney({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan voor demo klantreis." });
  } catch (error) {
    const missing = isMissingTableError(error);
    console.error("Demo journey API failed", {
      method: event.httpMethod,
      role: adminCheck.admin?.role || "",
      status: error.status || 500,
      code: error.code || "",
      message: error.message,
    });
    return jsonResponse(missing ? 503 : error.status || 500, {
      success: false,
      error: missing
        ? "Demo klantreis tabellen ontbreken nog. Rol de migration voor demo_journeys uit."
        : error.message || "Demo klantreis kon niet worden verwerkt.",
      setupRequired: missing,
      diagnostics: { module: "demo_journey", reason: missing ? "missing_demo_journeys_table" : "demo_journey_api_failed" },
    });
  }
};

async function readCustomerJourney(event) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !bearer) {
    return jsonResponse(401, { success: false, error: "Log in om uw projecttijdlijn te bekijken." });
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user?.id) return jsonResponse(401, { success: false, error: "Sessie kon niet worden gecontroleerd." });

  const customerRows = await supabaseFetch(`${supabaseUrl}/rest/v1/customers?select=id,auth_user_id,email&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=10`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const customerIds = customerRows.map((customer) => cleanText(customer.id)).filter(Boolean);
  if (!customerIds.length) return jsonResponse(200, { success: true, journey: null, events: [] });

  const params = new URLSearchParams({
    select: "*",
    customer_id: `in.(${customerIds.join(",")})`,
    order: "updated_at.desc.nullslast",
    limit: "1",
  });
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const journey = rows[0] ? sanitizeCustomerJourney(mapJourney(rows[0])) : null;
  const events = journey?.id ? await readEvents({ supabaseUrl, serviceRoleKey, journeyId: journey.id, customerOnly: true }) : [];
  return jsonResponse(200, { success: true, journey, events });
}

async function saveCustomerFeedback(event) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !bearer) {
    return jsonResponse(401, { success: false, error: "Log in om feedback door te geven." });
  }

  const payload = parsePayload(event.body);
  const feedback = cleanText(payload.feedback);
  if (!feedback) return jsonResponse(400, { success: false, error: "Vul uw feedback in." });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user?.id) return jsonResponse(401, { success: false, error: "Sessie kon niet worden gecontroleerd." });

  const customerRows = await supabaseFetch(`${supabaseUrl}/rest/v1/customers?select=id,auth_user_id,email&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=10`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const customerIds = customerRows.map((customer) => cleanText(customer.id)).filter(Boolean);
  if (!customerIds.length) return jsonResponse(404, { success: false, error: "Klantprofiel niet gevonden." });

  const journeyId = cleanText(payload.id);
  const params = new URLSearchParams({
    select: "*",
    customer_id: `in.(${customerIds.join(",")})`,
    order: "updated_at.desc.nullslast",
    limit: "1",
  });
  if (journeyId) params.set("id", `eq.${journeyId}`);
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const current = rows[0];
  if (!current?.id) return jsonResponse(404, { success: false, error: "Demo-preview niet gevonden." });
  if (normalizeStatus(current.demo_status) !== "preview_verstuurd") {
    return jsonResponse(400, { success: false, error: "Feedback kan worden verstuurd zodra de preview beschikbaar is." });
  }

  const updatedRows = await patchJourney({
    supabaseUrl,
    serviceRoleKey,
    id: current.id,
    record: {
      feedback,
      demo_status: "feedback_ontvangen",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
  });
  await createEvent({ supabaseUrl, serviceRoleKey, journeyId: current.id, type: "customer_feedback", title: "Feedback verwerken", description: "Uw opmerkingen zijn ontvangen.", visible: true, createdBy: user.id });
  return jsonResponse(200, {
    success: true,
    journey: sanitizeCustomerJourney(mapJourney(updatedRows[0] || current)),
    events: await readEvents({ supabaseUrl, serviceRoleKey, journeyId: current.id, customerOnly: true }),
  });
}

async function readAdminJourney({ event, supabaseUrl, serviceRoleKey, admin }) {
  const params = event.queryStringParameters || {};
  const leadId = cleanText(params.leadId || params.lead_id);
  const id = cleanText(params.id);
  const customerId = cleanText(params.customerId || params.customer_id);
  const query = new URLSearchParams({ select: "*", order: "updated_at.desc.nullslast", limit: "25" });
  if (id) query.set("id", `eq.${id}`);
  if (leadId) query.set("lead_id", `eq.${leadId}`);
  if (customerId) query.set("customer_id", `eq.${customerId}`);
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const journeys = rows.map(mapJourney).filter((journey) => canAdminSeeJourney(journey, admin));
  const selected = journeys[0] || null;
  const events = selected ? await readEvents({ supabaseUrl, serviceRoleKey, journeyId: selected.id }) : [];
  return jsonResponse(200, { success: true, journey: selected, records: journeys, events, templates: emailTemplates() });
}

async function upsertJourney({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  const action = cleanText(payload.action);
  const current = payload.id ? (await readJourneyById({ supabaseUrl, serviceRoleKey, id: payload.id })) : null;
  if (current && !canAdminMutateJourney(mapJourney(current), admin)) {
    const error = new Error("Je mag deze demo-klantreis niet wijzigen.");
    error.status = 403;
    throw error;
  }

  if (action === "generate_email") {
    const template = buildEmailTemplate(payload.emailType || payload.demoStatus || current?.demo_status, current ? mapJourney(current) : payload);
    return jsonResponse(200, { success: true, template });
  }

  if (action === "send_email") {
    const template = buildEmailTemplate(payload.emailType || payload.demoStatus || current?.demo_status, current ? mapJourney(current) : payload);
    if (!template.to) return jsonResponse(400, { success: false, error: "E-mailadres ontbreekt voor deze demo-klantreis." });
    const result = await sendEmail({
      to: template.to,
      subject: template.subject,
      text: template.body,
      html: textToHtml(template.body),
    });
    if (current?.id) {
      await patchJourney({ supabaseUrl, serviceRoleKey, id: current.id, record: {
        last_email_status: result.sent ? `sent:${template.type}` : result.warning || "email_not_sent",
        last_email_sent_at: result.sent ? new Date().toISOString() : null,
        next_email_type: nextEmailType(template.type),
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      } });
      await createEvent({ supabaseUrl, serviceRoleKey, journeyId: current.id, type: "email", title: result.sent ? "Mail verstuurd" : "Mail niet verstuurd", description: template.subject, visible: false, createdBy: admin.id });
    }
    return jsonResponse(result.sent ? 200 : 503, { success: result.sent, sent: result.sent, warning: result.warning || "", template });
  }

  if (action === "generate_preview") {
    const sourceJourney = current ? mapJourney(current) : mapJourney({
      id: payload.id,
      lead_id: payload.leadId,
      customer_id: payload.customerId,
      business_name: payload.businessName,
      contact_name: payload.contactName,
      email: payload.email,
      phone: payload.phone,
      website_url: payload.websiteUrl,
      demo_status: payload.demoStatus,
      generated_briefing: payload.generatedBriefing,
      preview_url: payload.previewUrl,
      feedback: payload.feedback,
      internal_notes: payload.internalNotes,
      follow_up_at: payload.followUpAt,
      assigned_to: payload.assignedTo,
      created_by: admin.id,
      updated_by: admin.id,
    });
    const briefing = cleanText(payload.generatedBriefing || sourceJourney.generatedBriefing);
    if (!briefing) return jsonResponse(400, { success: false, error: "Genereer of vul eerst een briefing in." });

    let journeyId = cleanText(sourceJourney.id);
    if (!journeyId) {
      const created = await insertJourney({ supabaseUrl, serviceRoleKey, record: journeyPayload({ ...payload, demoStatus: "briefing_klaar", generatedBriefing: briefing }, admin, { create: true }) });
      journeyId = cleanText(created[0]?.id);
    }
    if (!journeyId) return jsonResponse(500, { success: false, error: "Demo-klantreis kon niet worden voorbereid voor preview." });

    const previewToken = crypto.randomBytes(18).toString("hex");
    const previewPackage = buildPreviewPackage({ ...sourceJourney, id: journeyId, generatedBriefing: briefing });
    const previewUrl = `/.netlify/functions/demo-preview?id=${encodeURIComponent(journeyId)}&token=${encodeURIComponent(previewToken)}`;
    const updatedRows = await updatePreviewJourney({ supabaseUrl, serviceRoleKey, id: journeyId, record: {
      generated_briefing: briefing,
      preview_url: previewUrl,
      preview_token: previewToken,
      preview_package: previewPackage,
      preview_generated_at: new Date().toISOString(),
      demo_status: "interne_preview_klaar",
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    } });
    const journey = mapJourney(updatedRows[0] || { ...sourceJourney, id: journeyId, preview_url: previewUrl, demo_status: "interne_preview_klaar", generated_briefing: briefing });
    await createEvent({ supabaseUrl, serviceRoleKey, journeyId, type: "preview", title: "Preview klaar", description: "De interne preview is voorbereid en staat klaar voor controle.", visible: false, createdBy: admin.id });
    const events = await readEvents({ supabaseUrl, serviceRoleKey, journeyId });
    return jsonResponse(200, {
      success: true,
      journey,
      events,
      preview: {
        url: previewUrl,
        zipUrl: `${previewUrl}&format=zip`,
        files: previewPackage.files.map((file) => ({ path: file.path, bytes: Buffer.byteLength(file.content || "", "utf8") })),
      },
    });
  }

  const record = journeyPayload(payload, admin, { create: !payload.id });
  const rows = payload.id
    ? await patchJourney({ supabaseUrl, serviceRoleKey, id: payload.id, record })
    : await insertJourney({ supabaseUrl, serviceRoleKey, record });
  const journey = mapJourney(rows[0] || {});
  await createStatusEvents({ supabaseUrl, serviceRoleKey, journey, current: current ? mapJourney(current) : null, admin });
  const events = await readEvents({ supabaseUrl, serviceRoleKey, journeyId: journey.id });
  return jsonResponse(200, { success: true, journey, events, template: buildEmailTemplate(journey.demoStatus, journey) });
}

function journeyPayload(payload = {}, admin = {}, options = {}) {
  const now = new Date().toISOString();
  const status = normalizeStatus(payload.demoStatus || payload.demo_status || "aanvraag_ontvangen");
  if (!demoStatuses.includes(status)) {
    const error = new Error("Ongeldige demo status.");
    error.status = 400;
    throw error;
  }
  const record = {
    lead_id: cleanText(payload.leadId || payload.lead_id) || null,
    customer_id: cleanText(payload.customerId || payload.customer_id) || null,
    business_name: cleanText(payload.businessName || payload.business_name || payload.companyName || payload.company),
    contact_name: cleanText(payload.contactName || payload.contact_name || payload.name),
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    website_url: cleanText(payload.websiteUrl || payload.website_url || payload.website),
    demo_status: status,
    generated_briefing: cleanText(payload.generatedBriefing || payload.generated_briefing),
    preview_url: cleanText(payload.previewUrl || payload.preview_url),
    feedback: cleanText(payload.feedback),
    internal_notes: cleanText(payload.internalNotes || payload.internal_notes || payload.notes),
    follow_up_at: cleanText(payload.followUpAt || payload.follow_up_at) || null,
    assigned_to: cleanText(payload.assignedTo || payload.assigned_to || admin.id) || null,
    email_flow_enabled: Boolean(payload.emailFlowEnabled || payload.email_flow_enabled),
    next_email_type: cleanText(payload.nextEmailType || payload.next_email_type) || nextEmailType(status),
    updated_by: admin.id,
    updated_at: now,
  };
  if (options.create) {
    record.created_by = admin.id;
    record.created_at = now;
    if (!record.business_name && !record.contact_name && !record.email) {
      const error = new Error("Vul minimaal bedrijfsnaam, contactpersoon of e-mailadres in.");
      error.status = 400;
      throw error;
    }
  }
  Object.keys(record).forEach((key) => {
    if (record[key] === "" && !["email", "phone", "website_url", "preview_url", "feedback", "internal_notes", "generated_briefing"].includes(key)) delete record[key];
  });
  return record;
}

async function insertJourney({ supabaseUrl, serviceRoleKey, record }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

async function patchJourney({ supabaseUrl, serviceRoleKey, id, record }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

async function updatePreviewJourney({ supabaseUrl, serviceRoleKey, id, record }) {
  try {
    return await patchJourney({ supabaseUrl, serviceRoleKey, id, record });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const { preview_token, preview_package, preview_generated_at, ...fallbackRecord } = record;
    return patchJourney({ supabaseUrl, serviceRoleKey, id, record: fallbackRecord });
  }
}

async function readJourneyById({ supabaseUrl, serviceRoleKey, id }) {
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows[0] || null;
}

async function readEvents({ supabaseUrl, serviceRoleKey, journeyId, customerOnly = false }) {
  const params = new URLSearchParams({
    select: "*",
    demo_journey_id: `eq.${journeyId}`,
    order: "created_at.asc",
  });
  if (customerOnly) params.set("visible_to_customer", "eq.true");
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journey_events?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows.map(mapEvent);
}

async function createStatusEvents({ supabaseUrl, serviceRoleKey, journey, current, admin }) {
  if (!journey.id) return;
  if (!current) {
    await createEvent({ supabaseUrl, serviceRoleKey, journeyId: journey.id, type: "created", title: "Demo-aanvraag ontvangen", description: "De demo-klantreis is aangemaakt.", visible: true, createdBy: admin.id });
    return;
  }
  if (current.demoStatus !== journey.demoStatus) {
    const customerTitle = customerTimelineStep(journey.demoStatus);
    await createEvent({ supabaseUrl, serviceRoleKey, journeyId: journey.id, type: "status", title: statusLabel(journey.demoStatus), description: "Status bijgewerkt in het salesportaal.", visible: false, createdBy: admin.id });
    if (customerTitle) {
      await createEvent({ supabaseUrl, serviceRoleKey, journeyId: journey.id, type: "customer_status", title: customerTitle, description: customerTimelineDescription(journey.demoStatus), visible: customerVisibleStatuses.has(journey.demoStatus), createdBy: admin.id });
    }
  }
}

async function createEvent({ supabaseUrl, serviceRoleKey, journeyId, type, title, description, visible, createdBy }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/demo_journey_events`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
    body: JSON.stringify({
      demo_journey_id: journeyId,
      event_type: cleanText(type),
      title: cleanText(title),
      description: cleanText(description),
      visible_to_customer: Boolean(visible),
      created_by: cleanText(createdBy) || null,
    }),
  });
}

function buildEmailTemplate(typeOrStatus = "", journey = {}) {
  const type = emailTypeFor(typeOrStatus);
  const name = cleanText(journey.contactName || journey.contact_name || "u");
  const business = cleanText(journey.businessName || journey.business_name || "uw bedrijf");
  const preview = cleanText(journey.previewUrl || journey.preview_url);
  const followUp = cleanText(journey.followUpAt || journey.follow_up_at);
  const templates = {
    day0_received: {
      subject: "We zijn gestart met uw website-preview",
      body: `Beste ${name},\n\nBedankt voor het prettige gesprek en uw aanvraag voor ${business}. We hebben de besproken wensen ontvangen en ons projectteam gaat hiermee aan de slag.\n\nU ontvangt de komende dagen korte updates over de voortgang. Zo weet u precies waar we staan en wanneer de eerste preview klaarstaat.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    day1_planned: {
      subject: "Uw website-preview is ingepland",
      body: `Beste ${name},\n\nUw website-preview is ingepland. De informatie uit het gesprek is verwerkt en de eerste opzet wordt voorbereid.\n\nWe controleren de belangrijkste onderdelen zoals uitstraling, structuur, contactmogelijkheden en de eerste inhoudelijke richting.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    preview_ready: {
      subject: "Uw eerste website-preview staat klaar",
      body: `Beste ${name},\n\nUw eerste website-preview staat klaar. U kunt de preview bekijken via:\n${preview || "[previewlink]"}\n\nGeef gerust uw opmerkingen, wensen en correcties door. Dan verwerken wij deze in de volgende ronde.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    feedback_received: {
      subject: "Uw feedback is ontvangen",
      body: `Beste ${name},\n\nBedankt voor uw feedback op de website-preview. We hebben uw opmerkingen ontvangen en verwerken deze zorgvuldig in de volgende versie.\n\nZodra de aanpassingen klaarstaan, nemen we opnieuw contact met u op.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    finalizing: {
      subject: "We leggen de laatste hand aan uw website",
      body: `Beste ${name},\n\nWe zijn bezig met de afronding van uw website. De laatste onderdelen worden gecontroleerd en voorbereid voor de laatste bespreking.\n\nDaarna stemmen we samen de vervolgstappen richting livegang af.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    call_reminder: {
      subject: "Onze afspraak over uw website",
      body: `Beste ${name},\n\nGraag herinneren we u aan onze afspraak over uw website${followUp ? ` op ${formatDutchDate(followUp)}` : ""}.\n\nTijdens dit moment lopen we de preview, feedback en vervolgstappen rustig met u door.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
  };
  return { type, to: cleanText(journey.email).toLowerCase(), ...templates[type] };
}

function emailTemplates() {
  return [
    ["day0_received", "Dag 0 - Aanvraag ontvangen"],
    ["day1_planned", "Dag 1 - Project ingepland"],
    ["preview_ready", "Dag 2/3 - Preview klaar"],
    ["feedback_received", "Feedback ontvangen"],
    ["finalizing", "Definitieve versie bijna klaar"],
    ["call_reminder", "Belafspraak reminder"],
  ].map(([type, label]) => ({ type, label }));
}

function emailTypeFor(value = "") {
  const key = normalizeStatus(value);
  if (["day0_received", "aanvraag_ontvangen", "geen_demo"].includes(key)) return "day0_received";
  if (["day1_planned", "briefing_klaar", "intern_in_productie", "interne_preview_klaar", "preview_ingepland_voor_klant"].includes(key)) return "day1_planned";
  if (["preview_ready", "preview_verstuurd"].includes(key)) return "preview_ready";
  if (["feedback_received", "feedback_ontvangen", "aanpassingen_bezig"].includes(key)) return "feedback_received";
  if (["finalizing", "definitieve_versie_klaar", "verkocht"].includes(key)) return "finalizing";
  if (["call_reminder", "belafspraak_gepland"].includes(key)) return "call_reminder";
  return key && emailTemplates().some((item) => item.type === key) ? key : "day0_received";
}

function nextEmailType(type = "") {
  const order = ["day0_received", "day1_planned", "preview_ready", "feedback_received", "finalizing", "call_reminder"];
  const index = order.indexOf(emailTypeFor(type));
  return order[index + 1] || "";
}

function customerTimelineStep(status = "") {
  return ({
    aanvraag_ontvangen: "Aanvraag ontvangen",
    briefing_klaar: "Project ingepland",
    intern_in_productie: "Eerste ontwerp wordt voorbereid",
    interne_preview_klaar: "Eerste ontwerp wordt voorbereid",
    preview_ingepland_voor_klant: "Preview klaar",
    preview_verstuurd: "Preview klaar",
    feedback_ontvangen: "Feedback verwerken",
    aanpassingen_bezig: "Feedback verwerken",
    definitieve_versie_klaar: "Website afronden",
    belafspraak_gepland: "Livegang voorbereiden",
    verkocht: "Livegang voorbereiden",
  })[normalizeStatus(status)] || "";
}

function customerTimelineDescription(status = "") {
  return ({
    aanvraag_ontvangen: "We hebben uw wensen ontvangen en gaan aan de slag.",
    briefing_klaar: "De informatie is verwerkt en de planning staat klaar.",
    intern_in_productie: "Het projectteam bereidt de eerste versie voor.",
    interne_preview_klaar: "De eerste versie wordt gecontroleerd.",
    preview_ingepland_voor_klant: "De preview wordt klaargezet voor verzending.",
    preview_verstuurd: "U kunt de preview bekijken en feedback doorgeven.",
    feedback_ontvangen: "Uw opmerkingen zijn ontvangen.",
    aanpassingen_bezig: "We verwerken uw feedback zorgvuldig.",
    definitieve_versie_klaar: "De laatste onderdelen worden afgerond.",
    belafspraak_gepland: "We nemen de laatste stappen samen door.",
    verkocht: "We bereiden de vervolgstappen richting livegang voor.",
  })[normalizeStatus(status)] || "";
}

function sanitizeCustomerJourney(journey = {}) {
  return {
    id: journey.id,
    businessName: journey.businessName,
    contactName: journey.contactName,
    demoStatus: journey.demoStatus,
    previewUrl: journey.demoStatus === "preview_verstuurd" ? journey.previewUrl : "",
    feedback: journey.feedback,
    followUpAt: journey.followUpAt,
    updatedAt: journey.updatedAt,
  };
}

function buildPreviewPackage(journey = {}) {
  const business = cleanText(journey.businessName) || "Demo bedrijf";
  const contact = cleanText(journey.contactName) || "Contactpersoon";
  const briefing = cleanText(journey.generatedBriefing);
  const website = cleanText(journey.websiteUrl);
  const title = `${business} website-preview`;
  const summary = extractBriefingSection(briefing, "Doel") || "Een professionele website-preview die vertrouwen opbouwt en aanvragen stimuleert.";
  const notes = extractBriefingSection(briefing, "Belangrijke aandachtspunten") || briefing.slice(0, 500);
  const html = previewHtml({ title, business, contact, website, summary, notes });
  const css = previewCss();
  const readme = [
    `# ${title}`,
    ``,
    `Dit pakket is automatisch voorbereid vanuit de demo-briefing in het salesportaal.`,
    ``,
    `## Bestanden`,
    `- index.html: interne previewpagina`,
    `- styles.css: styling voor de preview`,
    `- briefing.txt: oorspronkelijke briefinginput`,
    ``,
    `## Status`,
    `Interne preview klaar. Controleer de inhoud voordat de preview naar de klant gaat.`,
  ].join("\n");
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    businessName: business,
    files: [
      { path: "index.html", content: html },
      { path: "styles.css", content: css },
      { path: "briefing.txt", content: briefing },
      { path: "README.md", content: readme },
    ],
  };
}

function extractBriefingSection(text = "", heading = "") {
  const lines = String(text || "").split(/\r?\n/);
  const index = lines.findIndex((line) => cleanText(line).toLowerCase() === cleanText(heading).toLowerCase());
  if (index === -1) return "";
  const collected = [];
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line && !line.startsWith(" ") && /^[A-ZÀ-ÿ][A-Za-zÀ-ÿ\s/-]{2,}$/.test(line.trim()) && collected.length) break;
    if (line.trim()) collected.push(line.trim());
  }
  return collected.join(" ");
}

function previewHtml({ title, business, contact, website, summary, notes }) {
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="hero">
      <nav><strong>${escapeHtml(business)}</strong><a href="#contact">Contact</a></nav>
      <section>
        <span>Eerste website-preview</span>
        <h1>${escapeHtml(business)} online sterker zichtbaar.</h1>
        <p>${escapeHtml(summary)}</p>
        <a class="button" href="#contact">Plan een kennismaking</a>
      </section>
    </header>
    <main>
      <section class="grid">
        <article><strong>Duidelijke diensten</strong><p>Een rustige structuur waarmee bezoekers snel begrijpen wat u aanbiedt.</p></article>
        <article><strong>Vertrouwen opbouwen</strong><p>Ruimte voor projecten, klantverhalen, keurmerken en lokale herkenbaarheid.</p></article>
        <article><strong>Meer aanvragen</strong><p>Heldere contactmomenten met telefoon, formulier en directe call-to-action.</p></article>
      </section>
      <section class="panel">
        <span>Briefingnotities</span>
        <p>${escapeHtml(notes)}</p>
      </section>
      <section class="contact" id="contact">
        <div>
          <span>Contact</span>
          <h2>Bespreek de preview met ${escapeHtml(contact)}.</h2>
          <p>${website ? `Huidige website: ${escapeHtml(website)}` : "Websitegegevens worden nog aangevuld."}</p>
        </div>
        <a class="button secondary" href="mailto:${escapeHtml(String(contact).includes("@") ? contact : "")}">Feedback doorgeven</a>
      </section>
    </main>
  </body>
</html>`;
}

function previewCss() {
  return `:root{color-scheme:light;--ink:#132238;--muted:#5c697a;--line:#d9e2ef;--brand:#1d7c68;--accent:#f1b84b;--paper:#ffffff;--soft:#f5f7fb}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--soft);color:var(--ink)}a{color:inherit}nav{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:24px clamp(20px,5vw,72px)}.hero{min-height:72vh;background:linear-gradient(180deg,#ffffff 0%,#eaf3f0 100%);border-bottom:1px solid var(--line)}.hero section{max-width:860px;padding:clamp(40px,9vw,110px) clamp(20px,5vw,72px)}span{display:inline-block;color:var(--brand);font-weight:800;text-transform:uppercase;font-size:.78rem;letter-spacing:.08em}h1{font-size:clamp(2.4rem,7vw,5.8rem);line-height:.96;margin:16px 0 20px;max-width:820px}h2{font-size:clamp(1.8rem,4vw,3rem);margin:10px 0 12px}p{font-size:1.08rem;line-height:1.7;color:var(--muted);max-width:720px}.button{display:inline-flex;align-items:center;justify-content:center;margin-top:16px;padding:13px 18px;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:800}.button.secondary{background:var(--ink)}main{width:min(1120px,calc(100% - 40px));margin:0 auto;padding:42px 0 72px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.grid article,.panel,.contact{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:24px}.grid strong{font-size:1.1rem}.panel,.contact{margin-top:18px}.contact{display:flex;justify-content:space-between;gap:24px;align-items:center}@media(max-width:760px){.grid{grid-template-columns:1fr}.contact{display:block}nav{align-items:flex-start}}`;
}

function mapJourney(row = {}) {
  return {
    id: cleanText(row.id),
    leadId: cleanText(row.lead_id),
    customerId: cleanText(row.customer_id),
    businessName: cleanText(row.business_name),
    contactName: cleanText(row.contact_name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website_url),
    demoStatus: normalizeStatus(row.demo_status || "geen_demo"),
    generatedBriefing: cleanText(row.generated_briefing),
    previewUrl: cleanText(row.preview_url),
    previewPackage: row.preview_package && typeof row.preview_package === "object" ? row.preview_package : null,
    previewGeneratedAt: cleanText(row.preview_generated_at),
    feedback: cleanText(row.feedback),
    internalNotes: cleanText(row.internal_notes),
    followUpAt: cleanText(row.follow_up_at),
    assignedTo: cleanText(row.assigned_to),
    emailFlowEnabled: Boolean(row.email_flow_enabled),
    lastEmailStatus: cleanText(row.last_email_status),
    lastEmailSentAt: cleanText(row.last_email_sent_at),
    nextEmailType: cleanText(row.next_email_type),
    createdBy: cleanText(row.created_by),
    updatedBy: cleanText(row.updated_by),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function mapEvent(row = {}) {
  return {
    id: cleanText(row.id),
    demoJourneyId: cleanText(row.demo_journey_id),
    eventType: cleanText(row.event_type),
    title: cleanText(row.title),
    description: cleanText(row.description),
    visibleToCustomer: Boolean(row.visible_to_customer),
    createdAt: cleanText(row.created_at),
    createdBy: cleanText(row.created_by),
  };
}

function canAdminSeeJourney(journey = {}, admin = {}) {
  if (managerRoles.has(normalizeRole(admin.role))) return true;
  return [journey.createdBy, journey.assignedTo, journey.updatedBy].map(cleanText).includes(cleanText(admin.id));
}

function canAdminMutateJourney(journey = {}, admin = {}) {
  return canAdminSeeJourney(journey, admin);
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("Supabase gaf geen geldige JSON-response terug.");
      error.status = response.status || 500;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.status = 400;
    throw error;
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function textToHtml(value = "") {
  return String(value || "").split("\n").map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("");
}

function formatDutchDate(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" });
}

function statusLabel(status = "") {
  return normalizeStatus(status).split("_").map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function normalizeStatus(value = "") {
  return cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeRole(value = "") {
  return cleanText(value).toLowerCase();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function isMissingTableError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 404
    || text.includes("42p01")
    || text.includes("pgrst205")
    || text.includes("schema cache")
    || text.includes("could not find the table")
    || text.includes("demo_journeys")
    || text.includes("demo_journey_events");
}

function isMissingColumnError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 400
    && (text.includes("42703")
      || text.includes("pgrst204")
      || text.includes("column")
      || text.includes("could not find"));
}
