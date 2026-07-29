const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const certification = require("../public/admin/ui/factory-hub.js");

function node() {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    children: [],
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    replaceChildren() { this.children = []; },
    append(child) { this.children.push(child); },
  };
}

function setup({ hostname = certification.certificationHost, role = "super_admin", accessToken = "test-session", fetchImpl } = {}) {
  const section = node();
  const button = node();
  const status = node();
  const results = node();
  const controller = certification.createStagingCertification({
    hostname,
    section,
    button,
    status,
    results,
    readSession: () => ({ role, accessToken }),
    fetchImpl: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({ results: [
      { resource: "factory_gate_checks", category: "reachable", httpStatus: 200, postgrestCode: null, serviceRoleConfigured: true, stagingTargetConfirmed: true },
      { resource: "factory_gate_overrides", category: "permission_denied", httpStatus: 403, postgrestCode: "42501", serviceRoleConfigured: true, stagingTargetConfirmed: true },
    ] }) })),
    createElement: () => node(),
  });
  return { section, button, status, results, controller };
}

test("certification section is present but only exposed on the exact staging host to a super_admin session", () => {
  const html = fs.readFileSync("public/admin-factories.html", "utf8");
  assert.match(html, /Stagingcertificering/);
  assert.match(html, /Voert één beveiligde, read-only controle uit\. Er worden geen gegevens gewijzigd\./);
  assert.match(html, /Production Gate controleren/);

  assert.equal(setup().controller.eligible, true);
  assert.equal(setup({ hostname: "maxwebstudio.nl" }).section.hidden, true);
  assert.equal(setup({ hostname: `${certification.certificationHost}.evil.example` }).section.hidden, true);
  assert.equal(setup({ role: "admin" }).button.disabled, true);
  assert.equal(setup({ role: "developer" }).section.hidden, true);
  assert.equal(setup({ accessToken: "" }).controller.eligible, false);
});

test("loading makes no request; one click disables before the exact single GET and cannot retry", async () => {
  const calls = [];
  let button;
  const harness = setup({ fetchImpl: async (url, options) => {
    assert.equal(button.disabled, true);
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ results: [
      { resource: "factory_gate_checks", category: "reachable", httpStatus: 200, postgrestCode: null, serviceRoleConfigured: true, stagingTargetConfirmed: true },
      { resource: "factory_gate_overrides", category: "resource_missing", httpStatus: 404, postgrestCode: "PGRST205", serviceRoleConfigured: true, stagingTargetConfirmed: true },
    ] }) };
  } });
  button = harness.button;

  assert.equal(calls.length, 0);
  const first = harness.controller.run();
  assert.equal(harness.controller.hasStarted(), true);
  assert.equal(button.disabled, true);
  await first;
  await harness.controller.run();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/internal/factory-gate-readiness");
  assert.deepEqual(calls[0].options, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer test-session" },
    credentials: "same-origin",
    cache: "no-store",
  });
  assert.equal(harness.status.textContent, "Controle geslaagd.");
  assert.deepEqual(harness.results.children.map((item) => item.textContent), [
    "factory_gate_checks: reachable · HTTP 200",
    "factory_gate_overrides: resource_missing · HTTP 404 · PGRST205",
  ]);
});

test("denials, invalid JSON and transport failures expose only fixed safe classifications", async () => {
  const denied = setup({ fetchImpl: async () => ({ ok: false, status: 403 }) });
  await denied.controller.run();
  assert.equal(denied.status.textContent, "Veilig geweigerd (HTTP 403).");

  const invalid = setup({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("secret raw response"); } }) });
  await invalid.controller.run();
  assert.equal(invalid.status.textContent, "Onverwachte veilige foutclassificatie.");

  const blocked = setup({ fetchImpl: async () => { throw new Error("secret request details"); } });
  await blocked.controller.run();
  assert.equal(blocked.status.textContent, "Netwerkrequest vóór verzending geblokkeerd.");

  const visibleText = [denied, invalid, blocked].map((item) => item.status.textContent).join(" ");
  assert.doesNotMatch(visibleText, /secret|authorization|token|cookie|stack/i);
});

test("the certification action has one endpoint, no fallback, polling or write method", () => {
  const source = fs.readFileSync("public/admin/ui/factory-hub.js", "utf8");
  const functionSource = source.slice(source.indexOf("function createStagingCertification"), source.indexOf("async function request"));
  assert.equal((functionSource.match(/\/internal\/factory-gate-readiness/g) || []).length, 0);
  assert.doesNotMatch(functionSource, /setInterval|retry|poll|fallback|method:\s*"(?:POST|PUT|PATCH|DELETE)"/i);
  assert.equal(certification.certificationEndpoint, "/internal/factory-gate-readiness");
});
