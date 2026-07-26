const { fetchPartnerGate, SELF_COMPLETABLE_STEPS, rest } = require("./services/partnerOnboardingAccessService");
const { hasPartnerOnboardingAccess } = require("./services/profileAccessPolicy");

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  try {
    const context = config();
    const token = bearer(event);
    if (!token) return json(401, { success: false, code: "AUTH_REQUIRED", error: "Log opnieuw in." });
    const user = await authUser(context, token);
    const profile = await profileForUser(context, user.id);
    if (!profile || !hasPartnerOnboardingAccess(profile)) {
      return json(403, { success: false, code: "PARTNER_ONBOARDING_FORBIDDEN", error: "Dit account heeft geen toegang tot partneronboarding." });
    }

    if (event.httpMethod === 'POST') {
      const input = parse(event.body);
      const action = text(input.action).toLowerCase();
      const idempotencyKey = text(input.idempotencyKey || input.idempotency_key);
      if (idempotencyKey.length < 16 || idempotencyKey.length > 160) {
        return json(400, { success: false, code: "INVALID_IDEMPOTENCY_KEY", error: "De herhaalbeveiliging ontbreekt." });
      }
      if (action === 'account_activated') {
        await rpc(context, 'partner_mark_account_activated', {
          input_auth_user_id: user.id,
          input_idempotency_key: idempotencyKey,
        });
      } else if (action === 'complete_step') {
        const stepKey = text(input.stepKey || input.step_key);
        if (!SELF_COMPLETABLE_STEPS.includes(stepKey)) {
          return json(400, { success: false, code: "STEP_REQUIRES_SERVER_WORKFLOW", error: "Deze stap vereist een aparte gecontroleerde beoordeling." });
        }
        await rpc(context, 'partner_complete_training_step', {
          input_auth_user_id: user.id,
          input_step_key: stepKey,
          input_idempotency_key: idempotencyKey,
        });
      } else if (action === 'submit_assessment') {
        const answers = input.answers;
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
          return json(400, { success: false, code: "INVALID_ASSESSMENT_ANSWERS", error: "Beantwoord alle toetsvragen." });
        }
        await rpc(context, 'partner_submit_assessment', {
          input_auth_user_id: user.id,
          input_assessment_version_code: text(input.assessmentVersionCode),
          input_answers: answers,
          input_idempotency_key: idempotencyKey,
        });
      } else if (action === 'finalize_certification') {
        await rpc(context, 'partner_finalize_certification', {
          input_auth_user_id: user.id,
          input_idempotency_key: idempotencyKey,
        });
      } else if (action === 'accept_commission_plan') {
        await rpc(context, 'partner_accept_commission_plan', {
          input_auth_user_id: user.id,
          input_version_code: text(input.versionCode),
          input_idempotency_key: idempotencyKey,
        });
      } else if (action === 'accept_required_documents') {
        const versionCodes = Array.isArray(input.versionCodes) ? input.versionCodes.map(text).filter(Boolean) : [];
        await rpc(context, 'partner_accept_required_documents', {
          input_auth_user_id: user.id,
          input_version_codes: versionCodes,
          input_declaration_version: 'partner_phase_b_documents_and_agreement_nl_v2',
          input_idempotency_key: idempotencyKey,
        });
      } else {
        return json(400, { success: false, code: "INVALID_ACTION", error: "Onbekende onboardingactie." });
      }
    }

    const gate = await fetchPartnerGate({
      supabaseUrl: context.supabaseUrl,
      serviceRoleKey: context.serviceRoleKey,
      profile,
    });
    const training = gate.onboarding
      ? await fetchTraining(context, gate.onboarding.training_program_version)
      : { version: null, modules: [] };
    const certification = gate.onboarding
      ? await fetchCertification(context, gate.onboarding, gate.steps || [])
      : { assessment: null, attempts: [], certificate: null };
    const commercial = gate.partnerProfile && gate.onboarding
      ? await fetchCommercial(context, gate.partnerProfile.id, gate.onboarding.id)
      : { assignment: null, plan: null, documents: [], acceptedDocumentVersionCodes: [], ledger: [] };
    return json(200, {
      success: true,
      access: { allowed: gate.allowed, reason: gate.reason, redirectTo: gate.redirectTo || "" },
      partnerProfile: safePartnerProfile(gate.partnerProfile),
      onboarding: safeOnboarding(gate.onboarding),
      steps: (gate.steps || []).map(safeStep),
      training,
      certification,
      commercial,
    });
  } catch (error) {
    console.error("Partner onboarding request failed", { code: error.code || "", status: error.status || 500 });
    return json(error.status || 500, { success: false, code: error.code || "PARTNER_ONBOARDING_FAILED", error: error.status ? error.message : "Partneronboarding kon niet worden geladen." });
  }
};

