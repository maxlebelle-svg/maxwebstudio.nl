import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = resolve(repositoryRoot, "public");
const storefrontFixture = JSON.parse(await readFile(resolve(repositoryRoot, "tests/fixtures/food-v1-phase-2-storefront.json"), "utf8"));
const dashboardFixture = JSON.parse(await readFile(resolve(repositoryRoot, "tests/fixtures/food-v1-phase-3-dashboard.json"), "utf8"));
const orderingEnabled = String(process.env.FOOD_PUBLIC_ORDERING_ENABLED || "").toLowerCase() === "true";
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number(portArgument?.split("=")[1] || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local demo port.");

const menu = structuredClone(storefrontFixture.menu);
const attempts = new Map();
const orders = new Map();
const confirmations = new Map();
const tokenProfiles = new Map(dashboardFixture.fixture_accounts.map((account) => [account.token, account]));
const mime = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".svg", "image/svg+xml"], [".json", "application/json; charset=utf-8"]]);
const statusGraph = new Map([["pending", "accepted"], ["accepted", "preparing"], ["preparing", "ready"], ["ready", "completed"]]);

function send(response, status, body, requestId = randomUUID()) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId });
  response.end(JSON.stringify({ success: status >= 200 && status < 300, ...(status >= 200 && status < 300 ? { data: body } : body), request_id: requestId }));
}
function safeError(code, error = "Deze aanvraag kon niet worden verwerkt.") { return { code, error }; }
async function jsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16 * 1024) throw Object.assign(new Error("large"), { status: 413, code: "PAYLOAD_TOO_LARGE" }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("json"), { status: 400, code: "INVALID_JSON" }); }
}
function currentMenu() {
  return { ...menu, categories: menu.categories.map((category) => ({ ...category, items: category.items.filter((item) => item.active !== false && item.available === true) })) };
}
function itemByRef(reference) { return menu.categories.flatMap((category) => category.items).find((item) => item.item_ref === reference); }
function dashboardItem(reference) { return menu.categories.flatMap((category) => category.items.map((item) => ({ ...item, id: item.item_ref, category_id: category.category_ref }))).find((item) => item.id === reference); }
function publicOrder(order) { return { id: order.id, public_reference: order.public_reference, location_id: order.location_id, status: order.status, fulfilment_type: order.fulfilment_type, channel: order.channel, currency: order.currency, subtotal_minor: order.subtotal_minor, tax_minor: order.tax_minor, total_minor: order.total_minor, created_at: order.created_at, updated_at: order.updated_at }; }
function authenticated(request) {
  const header = String(request.headers.authorization || ""); const token = header.startsWith("Bearer ") ? header.slice(7) : ""; const profile = tokenProfiles.get(token);
  if (!profile) throw Object.assign(new Error("auth"), { status: 401, code: "AUTH_REQUIRED" });
  if (!profile.tenant) throw Object.assign(new Error("member"), { status: 403, code: "FORBIDDEN" });
  return { ...profile, scope: dashboardFixture[profile.tenant] };
}
function requireScope(profile, accountRef, locationRef) {
  if (profile.scope.account_ref !== accountRef || (locationRef && profile.scope.location_ref !== locationRef)) throw Object.assign(new Error("scope"), { status: 404, code: "NOT_FOUND" });
}
function createOrder(payload, idempotencyKey) {
  if (payload?.fulfilment_type !== "pickup" || !Array.isArray(payload?.items) || !payload.items.length) throw Object.assign(new Error("order"), { status: 400, code: "ORDER_REJECTED" });
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex"); const previous = attempts.get(idempotencyKey);
  if (previous && previous.fingerprint !== fingerprint) throw Object.assign(new Error("conflict"), { status: 409, code: "IDEMPOTENCY_CONFLICT" });
  if (previous) return { ...previous.created, idempotent_replay: true };
  const lines = payload.items.map((line) => { const item = itemByRef(line.item_ref); if (!item || item.available !== true || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw Object.assign(new Error("item"), { status: 400, code: "ORDER_REJECTED" }); return { item_name_snapshot: item.name, item_description_snapshot: item.description, quantity: line.quantity, unit_price_minor: item.price_minor, line_subtotal_minor: item.price_minor * line.quantity, tax_rate_basis_points: item.tax_rate_basis_points, tax_minor: Math.round(item.price_minor * line.quantity * 9 / 109), line_total_minor: item.price_minor * line.quantity }; });
  const now = new Date().toISOString(); const totalMinor = lines.reduce((sum, line) => sum + line.line_total_minor, 0); const publicReference = randomBytes(16).toString("hex"); const id = randomUUID();
  const order = { id, public_reference: publicReference, food_account_id: dashboardFixture.pilot.account_ref, location_id: dashboardFixture.pilot.location_ref, status: "pending", fulfilment_type: "pickup", channel: "website", currency: "EUR", subtotal_minor: totalMinor, tax_minor: Math.round(totalMinor * 9 / 109), total_minor: totalMinor, customer: structuredClone(payload.customer || {}), fulfilment: structuredClone(payload.pickup || {}), customer_note: payload.note || null, items: lines, created_at: now, updated_at: now, status_history: [{ old_status: null, new_status: "pending", actor_type: "public", reason: null, created_at: now }] };
  orders.set(id, order);
  const created = { public_reference: publicReference, status: "pending", currency: "EUR", subtotal_minor: totalMinor, tax_minor: order.tax_minor, total_minor: totalMinor, idempotent_replay: false };
  confirmations.set(publicReference, { ...created, fulfilment_type: "pickup", created_at: now, storefront: { slug: storefrontFixture.storefront.slug, name: storefrontFixture.storefront.name }, items: lines.map((line) => ({ name: line.item_name_snapshot, quantity: line.quantity, unit_price_minor: line.unit_price_minor, line_total_minor: line.line_total_minor })) });
  attempts.set(idempotencyKey, { fingerprint, created }); return created;
}

async function publicApi(request, response, url) {
  const prefix = `/api/food/v1/storefronts/${storefrontFixture.storefront.slug}`;
  if (url.pathname === prefix && request.method === "GET") { const profile = structuredClone(storefrontFixture.storefront); profile.ordering = orderingEnabled ? profile.ordering : { enabled: false, reason: "pilot_disabled" }; send(response, 200, profile); return true; }
  if (url.pathname === `${prefix}/menu` && request.method === "GET") { send(response, 200, currentMenu()); return true; }
  if (url.pathname === `${prefix}/orders` && request.method === "POST") {
    if (!orderingEnabled) { send(response, 503, safeError("ORDERING_UNAVAILABLE", "Online bestellen staat voor deze lokale demo uit.")); return true; }
    const key = String(request.headers["idempotency-key"] || ""); if (key.length < 16 || key.length > 128) { send(response, 400, safeError("IDEMPOTENCY_KEY_REQUIRED")); return true; }
    try { const created = createOrder(await jsonBody(request), key); send(response, created.idempotent_replay ? 200 : 201, created); } catch (error) { send(response, error.status || 400, safeError(error.code || "ORDER_REJECTED")); } return true;
  }
  const confirmationMatch = url.pathname.match(new RegExp(`^${prefix}/orders/([a-f0-9]{32})/confirmation$`));
  if (confirmationMatch && request.method === "GET") { const confirmation = confirmations.get(confirmationMatch[1]); send(response, confirmation ? 200 : 404, confirmation || safeError("NOT_FOUND", "Niet gevonden.")); return true; }
  return false;
}

async function managementApi(request, response, url) {
  if (!url.pathname.startsWith("/api/food/v1/")) return false;
  let profile; try { profile = authenticated(request); } catch (error) { send(response, error.status, safeError(error.code, error.status === 401 ? "Inloggen is vereist." : "Deze handeling is niet toegestaan.")); return true; }
  if (url.pathname === "/api/food/v1/session/context" && request.method === "GET") {
    send(response, 200, { platform_role: "customer", scopes: [{ ...profile.scope, role: profile.role, permissions: { orders_read: true, orders_update: profile.role !== "viewer", menu_read: true, menu_update: profile.role === "manager" } }] }); return true;
  }
  const accountMatch = url.pathname.match(/^\/api\/food\/v1\/accounts\/([0-9a-f-]{36})(.*)$/); if (!accountMatch) { send(response, 404, safeError("NOT_FOUND", "Niet gevonden.")); return true; }
  const accountRef = accountMatch[1]; const rest = accountMatch[2]; try { requireScope(profile, accountRef, url.searchParams.get("location_id")); } catch (error) { send(response, error.status, safeError(error.code, "Niet gevonden.")); return true; }
  if (rest === "/orders" && request.method === "GET") { send(response, 200, { orders: [...orders.values()].filter((order) => order.food_account_id === accountRef && order.location_id === profile.scope.location_ref).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(publicOrder), page: { limit: 100, offset: 0, returned: orders.size } }); return true; }
  const orderMatch = rest.match(/^\/orders\/([0-9a-f-]{36})(?:\/status)?$/);
  if (orderMatch) {
    const order = orders.get(orderMatch[1]); if (!order || order.food_account_id !== accountRef || order.location_id !== profile.scope.location_ref) { send(response, 404, safeError("NOT_FOUND", "Niet gevonden.")); return true; }
    if (request.method === "GET" && !rest.endsWith("/status")) { send(response, 200, { ...publicOrder(order), customer: order.customer, fulfilment: order.fulfilment, customer_note: order.customer_note, items: order.items, status_history: order.status_history }); return true; }
    if (request.method === "PATCH" && rest.endsWith("/status")) {
      if (profile.role === "viewer") { send(response, 403, safeError("FORBIDDEN", "Deze handeling is niet toegestaan.")); return true; }
      const body = await jsonBody(request).catch(() => ({})); const expected = statusGraph.get(order.status); const kitchenAllowed = profile.role !== "kitchen_staff" || (order.status === "accepted" && body.status === "preparing") || (order.status === "preparing" && body.status === "ready");
      if (body.status !== expected || !kitchenAllowed) { send(response, 409, safeError("INVALID_TRANSITION", "Deze statuswijziging is niet toegestaan.")); return true; }
      const now = new Date().toISOString(); const previous = order.status; order.status = body.status; order.updated_at = now; order.status_history.push({ old_status: previous, new_status: order.status, actor_type: "food_member", reason: null, created_at: now }); send(response, 200, publicOrder(order)); return true;
    }
  }
  if (rest === "/menu" && request.method === "GET") { send(response, 200, { location_id: profile.scope.location_ref, menus: [{ id: "f8000000-0000-4000-8000-000000000001", name: menu.name, status: "published", published_at: menu.published_at }], categories: menu.categories.map((category) => ({ id: category.category_ref, menu_id: "f8000000-0000-4000-8000-000000000001", name: category.name, sort_order: 1, active: true })), items: menu.categories.flatMap((category) => category.items.map((item, index) => ({ ...item, id: item.item_ref, category_id: category.category_ref, active: item.active !== false, sort_order: index + 1, updated_at: new Date().toISOString() }))) }); return true; }
  const itemMatch = rest.match(/^\/menu\/items\/([0-9a-f-]{36})$/);
  if (itemMatch && request.method === "PATCH") {
    if (profile.role !== "manager") { send(response, 403, safeError("FORBIDDEN", "Deze handeling is niet toegestaan.")); return true; }
    const item = dashboardItem(itemMatch[1]); if (!item) { send(response, 404, safeError("NOT_FOUND", "Niet gevonden.")); return true; } const source = itemByRef(item.id); const body = await jsonBody(request).catch(() => ({}));
    if (body.price_minor !== undefined && (!Number.isSafeInteger(body.price_minor) || body.price_minor < 0 || body.price_minor > 100000000)) { send(response, 400, safeError("INVALID_PRICE", "Prijs is ongeldig.")); return true; }
    if (body.available !== undefined && typeof body.available !== "boolean") { send(response, 400, safeError("INVALID_REQUEST")); return true; }
    if (body.price_minor !== undefined) source.price_minor = body.price_minor; if (body.available !== undefined) source.available = body.available;
    send(response, 200, { id: source.item_ref, location_id: profile.scope.location_ref, name: source.name, price_minor: source.price_minor, active: source.active !== false, available: source.available, updated_at: new Date().toISOString() }); return true;
  }
  send(response, 404, safeError("NOT_FOUND", "Niet gevonden.")); return true;
}

const localBootstrap = `import "/admin/food/dashboard.js";const role=new URLSearchParams(location.search).get("demo_role");const token=role==="customer"?"demo-customer-token":role==="viewer"?"demo-viewer-token":role==="kitchen"?"demo-kitchen-token":"demo-manager-token";const app=window.MaxFoodDashboard.createDashboardApp({sessionProvider:async()=>token,logout:async()=>window.location.assign("/admin/food")});app.start();window.addEventListener("pagehide",()=>app.stop(),{once:true});`;
async function staticRoute(response, url) {
  if (url.pathname === "/admin/food/dashboard-bootstrap.js") { response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" }); response.end(localBootstrap); return; }
  let relative = url.pathname;
  if (/^\/food\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(relative)) relative = "/food.html";
  if (/^\/admin\/food(?:\/menu|\/orders(?:\/[0-9a-f-]{36})?)?\/?$/.test(relative)) relative = "/admin-food.html";
  if (relative === "/") relative = "/food.html";
  const file = resolve(publicRoot, `.${relative}`); if (file !== publicRoot && !file.startsWith(`${publicRoot}${sep}`)) { send(response, 404, safeError("NOT_FOUND")); return; }
  try { const bytes = await readFile(file); response.writeHead(200, { "Content-Type": mime.get(extname(file)) || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); response.end(bytes); } catch { send(response, 404, safeError("NOT_FOUND", "Niet gevonden.")); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${port}`}`);
  try { if (await publicApi(request, response, url)) return; if (await managementApi(request, response, url)) return; await staticRoute(response, url); }
  catch { send(response, 500, safeError("INTERNAL_ERROR", "De lokale demo kon de aanvraag niet verwerken.")); }
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Food v1 Phase 3 dashboard: http://127.0.0.1:${port}/admin/food\n`);
  process.stdout.write(`Food v1 Phase 3 storefront: http://127.0.0.1:${port}/food/${storefrontFixture.storefront.slug}\n`);
});
