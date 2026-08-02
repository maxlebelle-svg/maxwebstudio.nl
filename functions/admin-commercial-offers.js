const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { buildOfferVersion, catalogRegistrationPayload } = require("./services/commercialOfferService");
const { buildCommercialOfferMail } = require("./services/commercialOfferMailService");
const { sendTrackedEmail } = require("./services/resendMailService");
const { adminCatalog } = require("./_commercial-catalog");
const { DOCUMENTS, validateReadyDocuments } = require("./services/commercialDocumentRegistry");
const { normalizeValidityDate, expiryIso, isExpired } = require("./services/commercialOfferValidityService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales"];
const PHASE_B_TRANSITIONS = new Set(["ready_for_review", "revoked", "superseded"]);
const SILVERADO_FOOD_DEMO = Object.freeze({
  storefrontUrl: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord",
  restaurantPortalUrl: "https://max-webstudio-food-demo.netlify.app/admin/food",
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, {
    module: "commercial_offers",
    action: event.httpMethod === "GET" ? "read" : "write",
    allowedRoles: WRITE_ROLES,
    allowedStatuses: ["active"],
    disableLegacyToken: true,
  });
  if (!auth.success) return auth.response;

  try {
    const input = parseBody(event);
    const action = clean(input.action).toLowerCase();
    const actor = { id: auth.admin.id, profileId: auth.admin.profileId, role: auth.admin.role, email: clean(auth.admin.email).toLowerCase() };
    if (!UUID.test(clean(actor.id)) || !UUID.test(clean(actor.profileId))) throw problem(403, "ACTOR_INVALID", "De actieve beheerder kon niet veilig worden vastgesteld.");
    if (event.httpMethod === "GET") {
      const config = runtimeConfig();
      if (!config.ready) throw problem(503, "OFFER_STORAGE_UNAVAILABLE", "De commerciële opslag is niet geconfigureerd.");
      return await readComposerContext(event.queryStringParameters || {}, actor, config);
    }
    if (action === "prepare_snapshot") {
      return json(200, { success: true, persisted: false, snapshot: buildOfferVersion(input, actor) });
    }
    const config = runtimeConfig();
    if (!config.ready) throw problem(503, "OFFER_STORAGE_UNAVAILABLE", "De commerciële opslag is niet geconfigureerd.");
    if (action === "create_version") return createVersion(input, actor, config);
    if (action === "transition") return transition(input, actor, config);
    if (action === "preview_mail") return previewMail(input, actor, config);
    if (action === "test_mail") return dispatchMail("test", input, actor, config);
    if (action === "definitive_send") return dispatchMail("definitive", input, actor, config);
    if (action === "revoke_interest") return revokeInterest(input, actor, config);
    throw problem(400, "ACTION_INVALID", "Kies een geldige commerciële offeractie.");
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    console.error("Commercial offer action failed", { code: error.code || "OFFER_ACTION_FAILED", status });
    return json(status, { success: false, code: error.code || "OFFER_ACTION_FAILED", error: status >= 500 ? "De offeractie kon niet veilig worden verwerkt." : error.message });
  }
};

