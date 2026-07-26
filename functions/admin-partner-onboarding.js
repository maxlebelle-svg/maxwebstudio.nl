const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { rest } = require("./services/partnerOnboardingAccessService");

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { success: false, error: "Methode niet toegestaan." });
  const allowedRoles = event.httpMethod === 'GET' ? ['super_admin', 'admin', 'sales_manager'] : ['super_admin', 'admin'];
  const auth = await verifyAdmin(event, json, { module: 'partner_onboarding', action: event.httpMethod === 'GET' ? 'view' : 'manage', allowedRoles });
  if (!auth.success) return auth.response;
  try {
    const context = config();
    if (event.httpMethod === 'POST') {
      const input = parse(event.body);
      const action = text(input.action);
      if (action === 'initialize') {
        await rpc(context, 'partner_initialize_onboarding', {
          input_profile_id: text(input.profileId),
          input_created_by_profile_id: auth.admin.profileId,
          input_manager_profile_id: text(input.managerProfileId) || null,
        });
      } else if (action === 'reset_step') {
        await rpc(context, 'partner_admin_reset_step', {
          input_onboarding_id: text(input.onboardingId),
          input_step_key: text(input.stepKey),
          input_actor_profile_id: auth.admin.profileId,
          input_reason: text(input.reason),
          input_idempotency_key: text(input.idempotencyKey) || `admin-reset:${crypto.randomUUID()}`,
        });
      } else if (action === 'revoke_certificate') {
        await rpc(context, 'partner_revoke_certificate', {
          input_certificate_id: text(input.certificateId).toUpperCase(),
          input_actor_profile_id: auth.admin.profileId,
          input_reason: text(input.reason),
          input_idempotency_key: text(input.idempotencyKey) || `certificate-revoke:${crypto.randomUUID()}`,
        });
      } else if (action === 'activate_partner' || action === 'suspend_partner') {
        await rpc(context, 'partner_admin_set_access', {
          input_partner_profile_id: text(input.partnerProfileId),
          input_action: action === 'activate_partner' ? 'activate' : 'suspend',
          input_actor_profile_id: auth.admin.profileId,
          input_reason: text(input.reason),
          input_idempotency_key: text(input.idempotencyKey) || `partner-access:${crypto.randomUUID()}`,
        });
      } else {
        return json(400, { success: false, error: "Onbekende beheeractie." });
      }
    }
    const partnerProfiles = await rest(context.supabaseUrl, context.serviceRoleKey, 'partner_profiles?select=id,profile_id,status,assigned_manager_profile_id,invited_at,activated_at,updated_at&order=updated_at.desc');
    const visible = auth.admin.role === 'sales_manager'
      ? partnerProfiles.filter((row) => row.assigned_manager_profile_id === auth.admin.profileId)
      : partnerProfiles;
    const profileIds = visible.map((row) => row.profile_id);
    const profiles = profileIds.length ? await rest(context.supabaseUrl, context.serviceRoleKey,
      `profiles?select=id,name,email,role,status&id=in.(${profileIds.join(',')})`) : [];
    const ids = visible.map((row) => row.id);
    const onboardings = ids.length ? await rest(context.supabaseUrl, context.serviceRoleKey, `partner_onboardings?select=*&partner_profile_id=in.(${ids.join(',')})&order=created_at.desc`) : [];
    const onboardingIds = onboardings.map((row) => row.id);
    const steps = onboardingIds.length ? await rest(context.supabaseUrl, context.serviceRoleKey, `partner_onboarding_steps?select=*&onboarding_id=in.(${onboardingIds.join(',')})&order=step_order.asc`) : [];
    const requestedCertificateId = text(event.queryStringParameters?.certificateId).toUpperCase();
    const certificateFilter = onboardingIds.length
      ? `${requestedCertificateId ? `certificate_id=eq.${encodeURIComponent(requestedCertificateId)}&` : ''}onboarding_id=in.(${onboardingIds.join(',')})`
      : '';
    const certificates = certificateFilter ? await rest(context.supabaseUrl, context.serviceRoleKey,
      `partner_certificates?select=certificate_id,onboarding_id,partner_profile_id,partner_name,certification_type,training_version_code,certificate_version,authorized_signer_name,authorized_signer_title,verification_path,status,issued_at,expires_at,revoked_at,revocation_reason,disclaimer&${certificateFilter}&order=issued_at.desc`) : [];
    const attempts = onboardingIds.length ? await rest(context.supabaseUrl, context.serviceRoleKey,
      `partner_assessment_attempts?select=id,onboarding_id,attempt_number,score,passed,submitted_at&onboarding_id=in.(${onboardingIds.join(',')})&order=submitted_at.desc`) : [];
    const events = onboardingIds.length ? await rest(context.supabaseUrl, context.serviceRoleKey,
      `partner_onboarding_events?select=id,onboarding_id,partner_profile_id,actor_profile_id,event_type,subject_type,subject_id,safe_metadata,occurred_at&onboarding_id=in.(${onboardingIds.join(',')})&order=occurred_at.desc&limit=1000`) : [];
    return json(200, { success: true, profiles, partnerProfiles: visible, onboardings, steps, attempts, certificates, events });
  } catch (error) {
    console.error("Admin partner onboarding failed", { code: error.code || "", status: error.status || 500 });
    return json(error.status || 500, { success: false, error: error.status ? error.message : "Partneronboarding kon niet worden beheerd." });
  }
};

async function rpc(context, name, body) { return rest(context.supabaseUrl, context.serviceRoleKey, `rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }); }
function config() { const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, ''); const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY); if (!supabaseUrl || !serviceRoleKey) throw Object.assign(new Error('Configuratie ontbreekt.'), { status: 500 }); return { supabaseUrl, serviceRoleKey }; }
function parse(body) { try { return JSON.parse(body || '{}'); } catch { throw Object.assign(new Error('Ongeldige invoer.'), { status: 400 }); } }
function text(value = '') { return String(value || '').trim(); }
function json(statusCode, body) { return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }
