const { sendEmail } = require("./email");
const { randomUUID } = require("crypto");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const storageBucket = "change-request-files";
const maxFiles = 5;
const maxFileSize = 10 * 1024 * 1024;
const allowedFileTypes = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

const categoryLabels = {
  "tekst-aanpassen": "Tekst aanpassen",
  "foto-vervangen": "Foto vervangen",
  "nieuwe-pagina": "Nieuwe pagina",
  "nieuwe-dienst": "Nieuwe dienst",
  "blog-toevoegen": "Blog toevoegen",
  "contactgegevens-wijzigen": "Contactgegevens wijzigen",
  seo: "SEO",
  snelheidsverbetering: "Snelheidsverbetering",
  overig: "Overig",
};

const carePlanLabels = {
  basis: "Basis",
  plus: "Plus",
  premium: "Premium",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  let parsedRequest;

  try {
    parsedRequest = parseRequest(event);
  } catch (error) {
    return jsonResponse(400, { success: false, error: error.message || "Ongeldige aanvraag." });
  }

  const clean = sanitizeObject(parsedRequest.fields);
  const files = parsedRequest.files;

  if (clean.websiteUrl) {
    return jsonResponse(200, { success: true, skipped: true });
  }

  const validationError = validate(clean);

  if (validationError) {
    return jsonResponse(400, { success: false, error: validationError });
  }

  const fileValidationError = validateFiles(files);

  if (fileValidationError) {
    return jsonResponse(400, { success: false, error: fileValidationError });
  }

  const changeRequest = buildChangeRequest(clean);
  const uploadResult = await uploadChangeRequestFiles(changeRequest.id, files);

  if (!uploadResult.success) {
    return jsonResponse(500, {
      success: false,
      error: uploadResult.error || "Bestanden konden niet worden opgeslagen. Probeer het later opnieuw.",
    });
  }

  changeRequest.fileNames = uploadResult.files;
  const storageResult = await saveChangeRequest(changeRequest);

  if (!storageResult.success) {
    return jsonResponse(500, {
      success: false,
      error: "Het wijzigingsverzoek kon niet worden opgeslagen. Probeer het later opnieuw of neem contact op.",
    });
  }

  const adminResult = await sendAdminEmail(changeRequest);
  const customerResult = await sendCustomerEmail(changeRequest);
  const warning = [adminResult, customerResult].find((result) => result.warning)?.warning || "";

  return jsonResponse(200, {
    success: true,
    requestId: storageResult.id || undefined,
    warning: warning || undefined,
  });
};

function buildChangeRequest(clean) {
  const category = categoryLabels[clean.changeCategory] || clean.changeCategory;
  const priority = clean.priority === "hoog" ? "Hoog" : "Normaal";
  const carePlan = carePlanLabels[clean.carePlan] || clean.carePlan;
  const fileNames = toArray(clean.fileNames)
    .map((name) => ({ originalName: cleanText(name).slice(0, 180) }))
    .filter(Boolean)
    .slice(0, maxFiles);

  return {
    id: randomUUID(),
    submittedAt: new Date().toISOString(),
    firstName: clean.firstName,
    lastName: clean.lastName,
    customerName: `${clean.firstName} ${clean.lastName}`.trim(),
    companyName: clean.companyName,
    email: clean.email.toLowerCase(),
    phone: clean.phone,
    website: clean.website,
    carePlan,
    changeCategory: category,
    priority,
    changeTitle: clean.changeTitle,
    changeDescription: clean.changeDescription,
    fileNames,
    classification: classifyChangeRequest(clean.changeCategory, clean.priority),
  };
}

function classifyChangeRequest(category, priority) {
  if (priority === "hoog" || category === "overig") {
    return "Handmatig beoordelen";
  }

  if (["tekst-aanpassen", "foto-vervangen", "contactgegevens-wijzigen"].includes(category)) {
    return "Waarschijnlijk binnen onderhoud";
  }

  if (["nieuwe-pagina", "nieuwe-dienst", "blog-toevoegen", "seo", "snelheidsverbetering"].includes(category)) {
    return "Waarschijnlijk offerte nodig";
  }

  return "Handmatig beoordelen";
}