async function authUser(context, token) {
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, { headers: { apikey: context.anonKey, Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw coded("AUTH_INVALID", 401, "Sessie is ongeldig.");
  return data;
}

async function profileForUser(context, userId) {
  const rows = await rest(context.supabaseUrl, context.serviceRoleKey, `profiles?select=id,auth_user_id,name,email,role,status&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return rows?.[0] || null;
}

async function rpc(context, name, body) {
  return rest(context.supabaseUrl, context.serviceRoleKey, `rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

async function fetchTraining(context, versionCode) {
  const versions = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_training_versions?select=id,version_code,locale,title,introduction,legal_review_status,effective_from&version_code=eq.${encodeURIComponent(versionCode)}&status=eq.published&limit=1`);
  const version = versions?.[0] || null;
  if (!version) return { version: null, modules: [] };
  const modules = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_training_modules?select=id,step_key,display_order,title,summary,content,acknowledgement_text,estimated_minutes&training_version_id=eq.${encodeURIComponent(version.id)}&order=display_order.asc`);
  return {
    version: {
      code: version.version_code,
      locale: version.locale,
      title: version.title,
      introduction: version.introduction,
      legalReviewStatus: version.legal_review_status,
      effectiveFrom: version.effective_from,
    },
    modules: (modules || []).map((module) => ({
      id: module.id,
      stepKey: module.step_key,
      order: Number(module.display_order),
      title: module.title,
      summary: module.summary,
      content: module.content,
      acknowledgementText: module.acknowledgement_text,
      estimatedMinutes: Number(module.estimated_minutes),
    })),
  };
}

async function fetchCertification(context, onboarding, steps) {
  const versions = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_assessment_versions?select=id,version_code,title,pass_score,max_attempts,questions&training_version_code=eq.${encodeURIComponent(onboarding.training_program_version)}&status=eq.published&limit=1`);
  const version = versions?.[0] || null;
  const attempts = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_assessment_attempts?select=id,attempt_number,score,passed,submitted_at&onboarding_id=eq.${encodeURIComponent(onboarding.id)}&order=attempt_number.desc`);
  const certificates = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_certificates?select=certificate_id,partner_name,certification_type,training_version_code,certificate_version,authorized_signer_name,authorized_signer_title,verification_path,status,issued_at,expires_at,revoked_at,disclaimer&onboarding_id=eq.${encodeURIComponent(onboarding.id)}&order=issued_at.desc&limit=1`);
  const trainingReady = (steps || []).filter((step) => step.step_type === 'training' || Number(step.step_order) <= 7)
    .every((step) => step.status === 'completed');
  return {
    assessment: version ? {
      versionCode: version.version_code,
      title: version.title,
      passScore: Number(version.pass_score),
      maxAttempts: Number(version.max_attempts),
      available: trainingReady && (attempts || []).length < Number(version.max_attempts),
      questions: (version.questions || []).map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: Array.isArray(question.options) ? question.options : [],
      })),
    } : null,
    attempts: (attempts || []).map((attempt) => ({
      id: attempt.id,
      attemptNumber: Number(attempt.attempt_number),
      score: Number(attempt.score),
      passed: Boolean(attempt.passed),
      submittedAt: attempt.submitted_at,
    })),
    certificate: certificates?.[0] ? {
      certificateId: certificates[0].certificate_id,
      partnerName: certificates[0].partner_name,
      certificationType: certificates[0].certification_type,
      trainingVersionCode: certificates[0].training_version_code,
      certificateVersion: certificates[0].certificate_version,
      authorizedSignerName: certificates[0].authorized_signer_name,
      authorizedSignerTitle: certificates[0].authorized_signer_title,
      verificationPath: certificates[0].verification_path,
      status: certificates[0].status,
      issuedAt: certificates[0].issued_at,
      expiresAt: certificates[0].expires_at,
      revokedAt: certificates[0].revoked_at,
      disclaimer: certificates[0].disclaimer,
    } : null,
  };
}

async function fetchCommercial(context, partnerProfileId, onboardingId) {
  const assignments = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_commission_assignments?select=id,plan_version_id,status,assigned_at,accepted_at&partner_profile_id=eq.${encodeURIComponent(partnerProfileId)}&status=in.(assigned,accepted)&limit=1`);
  const assignment = assignments?.[0] || null;
  const plans = assignment ? await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_commission_plan_versions?select=id,version_code,calculation_method,currency,locale,basis,tiers,include_one_time_projects,include_subscriptions,effective_from&status=eq.published&id=eq.${encodeURIComponent(assignment.plan_version_id)}&limit=1`) : [];
  const documents = await rest(context.supabaseUrl, context.serviceRoleKey,
    'partner_document_versions?select=id,version_code,document_type,title,content,content_hash,review_status,effective_from&status=eq.published&order=document_type.asc');
  const acceptances = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_document_acceptances?select=document_version_id,accepted_at&onboarding_id=eq.${encodeURIComponent(onboardingId)}`);
  const acceptedIds = new Set((acceptances || []).map((row) => row.document_version_id));
  const ledger = await rest(context.supabaseUrl, context.serviceRoleKey,
    `partner_commission_ledger_entries?select=id,entry_type,basis_ex_vat_cents,commission_cents,currency,earning_month,status,created_at&partner_profile_id=eq.${encodeURIComponent(partnerProfileId)}&order=created_at.desc&limit=100`);
  return {
    assignment: assignment ? { id: assignment.id, status: assignment.status, assignedAt: assignment.assigned_at, acceptedAt: assignment.accepted_at } : null,
    plan: plans?.[0] ? {
      versionCode: plans[0].version_code,
      calculationMethod: plans[0].calculation_method,
      currency: plans[0].currency,
      locale: plans[0].locale,
      basis: plans[0].basis,
      tiers: plans[0].tiers,
      includeOneTimeProjects: plans[0].include_one_time_projects,
      includeSubscriptions: plans[0].include_subscriptions,
      effectiveFrom: plans[0].effective_from,
    } : null,
    documents: (documents || []).map((document) => ({
      versionCode: document.version_code,
      documentType: document.document_type,
      title: document.title,
      content: document.content,
      contentHash: document.content_hash,
      reviewStatus: document.review_status,
      effectiveFrom: document.effective_from,
      accepted: acceptedIds.has(document.id),
    })),
    acceptedDocumentVersionCodes: (documents || []).filter((document) => acceptedIds.has(document.id)).map((document) => document.version_code),
    ledger: (ledger || []).map((entry) => ({
      id: entry.id,
      entryType: entry.entry_type,
      basisExVatCents: Number(entry.basis_ex_vat_cents),
      commissionCents: Number(entry.commission_cents),
      currency: entry.currency,
      earningMonth: entry.earning_month,
      status: entry.status,
      createdAt: entry.created_at,
    })),
  };
}

