exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const appEnv = process.env.APP_ENV || "";
  const appEnvironment = process.env.APP_ENVIRONMENT || "";
  const environmentAllowed = ["test", "staging"].includes(appEnv) || ["test", "staging"].includes(appEnvironment);
  const clientPortalAuthLive = environmentAllowed && process.env.CLIENT_PORTAL_AUTH_LIVE === "true";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Client auth config missing Supabase public configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey),
    });

    return jsonResponse(500, {
      success: false,
      error: "Supabase Auth is nog niet geconfigureerd.",
    });
  }

  return jsonResponse(200, {
    success: true,
    supabaseUrl,
    supabaseAnonKey,
    appEnv,
    appEnvironment,
    clientPortalAuthLive,
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
