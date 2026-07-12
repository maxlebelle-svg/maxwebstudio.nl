const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const bridge = read("public/src/services/adminAuthBridgeService.js");
const provider = read("public/src/services/supabaseAuthProvider.js");
const guard = read("public/src/admin-route-guard.js");
const helpers = read("public/admin/ui/shared-helpers.js");
const login = read("public/login.html");
const factory = read("public/admin-website-factory.html");

test("central Supabase session is the source for login, refresh and new tabs", () => {
  assert.match(bridge, /import \{ getSession, signOut \} from "\.\/supabaseAuthProvider\.js\?v=20260712-authbridge"/);
  assert.match(factory, /admin-route-guard\.js\?v=20260712-authbridge/);
  assert.match(bridge, /const result = await getSession\(\)/);
  assert.match(provider, /officialAuth\.signInWithPassword/);
  assert.match(provider, /officialAuth\.getSession/);
  assert.match(provider, /officialAuth\.refreshSession/);
  assert.match(provider, /officialAuth\.onAuthStateChange/);
  assert.match(provider, /grant_type=refresh_token/);
  assert.match(provider, /expiresAt > Date\.now\(\) \+ 60000/);
  assert.match(provider, /window\.addEventListener\("storage", listener\)/);
});

test("legacy admin sessions are derived only after a server-confirmed active role", () => {
  assert.match(bridge, /fetch\("\/api\/account-profile"/);
  assert.match(bridge, /status !== "active"/);
  assert.match(bridge, /ADMIN_ROLES\.has\(role\)/);
  assert.match(bridge, /localStorage\.setItem\(ADMIN_SESSION_KEY/);
  assert.match(bridge, /localStorage\.setItem\(CURRENT_SESSION_KEY/);
  assert.doesNotMatch(guard, /function storedAuthSession/);
  assert.doesNotMatch(login, /function storeAdminSessionBridge/);
});

test("legacy UI status cannot grant access or preempt central session restore", () => {
  assert.doesNotMatch(helpers, /function productionSession/);
  assert.doesNotMatch(helpers, /window\.location\.replace\(`\/admin-login/);
  assert.match(guard, /await resolveAdminAuth\(\)/);
  assert.match(guard, /redirectToAdminLogin\(verification\.reason\)/);
});

test("Factory requests obtain bearer through the central admin bridge", () => {
  assert.match(factory, /import \{ getAdminAccessToken, getSafeAdminAuthMessage \}/);
  assert.match(factory, /token = await getAdminAccessToken\(\)/);
  assert.doesNotMatch(factory, /function getBearer\(\)[\s\S]{0,500}maxwebstudioSupabaseAuthSession/);
  assert.match(factory, /Je sessie is verlopen\. Log opnieuw in\./);
  assert.match(factory, /Dit account heeft geen actieve adminrol\./);
  assert.match(factory, /tijdelijke backendfout/);
  assert.match(factory, /error\?\.message \|\| "De klantwerkruimte kon niet worden geladen/);
});

test("logout clears central and all derived admin sessions", () => {
  for (const key of ["AUTH_SESSION_KEY", "mws_admin_supabase_session", "maxwebstudioCurrentSession", "maxwebstudioAdminSession"]) {
    assert.match(provider, new RegExp(`removeItem\\(${key === "AUTH_SESSION_KEY" ? key : `"${key}"`}\\)`));
  }
  assert.match(bridge, /await signOut\(\)/);
});

test("client or inactive profiles cannot become an admin bridge", () => {
  assert.match(bridge, /!ADMIN_ROLES\.has\(role\)/);
  assert.match(bridge, /error\.code = status !== "active" \? "PROFILE_INACTIVE" : "ROLE_NOT_ALLOWED"/);
  assert.match(bridge, /clearDerivedAdminSessions\(\)/);
});

test("manual ZIP publication regression remains connected after auth repair", () => {
  assert.match(factory, /data-manual-zip-upload/);
  assert.match(factory, /action: "activate"/);
  assert.match(factory, /activePreviewSource: "manual_zip"/);
});