async function createVersion(input, actor, config) {
  const relationshipType = clean(input.relationshipType).toLowerCase();
  const relationshipId = uuid(input.relationshipId, "Kies een geldige lead of klant.");
  if (!["lead", "customer"].includes(relationshipType)) throw problem(400, "RELATIONSHIP_INVALID", "Kies een geldige lead of klant.");
  const offerId = input.offerId ? uuid(input.offerId, "Het voorstel is ongeldig.") : null;
  const demoJourneyId = input.demoJourneyId ? uuid(input.demoJourneyId, "De gekoppelde demo is ongeldig.") : null;
  const factoryProjectId = input.factoryProjectId ? uuid(input.factoryProjectId, "Het Factory-dossier is ongeldig.") : null;
  const actionKey = boundedKey(input.actionKey);
  const title = clean(input.title);
  if (title.length < 2 || title.length > 180) throw problem(400, "TITLE_INVALID", "Geef het voorstel een geldige titel.");
  const documents = validateDocuments(input.documents);
  const snapshot = buildOfferVersion(input, actor);
  await assertLinkedResources({ relationshipType, relationshipId, demoJourneyId, factoryProjectId }, config);
  const catalog = catalogRegistrationPayload();
  if (["super_admin", "admin"].includes(clean(actor.role).toLowerCase().replace(/[\s-]+/g, "_"))) {
    await rpc(config, "commercial_register_catalog_version_v1", {
      input_actor_profile_id: actor.profileId,
      input_actor_auth_user_id: actor.id,
      input_catalog_key: catalog.catalog_key,
      input_version: catalog.version,
      input_checksum_sha256: catalog.checksum_sha256,
      input_catalog_snapshot: catalog.snapshot,
    });
  }
  const result = await rpc(config, "commercial_create_offer_version_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_relationship_type: relationshipType,
    input_relationship_id: relationshipId,
    input_offer_id: offerId,
    input_title: title,
    input_demo_journey_id: demoJourneyId,
    input_factory_project_id: factoryProjectId,
    input_snapshot: snapshot,
    input_lines: snapshot.lines,
    input_documents: documents,
    input_change_reason: clean(input.changeReason) || null,
    input_idempotency_key: actionKey,
  });
  return json(201, { success: true, offer: result, catalogVersion: snapshot.catalogVersion, snapshotChecksum: snapshot.checksum });
}

async function transition(input, actor, config) {
  const offerVersionId = uuid(input.offerVersionId, "De aanbodversie is ongeldig.");
  const targetStatus = clean(input.targetStatus).toLowerCase();
  if (!PHASE_B_TRANSITIONS.has(targetStatus)) throw problem(409, "PHASE_B_TRANSITION_BLOCKED", "Deze status vereist een latere, afzonderlijk gecertificeerde fase.");
  if (targetStatus === "ready_for_review") await assertReadyForReview(offerVersionId, actor, config);
  const result = await rpc(config, "commercial_transition_offer_version_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_target_status: targetStatus,
    input_reason: clean(input.reason) || null,
    input_idempotency_key: boundedKey(input.actionKey),
  });
  return json(200, { success: true, offer: result });
}

async function readComposerContext(query, actor, config) {
  const relationshipType = clean(query.relationshipType).toLowerCase();
  const relationshipId = uuid(query.relationshipId, "Kies een geldige lead of klant.");
  if (!["lead", "customer"].includes(relationshipType)) throw problem(400, "RELATIONSHIP_INVALID", "Kies een geldige lead of klant.");
  const relationship = await loadRelationship(relationshipType, relationshipId, config);
  assertRelationshipAccess(actor, relationshipType, relationship);
  const [demos, factoryProjects, history] = await Promise.all([
    loadDemos(relationshipType, relationshipId, config),
    rest(config, `factory_projects?select=id,relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,status,created_at,updated_at&relationship_type=eq.${relationshipType}&relationship_id=eq.${relationshipId}&order=updated_at.desc&limit=30`),
    loadHistory(relationshipType, relationshipId, clean(query.offerId), config),
  ]);
  return json(200, {
    success: true,
    actor: { role: normalizeRole(actor.role), profileId: actor.profileId, verifiedEmail: actor.email },
    relationship: mapRelationship(relationshipType, relationship),
    demos: demos.map(mapDemo),
    factoryProjects,
    catalog: adminCatalog(),
    documents: DOCUMENTS,
    history,
    capabilities: {
      customPrices: normalizeRole(actor.role) === "super_admin",
      previewMail: phaseD1Enabled(),
      testMail: phaseD1Enabled() && validEmail(actor.email),
      definitiveSend: phaseD1Enabled(),
      revokeInterest: phaseD1Enabled() && ["super_admin", "admin"].includes(normalizeRole(actor.role)),
      stagingMail: isStagingDeployment(),
      providersEnabled: false,
    },
  });
}

