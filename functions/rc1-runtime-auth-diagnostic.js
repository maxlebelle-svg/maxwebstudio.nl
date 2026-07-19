function runtimeSnapshot() {
  return {
    adminTokenPresent: Boolean(process.env.ADMIN_TOKEN),
    allowLegacyAdminToken: String(process.env.ALLOW_LEGACY_ADMIN_TOKEN || "").trim().toLowerCase() === "true",
    appEnv: String(process.env.APP_ENV || ""),
    appEnvironment: String(process.env.APP_ENVIRONMENT || ""),
    context: String(process.env.CONTEXT || ""),
    netlifyEnv: String(process.env.NETLIFY_ENV || ""),
  };
}

exports.handler = async () => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
  },
  body: JSON.stringify(runtimeSnapshot()),
});

