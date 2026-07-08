const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");
const { randomUUID } = require("crypto");
const { createTimelineEvent } = require("./services/timelineService");

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
  try {
    logStep("request ontvangen", {
      method: event.httpMethod,
      contentType: getContentType(event),
      isBase64Encoded: Boolean(event.isBase64Encoded),
      bodyLength: event.body ? event.body.length : 0,
    });

    return await handleSubmitChangeRequest(event);
  } catch (error) {
    console.error("Change request submit unhandled error", {
      step: "unhandled_error",
      message: error.message,
      stack: error.stack,
    });

    return jsonError(
      500,
      "Het wijzigingsverzoek kon niet worden verwerkt. Probeer het later opnieuw of neem contact op.",
      "unhandled_error"
    );
  }
};

async function handleSubmitChangeRequest(event) {
  if (event.httpMethod !== "POST") {
    return jsonError(405, "Alleen POST-verzoeken zijn toegestaan.", "method_not_allowed");
  }

  let parsedRequest;

  try {
    logStep("body parser gestart", {
      contentType: getContentType(event),
      isBase64Encoded: Boolean(event.isBase64Encoded),
    });
    parsedRequest = parseRequest(event);
  } catch (error) {
    console.error("Change request body parse failed", {
      step: "body_parse_failed",
      message: error.message,
    });
    return jsonError(400, error.message || "Ongeldige aanvraag.", "body_parse_failed");
  }

  const clean = sanitizeObject(parsedRequest.fields);
  const files = parsedRequest.files;

  logStep("body parser afgerond", {
    fieldCount: Object.keys(clean).length,
    fileCount: files.length,
    files: fileLogSummary(files),
  });

  if (clean.websiteUrl) {
    return jsonResponse(200, { success: true, skipped: true });
  }

  const validationError = validate(clean);

  if (validationError) {
    return jsonError(400, validationError, "validation_failed");
  }

  const fileValidationError = validateFiles(files);

  if (fileValidationError) {
    return jsonError(400, fileValidationError, "file_validation_failed");
  }

  const changeRequest = buildChangeRequest(clean);
  changeRequest.authUserId = await resolveAuthUserId(event);
  const uploadResult = await uploadChangeRequestFiles(changeRequest.id, files);

  if (!uploadResult.success) {
    return jsonError(
      500,
      uploadResult.error || "Bestanden konden niet worden opgeslagen. Probeer het later opnieuw.",
      uploadResult.debug || "file_upload_failed"
    );
  }

  changeRequest.fileNames = uploadResult.files;
  const storageResult = await saveChangeRequest(changeRequest);

  if (!storageResult.success) {
    return jsonError(
      500,
      "Het wijzigingsverzoek kon niet worden opgeslagen. Probeer het later opnieuw of neem contact op.",
      storageResult.debug || "database_insert_failed"
    );
  }
  await safeCreateTimeline({
    eventType: "change_request_submitted",
    title: `Wijzigingsverzoek ingestuurd: ${changeRequest.changeTitle}`,
    description: `${changeRequest.customerName} heeft een wijzigingsverzoek ingestuurd voor ${changeRequest.companyName}.`,
    module: "support",
    referenceType: "change_request",
    referenceId: storageResult.id || changeRequest.id,
    actorName: changeRequest.customerName,
    actorRole: "customer",
    icon: "🛠️",
    severity: changeRequest.priority === "Hoog" ? "warning" : "info",
    metadata: {
      dedupeKey: `change_request_submitted:${storageResult.id || changeRequest.id}`,
      companyName: changeRequest.companyName,
      customerEmail: changeRequest.email,
      category: changeRequest.changeCategory,
      priority: changeRequest.priority,
    },
  });

  logStep("e-mail stap", {
    adminEmailConfigured: Boolean(process.env.ADMIN_EMAIL),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
  });
  const adminResult = await sendAdminEmail(changeRequest);
  const customerResult = await sendCustomerEmail(changeRequest);
  const warning = [adminResult, customerResult].find((result) => result.warning)?.warning || "";

  return jsonResponse(200, {
    success: true,
    requestId: storageResult.id || undefined,
    warning: warning || undefined,
  });
}

