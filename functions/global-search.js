const { verifyAdmin } = require("./_admin-auth");

const STATIC_RESULTS = [
  ["dashboard", "page", "Open Dashboard", "Max CRM overzicht", "admin-dashboard.html", "Instellingen", "Dashboard"],
  ["customers", "page", "Open Klanten", "Klantbeheer en timeline", "admin-klanten.html", "Klanten", "CRM"],
  ["leads", "page", "Open Leads", "Sales pipeline en lead generator", "admin-sales.html", "Leads", "Sales"],
  ["invoices", "page", "Open Facturen", "Facturen en betalingen", "admin-facturen.html", "Facturen", "Finance"],
  ["mail-center", "page", "Open Mail Center", "Verzonden e-mails", "admin-mail-center.html", "E-mails", "Mail"],
  ["notification-center", "page", "Open Notification Center", "Activity feed", "admin-notification-center.html", "Notifications", "Activity"],
  ["website-factory", "page", "Open Website Factory", "Website previews", "admin-website-factory.html", "Websites", "Production"],
  ["logo-studio", "page", "Open Logo Studio", "Logo generatie", "admin-logo-studio.html", "Branding", "Brand"],
  ["settings", "page", "Open Settings", "Instellingen", "admin-instellingen.html", "Instellingen", "System"],
  ["new-customer", "command", "Nieuwe klant", "Maak een klant aan", "admin-klanten.html", "Klanten", "Command"],
  ["new-invoice", "command", "Nieuwe factuur", "Maak een factuur aan", "admin-facturen.html", "Facturen", "Command"],
  ["generate-logo", "command", "Generate logo", "Start Logo Studio", "admin-logo-studio.html", "Branding", "Command"],
];

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "global_search",
      action: "search",
      allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"],
    });
    if (!adminCheck.success) return adminCheck.response;

    const params = getQueryParams(event);
    const query = cleanText(params.get("query") || params.get("q")).toLowerCase();
    const type = cleanText(params.get("type")).toLowerCase();
    const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), 20);
    const results = STATIC_RESULTS
      .map(normalizeResult)
      .filter((item) => (!type || item.type === type) && (!query || searchable(item).includes(query)))
      .slice(0, limit);

    return jsonResponse(200, { success: true, results });
  } catch (error) {
    console.error("Global search error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Global search kon niet worden geladen.",
    });
  }
};

function normalizeResult(row) {
  const [id, type, title, subtitle, url, group, status] = row;
  return {
    id,
    type,
    title,
    subtitle,
    url,
    status,
    icon: type === "command" ? ">" : "#",
    updated_at: "",
    metadata: { group },
  };
}

function searchable(item) {
  return [item.id, item.type, item.title, item.subtitle, item.url, item.status, item.metadata?.group].join(" ").toLowerCase();
}

function getQueryParams(event) {
  if (event.rawQuery) return new URLSearchParams(event.rawQuery);
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, value);
  });
  return params;
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
