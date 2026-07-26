const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260726193000_cx2_callback_success_recovery.sql");
const client = read("public/src/dca-start.js");
const endpointSource = read("functions/client-activation-magic-link.js");
const authProviderSource = read("public/src/services/supabaseAuthProvider.js");
const portalSource = read("public/klantportaal.html");
const endpoint = require("../functions/client-activation-magic-link");

async function runtime() {
  return import(`${pathToFileUrl(path.join(root, "public/src/cx2-activation-runtime.mjs"))}?test=${Date.now()}`);
}

function pathToFileUrl(file) {
  return `file://${file.split(path.sep).map(encodeURIComponent).join("/").replace(/^%2F/, "")}`;
}

function sessionProvider({ delayed = false, never = false } = {}) {
  const session = { access_token: "browser-safe-test-session" };
  return {
    async consumeMagicLinkSessionFromUrl() { return { success: !delayed && !never, session: !delayed && !never ? session : null }; },
    async getSession() { return { session: null }; },
    onAuthStateChange(callback) {
      const timer = never ? 0 : setTimeout(() => callback("SIGNED_IN", { session }), 5);
      return { data: { subscription: { unsubscribe() { if (timer) clearTimeout(timer); } } } };
    },
  };
}

test("canoniek succescontract accepteert alleen serverbepaalde veilige portalroutes", async () => {
  const { canonicalActivationResult } = await runtime();
  const valid = {
    success: true, status: "activated", activationSucceeded: true, identityVerified: true,
    customerBindingSucceeded: true, invitationActivated: true,
    redirectTo: "/klantportaal.html?view=website", correlationId: "123e4567-e89b-12d3-a456-426614174000",
  };
  assert.equal(canonicalActivationResult(valid).redirectTo, "/klantportaal.html?view=website");
  assert.equal(canonicalActivationResult({ ...valid, redirectTo: "https://evil.example/" }), null);
  assert.equal(canonicalActivationResult({ ...valid, invitationActivated: false }), null);
});

