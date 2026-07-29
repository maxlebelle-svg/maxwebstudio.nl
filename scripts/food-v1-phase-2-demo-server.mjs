import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = resolve(repositoryRoot, "public");
const fixturePath = resolve(repositoryRoot, "tests/fixtures/food-v1-phase-2-storefront.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const orderingEnabled = String(process.env.FOOD_PUBLIC_ORDERING_ENABLED || "").toLowerCase() === "true";
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number(portArgument?.split("=")[1] || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local demo port.");

const attempts = new Map();
const confirmations = new Map();
const itemByRef = new Map(fixture.menu.categories.flatMap((category) => category.items).map((item) => [item.item_ref, item]));
const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".svg", "image/svg+xml"], [".json", "application/json; charset=utf-8"],
]);

function send(response, status, body, requestId = randomUUID()) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  });
  response.end(JSON.stringify({ success: status >= 200 && status < 300, ...(status >= 200 && status < 300 ? { data: body } : body), request_id: requestId }));
}

async function jsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error("large"), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("json"), { status: 400, code: "INVALID_JSON" }); }
}

function safeError(code, error = "Deze aanvraag kon niet worden verwerkt.") { return { code, error }; }

function createOrder(payload, idempotencyKey) {
  if (payload?.fulfilment_type !== "pickup" || !Array.isArray(payload?.items) || !payload.items.length) {
    throw Object.assign(new Error("order"), { status: 400, code: "ORDER_REJECTED" });
  }
  if ("price_minor" in payload || "total_minor" in payload || "food_account_id" in payload) {
    throw Object.assign(new Error("money"), { status: 400, code: "UNKNOWN_FIELD" });
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const previous = attempts.get(idempotencyKey);
  if (previous && previous.fingerprint !== fingerprint) throw Object.assign(new Error("conflict"), { status: 409, code: "IDEMPOTENCY_CONFLICT" });
  if (previous) return { ...previous.created, idempotent_replay: true };

  const lines = payload.items.map((line) => {
    const item = itemByRef.get(line.item_ref);
    if (!item || item.available !== true || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw Object.assign(new Error("item"), { status: 400, code: "ORDER_REJECTED" });
    }
    return { name: item.name, quantity: line.quantity, unit_price_minor: item.price_minor, line_total_minor: item.price_minor * line.quantity };
  });
  const totalMinor = lines.reduce((sum, line) => sum + line.line_total_minor, 0);
  const publicReference = randomBytes(16).toString("hex");
  const created = { public_reference: publicReference, status: "pending", currency: "EUR", subtotal_minor: totalMinor, tax_minor: Math.round(totalMinor * 9 / 109), total_minor: totalMinor, idempotent_replay: false };
  const confirmation = { ...created, fulfilment_type: "pickup", created_at: new Date().toISOString(), storefront: { slug: fixture.storefront.slug, name: fixture.storefront.name }, items: lines };
  attempts.set(idempotencyKey, { fingerprint, created });
  confirmations.set(publicReference, confirmation);
  return created;
}

async function apiRoute(request, response, url) {
  const prefix = `/api/food/v1/storefronts/${fixture.storefront.slug}`;
  if (!url.pathname.startsWith("/api/food/v1/")) return false;
  if (url.pathname === prefix && request.method === "GET") {
    const profile = structuredClone(fixture.storefront);
    profile.ordering = orderingEnabled ? profile.ordering : { enabled: false, reason: "pilot_disabled" };
    send(response, 200, profile); return true;
  }
  if (url.pathname === `${prefix}/menu` && request.method === "GET") { send(response, 200, fixture.menu); return true; }
  if (url.pathname === `${prefix}/orders` && request.method === "POST") {
    if (!orderingEnabled) { send(response, 503, safeError("ORDERING_UNAVAILABLE", "Online bestellen staat voor deze lokale demo uit.")); return true; }
    const key = String(request.headers["idempotency-key"] || "");
    if (key.length < 16 || key.length > 128) { send(response, 400, safeError("IDEMPOTENCY_KEY_REQUIRED")); return true; }
    try {
      const created = createOrder(await jsonBody(request), key);
      send(response, created.idempotent_replay ? 200 : 201, created);
    } catch (error) { send(response, error.status || 400, safeError(error.code || "ORDER_REJECTED")); }
    return true;
  }
  const match = url.pathname.match(new RegExp(`^${prefix}/orders/([a-f0-9]{32})/confirmation$`));
  if (match && request.method === "GET") {
    const confirmation = confirmations.get(match[1]);
    send(response, confirmation ? 200 : 404, confirmation || safeError("NOT_FOUND", "Niet gevonden."));
    return true;
  }
  send(response, 404, safeError("NOT_FOUND", "Niet gevonden."));
  return true;
}

async function staticRoute(response, url) {
  let relative = url.pathname;
  if (/^\/food\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(relative)) relative = "/food.html";
  if (relative === "/") relative = "/food.html";
  let file = resolve(publicRoot, `.${relative}`);
  if (file !== publicRoot && !file.startsWith(`${publicRoot}${sep}`)) { send(response, 404, safeError("NOT_FOUND")); return; }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { "Content-Type": mime.get(extname(file)) || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(bytes);
  } catch { send(response, 404, safeError("NOT_FOUND", "Niet gevonden.")); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${port}`}`);
  try {
    if (await apiRoute(request, response, url)) return;
    await staticRoute(response, url);
  } catch { send(response, 500, safeError("INTERNAL_ERROR", "De lokale demo kon de aanvraag niet verwerken.")); }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Food v1 Phase 2 demo: http://127.0.0.1:${port}/food/${fixture.storefront.slug}\n`);
  process.stdout.write(`Ordering: ${orderingEnabled ? "enabled" : "disabled"}\n`);
});
