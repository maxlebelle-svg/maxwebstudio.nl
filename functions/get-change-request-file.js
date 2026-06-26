const storageBucket = "change-request-files";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const params = event.queryStringParameters || {};
  const changeRequestId = String(params.changeRequestId || "").trim();
  const storagePath = String(params.storagePath || "").trim();
  const fileIndex = Number.parseInt(params.fileIndex || "", 10);

  console.error("Change request file access received", {
    changeRequestId,
    fileIndex: Number.isInteger(fileIndex) ? fileIndex : null,
    storagePath,
  });

  if (!uuidPattern.test(changeRequestId)) {
    return jsonResponse(400, { success: false, error: "Ongeldig wijzigingsverzoek ID." });
  }

  if (!storagePath && !Number.isInteger(fileIndex)) {
    return jsonResponse(400, { success: false, error: "Geef een storagePath of fileIndex mee." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request file access missing Supabase configuration");
    return jsonResponse(500, { success: false, error: "Bestand kon niet worden geopend." });
  }

  try {
    const requestRecord = await fetchChangeRequest(supabaseUrl, serviceRoleKey, changeRequestId);

    if (!requestRecord.success) {
      return jsonResponse(requestRecord.statusCode, {
        success: false,
        error: requestRecord.error,
      });
    }

    const files = normalizeFiles(requestRecord.record.file_names);
    const requestedStoragePath = normalizeStoragePath(storagePath);
    const file = requestedStoragePath
      ? files.find((item) => normalizeStoragePath(item.storagePath) === requestedStoragePath)
      : files[fileIndex];

    if (!file || !file.storagePath) {
      return jsonResponse(404, { success: false, error: "Bestand niet gevonden bij dit wijzigingsverzoek." });
    }

    const normalizedStoragePath = normalizeStoragePath(file.storagePath);

    console.error("Change request file metadata found", {
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      storedStoragePath: file.storagePath,
      normalizedStoragePath,
    });

    const signedUrlResult = await createSignedUrl(supabaseUrl, serviceRoleKey, normalizedStoragePath);

    if (!signedUrlResult.success) {
      return jsonResponse(500, { success: false, error: "Bestand kon niet worden geopend." });
    }

    if (params.format === "json") {
      return jsonResponse(200, {
        success: true,
        signedUrl: signedUrlResult.signedUrl,
        fileName: file.originalName,
      });
    }

    return {
      statusCode: 302,
      headers: {
        Location: signedUrlResult.signedUrl,
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch (error) {
    console.error("Change request file access error", { message: error.message });
    return jsonResponse(500, { success: false, error: "Bestand kon niet worden geopend." });
  }
};

async function fetchChangeRequest(supabaseUrl, serviceRoleKey, changeRequestId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/change_requests?select=id,file_names&id=eq.${encodeURIComponent(changeRequestId)}&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
        "Accept-Profile": "public",
      },
    }
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Change request file lookup failed", {
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    return { success: false, statusCode: 500, error: "Bestand kon niet worden geopend." };
  }

  const record = Array.isArray(data) ? data[0] : data;

  if (!record) {
    return { success: false, statusCode: 404, error: "Wijzigingsverzoek niet gevonden." };
  }

  return { success: true, record };
}

async function createSignedUrl(supabaseUrl, serviceRoleKey, storagePath) {
  const encodedPath = encodeStoragePath(storagePath);
  const signUrl = `${supabaseUrl}/storage/v1/object/sign/${storageBucket}/${encodedPath}`;

  console.error("Change request file signed URL request", {
    bucket: storageBucket,
    storagePath,
    encodedPath,
    signUrl,
  });

  const response = await fetch(signUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.signedURL) {
    console.error("Change request signed URL failed", {
      status: response.status,
      storagePath,
      message: data.message || data.error || "Unknown Supabase Storage error",
    });
    return { success: false };
  }

  const signedUrl = toAbsoluteSignedUrl(supabaseUrl, data.signedURL);

  console.error("Change request signed URL created", {
    storagePath,
    signedUrlShape: data.signedURL.startsWith("http") ? "absolute" : "relative",
  });

  return {
    success: true,
    signedUrl,
  };
}

function normalizeFiles(value) {
  return Array.isArray(value)
    ? value
        .map((file) => {
          if (file && typeof file === "object") {
            return {
              originalName: cleanText(file.originalName),
              storagePath: cleanText(file.storagePath),
              mimeType: cleanText(file.mimeType),
              size: Number(file.size) || 0,
            };
          }

          return { originalName: cleanText(file), storagePath: "", mimeType: "", size: 0 };
        })
        .filter((file) => file.originalName || file.storagePath)
    : [];
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeStoragePath(path) {
  const cleanPath = cleanText(path).replace(/^\/+/, "");
  return cleanPath.startsWith(`${storageBucket}/`)
    ? cleanPath.slice(storageBucket.length + 1)
    : cleanPath;
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function toAbsoluteSignedUrl(supabaseUrl, signedUrl) {
  if (signedUrl.startsWith("http")) return signedUrl;
  if (signedUrl.startsWith("/storage/v1/")) return `${supabaseUrl}${signedUrl}`;
  if (signedUrl.startsWith("/object/")) return `${supabaseUrl}/storage/v1${signedUrl}`;
  if (signedUrl.startsWith("object/")) return `${supabaseUrl}/storage/v1/${signedUrl}`;
  return `${supabaseUrl}/storage/v1/${signedUrl.replace(/^\/+/, "")}`;
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