async function assertReadyForReview(offerVersionId, actor, config) {
  const versions = await rest(config, `commercial_offer_versions?select=id,offer_id,status,has_non_binding_lines,snapshot&id=eq.${offerVersionId}&limit=1`);
  const version = versions[0];
  if (!version) throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  const offers = await rest(config, `commercial_offers?select=id,relationship_type,relationship_id&id=eq.${version.offer_id}&limit=1`);
  const offer = offers[0];
  if (!offer) throw problem(404, "OFFER_NOT_FOUND", "Het voorstel bestaat niet.");
  const relationship = await loadRelationship(offer.relationship_type, offer.relationship_id, config);
  assertRelationshipAccess(actor, offer.relationship_type, relationship);
  if (version.has_non_binding_lines) throw problem(409, "NON_BINDING_LINES", "Bevestig eerst alle vanaf- en op-aanvraagprijzen.");
  const bindings = await rest(config, `commercial_offer_document_bindings?select=document_type,version_code,checksum_sha256,required&offer_version_id=eq.${offerVersionId}`);
  const readiness = validateReadyDocuments(version.snapshot || {}, bindings);
  if (!readiness.ready) throw problem(409, "DOCUMENTS_INCOMPLETE", `Verplichte documenten ontbreken of hebben een ongeldige checksum: ${readiness.missing.join(", ")}.`);
}

async function previewMail(input, actor, config) {
  assertPhaseD1Enabled();
  const offerVersionId = uuid(input.offerVersionId, "De aanbodversie is ongeldig.");
  const context = await loadMailContext(offerVersionId, actor, config);
  const mail = buildCommercialOfferMail({ relationship: context.relationship, demo: context.demo, snapshot: context.version.snapshot, mode: "preview", staging: isStagingDeployment() });
  const evidence = await rpc(config, "commercial_record_offer_preview_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_idempotency_key: boundedKey(input.actionKey),
  });
  return json(200, {
    success: true,
    preview: publicMail(mail),
    manualFallback: { subject: mail.subject.replace(/^\[TEST\]\s*/, ""), text: mail.text.replace(/^TESTMAIL[^\n]*\n?/, "") },
    evidence,
  });
}

async function dispatchMail(kind, input, actor, config) {
  assertPhaseD1Enabled();
  const offerVersionId = uuid(input.offerVersionId, "De aanbodversie is ongeldig.");
  const actionKey = boundedKey(input.actionKey);
  const context = await loadMailContext(offerVersionId, actor, config, { allowSent: kind === "definitive" });
  const snapshotExpiry = offerExpiry(context.version.snapshot);
  const recipient = resolveDispatchRecipient(kind, input, actor, context.relationship);
  let rawToken = "";
  let tokenHash = null;
  let tokenExpiresAt = null;
  let interestUrl = "";
  if (kind === "definitive") {
    rawToken = crypto.randomBytes(32).toString("base64url");
    tokenHash = sha256(rawToken);
    tokenExpiresAt = snapshotExpiry;
    interestUrl = `${siteUrl()}/voorstel-interesse.html#token=${encodeURIComponent(rawToken)}`;
  }
  const reservation = await rpc(config, "commercial_reserve_offer_dispatch_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_dispatch_kind: kind,
    input_recipient_sha256: sha256(recipient.toLowerCase()),
    input_token_sha256: tokenHash,
    input_token_expires_at: tokenExpiresAt,
    input_idempotency_key: actionKey,
  });
  if (reservation.duplicate) {
    if (reservation.status === "sent") return json(200, { success: true, duplicate: true, dispatch: reservation });
    throw problem(409, "DISPATCH_ALREADY_RESERVED", "Deze verzendactie is al veilig gereserveerd en wordt niet opnieuw uitgevoerd.");
  }
  let mail;
  try {
    mail = buildCommercialOfferMail({ relationship: { ...context.relationship, email: recipient }, demo: context.demo, snapshot: context.version.snapshot, mode: kind, interestUrl, staging: isStagingDeployment() });
  } catch (error) {
    await finalizeDispatch(config, actor, reservation.dispatchId, false, "", error.code || "mail_render_failed");
    throw error;
  }
  const result = await sendTrackedEmail({
    to: recipient,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    idempotencyKey: `commercial-offer/${kind}/${reservation.dispatchId}`,
    templateKey: `commercial_offer_${kind}`,
    templateName: kind === "test" ? "Voorstel testmail" : "Demo en voorstel",
    leadId: context.offer.relationship_type === "lead" ? context.offer.relationship_id : undefined,
    customerId: context.offer.relationship_type === "customer" ? context.offer.relationship_id : undefined,
    metadata: { offerVersion: context.version.version_number, dispatchKind: kind },
    sensitiveContent: kind === "definitive",
  });
  const sent = result.sent === true && Boolean(clean(result.id));
  const finalized = await finalizeDispatch(config, actor, reservation.dispatchId, sent, sent ? sha256(result.id) : "", result.errorCode || "provider_failed");
  if (!sent) throw problem(502, "MAIL_PROVIDER_UNCONFIRMED", "De mailprovider heeft de verzending niet bevestigd. Er wordt niet automatisch opnieuw geprobeerd.");
  return json(200, { success: true, duplicate: false, dispatch: finalized, recipient: kind === "test" ? actor.email : "customer" });
}

