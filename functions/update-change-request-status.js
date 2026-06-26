const allowedStatuses = new Set(["nieuw", "in_behandeling", "wacht_op_klant", "afgerond"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== "PATCH") {
    return jsonResponse(405, { success: false, error: "Alleen PATCH-verzoeken zijn toegestaan." });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { success: false, error: "Ongeldige JSON body." });
  }

  const id = String(payload.id || "").trim();
  const status = String(payload.status || "").trim();

  if (!uuidPattern.test(id)) {
    return jsonResponse(400, { success: false, error: "Ongeldig wijzigingsverzoek ID." });
  }

  if (!allowedStatuses.has(status)) {
    return jsonResponse(400, { success: false, error: "Ongeldige status." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Change request status update missing Supabase configuration");
    return jsonResponse(500, {
      success: false,
      error: "Status kon niet worden bijgewerkt.",
    });
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/change_requests?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status }),
    });

    const data = await response.json().catch(() => []);

    if (!response.ok) {
      console.error("Change request status update failed", {
        status: response.status,
        message: data.message || data.error || "Unknown Supabase error",
      });

      return jsonResponse(500, {
        success: false,
        error: "Status kon niet worden bijgewerkt.",
      });
    }

    const updatedRecord = Array.isArray(data) ? data[0] : data;

    if (!updatedRecord) {
      return jsonResponse(404, {
        success: false,
        error: "Wijzigingsverzoek niet gevonden.",
      });
    }

    return jsonResponse(200, {
      success: true,
      changeRequest: {
        id: updatedRecord.id,
        status: updatedRecord.status,
      },
    });
  } catch (error) {
    console.error("Change request status update error", { message: error.message });
    return jsonResponse(500, {
      success: false,
      error: "Status kon niet worden bijgewerkt.",
    });
  }
};

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
