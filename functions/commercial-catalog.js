const { publicCatalog } = require("./_commercial-catalog");
const { corsHeaders } = require("./_cors");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "GET") return response(405, { success: false, error: "Methode niet toegestaan." });
  return response(200, { success: true, catalog: publicCatalog() });
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders({ methods: "GET, OPTIONS" }),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
