const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildOfferVersion } = require("../functions/services/commercialOfferService");
const { buildCommercialOfferMail } = require("../functions/services/commercialOfferMailService");
const { generateCommercialOfferPdf } = require("../functions/services/commercialOfferPdfService");
const { buildCommercialOfferMetadata, commercialOfferReturnUrl, createCommercialOfferReturnToken, mapTransactionStatus, transactionSignUrl, verifyCommercialOfferReturnToken } = require("../functions/services/signhostService");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
function snapshot(purpose="definitive_offer") { return buildOfferVersion({offerPurpose:purpose,paymentChoice:"full",discountPercentage:15,selections:[{productId:"starter_site",quantity:1}]},{role:"super_admin",profileId:"00000000-0000-4000-8000-000000000001"}); }
const relation={companyName:"Voorbeeld BV",contactName:"Jan Jansen",email:"jan@voorbeeld.nl"};
const demo={desktopUrl:"https://demo.example/admin",mobileUrl:"https://demo.example/mobile",qrCodeUrl:"https://maxwebstudio.nl/api/commercial-offer-qr?x=1"};

test("offer purpose is immutable checksum input and defaults safely to personal proposal",()=>{
  const personal=snapshot("personal_proposal"),definitive=snapshot();
  assert.equal(personal.offerPurpose,"personal_proposal");assert.equal(definitive.offerPurpose,"definitive_offer");assert.notEqual(personal.checksum,definitive.checksum);
});

test("mail keeps personal interest and definitive Signhost actions explicitly separate",()=>{
  const personal=buildCommercialOfferMail({relationship:relation,demo,snapshot:snapshot("personal_proposal"),mode:"definitive",interestUrl:"https://maxwebstudio.nl/voorstel-interesse.html#token=x"});
  const definitive=buildCommercialOfferMail({relationship:relation,demo,snapshot:snapshot(),mode:"definitive",signingUrl:"https://maxwebstudio.nl/voorstel-ondertekenen.html#token=x"});
  assert.match(personal.html,/Ja, ik wil verder/);assert.match(personal.disclaimer,/geen digitale ondertekening/i);
  assert.match(definitive.html,/Bekijk offerte en onderteken/);assert.match(definitive.subject,/Definitieve offerte/);assert.match(definitive.disclaimer,/Alleen ondertekening via Signhost/i);
  assert.match(definitive.html,/BUILD BETTER ONLINE/);assert.match(definitive.html,/name="color-scheme" content="dark"/);assert.match(definitive.html,/Volgende stap/);
  assert.ok(definitive.html.indexOf("Bekijk offerte en onderteken")<definitive.html.indexOf("Demo op computer bekijken"));
  assert.doesNotMatch(personal.html,/start de beveiligde ondertekening via Signhost/i);
  assert.throws(()=>buildCommercialOfferMail({relationship:relation,demo,snapshot:snapshot(),mode:"definitive",interestUrl:"https://maxwebstudio.nl/interesse"}),/ondertekenlink/i);
});

test("generated definitive offer is a branded three-page PDF with pinned business evidence",()=>{
  const value=snapshot();const pdf=generateCommercialOfferPdf({offerId:"12345678-1234-4234-8234-123456789abc",versionNumber:3,snapshot:value,relationship:relation,documents:[{document_type:"general_terms",version_code:"algemene-voorwaarden-2026-08-b2b",checksum_sha256:"a".repeat(64)}],signerName:"Jan Jansen",signerRole:"Eigenaar"});
  const source=pdf.bytes.toString("latin1");
  assert.equal(pdf.pageCount,3);assert.equal(pdf.signaturePage,3);assert.equal(pdf.bytes.subarray(0,5).toString(),"%PDF-");assert.match(pdf.bytes.subarray(-20).toString("latin1"),/%%EOF/);
  assert.match(source,/Max Webstudio/);assert.match(source,/BUILD BETTER ONLINE/);assert.match(source,/Duidelijk vastgelegd/);assert.match(source,/DIGITALE HANDTEKENING VIA SIGNHOST/);
  assert.match(source,/algemene-voorwaarden-2026-08-b2b/);assert.doesNotMatch(source,/consumentenherroepingsrecht/i);
});

test("long definitive offers keep every line and move the Signhost field to the actual final page",()=>{
  const value=snapshot();
  const lines=Array.from({length:12},(_,index)=>({...value.lines[0],productName:`Onderdeel ${String(index+1).padStart(2,"0")}`,productDescription:`Beschrijving ${index+1}`}));
  const pdf=generateCommercialOfferPdf({offerId:"12345678-1234-4234-8234-123456789abc",versionNumber:4,snapshot:{...value,lines},relationship:relation,documents:[],signerName:"Jan Jansen",signerRole:"Eigenaar"});
  const source=pdf.bytes.toString("latin1");
  assert.equal(pdf.pageCount,4);assert.equal(pdf.signaturePage,4);assert.match(source,/Onderdeel 01/);assert.match(source,/Onderdeel 12/);assert.match(source,/4 \/ 4/);
});

test("Signhost metadata gives exactly the customer signer a signature field on the final page",()=>{
  const metadata=buildCommercialOfferMetadata({Signers:[{Id:"signer-1",Email:relation.email}]},{signerEmail:relation.email,signaturePage:3,reference:"MWS-003"});
  assert.deepEqual(metadata.Signers,{"signer-1":{FormSets:["CustomerSignature"]}});assert.equal(metadata.FormSets.CustomerSignature.Handtekening.Location.PageNumber,3);
  assert.equal(transactionSignUrl({Signers:[{SignUrl:"https://signhost.example/sign/abc"}]}),"https://signhost.example/sign/abc");assert.equal(transactionSignUrl({SignUrl:"javascript:bad"}),"");
});

test("commercial Signhost return URL is pinned to approved Max Webstudio hosts",()=>{
  assert.equal(commercialOfferReturnUrl({URL:"https://maxwebstudio.nl"}),"https://maxwebstudio.nl/offerte-ondertekening-voltooid");
  assert.equal(commercialOfferReturnUrl({URL:"https://maxwebstudio-staging.netlify.app/anything?x=1#old"}),"https://maxwebstudio-staging.netlify.app/offerte-ondertekening-voltooid");
  assert.equal(commercialOfferReturnUrl({URL:"https://attacker.example"}),"");
  assert.equal(commercialOfferReturnUrl({URL:"http://maxwebstudio.nl"}),"");
  assert.equal(commercialOfferReturnUrl({URL:"https://maxwebstudio.nl:444"}),"");
  const service=read("functions/services/signhostService.js");
  assert.match(service,/ReturnUrl:returnUrl/);
  assert.match(service,/SIGNHOST_RETURN_URL_INVALID/);
});

test("commercial return status uses a signed opaque transaction reference",()=>{
  const env={URL:"https://maxwebstudio.nl",SIGNHOST_POSTBACK_SHARED_SECRET:"test-secret-that-is-long-enough-for-hmac"};
  const id="11111111-1111-4111-8111-111111111111";
  const token=createCommercialOfferReturnToken(id,env);
  assert.match(token,new RegExp(`^${id}\\.[a-f0-9]{64}$`));
  assert.deepEqual(verifyCommercialOfferReturnToken(token,env),{valid:true,signingTransactionId:id});
  assert.equal(verifyCommercialOfferReturnToken(`${id}.${"0".repeat(64)}`,env).valid,false);
  assert.equal(commercialOfferReturnUrl(env,token),`https://maxwebstudio.nl/offerte-ondertekening-voltooid?status=${token}`);
});

test("manual reconciliation maps Signhost status without guessing a final state",()=>{
  assert.equal(mapTransactionStatus(10),"waiting_for_signer");
  assert.equal(mapTransactionStatus(20),"waiting_for_signer");
  assert.equal(mapTransactionStatus(30),"signed_pending_scan");
  assert.equal(mapTransactionStatus(40),"rejected");
  assert.equal(mapTransactionStatus(50),"expired");
  assert.equal(mapTransactionStatus(60),"cancelled");
  assert.equal(mapTransactionStatus(70),"failed");
  assert.equal(mapTransactionStatus("not-a-status"),"waiting_for_signer");
});

test("branded completion page never treats return parameters as proof",()=>{
  const page=read("public/offerte-ondertekening-voltooid.html");
  assert.match(page,/Max Webstudio/);
  assert.match(page,/wordt verwerkt/i);
  assert.match(page,/niet opnieuw te ondertekenen/i);
  assert.match(page,/sh_signerstatus/);
  assert.match(page,/history\.replaceState/);
  assert.match(page,/commercial-offer-completion-status/);
  assert.match(page,/fetch\(/);
  assert.doesNotMatch(page,/XMLHttpRequest|localStorage|sessionStorage/);
  assert.doesNotMatch(page,/sh_transactionid|sh_signerid/);
  const netlify=read("netlify.toml");
  assert.match(netlify,/from = "\/offerte-ondertekening-voltooid"[\s\S]*to = "\/offerte-ondertekening-voltooid\.html"/);
  assert.match(netlify,/for = "\/offerte-ondertekening-voltooid\*"[\s\S]*X-Robots-Tag = "noindex, nofollow, noarchive"/);
});

test("migration makes provider postback the only signed finalizer and keeps artifacts private",()=>{
  const sql=read("supabase/migrations/20260802213000_commercial_offer_signhost.sql");
  assert.match(sql,/commercial_offer_signing_transactions/);assert.match(sql,/commercial_finalize_offer_signature_v1/);assert.match(sql,/status='signed'/);assert.match(sql,/public\s*,\s*file_size_limit|values\([^\n]+false/i);assert.match(sql,/force row level security/);assert.match(sql,/grant execute.*service_role/s);assert.doesNotMatch(sql,/grant execute.*\b(?:anon|authenticated)\b/i);
});

test("customer page requires authority and displays clickable versioned documents",()=>{
  const page=read("public/voorstel-ondertekenen.html");
  assert.match(page,/authorityConfirmed/);assert.match(page,/bevoegd/);assert.match(page,/target="_blank"/);assert.match(page,/Authorization:`Bearer \$\{token\}`/);assert.match(page,/Signhost/);assert.doesNotMatch(page,/wachtwoord.{0,20}(?:verstuur|mail)/i);
});

test("verified signed postback stores both artifacts before portal activation",()=>{
  const postback=read("functions/signhost-postback.js"),activation=read("functions/services/commercialOfferActivationService.js");
  assert.match(postback,/preserveCommercialArtifacts/);assert.match(postback,/commercial_finalize_offer_signature_v1/);assert.match(postback,/activateSignedCommercialOffer/);assert.match(postback,/receiptSha256/);
  assert.match(postback,/COMMERCIAL_ARTIFACT_PRESERVATION_FAILED/);assert.match(postback,/COMMERCIAL_SIGNATURE_FINALIZATION_FAILED/);
  assert.match(postback,/commercialStorageUpload[\s\S]*"x-upsert":"true"/);
  assert.match(postback,/COMMERCIAL_SIGNING_ARTIFACT_STORAGE_FAILED_\$\{response\.status\}/);
  assert.match(activation,/ensureCustomerAuthContext/);assert.match(activation,/createInviteOrResetLink/);assert.match(activation,/lead_status:"won"/);assert.doesNotMatch(activation,/password\s*:/i);
});
