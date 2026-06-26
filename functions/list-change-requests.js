const SELECT_FIELDS = [
  "id",
  "created_at",
  "first_name",
  "last_name",
  "company_name",
  "email",
  "phone",
  "website",
  "care_plan",
  "change_category",
  "priority",
  "title",
  "description",
  "file_names",
  "internal_classification",
  "status",
  "source",
  "metadata",
].join(",");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request list missing Supabase configuration");
    return jsonResponse(500, {
      success: false,
      error: "Wijzigingsverzoeken konden niet worden opgehaald.",
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/change_requests?select=${SELECT_FIELDS}&order=created_at.desc&limit=100`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
        },
      }
    );

    const data = await response.json().catch(() => []);

    if (!response.ok) {
      console.error("Change request list failed", {
        status: response.status,
        message: data.message || data.error || "Unknown Supabase error",
      });

      return jsonResponse(500, {
        success: false,
        error: "Wijzigingsverzoeken konden niet worden opgehaald.",
      });
    }

    return jsonResponse(200, {
      success: true,
      changeRequests: Array.isArray(data) ? data.map(normalizeChangeRequest) : [],
    });
  } catch (error) {
    console.error("Change request list error", { message: error.message });
    return jsonResponse(500, {
      success: false,
      error: "Wijzigingsverzoeken konden niet worden opgehaald.",
    });
  }
};

function normalizeChangeRequest(row) {
  const firstName = cleanText(row.first_name);
  const lastName = cleanText(row.last_name);

  return {
    id: row.id,
    createdAt: row.created_at,
    firstName,
    lastName,
    customerName: [firstName, lastName].filter(Boolean).join(" "),
    companyName: cleanText(row.company_name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    website: cleanText(row.website),
    carePlan: cleanText(row.care_plan),
    changeCategory: cleanText(row.change_category),
    priority: cleanText(row.priority),
    title: cleanText(row.title),
    description: cleanText(row.description),
    fileNames: Array.isArray(row.file_names) ? row.file_names.map(cleanText).filter(Boolean) : [],
    internalClassification: cleanText(row.internal_classification),
    status: cleanText(row.status || "nieuw"),
    source: cleanText(row.source || "website"),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function cleanText(value) {
  return String(value || "").trim();
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