async function saveChangeRequest(changeRequest) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request storage missing Supabase configuration");
    return { success: false };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/change_requests`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(toSupabaseRecord(changeRequest)),
    });

    const data = await response.json().catch(() => []);

    if (!response.ok) {
      console.error("Change request storage failed", {
        status: response.status,
        message: data.message || data.error || "Unknown Supabase error",
      });
      return { success: false };
    }

    return { success: true, id: Array.isArray(data) ? data[0]?.id : data?.id };
  } catch (error) {
    console.error("Change request storage error", { message: error.message });
    return { success: false };
  }
}

function toSupabaseRecord(changeRequest) {
  return {
    id: changeRequest.id,
    created_at: changeRequest.submittedAt,
    first_name: changeRequest.firstName,
    last_name: changeRequest.lastName,
    company_name: changeRequest.companyName,
    email: changeRequest.email,
    phone: changeRequest.phone,
    website: changeRequest.website,
    care_plan: changeRequest.carePlan,
    change_category: changeRequest.changeCategory,
    priority: changeRequest.priority,
    title: changeRequest.changeTitle,
    description: changeRequest.changeDescription,
    file_names: changeRequest.fileNames,
    internal_classification: changeRequest.classification,
    metadata: {
      form: "change-request",
      formVersion: "2",
      uploadMode: "supabase_storage",
      storageBucket,
      filesAttached: changeRequest.fileNames.length > 0,
    },
  };
}

async function sendAdminEmail(changeRequest) {
  return sendEmail({
    to: process.env.ADMIN_EMAIL || "info@maxwebstudio.nl",
    subject: "Nieuw wijzigingsverzoek via Max Web Studio",
    html: buildEmailHtml("Nieuw wijzigingsverzoek via Max Web Studio", [
      ["Interne classificatie", changeRequest.classification],
      ["Naam klant", changeRequest.customerName],
      ["Bedrijfsnaam", changeRequest.companyName],
      ["E-mailadres", changeRequest.email],
      ["Telefoonnummer", changeRequest.phone],
      ["Website", changeRequest.website],
      ["Onderhoudspakket", changeRequest.carePlan],
      ["Categorie wijziging", changeRequest.changeCategory],
      ["Prioriteit", changeRequest.priority],
      ["Titel", changeRequest.changeTitle],
      ["Omschrijving", changeRequest.changeDescription],
      ["Bestanden", formatFileList(changeRequest.fileNames)],
      ["Datum/tijd", changeRequest.submittedAt],
    ]),
    text: plainTextSummary(changeRequest),
  });
}

async function sendCustomerEmail(changeRequest) {
  return sendEmail({
    to: changeRequest.email,
    subject: "Wijzigingsverzoek ontvangen - Max Webstudio",
    html: buildEmailHtml("Wijzigingsverzoek ontvangen - Max Webstudio", [
      ["Bericht", `Beste ${changeRequest.firstName},\n\nWe hebben je wijzigingsverzoek ontvangen. Max Web Studio bekijkt de aanvraag en neemt indien nodig contact met je op.`],
      ["Bedrijfsnaam", changeRequest.companyName],
      ["Website", changeRequest.website],
      ["Categorie", changeRequest.changeCategory],
      ["Prioriteit", changeRequest.priority],
      ["Titel", changeRequest.changeTitle],
      ["Bestanden", formatFileList(changeRequest.fileNames)],
      ["Contact", "Vragen? Mail naar info@maxwebstudio.nl."],
    ]),
    text: `Beste ${changeRequest.firstName},\n\nWe hebben je wijzigingsverzoek ontvangen.\n\n${plainTextSummary(changeRequest)}\n\nMet vriendelijke groet,\nMax Webstudio`,
  });
}

function plainTextSummary(changeRequest) {
  return [
    `Interne classificatie: ${changeRequest.classification}`,
    `Naam klant: ${changeRequest.customerName}`,
    `Bedrijfsnaam: ${changeRequest.companyName}`,
    `E-mailadres: ${changeRequest.email}`,
    `Telefoonnummer: ${changeRequest.phone}`,
    `Website: ${changeRequest.website}`,
    `Onderhoudspakket: ${changeRequest.carePlan}`,
    `Categorie wijziging: ${changeRequest.changeCategory}`,
    `Prioriteit: ${changeRequest.priority}`,
    `Titel: ${changeRequest.changeTitle}`,
    `Omschrijving: ${changeRequest.changeDescription}`,
    `Bestanden: ${formatFileList(changeRequest.fileNames)}`,
    `Datum/tijd: ${changeRequest.submittedAt}`,
  ].join("\n");
}

function buildEmailHtml(title, rows) {
  const bodyRows = rows
    .map(([label, value]) => `<tr><th style="vertical-align:top;text-align:left;width:220px;padding:10px 12px;border-top:1px solid #dce4ed;color:#5b6573;">${escapeHtml(label)}</th><td style="padding:10px 12px;border-top:1px solid #dce4ed;white-space:pre-line;">${escapeHtml(value || "Niet ingevuld")}</td></tr>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f6f8fb;font-family:Inter,Arial,sans-serif;color:#06121f;">
    <div style="max-width:760px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #dce4ed;border-radius:12px;padding:28px;">
        <p style="margin:0 0 10px;color:#155eef;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">Max Webstudio</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.1;">${escapeHtml(title)}</h1>
        <table style="width:100%;border-collapse:collapse;">${bodyRows}</table>
      </div>
    </div>
  </body></html>`;
}

function validate(payload) {
  if (!payload.firstName) return "Vul je voornaam in.";
  if (!payload.lastName) return "Vul je achternaam in.";
  if (!payload.companyName) return "Vul je bedrijfsnaam in.";
  if (!emailPattern.test(payload.email || "")) return "Vul een geldig e-mailadres in.";
  if (!payload.phone) return "Vul je telefoonnummer in.";
  if (!payload.website) return "Vul je website in.";
  if (!payload.carePlan || !carePlanLabels[payload.carePlan]) return "Kies een geldig onderhoudspakket.";
  if (!payload.changeCategory || !categoryLabels[payload.changeCategory]) return "Kies een geldige categorie.";
  if (!["normaal", "hoog"].includes(payload.priority)) return "Kies een geldige prioriteit.";
  if (!payload.changeTitle) return "Vul de titel van de wijziging in.";
  if (!payload.changeDescription) return "Vul de omschrijving van de wijziging in.";
  if (!payload.confirmed) return "Bevestig dat de informatie correct is.";
  return "";
}

function parseRequest(event) {
  const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartRequest(event, contentType);
  }

  if (contentType.includes("application/json") || !contentType) {
    return { fields: JSON.parse(event.body || "{}"), files: [] };
  }

  throw new Error("Niet ondersteund formulierformaat.");
}

function parseMultipartRequest(event, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error("Multipart boundary ontbreekt.");
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const bodyBuffer = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];
  let position = bodyBuffer.indexOf(delimiter);

  while (position !== -1) {
    let partStart = position + delimiter.length;

    if (bodyBuffer.slice(partStart, partStart + 2).toString() === "--") break;
    if (bodyBuffer.slice(partStart, partStart + 2).toString() === "\r\n") partStart += 2;

    const nextBoundary = bodyBuffer.indexOf(delimiter, partStart);
    if (nextBoundary === -1) break;

    let part = bodyBuffer.slice(partStart, nextBoundary);
    if (part.slice(-2).toString() === "\r\n") part = part.slice(0, -2);

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = parsePartHeaders(part.slice(0, headerEnd).toString("utf8"));
      const content = part.slice(headerEnd + 4);
      const disposition = headers["content-disposition"] || "";
      const name = getDispositionValue(disposition, "name");
      const filename = getDispositionValue(disposition, "filename");

      if (name && filename) {
        files.push({
          fieldName: name,
          originalName: filename,
          mimeType: headers["content-type"] || "application/octet-stream",
          size: content.length,
          buffer: content,
        });
      } else if (name) {
        fields[name] = content.toString("utf8").trim();
      }
    }

    position = nextBoundary;
  }

  fields.confirmed = Boolean(fields.confirmed);

  return { fields, files };
}

function parsePartHeaders(headerText) {
  return Object.fromEntries(
    headerText
      .split("\r\n")
      .map((line) => {
        const separator = line.indexOf(":");
        return separator === -1
          ? []
          : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
      })
      .filter((entry) => entry.length === 2)
  );
}

function getDispositionValue(disposition, key) {
  const match = disposition.match(new RegExp(`${key}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

