const { verifyAdmin } = require("./_admin-auth");
const { upsertProjectWorkspace, zipFilenameFor } = require("./_project-workspace");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, "", {});
  if (event.httpMethod !== "GET") return response(405, "Methode niet toegestaan.", { "Content-Type": "text/plain; charset=utf-8" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) return response(500, "Preview service is nog niet geconfigureerd.", { "Content-Type": "text/plain; charset=utf-8" });

  const id = cleanText(event.queryStringParameters?.id);
  const token = cleanText(event.queryStringParameters?.token);
  const format = cleanText(event.queryStringParameters?.format).toLowerCase();
  const filePath = cleanText(event.queryStringParameters?.file) || "index.html";
  if (!id) return response(400, "Preview id ontbreekt.", { "Content-Type": "text/plain; charset=utf-8" });

  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const row = rows[0];
  if (!row) return response(404, "Preview niet gevonden.", { "Content-Type": "text/plain; charset=utf-8" });

  const storedToken = cleanText(row.preview_token);
  if (storedToken && token !== storedToken) {
    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "demo_preview",
      action: "read",
      allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"],
      allowedStatuses: ["active", "invited"],
    });
    if (!adminCheck.success) return response(403, "Previewlink is niet geldig.", { "Content-Type": "text/plain; charset=utf-8" });
  }

  const previewPackage = normalizePackage(row.preview_package, row);
  if (format === "zip") {
    const previewVersion = previewPackage.version || previewPackage.meta?.version || 1;
    const filename = zipFilenameFor({ businessName: row.business_name || previewPackage.businessName, websiteUrl: row.website_url, version: previewVersion });
    const previewUrl = absolutePreviewUrl(row.preview_url || previewUrlForRequest(event, id, token), event);
    const files = prepareZipFiles(previewPackage.files, {
      businessName: row.business_name || previewPackage.businessName,
      previewVersion,
      generatedAt: previewPackage.generatedAt,
      packageLabel: previewPackage.meta?.packageLabel || "",
      previewUrl,
    });
    await upsertProjectWorkspace({ supabaseUrl, serviceRoleKey, admin: {} }, {
      leadId: row.lead_id,
      customerId: row.customer_id,
      demoJourneyId: row.id,
      businessName: row.business_name || previewPackage.businessName,
      websiteUrl: row.website_url,
      latestZipFilename: filename,
      latestPreviewUrl: row.preview_url || previewUrl,
      latestPreviewVersion: previewVersion,
    });
    const zip = createZip(files);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
      body: zip.toString("base64"),
    };
  }

  const file = previewPackage.files.find((item) => item.path === filePath) || previewPackage.files.find((item) => item.path === "index.html") || previewPackage.files[0];
  const content = file?.path?.endsWith(".html")
    ? rewritePreviewHtml(file?.content || "", id, token)
    : file?.content || "";
  return response(200, content || "<!doctype html><title>Preview</title><p>Previewpakket is leeg.</p>", {
    "Content-Type": contentTypeFor(file?.path),
    "Cache-Control": "no-store",
  });
};

function normalizePackage(value, row = {}) {
  if (value && typeof value === "object" && Array.isArray(value.files) && value.files.length) return value;
  const businessName = cleanText(row.business_name) || "Demo preview";
  const briefing = cleanText(row.generated_briefing);
  return {
    businessName,
    files: [
      {
        path: "index.html",
        content: `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(businessName)}</title><style>body{font-family:Inter,Arial,sans-serif;margin:0;padding:48px;background:#f6f8fb;color:#132238}main{max-width:860px;margin:auto;background:#fff;border:1px solid #dbe4ef;border-radius:8px;padding:32px}h1{font-size:clamp(2rem,6vw,4rem);line-height:1}p{line-height:1.7;color:#5c697a;white-space:pre-wrap}</style></head><body><main><span>Eerste website-preview</span><h1>${escapeHtml(businessName)}</h1><p>${escapeHtml(briefing || "Preview wordt voorbereid.")}</p></main></body></html>`,
      },
      { path: "briefing.txt", content: briefing },
    ],
  };
}

function rewritePreviewHtml(html = "", id = "", token = "") {
  const assetUrl = (file) => `/.netlify/functions/demo-preview?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&file=${encodeURIComponent(file)}`;
  return String(html || "")
    .replaceAll('href="styles.css"', `href="${assetUrl("styles.css")}"`)
    .replaceAll('src="script.js"', `src="${assetUrl("script.js")}"`)
    .replace(/href="([^"#?]+\.html)"/g, (_match, file) => `href="${assetUrl(file)}"`);
}

function prepareZipFiles(files = [], meta = {}) {
  const existing = Array.isArray(files) ? files : [];
  const hasReadme = existing.some((file) => file.path === "README.md");
  const readme = [
    `# ${cleanText(meta.businessName) || "Demo preview"} preview V${Math.max(1, Number(meta.previewVersion || 1))}`,
    "",
    "Interne website-preview voorbereid door de Website Factory.",
    "",
    `Bedrijfsnaam: ${cleanText(meta.businessName) || "-"}`,
    `Preview versie: V${Math.max(1, Number(meta.previewVersion || 1))}`,
    `Gegenereerd op: ${cleanText(meta.generatedAt) || "-"}`,
    `Pakket: ${cleanText(meta.packageLabel) || "-"}`,
    `Preview URL: ${cleanText(meta.previewUrl) || "-"}`,
    "",
    "Controleer de preview intern voordat deze naar de klant gaat.",
  ].join("\n");
  const filesWithReadme = hasReadme
    ? existing.map((file) => file.path === "README.md" ? { ...file, content: readme } : file)
    : [{ path: "README.md", content: readme }, ...existing];
  const preferredOrder = ["README.md", "briefing.json", "index.html", "over-ons.html", "diensten.html", "projecten.html", "reviews.html", "contact.html", "offerte.html", "styles.css", "script.js", "assets-map.json"];
  return [...filesWithReadme].sort((a, b) => {
    const left = preferredOrder.indexOf(a.path);
    const right = preferredOrder.indexOf(b.path);
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });
}

function previewUrlForRequest(event, id, token) {
  return `/.netlify/functions/demo-preview?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
}

function absolutePreviewUrl(url = "", event = {}) {
  const value = cleanText(url);
  if (!value || /^https?:\/\//i.test(value)) return value;
  const host = event.headers?.host || event.headers?.Host || "";
  const proto = event.headers?.["x-forwarded-proto"] || event.headers?.["X-Forwarded-Proto"] || "https";
  return host ? `${proto}://${host}${value.startsWith("/") ? value : `/${value}`}` : value;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function createZip(files = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach((file) => {
    const name = Buffer.from(file.path, "utf8");
    const content = Buffer.from(file.content || "", "utf8");
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  });

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = (() => {
  const table = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function response(statusCode, body, headers = {}) {
  return { statusCode, headers: { ...corsHeaders(), ...headers }, body: statusCode === 204 ? "" : body };
}

function jsonResponse(statusCode, body) {
  return response(statusCode, JSON.stringify(body), { "Content-Type": "application/json" });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function contentTypeFor(path = "") {
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".txt") || path.endsWith(".md")) return "text/plain; charset=utf-8";
  return "text/html; charset=utf-8";
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}
