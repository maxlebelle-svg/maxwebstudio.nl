function allowedCorsOrigin() {
  const configuredOrigin = process.env.SITE_URL || process.env.URL || process.env.DEPLOY_URL || "https://maxwebstudio.nl";
  try {
    return new URL(configuredOrigin).origin;
  } catch (error) {
    return "https://maxwebstudio.nl";
  }
}

function corsHeaders({ headers = "Content-Type, Authorization", methods = "GET, POST, OPTIONS" } = {}) {
  return {
    "Access-Control-Allow-Origin": allowedCorsOrigin(),
    "Access-Control-Allow-Headers": headers,
    "Access-Control-Allow-Methods": methods,
  };
}

module.exports = {
  allowedCorsOrigin,
  corsHeaders,
};
