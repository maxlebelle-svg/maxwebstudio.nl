const crypto = require("node:crypto");

const API_BASE = "https://api.signhost.com";
const FINAL_STATUSES = new Map([
  [30, "signed_pending_scan"],
  [40, "rejected"],
  [50, "expired"],
  [60, "cancelled"],
  [70, "failed"],
]);

function signhostConfig() {
  const appKey = clean(process.env.SIGNHOST_APP_KEY);
  const userToken = clean(process.env.SIGNHOST_USER_TOKEN);
  if (!appKey || !userToken) throw coded("SIGNHOST_NOT_CONFIGURED", 503, "Digitale ondertekening is nog niet volledig geconfigureerd.");
  return { appKey, userToken, baseUrl:API_BASE };
}

async function signhostRequest(config, path, options = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method:options.method || "GET",
    headers:{
      Application:`APPKey ${config.appKey}`,
      Authorization:`APIKey ${config.userToken}`,
      Accept:options.accept || "application/json",
      ...(options.contentType ? { "Content-Type":options.contentType } : {}),
    },
    body:options.body,
  });
  if (options.binary) {
    if (!response.ok) throw await signhostError(response);
    return { bytes:Buffer.from(await response.arrayBuffer()), contentType:response.headers.get("content-type") || "application/pdf" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data);
  return data;
}

async function createTransaction(config, input) {
  const signerVerification = verification(input.verificationMethod, input.signerPhone, input.signerName);
  const countersignerVerification = verification("Scribble", "", input.countersignerName);
  return signhostRequest(config, "/api/transaction/", {
    method:"POST",
    contentType:"application/json",
    body:JSON.stringify({
      Signers:[
        {
          Email:input.signerEmail,
          Language:"nl-NL",
          Verifications:[signerVerification],
          SendSignRequest:true,
          SignRequestSubject:"Onderteken je ZZP-overeenkomst met Max Webstudio",
          SignRequestMessage:"Beste partner, controleer en onderteken de definitieve ZZP-overeenkomst. Met vriendelijke groet, Max Webstudio.",
          SendSignConfirmation:true,
          DaysToRemind:3,
        },
        {
          Email:input.countersignerEmail,
          Language:"nl-NL",
          Verifications:[countersignerVerification],
          SendSignRequest:true,
          SignRequestSubject:"Medeondertekening ZZP-overeenkomst",
          SignRequestMessage:`De ZZP-overeenkomst met ${input.signerName} staat klaar voor medeondertekening.`,
          SendSignConfirmation:true,
          DaysToRemind:3,
        },
      ],
      SendEmailNotifications:true,
    }),
  });
}

function verification(method, phone, name) {
  if (method === "PhoneNumber") {
    const number = normalizePhone(phone);
    if (!number) throw coded("SIGNER_PHONE_REQUIRED", 409, "Vul eerst een mobiel telefoonnummer met landcode in, bijvoorbeeld +31612345678.");
    return { Type:"PhoneNumber", Number:number, SecureDownload:true };
  }
  if (method === "Consent") return { Type:"Consent" };
  return { Type:"Scribble", RequireHandsignature:true, ScribbleName:name, ScribbleNameFixed:true };
}

async function uploadPdf(config, transactionId, fileId, bytes) {
  return signhostRequest(config, `/api/transaction/${encodeURIComponent(transactionId)}/file/${encodeURIComponent(fileId)}`, {
    method:"PUT", contentType:"application/pdf", body:bytes,
  });
}

async function uploadFileMetadata(config, transactionId, fileId, metadata) {
  return signhostRequest(config, `/api/transaction/${encodeURIComponent(transactionId)}/file/${encodeURIComponent(fileId)}`, {
    method:"PUT", contentType:"application/json", body:JSON.stringify(metadata),
  });
}

