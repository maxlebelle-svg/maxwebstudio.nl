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
  downloadReceipt,
  downloadSignedPdf,
  normalizePhone,
  signhostConfig,
  signhostRequest,
  startTransaction,
  uploadPdf,
  validatePostback,
  verification,
};
