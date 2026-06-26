const storageBucket = "change-request-files";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Client change request file missing Supabase configuration");
    return jsonResponse(500, { success: false, error: "Bestand kon niet worden geopend." });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return jsonResponse(401, { success: false, error: "Niet ingelogd." });
  }

  const params = event.queryStringParameters || {};
  const changeRequestId = cleanText(params.changeRequestId);
  const storagePath = cleanText(params.storagePath);
  const fileIndex = Number.parseInt(params.fileIndex || "", 10);

  if (!uuidPattern.test(changeRequestId)) {
    return jsonResponse(400, { success: false, error: "Ongeldig wijzigingsverzoek ID." });
  }

  if (!storagePath && !Number.isInteger(fileIndex)) {
    return jsonResponse(400, { success: false, error: "Geef een storagePath of fileIndex mee." });
  }

  try {
    const user = await fetchAuthenticatedUser(supabaseUrl, serviceRoleKey, token);
    if (!user?.id) {
      return jsonResponse(401, { success: false, error: "Niet ingelogd." });
    }

    const request = await fetchOwnedChangeRequest(supabaseUrl, serviceRoleKey, changeRequestId, user.id);
    if (!request) {
      return jsonResponse(404, { success: false, error: "Bestand niet gevonden bij jouw wijzigingsverzoek." });
    }

    const files = normalizeFiles(request.file_names);
    const requestedStoragePath = normalizeStoragePath(storagePath);
    const file = requestedStoragePath
      ? files.find((item) => normalizeStoragePath(item.storagePath) === requestedStoragePath)
      : files[fileIndex];

    if (!file?.storagePath) {
      return jsonResponse(404, { success: false, error: "Bestand niet gevonden bij jouw wijzigingsverzoek." });
    }

    const signedUrl = await createSignedUrl(supabaseUrl, serviceRoleKey, normalizeStoragePath(file.storagePath));

    if (params.format === "json") {
      return jsonResponse(200, {
        success: true,
        signedUrl,
        fileName: file.originalName,
      });
    }

    return {
      statusCode: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch (error) {
    console.error("Client change request file error", { message: error.message });
    return jsonResponse(500, { success: false, error: "Bestand kon niet worden geopend." });
  }
};

async function fetchAuthenticatedUser(supabaseUrl, serviceRoleKey, token) {
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
    console.error("Client file auth lookup failed", {
      status: response.status,
      message: data.message || data.error || "Unknown Supabase Auth error",
    });
    return null;
  }

  return data;
}

async function fetchOwnedChangeRequest(supabaseUrl, serviceRoleKey, changeRequestId, authUserId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/change_requests?select=id,auth_user_id,file_names&id=eq.${encodeURIComponent(changeRequestId)}&limit=1`,
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
    console.error("Client file change request lookup failed", {
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    throw new Error("Change request lookup failed.");
  }

  const record = Array.isArray(data) ? data[0] : data;
  if (!record || record.auth_user_id !== authUserId) return null;
  return record;
}

async function createSignedUrl(supabaseUrl, serviceRoleKey, storagePath) {
  const encodedPath = encodeStoragePath(storagePath);
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${storageBucket}/${encodedPath}`, {
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
    console.error("Client file signed URL failed", {
      status: response.status,
      storagePath,
      message: data.message || data.error || "Unknown Supabase Storage error",
    });
    throw new Error("Signed URL failed.");
  }

  return toAbsoluteSignedUrl(supabaseUrl, data.signedURL);
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