async function finalizeDispatch(config, actor, dispatchId, sent, providerHash, failureCode) {
  return rpc(config, "commercial_finalize_offer_dispatch_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_dispatch_id: dispatchId,
    input_sent: sent,
    input_provider_message_id_sha256: providerHash || null,
    input_failure_code: sent ? null : clean(failureCode).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80),
  });
}

async function revokeInterest(input, actor, config) {
  assertPhaseD1Enabled();
  if (!["super_admin", "admin"].includes(normalizeRole(actor.role))) throw problem(403, "OFFER_FORBIDDEN", "Alleen een beheerder mag een actieve interesselink intrekken.");
  const offerVersionId = uuid(input.offerVersionId, "De aanbodversie is ongeldig.");
  const reason = clean(input.reason);
  if (reason.length < 8 || reason.length > 500) throw problem(400, "REVOCATION_REASON_INVALID", "Geef een duidelijke reden van 8 tot 500 tekens.");
  const result = await rpc(config, "commercial_revoke_offer_interest_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_reason: reason,
    input_idempotency_key: boundedKey(input.actionKey),
  });
  const redaction = await rpc(config, "commercial_redact_offer_email_logs_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_reason: reason,
    input_idempotency_key: boundedKey(input.redactionActionKey),
  });
  return json(200, { success: true, result, redaction });
}

async function loadMailContext(offerVersionId, actor, config, options = {}) {
  const versions = await rest(config, `commercial_offer_versions?select=id,offer_id,version_number,status,has_non_binding_lines,snapshot&id=eq.${offerVersionId}&limit=1`);
  const version = versions[0];
  if (!version) throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  const offers = await rest(config, `commercial_offers?select=id,relationship_type,relationship_id,demo_journey_id,current_version_id,status&id=eq.${version.offer_id}&limit=1`);
  const offer = offers[0];
  if (!offer) throw problem(404, "OFFER_NOT_FOUND", "Het voorstel bestaat niet.");
  const relationshipRow = await loadRelationship(offer.relationship_type, offer.relationship_id, config);
  assertRelationshipAccess(actor, offer.relationship_type, relationshipRow);
  const allowedStatuses = options.allowSent ? ["ready_for_review", "sent"] : ["ready_for_review"];
  if (offer.current_version_id !== version.id || !allowedStatuses.includes(version.status) || version.has_non_binding_lines) throw problem(409, "OFFER_NOT_SEND_READY", "Alleen de actuele, volledig bindende versie die gereed is voor controle kan worden verzonden.");
  if (!offer.demo_journey_id) throw problem(409, "DEMO_REQUIRED", "Koppel eerst een geldige demo.");
  const demos = await rest(config, `demo_journeys?select=id,business_name,contact_name,demo_status,preview_url,preview_package,preview_generated_at,updated_at&id=eq.${offer.demo_journey_id}&limit=1`);
  if (!demos[0]) throw problem(409, "DEMO_REQUIRED", "De gekoppelde demo bestaat niet meer.");
  const relationshipColumn = offer.relationship_type === "lead" ? "lead_id" : "customer_id";
  const ownership = await rest(config, `demo_journeys?select=id&id=eq.${offer.demo_journey_id}&${relationshipColumn}=eq.${offer.relationship_id}&limit=1`);
  if (!ownership[0]) throw problem(409, "DEMO_RELATIONSHIP_MISMATCH", "De demo hoort niet bij deze relatie.");
  return { version, offer, relationship: mapRelationship(offer.relationship_type, relationshipRow), demo: mapDemo(demos[0]) };
}