function validateFiles(files) {
  if (files.length > maxFiles) {
    return `Upload maximaal ${maxFiles} bestanden.`;
  }

  for (const file of files) {
    const extension = fileExtension(file.originalName);
    const allowedMimeTypes = allowedFileTypes[extension];

    if (!allowedMimeTypes || !allowedMimeTypes.includes(file.mimeType)) {
      return `Bestandstype niet toegestaan: ${file.originalName}. Gebruik JPG, PNG, PDF of DOCX.`;
    }

    if (file.size > maxFileSize) {
      return `Bestand is te groot: ${file.originalName}. Maximaal 10 MB per bestand.`;
    }

    if (!file.size) {
      return `Bestand is leeg: ${file.originalName}.`;
    }
  }

  return "";
}

async function uploadChangeRequestFiles(changeRequestId, files) {
  if (!files.length) return { success: true, files: [] };

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request file upload missing Supabase configuration");
    return { success: false, error: "Uploadopslag is nog niet goed geconfigureerd." };
  }

  const bucketResult = await ensureStorageBucket(supabaseUrl, serviceRoleKey);

  if (!bucketResult.success) {
    console.error("Change request file bucket check failed", {
      status: bucketResult.status,
      message: bucketResult.message,
    });
    return { success: false, error: "Uploadopslag kon niet worden voorbereid." };
  }

  const uploadedFiles = [];

  for (const [index, file] of files.entries()) {
    const safeName = safeFilename(file.originalName);
    const storagePath = `${changeRequestId}/${Date.now()}-${index + 1}-${safeName}`;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${storageBucket}/${encodeStoragePath(storagePath)}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": file.mimeType,
        "Cache-Control": "3600",
        "x-upsert": "false",
      },
      body: file.buffer,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Change request file upload failed", {
        status: response.status,
        message: data.message || data.error || "Unknown Supabase Storage error",
      });
      return { success: false, error: `Bestand kon niet worden opgeslagen: ${file.originalName}.` };
    }

    uploadedFiles.push({
      originalName: file.originalName,
      storagePath,
      mimeType: file.mimeType,
      size: file.size,
      bucket: storageBucket,
    });
  }

  return { success: true, files: uploadedFiles };
}

