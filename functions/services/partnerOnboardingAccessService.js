const { normalizeRole, normalizeProfileStatus } = require("./profileAccessPolicy");

const REQUIRED_ONBOARDING_STEPS = Object.freeze([
  "welcome",
  "vision",
  "working_principles",
  "lead_and_task_registration",
  "privacy_confidentiality",
  "responsible_customer_contact",
  "sales_process_call_script",
  "commission_system",
  "knowledge_assessment",
  "document_acceptance",
]);

const SELF_COMPLETABLE_STEPS = Object.freeze([
  "welcome",
  "vision",
  "working_principles",
  "lead_and_task_registration",
  "privacy_confidentiality",
  "responsible_customer_contact",
  "sales_process_call_script",
]);

function evaluatePartnerGate({ profile = {}, partnerProfile = null, onboarding = null, steps = [], documentAcceptanceCurrent = true, certificateCurrent = true } = {}) {
  const role = normalizeRole(profile.role);
  const profileStatus = normalizeProfileStatus(profile.status);
  if (role !== "sales_partner") {
    return { required: false, allowed: profileStatus === "active", reason: profileStatus === "active" ? "not_partner" : "profile_inactive" };
  }
  if (profileStatus !== "active") {
    return { required: true, allowed: false, reason: "profile_not_active", redirectTo: "/partner-onboarding.html" };
  }
  if (!partnerProfile || !onboarding) {
    return { required: true, allowed: false, reason: "onboarding_missing", redirectTo: "/partner-onboarding.html" };
  }
  if (partnerProfile.status !== "active") {
    return { required: true, allowed: false, reason: "partner_not_active", redirectTo: "/partner-onboarding.html" };
  }
  if (onboarding.status !== "active") {
    return { required: true, allowed: false, reason: "onboarding_not_active", redirectTo: "/partner-onboarding.html" };
  }
  if (!certificateCurrent) {
    return { required: true, allowed: false, reason: "certificate_not_valid", redirectTo: "/partner-onboarding.html" };
  }
  const statuses = new Map((Array.isArray(steps) ? steps : []).map((step) => [step.step_key || step.stepKey, step.status]));
  const incompleteSteps = REQUIRED_ONBOARDING_STEPS.filter((key) => statuses.get(key) !== "completed");
  if (!documentAcceptanceCurrent && !incompleteSteps.includes('document_acceptance')) incompleteSteps.push('document_acceptance');
  if (incompleteSteps.length) {
    return { required: true, allowed: false, reason: "required_steps_incomplete", incompleteSteps, redirectTo: "/partner-onboarding.html" };
  }
  return { required: true, allowed: true, reason: "partner_active", incompleteSteps: [] };
}

async function fetchPartnerGate({ supabaseUrl, serviceRoleKey, profile }) {
  if (normalizeRole(profile?.role) !== "sales_partner") return evaluatePartnerGate({ profile });
  if (!supabaseUrl || !serviceRoleKey || !profile?.id) {
    return { required: true, allowed: false, reason: "gate_configuration_missing", redirectTo: "/partner-onboarding.html" };
  }

  const partnerProfiles = await rest(supabaseUrl, serviceRoleKey,
    `partner_profiles?select=id,profile_id,status,assigned_manager_profile_id&profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
  const partnerProfile = partnerProfiles?.[0] || null;
  if (!partnerProfile) return evaluatePartnerGate({ profile });

  const onboardings = await rest(supabaseUrl, serviceRoleKey,
    `partner_onboardings?select=id,partner_profile_id,status,current_step,training_program_version,started_at,completed_at,activated_at&partner_profile_id=eq.${encodeURIComponent(partnerProfile.id)}&order=created_at.desc&limit=1`);
  const onboarding = onboardings?.[0] || null;
  const steps = onboarding
    ? await rest(supabaseUrl, serviceRoleKey,
      `partner_onboarding_steps?select=id,onboarding_id,step_key,step_order,step_type,status,content_version,completed_at&onboarding_id=eq.${encodeURIComponent(onboarding.id)}&order=step_order.asc`)
    : [];
  const requiredDocuments = onboarding
    ? await rest(supabaseUrl, serviceRoleKey, 'partner_document_versions?select=id,version_code&status=eq.published')
    : [];
  const acceptances = onboarding
    ? await rest(supabaseUrl, serviceRoleKey, `partner_document_acceptances?select=document_version_id&onboarding_id=eq.${encodeURIComponent(onboarding.id)}`)
    : [];
  const acceptedDocumentIds = new Set((acceptances || []).map((row) => row.document_version_id));
  const documentAcceptanceCurrent = Array.isArray(requiredDocuments) && requiredDocuments.length > 0
    && requiredDocuments.every((document) => acceptedDocumentIds.has(document.id));
  const validCertificates = onboarding
    ? await rest(supabaseUrl, serviceRoleKey, `partner_certificates?select=id,certificate_id,status,expires_at&onboarding_id=eq.${encodeURIComponent(onboarding.id)}&status=eq.valid&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`)
    : [];
  const certificateCurrent = Array.isArray(validCertificates) && validCertificates.length === 1;

  return {
    ...evaluatePartnerGate({ profile, partnerProfile, onboarding, steps, documentAcceptanceCurrent, certificateCurrent }),
    partnerProfile,
    onboarding,
    steps: Array.isArray(steps) ? steps : [],
    documentAcceptanceCurrent,
    requiredDocumentVersions: (requiredDocuments || []).map((document) => document.version_code),
    certificateCurrent,
  };
}

async function rest(supabaseUrl, serviceRoleKey, route, options = {}) {
  const response = await fetch(`${String(supabaseUrl).replace(/\/$/, "")}/rest/v1/${route}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Partner onboarding gate lookup failed.");
    error.status = response.status;
    error.code = data?.code || "PARTNER_GATE_LOOKUP_FAILED";
    throw error;
  }
  return data;
}

module.exports = {
  REQUIRED_ONBOARDING_STEPS,
  SELF_COMPLETABLE_STEPS,
  evaluatePartnerGate,
  fetchPartnerGate,
  rest,
};
