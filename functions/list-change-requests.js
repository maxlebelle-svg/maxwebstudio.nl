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

  console.log("Change request list configuration", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
  });

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
          "Accept-Profile": "public",
        },
      }
    );

    const data = await response.json().catch(() => []);

    console.log("Change request list Supabase response", {
      status: response.status,
      recordCount: Array.isArray(data) ? data.length : 0,
    });

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

    const records = Array.isArray(data) ? data : [];

    if (!records.length) {
      const seedResult = await createDemoChangeRequest(supabaseUrl, serviceRoleKey);

      if (seedResult.success) {
        console.log("Change request demo record created", { recordCount: 1 });
        return jsonResponse(200, {
          success: true,
          demoCreated: true,
          changeRequests: [normalizeChangeRequest(seedResult.record)],
        });
      }

      console.error("Change request demo record failed", {
        status: seedResult.status,
        message: seedResult.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      changeRequests: records.map(normalizeChangeRequest),
    });
  } catch (error) {
    console.error("Change request list error", { message: error.message });
    return jsonResponse(500, {
      success: false,
      error: "Wijzigingsverzoeken konden niet worden opgehaald.",
    });
  }
};

async function createDemoChangeRequest(supabaseUrl, serviceRoleKey) {
  const submittedAt = new Date().toISOString();

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/change_requests`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        created_at: submittedAt,
        first_name: "Demo",
        last_name: "Klant",
        company_name: "Max Web Studio Demo",
        email: "info@maxwebstudio.nl",
        phone: "0612345678",
        website: "https://maxwebstudio.nl",
        care_plan: "Plus",
        change_category: "Tekst aanpassen",
        priority: "Normaal",
        title: "Demo wijzigingsverzoek",
        description: "Dit demo-record is automatisch aangemaakt omdat de tabel nog leeg was. Gebruik dit om het admin-dashboard te testen.",
        file_names: [],
        internal_classification: "Waarschijnlijk binnen onderhoud",
        status: "nieuw",
        source: "website",
        metadata: {
          demo: true,
          createdBy: "list-change-requests",
          createdReason: "empty_table_dashboard_test",
        },
      }),
    });

    const data = await response.json().catch(() => []);

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        message: data.message || data.error || "Unknown Supabase error",
      };
    }

    const record = Array.isArray(data) ? data[0] : data;

    return record
      ? { success: true, record }
      : { success: false, status: response.status, message: "Supabase returned no inserted record" };
  } catch (error) {
    return { success: false, status: 0, message: error.message };
  }
}

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
    fileNames: normalizeFiles(row.file_names),
    internalClassification: cleanText(row.internal_classification),
    status: cleanText(row.status || "nieuw"),
    source: cleanText(row.source || "website"),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
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
              bucket: cleanText(file.bucket),
            };
          }

          return {
            originalName: cleanText(file),
            storagePath: "",
            mimeType: "",
            size: 0,
            bucket: "",
          };
        })
        .filter((file) => file.originalName || file.storagePath)
    : [];
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
