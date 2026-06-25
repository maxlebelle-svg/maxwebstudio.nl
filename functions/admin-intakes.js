const { readIntakes } = require("./intake-storage");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const expectedToken = process.env.ADMIN_TOKEN;
  const authHeader = event.headers.authorization || event.headers.Authorization || "";

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return jsonResponse(401, { success: false, error: "Niet geautoriseerd." });
  }

  const intakes = await readIntakes();
  return jsonResponse(200, { success: true, intakes });
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
