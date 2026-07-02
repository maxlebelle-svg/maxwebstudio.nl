exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const googleMapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

  if (!googleMapsApiKey) {
    return jsonResponse(200, {
      success: false,
      configured: false,
      error: "Google Maps is nog niet geconfigureerd.",
    });
  }

  return jsonResponse(200, {
    success: true,
    configured: true,
    googleMapsApiKey,
  });
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