test("callback wacht event-based op vertraagde session hydration", async () => {
  const { completeCallbackFlow } = await runtime();
  const result = await completeCallbackFlow({
    state: "a".repeat(64), provider: sessionProvider({ delayed: true }), timeoutMs: 100,
    completeRequest: async (_state, token) => ({
      success: token === "browser-safe-test-session", status: "activated", activationSucceeded: true,
      identityVerified: true, customerBindingSucceeded: true, invitationActivated: true,
      redirectTo: "/klantportaal.html?view=website", correlationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
  });
  assert.equal(result.status, "activated");
});

test("session restore timeout blijft tijdelijk en refreshbaar", async () => {
  const { completeCallbackFlow, callbackError } = await runtime();
  await assert.rejects(
    completeCallbackFlow({ state: "b".repeat(64), provider: sessionProvider({ never: true }), timeoutMs: 10 }),
    (error) => callbackError(error).code === "CX2_SESSION_RESTORE_TIMEOUT" && callbackError(error).retryable === true,
  );
});

test("invalid, expired, revoked, identity en ownership hebben afzonderlijke veilige teksten", async () => {
  const { callbackError } = await runtime();
  const codes = ["CX2_ACTIVATION_INVALID", "CX2_ACTIVATION_EXPIRED", "CX2_ACTIVATION_REVOKED", "CX2_IDENTITY_MISMATCH", "CX2_OWNERSHIP_AMBIGUOUS"];
  const messages = codes.map((code) => callbackError({ code }).message);
  assert.equal(new Set(messages).size, codes.length);
  assert.ok(messages.every((message) => !/@|[0-9a-f]{64}/i.test(message)));
});

test("countdown gebruikt absolute servertijd en blijft correct na refresh of achtergrondtab", async () => {
  const { remainingCooldownSeconds } = await runtime();
  const end = 1_000_060_000;
  assert.equal(remainingCooldownSeconds(end, 1_000_000_000), 60);
  assert.equal(remainingCooldownSeconds(end, 1_000_030_500), 30);
  assert.equal(remainingCooldownSeconds(end, 1_000_120_000), 0);
  assert.match(client, /activationContext\?\.activation\?\.cooldownEndsAt/);
  assert.match(client, /button\.replaceChildren/);
  assert.doesNotMatch(client, /const count = byId\("cx2-activation-countdown"\);[\s\S]*count\.textContent/);
});

test("server herstelt een reeds geconsumeerde callback met hetzelfde geverifieerde account", async () => {
  const previous = { ...process.env };
  const previousFetch = global.fetch;
  const calls = [];
  Object.assign(process.env, {
    SUPABASE_URL: "https://staging.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
    SUPABASE_ANON_KEY: "public-anon",
    CX2_AUTH_REDIRECT_ORIGINS: "https://staging.example.nl",
    APP_ENV: "staging",
  });
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/auth/v1/user")) return response(200, { id: "auth-user", email_confirmed_at: "2026-07-26T12:00:00Z", user_metadata: { name: "Test" } });
    if (String(url).includes("/rpc/cx2_complete_magic_link")) return response(400, { code: "55000", message: "CX2 callback is no longer active." });
    if (String(url).includes("/rpc/cx2_resolve_magic_link_completion")) return response(200, [{ customer_id: "customer", profile_id: "profile", preview_version_id: "preview", customer_created: false, portal_path: "/klantportaal.html?view=website" }]);
    throw new Error("unexpected request");
  };
  try {
    const result = await endpoint.handler({
      httpMethod: "POST",
      headers: { origin: "https://staging.example.nl", host: "staging.example.nl", "x-forwarded-proto": "https", "content-type": "application/json", authorization: "Bearer session" },
      body: JSON.stringify({ action: "complete", state: "c".repeat(64) }),
    });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.status, "activated");
    assert.equal(body.replayRecovered, true);
    assert.equal(body.redirectTo, "/klantportaal.html?view=website");
    assert.equal(calls.filter((url) => url.includes("cx2_complete_magic_link")).length, 1);
    assert.equal(calls.filter((url) => url.includes("cx2_resolve_magic_link_completion")).length, 1);
  } finally {
    global.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("recovery-RPC is read-only, identitygebonden en behoudt ownershipisolatie", () => {
  assert.match(migration, /challenge_record\.status <> 'consumed'/);
  assert.match(migration, /verified_auth_user_id is distinct from input_auth_user_id/);
  assert.match(migration, /lead_record\.converted_customer_id is distinct from customer_record\.id/);
  assert.match(migration, /publication\.relationship_type = 'customer'/);
  assert.match(migration, /project\.customer_id = customer_record\.id/);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\b/i);
  assert.match(migration, /revoke all on function public\.cx2_resolve_magic_link_completion/);
});

test("browsercontract lekt geen callbackstate, authcode of interne identifiers", () => {
  assert.doesNotMatch(`${client}\n${endpointSource}`, /localStorage\.(?:setItem|getItem)\([^\n]*(?:state|code)/i);
  assert.doesNotMatch(endpointSource, /console\.(?:log|info|error)\([^\n]*(?:email|token|state|body)/i);
  assert.match(client, /if \(!mapped\.retryable\) window\.history\.replaceState/);
  assert.match(client, /completeCallbackFlow/);
  assert.match(client, /window\.location\.replace\(data\.redirectTo\)/);
  assert.doesNotMatch(client, /window\.location\.assign\(data\.redirectTo\)/);
  assert.match(authProviderSource, /hydrateSessionUser\(config, \{/);
  assert.match(authProviderSource, /\/auth\/v1\/user/);
  assert.match(authProviderSource, /if \(!session\?\.user\?\.id\) return \{ success: false, reason: "magic_link_session_unverified" \}/);
  assert.match(authProviderSource, /return \{ \.\.\.session, user \}/);
  assert.match(portalSource, /verifiedAuthUserId !== profileAuthUserId/);
  assert.match(portalSource, /id: existingSession\?\.id \|\| `supabase-\$\{verifiedAuthUserId\}`/);
  assert.match(portalSource, /provider: "supabase"/);
  assert.match(portalSource, /isDemo: false/);
  assert.doesNotMatch(portalSource, /maxwebstudioCurrentSession[\s\S]{0,900}accessToken:/);
});

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}