function publicMail(mail) {
  return { subject: mail.subject, html: mail.html, text: mail.text, desktopUrl: mail.desktopUrl, mobileUrl: mail.mobileUrl, storefrontUrl: mail.storefrontUrl, restaurantPortalUrl: mail.restaurantPortalUrl, qrCodeUrl: mail.qrCodeUrl, disclaimer: mail.disclaimer, validUntil: mail.validUntil };
}

function offerExpiry(snapshot = {}) {
  const value = normalizeValidityDate(snapshot.validUntil);
  if (!value) throw problem(409, "OFFER_VALIDITY_REQUIRED", "De aanbodversie mist een geldige, server-side bepaalde geldigheidsdatum.");
  if (isExpired(value)) throw problem(409, "OFFER_EXPIRED", "De aanbodversie is verlopen en kan niet worden verzonden.");
  return expiryIso(value);
}

async function loadRelationship(type, id, config) {
  const table = type === "lead" ? "leads" : "customers";
  const rows = await rest(config, `${table}?select=*&id=eq.${id}&limit=1`);
  if (!rows[0]) throw problem(404, "RELATIONSHIP_NOT_FOUND", "De geselecteerde relatie bestaat niet.");
  return rows[0];
}

function assertRelationshipAccess(actor, type, record) {
  const actorRole = normalizeRole(actor.role);
  if (["super_admin", "admin", "sales_manager"].includes(actorRole)) return;
  const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const actorAuthId = clean(actor.id);
  const actorProfileId = clean(actor.profileId);
  const authOwners = [metadata.assignedUserId, metadata.ownerAuthUserId];
  if (type === "lead") authOwners.push(record.assigned_user_id, record.assigned_to, record.owner_id);
  const allowed = authOwners.map(clean).includes(actorAuthId)
    || [metadata.ownerProfileId, metadata.assignedProfileId].map(clean).includes(actorProfileId);
  if (!allowed) throw problem(403, "OFFER_FORBIDDEN", "U mag voor deze relatie geen voorstel beheren.");
}

async function loadDemos(type, id, config) {
  const filter = type === "lead" ? `lead_id=eq.${id}` : `customer_id=eq.${id}`;
  return rest(config, `demo_journeys?select=id,business_name,contact_name,demo_status,preview_url,preview_package,preview_generated_at,updated_at&${filter}&order=updated_at.desc&limit=30`);
}

async function assertLinkedResources({ relationshipType, relationshipId, demoJourneyId, factoryProjectId }, config) {
  if (demoJourneyId) {
    const relationshipColumn = relationshipType === "lead" ? "lead_id" : "customer_id";
    const demos = await rest(config, `demo_journeys?select=id,${relationshipColumn}&id=eq.${demoJourneyId}&${relationshipColumn}=eq.${relationshipId}&limit=1`);
    if (!demos[0]) throw problem(409, "DEMO_RELATIONSHIP_MISMATCH", "De geselecteerde demo hoort niet bij deze relatie.");
  }
  if (factoryProjectId) {
    const projects = await rest(config, `factory_projects?select=id&id=eq.${factoryProjectId}&relationship_type=eq.${relationshipType}&relationship_id=eq.${relationshipId}&limit=1`);
    if (!projects[0]) throw problem(409, "FACTORY_RELATIONSHIP_MISMATCH", "Het geselecteerde Factory-dossier hoort niet bij deze relatie.");
  }
}