async function safeCreateTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Change request timeline event failed", { message: error.message });
    return null;
  }
}

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

  logStep("database insert stap", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    fileCount: changeRequest.fileNames.length,
  });

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request storage missing Supabase configuration", {
      step: "database_config_missing",
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return { success: false, debug: "database_config_missing" };
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
        step: "database_insert_failed",
        status: response.status,
        message: data.message || data.error || "Unknown Supabase error",
      });
      return { success: false, debug: `database_insert_failed_${response.status}` };
    }

    logStep("database insert afgerond", {
      status: response.status,
      id: Array.isArray(data) ? data[0]?.id : data?.id,
    });

    return { success: true, id: Array.isArray(data) ? data[0]?.id : data?.id };
  } catch (error) {
    console.error("Change request storage error", {
      step: "database_insert_exception",
      message: error.message,
      stack: error.stack,
    });
    return { success: false, debug: "database_insert_exception" };
  }
}

function toSupabaseRecord(changeRequest) {
  const record = {
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

  if (changeRequest.authUserId) {
    record.auth_user_id = changeRequest.authUserId;
  }

  return record;
}

async function resolveAuthUserId(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) return null;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.id) {
      console.error("Change request auth user lookup failed", {
        status: response.status,
        message: data.message || data.error || "Unknown Supabase Auth error",
      });
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Change request auth user lookup error", { message: error.message });
    return null;
  }
}

async function sendAdminEmail(changeRequest) {
  const companySettings = getCompanySettings();
  return sendEmail({
    to: process.env.ADMIN_EMAIL || companySettings.primaryEmail,
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
    templateKey: "change_request_admin",
    templateName: "Wijzigingsverzoek adminnotificatie",
    triggeredBy: "change_request_form",
    metadata: {
      changeRequestId: changeRequest.id,
      customerName: changeRequest.customerName,
      companyName: changeRequest.companyName,
      website: changeRequest.website,
      priority: changeRequest.priority,
      category: changeRequest.changeCategory,
    },
  });
}

