const crypto = require("node:crypto");
const QRCode = require("qrcode");

exports.handler = async (event = {}) => {
  if (event.httpMethod !== "GET") return response(405, "Method not allowed", "text/plain; charset=utf-8");
  const target = safeTarget(event.queryStringParameters?.target);
  const supplied = clean(event.queryStringParameters?.signature).toLowerCase();
  const secret = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!target || !secret || !validSignature(target, supplied, secret)) return response(404, "Not found", "text/plain; charset=utf-8");
  const svg = await QRCode.toString(target, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
    color: { dark: "#06121fff", light: "#ffffffff" },
  });
  return response(200, svg, "image/svg+xml; charset=utf-8", "public, max-age=86400, immutable");
};

function safeTarget(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:" || url.username || url.password || url.toString().length > 2000) return "";
    return url.toString();
  } catch { return ""; }
}

function validSignature(target, supplied, secret) {
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = crypto.createHmac("sha256", secret).update(target).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

function response(statusCode, body, contentType, cacheControl = "no-store") {
  return { statusCode, headers: { "Content-Type": contentType, "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" }, body };
}

function clean(value) { return String(value || "").trim(); }

exports._private = { safeTarget, validSignature };
