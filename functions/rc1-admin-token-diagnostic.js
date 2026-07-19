const { legacyAdminTokenAllowed } = require("./_admin-auth");

exports.handler = async (event) => {
  const authorizationHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearerToken = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice(7).trim()
    : "";
  const runtimeAdminToken = process.env.ADMIN_TOKEN || "";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
    body: JSON.stringify({
      authorizationHeaderPresent: Boolean(authorizationHeader),
      bearerTokenParsed: Boolean(bearerToken),
      runtimeAdminTokenPresent: Boolean(runtimeAdminToken),
      tokenMatchesRuntime: Boolean(runtimeAdminToken && bearerToken && bearerToken === runtimeAdminToken),
      legacyAuthAllowed: legacyAdminTokenAllowed(),
    }),
  };
};

