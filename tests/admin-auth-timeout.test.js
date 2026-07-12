const test = require("node:test");
const assert = require("node:assert/strict");
const { _private } = require("../functions/_admin-auth");

test("admin auth upstream timeout is bounded and phase coded", async () => {
  const originalFetch = global.fetch;
  global.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
  try {
    await assert.rejects(
      _private.fetchWithTimeout("https://example.invalid/auth/v1/user", {}, "verify_auth_user", 5),
      (error) => error.code === "AUTH_UPSTREAM_TIMEOUT" && error.phase === "verify_auth_user"
    );
  } finally {
    global.fetch = originalFetch;
  }
});