async function loadHistory(type, id, requestedOfferId, config) {
  let offerQuery = `commercial_offers?select=id,title,status,current_version_id,demo_journey_id,factory_project_id,created_by_profile_id,created_at,updated_at&relationship_type=eq.${type}&relationship_id=eq.${id}&order=updated_at.desc&limit=50`;
  if (requestedOfferId) offerQuery += `&id=eq.${uuid(requestedOfferId, "Het voorstel is ongeldig.")}`;
  const offers = await rest(config, offerQuery);
  if (!offers.length) return [];
  const offerIds = offers.map((offer) => offer.id);
  const filter = `in.(${offerIds.join(",")})`;
  const versions = await rest(config, `commercial_offer_versions?select=*&offer_id=${filter}&order=version_number.desc`);
  const versionFilter = `in.(${versions.map((version) => version.id).join(",") || "00000000-0000-0000-0000-000000000000"})`;
  const [lines, documents, events, dispatches, interestTokens] = await Promise.all([
    rest(config, `commercial_offer_lines?select=*&offer_version_id=${versionFilter}&order=position.asc`),
    rest(config, `commercial_offer_document_bindings?select=*&offer_version_id=${versionFilter}&order=document_type.asc`),
    rest(config, `commercial_offer_events?select=offer_id,offer_version_id,event_type,actor_profile_id,actor_role,reason,previous_status,new_status,occurred_at,safe_metadata&offer_id=${filter}&order=occurred_at.desc`),
    rest(config, `commercial_offer_mail_dispatches?select=id,offer_id,offer_version_id,dispatch_kind,status,reserved_at,completed_at&offer_id=${filter}&order=created_at.desc`),
    rest(config, `commercial_offer_interest_tokens?select=id,offer_id,offer_version_id,expires_at,confirmed_at,revoked_at,created_at&offer_id=${filter}&order=created_at.desc`),
  ]);
  return offers.map((offer) => ({
    ...offer,
    versions: versions.filter((version) => version.offer_id === offer.id).map((version) => ({
      ...version,
      lines: lines.filter((line) => line.offer_version_id === version.id),
      documents: documents.filter((document) => document.offer_version_id === version.id),
      events: events.filter((event) => event.offer_version_id === version.id),
      dispatches: dispatches.filter((dispatch) => dispatch.offer_version_id === version.id),
      interestTokens: interestTokens.filter((token) => token.offer_version_id === version.id),
    })),
    events: events.filter((event) => event.offer_id === offer.id),
  }));
}

function mapRelationship(type, record) {
  return {
    type,
    id: record.id,
    companyName: clean(record.company_name || record.company || record.name),
    contactName: clean(record.contact_name || record.name),
    email: clean(record.email).toLowerCase(),
    phone: clean(record.phone),
    website: clean(record.website || record.website_url),
    missing: [!clean(record.company_name || record.company || record.name) && "bedrijfsnaam", !clean(record.contact_name || record.name) && "contactpersoon", !clean(record.email) && "e-mailadres", !clean(record.phone) && "telefoonnummer"].filter(Boolean),
  };
}

function mapDemo(row) {
  const meta = row.preview_package && typeof row.preview_package === "object" ? row.preview_package : {};
  const desktopUrl = absolutePreviewUrl(row.preview_url);
  const foodDemo = isSilveradoFoodDemo(row, desktopUrl);
  const storefrontUrl = foodDemo ? SILVERADO_FOOD_DEMO.storefrontUrl : "";
  const restaurantPortalUrl = foodDemo ? SILVERADO_FOOD_DEMO.restaurantPortalUrl : "";
  const mobileUrl = storefrontUrl || absolutePreviewUrl(meta.mobileUrl) || desktopUrl;
  const qrTarget = storefrontUrl || absolutePreviewUrl(meta.qrTarget) || mobileUrl;
  return {
    id: row.id,
    name: clean(row.business_name || meta.name || "Demo"),
    type: foodDemo ? "food" : clean(meta.factoryType || meta.type || "website"),
    desktopUrl,
    mobileUrl,
    storefrontUrl,
    restaurantPortalUrl,
    qrTarget,
    qrCodeUrl: signedQrCodeUrl(qrTarget),
    status: clean(row.demo_status),
    expiresAt: clean(meta.expiresAt),
    updatedAt: row.updated_at,
  };
}

