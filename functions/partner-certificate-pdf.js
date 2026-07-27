const { rest } = require('./services/partnerOnboardingAccessService');
const { generateCertificatePdf } = require('./services/certificatePdfService');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { success:false, error:'Methode niet toegestaan.' });
  try {
    const context = config();
    const token = bearer(event);
    if (!token) return json(401, { success:false, error:'Log opnieuw in.' });
    const user = await authUser(context, token);
    const profiles = await rest(context.supabaseUrl, context.serviceRoleKey, `profiles?select=id,role,status,auth_user_id&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const profile = profiles?.[0];
    if (!profile) return json(403, { success:false, error:'Geen profieltoegang.' });
    const certificateId = text(event.queryStringParameters?.certificateId).toUpperCase();
    if (!/^MWS-PARTNER-[A-F0-9]{16}$/.test(certificateId)) return json(400, { success:false, error:'Ongeldig certificaatnummer.' });
    const certificates = await rest(context.supabaseUrl, context.serviceRoleKey,
      `partner_certificates?select=certificate_id,partner_profile_id,partner_name,certification_type,training_version_code,certificate_version,authorized_signer_name,authorized_signer_title,verification_path,status,issued_at,expires_at,disclaimer&certificate_id=eq.${encodeURIComponent(certificateId)}&limit=1`);
    const certificate = certificates?.[0];
    if (!certificate) return json(404, { success:false, error:'Certificaat niet gevonden.' });
    const partnerProfiles = await rest(context.supabaseUrl, context.serviceRoleKey,
      `partner_profiles?select=id,profile_id,assigned_manager_profile_id&id=eq.${encodeURIComponent(certificate.partner_profile_id)}&limit=1`);
    const partnerProfile = partnerProfiles?.[0];
    if (!allowed(profile, partnerProfile)) return json(403, { success:false, error:'Geen toegang tot dit certificaat.' });
    const pdf = generateCertificatePdf(toCertificate(certificate), { baseUrl: process.env.SITE_URL || process.env.URL || 'https://maxwebstudio.nl' });
    return { statusCode:200, isBase64Encoded:true, headers:{ 'Content-Type':'application/pdf', 'Content-Disposition':`attachment; filename="${certificate.certificate_id}.pdf"`, 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' }, body:pdf.toString('base64') };
  } catch (error) {
    console.error('Partner certificate PDF failed',{code:error.code||'',status:error.status||500});
    return json(error.status||500,{success:false,error:error.status?error.message:'Certificaat kon niet worden gegenereerd.'});
  }
};

function allowed(profile, partnerProfile) {
  if (!partnerProfile) return false;
  if (profile.role === 'sales_partner') return partnerProfile.profile_id === profile.id && ['pending','active','disabled'].includes(profile.status);
  if (['super_admin','admin'].includes(profile.role)) return profile.status === 'active';
  return profile.role === 'sales_manager' && profile.status === 'active' && partnerProfile.assigned_manager_profile_id === profile.id;
}
function toCertificate(row){return{certificateId:row.certificate_id,partnerName:row.partner_name,certificationType:row.certification_type,trainingVersionCode:row.training_version_code,certificateVersion:row.certificate_version,authorizedSignerName:row.authorized_signer_name,authorizedSignerTitle:row.authorized_signer_title,verificationPath:row.verification_path,issuedAt:row.issued_at,expiresAt:row.expires_at,disclaimer:row.disclaimer};}
async function authUser(context,token){const response=await fetch(`${context.supabaseUrl}/auth/v1/user`,{headers:{apikey:context.anonKey,Authorization:`Bearer ${token}`,Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok||!data.id)throw Object.assign(new Error('Sessie is ongeldig.'),{status:401});return data;}
function config(){const supabaseUrl=text(process.env.SUPABASE_URL).replace(/\/$/,'');const anonKey=text(process.env.SUPABASE_ANON_KEY);const serviceRoleKey=text(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!supabaseUrl||!anonKey||!serviceRoleKey)throw Object.assign(new Error('Configuratie ontbreekt.'),{status:500});return{supabaseUrl,anonKey,serviceRoleKey};}
function bearer(event){const value=event.headers?.authorization||event.headers?.Authorization||'';return value.startsWith('Bearer ')?value.slice(7).trim():'';}
function text(value=''){return String(value||'').trim();}
function json(statusCode,body){return{statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(body)};}

exports._private={allowed,toCertificate};