async function ensureStorageBucket(supabaseUrl, serviceRoleKey) {
  const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/${storageBucket}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (bucketResponse.ok) return { success: true };
  if (bucketResponse.status !== 404) {
    const data = await bucketResponse.json().catch(() => ({}));
    return { success: false, status: bucketResponse.status, message: data.message || data.error || "Bucket check failed" };
  }

  const createResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: storageBucket,
      name: storageBucket,
      public: false,
      file_size_limit: maxFileSize,
      allowed_mime_types: Object.values(allowedFileTypes).flat(),
    }),
  });

  if (createResponse.ok) return { success: true };

  const data = await createResponse.json().catch(() => ({}));
  return { success: false, status: createResponse.status, message: data.message || data.error || "Bucket create failed" };
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject).slice(0, 20);
  if (value && typeof value === "object") {
    const allowedKeys = new Set([
      "firstName",
      "lastName",
      "companyName",
      "email",
      "phone",
      "website",
      "carePlan",
      "changeCategory",
      "priority",
      "changeTitle",
      "changeDescription",
      "fileNames",
      "confirmed",
      "websiteUrl",
    ]);

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => allowedKeys.has(key))
        .map(([key, item]) => [key, sanitizeObject(item)])
    );
  }
  return typeof value === "string" ? value.trim().slice(0, 5000) : value;
}

function formatFileList(files) {
  return files.length
    ? files.map((file) => file.originalName || file).join("\n")
    : "Geen bestanden meegestuurd";
}

function cleanText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileExtension(filename) {
  const dotIndex = String(filename || "").lastIndexOf(".");
  return dotIndex === -1 ? "" : String(filename).slice(dotIndex).toLowerCase();
}

function safeFilename(filename) {
  const extension = fileExtension(filename);
  const basename = String(filename || "bestand")
    .slice(0, extension ? -extension.length : undefined)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "bestand";

  return `${basename}${extension}`;
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