function isSilveradoFoodDemo(row = {}, desktopUrl = "") {
  const meta = row.preview_package && typeof row.preview_package === "object" ? row.preview_package : {};
  const saved = meta.savedDemoSite || meta.saved_demo_site || {};
  const identity = [row.business_name, row.preview_url, desktopUrl, meta.name, saved.businessName, saved.websiteUrl]
    .map(clean)
    .join(" ")
    .toLowerCase();
  const knownPreview = identity.includes("/preview/emmerloord-rotishop") || identity.includes("/preview/emmeloord-rotishop");
  return knownPreview || (identity.includes("silverado") && (identity.includes("roti") || identity.includes("rotishop")));
}

function signedQrCodeUrl(target) {
  const safeTarget = absolutePreviewUrl(target);
  const secret = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!safeTarget || !secret) return "";
  const signature = crypto.createHmac("sha256", secret).update(safeTarget).digest("hex");
  return `${siteUrl()}/api/commercial-offer-qr?target=${encodeURIComponent(safeTarget)}&signature=${signature}`;
}

function absolutePreviewUrl(value) {
  const safe = safePreviewUrl(value);
  if (!safe) return "";
  if (safe.startsWith("https://")) return safe;
  try { return new URL(safe, siteUrl()).toString(); } catch { return ""; }
}

function safePreviewUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch { return ""; }
}

function silveradoQr(row, desktopUrl) {
  const haystack = `${clean(row?.business_name)} ${clean(desktopUrl)}`.toLowerCase();
  if (!haystack.includes("silverado") && !haystack.includes("rotishop") && !haystack.includes("roti-shop")) return "";
  try { return new URL("/assets/food/silverado/silverado-demo-qr.svg", siteUrl()).toString(); } catch { return ""; }
}

async function rest(config, path) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (response.ok && Array.isArray(data)) return data;
  console.error("Commercial composer read failed", { status: response.status, code: clean(data?.code), resource: clean(path).split("?")[0] });
  throw problem(503, "OFFER_READ_UNAVAILABLE", "De commerciële context kon niet veilig worden geladen.");
}

function validateDocuments(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 30) throw problem(400, "DOCUMENTS_INVALID", "De documentbindingen zijn ongeldig.");
  return value.map((entry) => {
    const checksumSha256 = clean(entry.checksumSha256).toLowerCase();
    const documentType = clean(entry.documentType).toLowerCase();
    const versionCode = clean(entry.versionCode);
    const storageBucket = clean(entry.storageBucket) || null;
    const storagePath = clean(entry.storagePath) || null;
    const sourceUrl = safeHttpsUrl(entry.sourceUrl);
    if (!/^[a-f0-9]{64}$/.test(checksumSha256) || !documentType || versionCode.length < 1 || versionCode.length > 120) throw problem(400, "DOCUMENT_INVALID", "Een documentversie of checksum is ongeldig.");
    if (Boolean(storageBucket && storagePath) === Boolean(sourceUrl)) throw problem(400, "DOCUMENT_SOURCE_INVALID", "Een document vereist exact één veilige bron.");
    return { documentType, versionCode, templateCode: clean(entry.templateCode) || null, checksumSha256, storageBucket, storagePath, sourceUrl, required: entry.required !== false, metadata: {} };
  });
}

function safeHttpsUrl(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("unsafe");
    return parsed.toString();
  } catch { throw problem(400, "DOCUMENT_URL_INVALID", "Document-URL moet een veilige HTTPS-URL zijn."); }
}

async function rpc(config, name, body) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const code = clean(data?.code);
  if (code === "42501") throw problem(403, "OFFER_FORBIDDEN", "U mag voor deze relatie geen voorstel beheren.");
  if (["22023", "23514", "40001", "55000"].includes(code)) throw problem(409, "OFFER_STATE_REJECTED", "De offeractie past niet bij de actuele, veilige status.");
  if (code === "P0002") throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  throw problem(503, "OFFER_RPC_UNAVAILABLE", "De beveiligde offeropslag is tijdelijk niet beschikbaar.");
}

function runtimeConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, key, ready: Boolean(url && key) };
}
function phaseD1Enabled() {
  const enabled = clean(process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED).toLowerCase() === "true";
  let siteHost = "";
  let databaseHost = "";
  try { siteHost = new URL(clean(process.env.URL || process.env.DEPLOY_PRIME_URL)).hostname.toLowerCase(); } catch {}
  try { databaseHost = new URL(clean(process.env.SUPABASE_URL)).hostname.toLowerCase(); } catch {}
  const allowedEnvironment = [
    ["maxwebstudio-staging.netlify.app", "xlxpuuycigeqhgxqtzni.supabase.co"],
    ["maxwebstudio.nl", "yxxahurphdbblkuxoeje.supabase.co"],
  ].some(([allowedSite, allowedDatabase]) => siteHost === allowedSite && databaseHost === allowedDatabase);
  return enabled && allowedEnvironment;
}
function isStagingDeployment() {
  try { return new URL(clean(process.env.URL || process.env.DEPLOY_PRIME_URL)).hostname.toLowerCase() === "maxwebstudio-staging.netlify.app"; }
  catch { return false; }
}
function assertPhaseD1Enabled() { if (!phaseD1Enabled()) throw problem(403, "PHASE_D1_DISABLED", "Deze mailfase is in deze omgeving niet geactiveerd."); }
function siteUrl() {
  const candidate = clean(process.env.URL || process.env.DEPLOY_PRIME_URL || "https://maxwebstudio-staging.netlify.app");
  try { const url = new URL(candidate); if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe"); return url.origin; }
  catch { throw problem(503, "SITE_URL_INVALID", "De veilige applicatie-URL ontbreekt."); }
}
function sha256(value) { return crypto.createHash("sha256").update(clean(value)).digest("hex"); }
function validEmail(value) { const email = clean(value); return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function resolveDispatchRecipient(kind, input = {}, actor = {}, relationship = {}) {
  if (kind === "test") {
    if (!validEmail(actor.email)) throw problem(409, "ADMIN_EMAIL_INVALID", "Het geverifieerde beheerderse-mailadres ontbreekt.");
    return clean(actor.email).toLowerCase();
  }
  const manualRecipient = clean(input.recipientEmail);
  if (manualRecipient && !validEmail(manualRecipient)) throw problem(400, "RECIPIENT_EMAIL_INVALID", "Vul een geldig verzendadres in.");
  const recipient = manualRecipient || clean(relationship.email);
  if (!validEmail(recipient)) throw problem(409, "CUSTOMER_EMAIL_REQUIRED", "Vul een geldig verzendadres in voordat u definitief verzendt.");
  return recipient.toLowerCase();
}
function parseBody(event) { if (event.httpMethod === "GET") return {}; const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || ""); if (!raw || Buffer.byteLength(raw) > 131072) throw problem(400, "BODY_INVALID", "De aanvraag is leeg of te groot."); try { return JSON.parse(raw); } catch { throw problem(400, "JSON_INVALID", "De aanvraag bevat geen geldige gegevens."); } }
function boundedKey(value) { const key = clean(value); if (key.length < 16 || key.length > 150 || !/^[a-zA-Z0-9:_-]+$/.test(key)) throw problem(400, "ACTION_KEY_INVALID", "De actiebeveiliging ontbreekt."); return key; }
function uuid(value, message) { const result = clean(value); if (!UUID.test(result)) throw problem(400, "UUID_INVALID", message); return result; }
function clean(value) { return String(value || "").trim(); }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { PHASE_B_TRANSITIONS, SILVERADO_FOOD_DEMO, buildOfferVersion, validateDocuments, assertRelationshipAccess, assertLinkedResources, mapRelationship, mapDemo, isSilveradoFoodDemo, safePreviewUrl, absolutePreviewUrl, signedQrCodeUrl, phaseD1Enabled, isStagingDeployment, sha256, publicMail, offerExpiry, resolveDispatchRecipient };