function config() {
  const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = text(process.env.SUPABASE_ANON_KEY);
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw coded("CONFIGURATION_MISSING", 500, "Partneronboarding is nog niet geconfigureerd.");
  return { supabaseUrl, anonKey, serviceRoleKey };
}

function safePartnerProfile(row) { return row ? { id: row.id, status: row.status, assignedManagerProfileId: row.assigned_manager_profile_id || null } : null; }
function safeOnboarding(row) { return row ? { id: row.id, status: row.status, currentStep: row.current_step, trainingProgramVersion: row.training_program_version, startedAt: row.started_at, completedAt: row.completed_at, activatedAt: row.activated_at } : null; }
function safeStep(row) { return { id: row.id, stepKey: row.step_key, order: Number(row.step_order), type: row.step_type, status: row.status, contentVersion: row.content_version, completedAt: row.completed_at }; }
function bearer(event) { const value = event.headers?.authorization || event.headers?.Authorization || ""; return value.startsWith("Bearer ") ? value.slice(7).trim() : ""; }
function parse(body) { try { return JSON.parse(body || "{}"); } catch { throw coded("INVALID_JSON", 400, "Ongeldige invoer."); } }
function text(value = "") { return String(value || "").trim(); }
function coded(code, status, message) { return Object.assign(new Error(message), { code, status }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) }; }

exports._private = { safePartnerProfile, safeOnboarding, safeStep, fetchTraining, fetchCertification, fetchCommercial };