async function sendCustomerEmail(changeRequest) {
  const companySettings = getCompanySettings();
  return sendEmail({
    to: changeRequest.email,
    subject: "Wijzigingsverzoek ontvangen - Max Webstudio",
    html: buildEmailHtml("Wijzigingsverzoek ontvangen - Max Webstudio", [
      ["Bericht", `Beste ${changeRequest.firstName},\n\nWe hebben je wijzigingsverzoek ontvangen. ${companySettings.companyName} bekijkt de aanvraag en neemt indien nodig contact met je op.`],
      ["Bedrijfsnaam", changeRequest.companyName],
      ["Website", changeRequest.website],
      ["Categorie", changeRequest.changeCategory],
      ["Prioriteit", changeRequest.priority],
      ["Titel", changeRequest.changeTitle],
      ["Bestanden", formatFileList(changeRequest.fileNames)],
      ["Contact", `Vragen? Mail naar ${companySettings.primaryEmail} of gebruik ${getMailtoLink(companySettings, "Vraag over wijzigingsverzoek")}.`],
    ]),
    text: `Beste ${changeRequest.firstName},\n\nWe hebben je wijzigingsverzoek ontvangen.\n\n${plainTextSummary(changeRequest)}\n\nVragen? Mail naar ${companySettings.primaryEmail}.\n\nMet vriendelijke groet,\n${companySettings.companyName}`,
    templateKey: "change_request_customer_confirmation",
    templateName: "Wijzigingsverzoek klantbevestiging",
    triggeredBy: "change_request_form",
    metadata: {
      changeRequestId: changeRequest.id,
      companyName: changeRequest.companyName,
      website: changeRequest.website,
      priority: changeRequest.priority,
      category: changeRequest.changeCategory,
    },
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
  const contentType = getContentType(event);

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
  logStep("multipart parser gestart", {
    boundaryLength: boundary.length,
    isBase64Encoded: Boolean(event.isBase64Encoded),
    bodyBytes: bodyBuffer.length,
  });
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

  logStep("multipart parser afgerond", {
    fieldCount: Object.keys(fields).length,
    fileCount: files.length,
    files: fileLogSummary(files),
  });

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

  logStep("Supabase configuratie", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    fileCount: files.length,
    files: fileLogSummary(files),
  });

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request file upload missing Supabase configuration", {
      step: "storage_config_missing",
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return { success: false, error: "Uploadopslag is nog niet goed geconfigureerd.", debug: "storage_config_missing" };
  }

  let bucketResult;

  try {
    bucketResult = await ensureStorageBucket(supabaseUrl, serviceRoleKey);
  } catch (error) {
    console.error("Change request file bucket check exception", {
      step: "storage_bucket_exception",
      message: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      error: "Supabase Storage bucket change-request-files ontbreekt of is niet bereikbaar.",
      debug: "storage_bucket_exception",
    };
  }

  if (!bucketResult.success) {
    console.error("Change request file bucket check failed", {
      step: "storage_bucket_unavailable",
      status: bucketResult.status,
      message: bucketResult.message,
    });
    return {
      success: false,
      error: "Supabase Storage bucket change-request-files ontbreekt of is niet bereikbaar.",
      debug: bucketResult.debug || "storage_bucket_unavailable",
    };
  }

  const uploadedFiles = [];

  for (const [index, file] of files.entries()) {
    const safeName = safeFilename(file.originalName);
    const storagePath = `${changeRequestId}/${Date.now()}-${index + 1}-${safeName}`;
    logStep("upload stap", {
      index: index + 1,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      storagePath,
    });
    let response;

    try {
      response = await fetch(`${supabaseUrl}/storage/v1/object/${storageBucket}/${encodeStoragePath(storagePath)}`, {
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
    } catch (error) {
      console.error("Change request file upload exception", {
        step: "storage_upload_exception",
        message: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        error: `Bestand kon niet worden opgeslagen: ${file.originalName}.`,
        debug: "storage_upload_exception",
      };
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Change request file upload failed", {
        step: "storage_upload_failed",
        status: response.status,
        message: data.message || data.error || "Unknown Supabase Storage error",
      });
      return {
        success: false,
        error: `Bestand kon niet worden opgeslagen: ${file.originalName}.`,
        debug: `storage_upload_failed_${response.status}`,
      };
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
  logStep("bucket create/check stap", {
    bucket: storageBucket,
    action: "check",
  });

  const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/${storageBucket}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (bucketResponse.ok) {
    logStep("bucket create/check stap", {
      bucket: storageBucket,
      action: "check_ok",
      status: bucketResponse.status,
    });
    return { success: true };
  }

  if (bucketResponse.status !== 404) {
    const data = await bucketResponse.json().catch(() => ({}));
    return {
      success: false,
      status: bucketResponse.status,
      message: data.message || data.error || "Bucket check failed",
      debug: `storage_bucket_check_failed_${bucketResponse.status}`,
    };
  }

  logStep("bucket create/check stap", {
    bucket: storageBucket,
    action: "create",
    status: bucketResponse.status,
  });

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

  if (createResponse.ok) {
    logStep("bucket create/check stap", {
      bucket: storageBucket,
      action: "create_ok",
      status: createResponse.status,
    });
    return { success: true };
  }

  const data = await createResponse.json().catch(() => ({}));
  return {
    success: false,
    status: createResponse.status,
    message: data.message || data.error || "Bucket create failed",
    debug: `storage_bucket_create_failed_${createResponse.status}`,
  };
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

function getContentType(event) {
  return event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";
}

function logStep(step, data = {}) {
  console.error("Change request submit step", { step, ...data });
}

function fileLogSummary(files) {
  return files.map((file) => ({
    fieldName: file.fieldName,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
  }));
}

function jsonError(statusCode, error, debug) {
  return jsonResponse(statusCode, {
    success: false,
    error,
    debug,
  });
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
