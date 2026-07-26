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
    return json(200, {
      success: true,
      access: { allowed: gate.allowed, reason: gate.reason, redirectTo: gate.redirectTo || "" },
      partnerProfile: safePartnerProfile(gate.partnerProfile),
      onboarding: safeOnboarding(gate.onboarding),
      steps: (gate.steps || []).map(safeStep),
      training,
      certification,
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
    `partner_certificates?select=certificate_id,partner_name,certification_type,training_version_code,status,issued_at,expires_at,revoked_at,disclaimer&onboarding_id=eq.${encodeURIComponent(onboarding.id)}&order=issued_at.desc&limit=1`);
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
      status: certificates[0].status,
      issuedAt: certificates[0].issued_at,
      expiresAt: certificates[0].expires_at,
      revokedAt: certificates[0].revoked_at,
      disclaimer: certificates[0].disclaimer,
    } : null,
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

exports._private = { safePartnerProfile, safeOnboarding, safeStep, fetchTraining, fetchCertification };
