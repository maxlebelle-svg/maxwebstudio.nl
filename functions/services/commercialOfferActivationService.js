const crypto = require("node:crypto");
const { sendEmail } = require("../email");
const { _internal: welcome } = require("../admin-customer-welcome-email");

async function activateSignedCommercialOffer(context, signing) {
  const offers=await rest(context,`commercial_offers?select=*&id=eq.${signing.offer_id}&limit=1`);const offer=offers[0];
  if(!offer)throw coded("SIGNED_OFFER_MISSING",404,"Ondertekende offerte ontbreekt.");
  const sourceTable=offer.relationship_type==="lead"?"leads":"customers";
  const rows=await rest(context,`${sourceTable}?select=*&id=eq.${offer.relationship_id}&limit=1`);const source=rows[0];
  if(!source)throw coded("SIGNED_RELATIONSHIP_MISSING",404,"Relatie van de ondertekende offerte ontbreekt.");
  const customer=offer.relationship_type==="customer"?source:await ensureCustomerFromLead(context,source,offer,signing);
  const input={customerId:customer.id,name:clean(customer.name||customer.contact_name||customer.company||customer.company_name),company:clean(customer.company||customer.company_name||customer.name),email:clean(customer.email).toLowerCase(),website:clean(customer.website||customer.website_url),package:clean(customer.package||"Maatwerk")};
  const auth=await welcome.ensureCustomerAuthContext(input);
  const setup=await welcome.createInviteOrResetLink(input.email);
  const preview=welcome.buildMailPreview(input,setup);
  const actionKey=`signed-offer:${signing.offer_version_id}`;
  const result=await sendEmail({to:input.email,subject:preview.subject,html:welcome.buildWelcomeEmailHtml(input,preview),text:preview.text,templateKey:"customer_welcome_after_signed_offer",templateName:"Klantportaal na ondertekende offerte",customerId:customer.id,triggeredBy:"commercial_offer_signhost_postback",metadata:{offerId:offer.id,offerVersionId:signing.offer_version_id,signingTransactionId:signing.id,authUserId:auth.authUserId,profileId:auth.profileId},idempotencyKey:`customer.account.invitation:${customer.id}:${actionKey}`});
  await welcome.updateCustomerInvitationStatus(auth,result.sent?"sent":"send_failed",{action:"signed_offer",actionKey,providerMessageId:clean(result.id)});
  await patch(context,"commercial_offer_signing_transactions",`id=eq.${signing.id}`,{failure_code:result.sent?null:"portal_invite_send_failed",updated_at:new Date().toISOString()});
  return{customerId:customer.id,mailSent:Boolean(result.sent),auth:welcome.publicAuthContext(auth)};
}

async function ensureCustomerFromLead(context,lead,offer,signing){
  const existingId=clean(lead.converted_customer_id||lead.customer_id);
  if(existingId){const rows=await rest(context,`customers?select=*&id=eq.${existingId}&limit=1`);if(rows[0])return rows[0];}
  const email=clean(lead.email).toLowerCase();
  if(email){const existing=await rest(context,`customers?select=*&email=eq.${encodeURIComponent(email)}&limit=1`);if(existing[0]){await markLeadWon(context,lead,existing[0].id,offer,signing);return existing[0];}}
  const now=new Date().toISOString();const customerRows=await rest(context,"customers",{method:"POST",body:{id:crypto.randomUUID(),name:clean(lead.contact_name||lead.name||lead.company_name||lead.company),company:clean(lead.company_name||lead.company||lead.name),email,phone:clean(lead.phone),website:clean(lead.website||lead.website_url),package:"Maatwerk",status:"onboarding",portal_status:"prepared",metadata:{createdBy:"commercial_offer_signhost_postback",createdFromLeadId:lead.id,signedOfferId:offer.id,signedOfferVersionId:signing.offer_version_id,signedAt:signing.signed_at||now},updated_at:now}});
  const customer=customerRows[0];if(!customer?.id)throw coded("CUSTOMER_CREATION_FAILED",502,"Klant kon na ondertekening niet worden aangemaakt.");
  await markLeadWon(context,lead,customer.id,offer,signing);return customer;
}
async function markLeadWon(context,lead,customerId,offer,signing){const now=new Date().toISOString();const metadata={...(lead.metadata&&typeof lead.metadata==="object"?lead.metadata:{}),wonAt:now,wonReason:"signed_commercial_offer",signedOfferId:offer.id,signedOfferVersionId:signing.offer_version_id,convertedCustomerId:customerId};await patch(context,"leads",`id=eq.${lead.id}`,{converted_customer_id:customerId,customer_id:customerId,converted_at:now,status:"converted",lead_status:"won",won_at:now,metadata,updated_at:now});}
async function rest(c,route,options={}){const response=await fetch(`${c.url}/rest/v1/${route}`,{method:options.method||"GET",headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,Accept:"application/json","Content-Type":"application/json",Prefer:"return=representation"},body:options.body?JSON.stringify(options.body):undefined});const data=await response.json().catch(()=>null);if(!response.ok)throw coded(data?.code||"ACTIVATION_STORAGE_FAILED",response.status,data?.message||"Automatische klantactivatie mislukt.");return data;}
async function patch(c,table,filter,body){return rest(c,`${table}?${filter}`,{method:"PATCH",body});}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,status});}
module.exports={activateSignedCommercialOffer,_test:{ensureCustomerFromLead}};
