const { verifyAdmin } = require('./_admin-auth');
const { rest } = require('./services/partnerOnboardingAccessService');

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { success: false, error: 'Methode niet toegestaan.' });
  const auth = await verifyAdmin(event, json, { module: 'partner_commission', action: event.httpMethod === 'GET' ? 'view' : 'reconcile', allowedRoles: ['super_admin', 'admin'] });
  if (!auth.success) return auth.response;
  try {
    const context = config();
    if (event.httpMethod === 'POST') {
      const input = parse(event.body);
      const action = text(input.action);
      if (action === 'assign_lead') {
        await rpc(context, 'partner_admin_assign_lead', { input_lead_id: text(input.leadId), input_partner_profile_id: text(input.partnerProfileId), input_actor_profile_id: auth.admin.profileId, input_reason: text(input.reason), input_idempotency_key: text(input.idempotencyKey) });
      } else if (action === 'record_canonical_payment') {
        if (text(input.provider).toLowerCase() !== 'mollie') return json(400, { success: false, error: 'Alleen de gevalideerde Mollie-provider is toegestaan.' });
        await rpc(context, 'partner_record_canonical_payment', { input_invoice_id: text(input.invoiceId), input_provider: 'mollie', input_provider_payment_id: text(input.providerPaymentId), input_provider_event_id: text(input.providerEventId), input_attribution_id: text(input.attributionId), input_idempotency_key: text(input.idempotencyKey) });
      } else if (action === 'reverse_canonical_payment') {
        await rpc(context, 'partner_reverse_canonical_payment', { input_provider: 'mollie', input_original_payment_id: text(input.originalPaymentId), input_reversal_event_id: text(input.reversalEventId), input_reversal_type: text(input.reversalType), input_reason: text(input.reason), input_idempotency_key: text(input.idempotencyKey) });
      } else return json(400, { success: false, error: 'Onbekende commissieactie.' });
    }
    const ledger = await rest(context.supabaseUrl, context.serviceRoleKey, 'partner_commission_ledger_entries?select=*&order=created_at.desc&limit=300');
    return json(200, { success: true, ledger });
  } catch (error) {
    console.error('Partner commission request failed', { code: error.code || '', status: error.status || 500 });
    return json(error.status || 500, { success: false, error: error.status ? error.message : 'Commissieverwerking is niet gelukt.' });
  }
};
async function rpc(context, name, body) { return rest(context.supabaseUrl, context.serviceRoleKey, `rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }); }
function config() { const supabaseUrl=text(process.env.SUPABASE_URL).replace(/\/$/,''); const serviceRoleKey=text(process.env.SUPABASE_SERVICE_ROLE_KEY); if(!supabaseUrl||!serviceRoleKey) throw Object.assign(new Error('Configuratie ontbreekt.'),{status:500}); return {supabaseUrl,serviceRoleKey}; }
function parse(value) { try{return JSON.parse(value||'{}');}catch{throw Object.assign(new Error('Ongeldige invoer.'),{status:400});} }
function text(value=''){return String(value||'').trim();}
function json(statusCode,body){return{statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)};}