function buildAgreementMetadata(transaction, input) {
  const signers = Array.isArray(transaction?.Signers) ? transaction.Signers : [];
  const partnerId = signerId(signers, input.signerEmail, 0);
  const countersignerId = signerId(signers, input.countersignerEmail, 1);
  if (!partnerId || !countersignerId || partnerId === countersignerId) {
    throw coded("SIGNHOST_SIGNERS_INVALID", 502, "Signhost gaf geen geldige ondertekenaars terug.");
  }
  return {
    DisplayName:"ZZP-overeenkomst met Max Webstudio",
    Signers:{
      [partnerId]:{ FormSets:["PartnerDetails", "PartnerSignature"] },
      [countersignerId]:{ FormSets:["MaxSignature"] },
    },
    FormSets:{
      PartnerDetails:{
        Bedrijfsnaam:singleLine(2, 365, 134, 125),
        Naam:singleLine(2, 340, 147, 150),
        Rechtsvorm:singleLine(2, 360, 160, 130),
        KvkNummer:singleLine(2, 365, 173, 125),
        BtwNummer:singleLine(2, 368, 186, 122),
        Vestigingsadres:singleLine(2, 378, 199, 112),
        PostcodeEnPlaats:singleLine(2, 390, 212, 100),
        Email:singleLine(2, 340, 225, 150),
        Ondertekenplaats:singleLine(7, 340, 628, 150),
        Ondertekendatum:singleLine(7, 340, 654, 150),
        OndertekenaarNaam:singleLine(7, 340, 706, 150),
        Functie:singleLine(7, 345, 719, 145),
      },
      PartnerSignature:{
        Handtekening:{ Type:"Signature", Location:{ PageNumber:7, Left:365, Top:675, Width:125, Height:30 } },
      },
      MaxSignature:{
        Plaats:singleLine(7, 100, 628, 140),
        Datum:singleLine(7, 100, 654, 140),
        Functie:singleLine(7, 102, 719, 138),
        Handtekening:{ Type:"Signature", Location:{ PageNumber:7, Left:115, Top:675, Width:125, Height:30 } },
      },
    },
  };
}

function singleLine(page, left, top, width) {
  return { Type:"SingleLine", Location:{ PageNumber:page, Left:left, Top:top, Width:width, Height:12 } };
}

function signerId(signers, email, fallbackIndex) {
  const expected = clean(email).toLowerCase();
  const matching = signers.find((signer) => clean(signer?.Email || signer?.email).toLowerCase() === expected);
  return clean(matching?.Id || matching?.id || signers[fallbackIndex]?.Id || signers[fallbackIndex]?.id);
}

async function startTransaction(config, transactionId) {
  return signhostRequest(config, `/api/transaction/${encodeURIComponent(transactionId)}/start`, { method:"PUT" });
}

async function downloadSignedPdf(config, transactionId, fileId) {
  return signhostRequest(config, `/api/transaction/${encodeURIComponent(transactionId)}/file/${encodeURIComponent(fileId)}`, { binary:true, accept:"application/pdf" });
}

async function downloadReceipt(config, transactionId) {
  return signhostRequest(config, `/api/file/receipt/${encodeURIComponent(transactionId)}`, { binary:true, accept:"application/pdf" });
}

function validatePostback(payload, headers, config = process.env) {
  const id = clean(payload?.Id || payload?.id);
  const status = Number(payload?.Status ?? payload?.status);
  const suppliedChecksum = clean(payload?.Checksum || payload?.checksum || headers?.checksum || headers?.Checksum);
  const expectedAuthorization = clean(config.SIGNHOST_POSTBACK_AUTHORIZATION);
  const sharedSecret = clean(config.SIGNHOST_POSTBACK_SHARED_SECRET);
  const suppliedAuthorization = clean(headers?.authorization || headers?.Authorization);
  if (!id || !Number.isInteger(status) || !suppliedChecksum || !expectedAuthorization || !sharedSecret) return { valid:false, id, status, reason:"missing" };
  if (!safeEqual(suppliedAuthorization, expectedAuthorization)) return { valid:false, id, status, reason:"authorization" };
  const expectedChecksum = crypto.createHash("sha1").update(`${id}||${status}|${sharedSecret}`).digest("hex");
  if (!safeEqual(suppliedChecksum.toLowerCase(), expectedChecksum)) return { valid:false, id, status, reason:"checksum" };
  return { valid:true, id, status, mappedStatus:FINAL_STATUSES.get(status) || "waiting_for_signer" };
}

function safeEqual(left, right) {
  const a = Buffer.from(clean(left));
  const b = Buffer.from(clean(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizePhone(value) {
  let phone = clean(value).replace(/[\s().-]/g, "");
  if (phone.startsWith("0031")) phone = `+31${phone.slice(4)}`;
  if (phone.startsWith("+3106")) phone = `+316${phone.slice(5)}`;
  if (/^06\d{8}$/.test(phone)) return `+31${phone.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

async function signhostError(response) {
  const data = await response.json().catch(() => ({}));
  return providerError(response.status, data);
}
function providerError(status, data) {
  const error = coded("SIGNHOST_REQUEST_FAILED", 502, "Signhost kon de ondertekening niet verwerken.");
  error.providerStatus = status;
  error.providerCode = clean(data?.type || data?.code || data?.title || "provider_error").slice(0,120);
  return error;
}
function clean(value) { return String(value ?? "").trim(); }
function coded(code, status, message) { return Object.assign(new Error(message), { code, status }); }

module.exports = {
  API_BASE,
  createTransaction,
  buildAgreementMetadata,
  downloadReceipt,
  downloadSignedPdf,
  normalizePhone,
  signhostConfig,
  signhostRequest,
  startTransaction,
  uploadPdf,
  uploadFileMetadata,
  validatePostback,
  verification,
};
