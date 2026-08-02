"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, sign } = require("node:crypto");

const {
  FACTORY_WORKER_AUDIENCE,
  FACTORY_WORKER_REF,
  FACTORY_WORKER_REPOSITORY,
  FACTORY_WORKER_WORKFLOW,
  GITHUB_OIDC_ISSUER,
  authenticateFactoryBrowserWorker,
  verifyFactoryBrowserWorkerToken,
} = require("../functions/website-factory/github-actions-oidc");

const now = 1785798000;
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "factory-test-key", use: "sig", alg: "RS256" };

function claims(overrides = {}) {
  return {
    iss: GITHUB_OIDC_ISSUER,
    aud: FACTORY_WORKER_AUDIENCE,
    sub: `repo:${FACTORY_WORKER_REPOSITORY}:ref:${FACTORY_WORKER_REF}`,
    repository: FACTORY_WORKER_REPOSITORY,
    workflow_ref: FACTORY_WORKER_WORKFLOW,
    ref: FACTORY_WORKER_REF,
    ref_type: "branch",
    event_name: "schedule",
    runner_environment: "github-hosted",
    run_id: "123456",
    jti: "oidc-test-jti",
    iat: now - 10,
    nbf: now - 10,
    exp: now + 300,
    ...overrides,
  };
}

function token(payload = claims(), privateKey = keys.privateKey) {
  const header = encode({ alg: "RS256", typ: "JWT", kid: publicJwk.kid });
  const body = encode(payload);
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}

test("exact GitHub Actions worker identity is accepted", async () => {
  const verified = await verifyFactoryBrowserWorkerToken(token(), { jwks: { keys: [publicJwk] }, nowSeconds: now });

  assert.equal(verified.repository, FACTORY_WORKER_REPOSITORY);
  assert.equal(verified.workflow_ref, FACTORY_WORKER_WORKFLOW);
  assert.equal(verified.aud, FACTORY_WORKER_AUDIENCE);
});

test("repository, workflow, branch, audience and event claims fail closed", async () => {
  const cases = [
    [{ repository: "attacker/fork" }, "FACTORY_WORKER_OIDC_REPOSITORY_INVALID"],
    [{ workflow_ref: `${FACTORY_WORKER_REPOSITORY}/.github/workflows/other.yml@${FACTORY_WORKER_REF}` }, "FACTORY_WORKER_OIDC_WORKFLOW_INVALID"],
    [{ ref: "refs/heads/feature" }, "FACTORY_WORKER_OIDC_REF_INVALID"],
    [{ aud: "another-service" }, "FACTORY_WORKER_OIDC_AUDIENCE_INVALID"],
    [{ event_name: "pull_request" }, "FACTORY_WORKER_OIDC_EVENT_INVALID"],
  ];
  for (const [override, expectedCode] of cases) {
    await assert.rejects(
      verifyFactoryBrowserWorkerToken(token(claims(override)), { jwks: { keys: [publicJwk] }, nowSeconds: now }),
      (error) => error.code === expectedCode,
    );
  }
});

test("expired, excessively long and invalidly signed tokens are rejected", async () => {
  await assert.rejects(
    verifyFactoryBrowserWorkerToken(token(claims({ exp: now - 60 })), { jwks: { keys: [publicJwk] }, nowSeconds: now }),
    (error) => error.code === "FACTORY_WORKER_OIDC_TIME_INVALID",
  );
  await assert.rejects(
    verifyFactoryBrowserWorkerToken(token(claims({ iat: now - 10, exp: now + 1800 })), { jwks: { keys: [publicJwk] }, nowSeconds: now }),
    (error) => error.code === "FACTORY_WORKER_OIDC_LIFETIME_INVALID",
  );
  const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await assert.rejects(
    verifyFactoryBrowserWorkerToken(token(claims(), otherKeys.privateKey), { jwks: { keys: [publicJwk] }, nowSeconds: now }),
    (error) => error.code === "FACTORY_WORKER_OIDC_SIGNATURE_INVALID",
  );
});

test("OIDC identity is considered only for the two worker actions", async () => {
  const event = { headers: { authorization: `Bearer ${token()}` } };
  const queue = await authenticateFactoryBrowserWorker(event, "get_browser_review_queue", { jwks: { keys: [publicJwk] }, nowSeconds: now });
  const submit = await authenticateFactoryBrowserWorker(event, "submit_browser_review", { jwks: { keys: [publicJwk] }, nowSeconds: now });
  const unrelated = await authenticateFactoryBrowserWorker(event, "create_build_job", { jwks: { keys: [publicJwk] }, nowSeconds: now });

  assert.equal(queue.success, true);
  assert.equal(submit.success, true);
  assert.equal(queue.admin.role, "admin");
  assert.equal(unrelated.attempted, false);
});

test("Website Factory accepts its workflow token and rejects a signed fork token before database access", async () => {
  const current = Math.floor(Date.now() / 1000);
  const previousFetch = global.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  let databaseCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes("token.actions.githubusercontent.com/.well-known/jwks")) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url).includes("website_build_jobs")) {
      databaseCalls += 1;
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Onverwachte fetch: ${url}`);
  };
  process.env.SUPABASE_URL = "https://factory-oidc-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const { handler } = require("../functions/website-factory");
  const validClaims = claims({ iat: current - 10, nbf: current - 10, exp: current + 300 });
  const valid = await handler({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token(validClaims)}` },
    body: JSON.stringify({ action: "get_browser_review_queue", limit: 1 }),
  });
  const beforeFork = databaseCalls;
  const fork = await handler({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token({ ...validClaims, repository: "attacker/fork" })}` },
    body: JSON.stringify({ action: "get_browser_review_queue", limit: 1 }),
  });
  try {
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(JSON.parse(valid.body).jobs, []);
    assert.equal(fork.statusCode, 401);
    assert.equal(JSON.parse(fork.body).code, "FACTORY_WORKER_OIDC_REPOSITORY_INVALID");
    assert.equal(databaseCalls, beforeFork);
  } finally {
    global.fetch = previousFetch;
    restoreEnv("SUPABASE_URL", previousEnv.SUPABASE_URL);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", previousEnv.SUPABASE_SERVICE_ROLE_KEY);
  }
});

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
