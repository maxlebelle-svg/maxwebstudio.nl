const crypto = require("node:crypto");
const { allowedCorsOrigin, corsHeaders } = require("./_cors");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_REFERENCE = /^[a-f0-9]{32}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const ORDER_STATUSES = new Set(["pending", "accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]);
const MANAGER_ROLES = new Set(["owner", "manager"]);
const ORDER_ROLES = new Set(["owner", "manager", "staff", "kitchen_staff"]);
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;

class ApiError extends Error {
  constructor(status, code, publicMessage) {
    super(code);
    this.name = "FoodApiError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function requestId(event) {
  const supplied = String(event?.headers?.["x-request-id"] || event?.headers?.["X-Request-Id"] || event?.headers?.["x-nf-request-id"] || "").trim();
  return REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
}

function response(statusCode, body, traceId, methods = "GET, POST, PATCH, OPTIONS") {
  return {
    statusCode,
    headers: {
      ...corsHeaders({ methods, headers: "Content-Type, Authorization, Idempotency-Key, X-Request-Id" }),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": traceId,
    },
    body: JSON.stringify(body),
  };
}

function exactObject(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_REQUEST", `${label} is ongeldig.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ApiError(400, "UNKNOWN_FIELD", `${label} bevat een onbekend veld.`);
  return value;
}

function cleanText(value, min, max, label, optional = false) {
  if ((value === null || value === undefined || value === "") && optional) return null;
  if (typeof value !== "string") throw new ApiError(400, "INVALID_REQUEST", `${label} is ongeldig.`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max || /[<>\u0000-\u001f]/.test(cleaned)) {
    throw new ApiError(400, "INVALID_REQUEST", `${label} is ongeldig.`);
  }
  return cleaned;
}

function parseJsonBody(event) {
  const raw = String(event.body || "");
  const bytes = Buffer.byteLength(raw, event.isBase64Encoded ? "base64" : "utf8");
  if (!raw || bytes > MAX_BODY_BYTES) throw new ApiError(bytes > MAX_BODY_BYTES ? 413 : 400, bytes > MAX_BODY_BYTES ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", "De aanvraag is te groot of ongeldig.");
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "De aanvraag bevat geen geldige JSON.");
  }
}

function assertOrigin(event) {
  const origin = String(event?.headers?.origin || event?.headers?.Origin || "").trim();
  if (origin && origin !== allowedCorsOrigin()) throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Deze aanvraag is niet toegestaan.");
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!url || !anonKey || !serviceKey) throw new ApiError(503, "SERVICE_UNAVAILABLE", "De Food-service is tijdelijk niet beschikbaar.");
  return { url, anonKey, serviceKey };
}

async function timedFetch(url, options, phase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new ApiError(503, "UPSTREAM_TIMEOUT", "De Food-service reageert tijdelijk niet.");
    const wrapped = new ApiError(503, "UPSTREAM_UNAVAILABLE", "De Food-service is tijdelijk niet beschikbaar.");
    wrapped.phase = phase;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

async function supabaseRequest(path, { method = "GET", body, bearer, service = false, prefer } = {}) {
  const config = supabaseConfig();
  const token = service ? config.serviceKey : bearer;
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Inloggen is vereist.");
  const result = await timedFetch(`${config.url}${path}`, {
    method,
    headers: {
      apikey: service ? config.serviceKey : config.anonKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, `supabase_${method.toLowerCase()}`);
  const data = await result.json().catch(() => null);
  if (!result.ok) {
    const code = String(data?.code || "UPSTREAM_REJECTED");
    if (code === "23505") throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Deze idempotency-sleutel hoort al bij een andere bestelling.");
    if (code === "22023") throw new ApiError(400, "ORDER_REJECTED", "De bestelling is ongeldig.");
    if (code === "42501") throw new ApiError(403, "FORBIDDEN", "Deze handeling is niet toegestaan.");
    if (code === "P0002" || result.status === 404) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
    const error = new ApiError(502, "UPSTREAM_REJECTED", "De Food-service kon de aanvraag niet verwerken.");
    error.upstreamStatus = result.status;
    error.upstreamCode = code;
    throw error;
  }
  return data;
}

function serviceQuery(table, query) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, { service: true });
}
function sessionQuery(table, query, bearer, options = {}) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, { bearer, ...options });
}
function serviceRpc(name, input) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, { method: "POST", body: input, service: true });
}
function sessionRpc(name, input, bearer) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, { method: "POST", body: input, bearer });
}

async function publicLocation(slug) {
  if (!SLUG.test(slug) || slug.length > 100) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const locations = await serviceQuery("restaurant_locations", new URLSearchParams({
    select: "id,food_account_id,name,slug,timezone,phone,city,country_code",
    slug: `eq.${slug}`, status: "eq.active", is_published: "eq.true", limit: "1",
  }).toString());
  const location = Array.isArray(locations) ? locations[0] : null;
  if (!location) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const accounts = await serviceQuery("food_accounts", new URLSearchParams({
    select: "id,name,currency,timezone", id: `eq.${location.food_account_id}`, status: "in.(pilot,active)", limit: "1",
  }).toString());
  const account = Array.isArray(accounts) ? accounts[0] : null;
  if (!account) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  return { location, account };
}

async function storefront(slug) {
  const { location, account } = await publicLocation(slug);
  const pickup = await serviceRpc("food_has_capability", {
    target_food_account_id: account.id, target_location_id: location.id, target_capability_key: "ordering.pickup",
  });
  return {
    slug: location.slug,
    name: location.name || account.name,
    timezone: location.timezone || account.timezone,
    phone: location.phone || null,
    city: location.city || null,
    country_code: location.country_code,
    currency: account.currency,
    fulfilment: { pickup: pickup === true },
  };
}

async function publishedMenu(slug) {
  const { location, account } = await publicLocation(slug);
  const menus = await serviceQuery("menus", new URLSearchParams({
    select: "id,name,published_at", food_account_id: `eq.${account.id}`, location_id: `eq.${location.id}`,
    status: "eq.published", order: "published_at.desc", limit: "1",
  }).toString());
  const menu = Array.isArray(menus) ? menus[0] : null;
  if (!menu) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const categories = await serviceQuery("menu_categories", new URLSearchParams({
    select: "id,name,sort_order", food_account_id: `eq.${account.id}`, location_id: `eq.${location.id}`,
    menu_id: `eq.${menu.id}`, active: "eq.true", order: "sort_order.asc,id.asc",
  }).toString());
  const categoryIds = categories.map((category) => category.id);
  const items = categoryIds.length ? await serviceQuery("menu_items", new URLSearchParams({
    select: "id,category_id,tax_class_id,name,description,price_minor,available,sort_order",
    food_account_id: `eq.${account.id}`, location_id: `eq.${location.id}`,
    category_id: `in.(${categoryIds.join(",")})`, active: "eq.true", available: "eq.true", order: "sort_order.asc,id.asc",
  }).toString()) : [];
  const taxIds = [...new Set(items.map((item) => item.tax_class_id))];
  const taxes = taxIds.length ? await serviceQuery("restaurant_tax_classes", new URLSearchParams({
    select: "id,rate_basis_points", food_account_id: `eq.${account.id}`, id: `in.(${taxIds.join(",")})`, active: "eq.true",
  }).toString()) : [];
  const rates = new Map(taxes.map((tax) => [tax.id, tax.rate_basis_points]));
  return {
    name: menu.name,
    published_at: menu.published_at,
    currency: account.currency,
    tax_included: true,
    categories: categories.map((category) => ({
      category_ref: category.id,
      name: category.name,
      items: items.filter((item) => item.category_id === category.id).map((item) => ({
        item_ref: item.id,
        name: item.name,
        description: item.description,
        price_minor: Number(item.price_minor),
        tax_rate_basis_points: Number(rates.get(item.tax_class_id) || 0),
        available: true,
      })),
    })),
  };
}

function validateOrder(body) {
  exactObject(body, ["fulfilment_type", "customer", "pickup", "items", "note"], "Bestelling");
  if (body.fulfilment_type !== "pickup") throw new ApiError(400, "PICKUP_ONLY", "Alleen afhalen is momenteel beschikbaar.");
  const customer = exactObject(body.customer, ["name", "phone", "email"], "Klantgegevens");
  const pickup = exactObject(body.pickup || {}, ["pickup_at"], "Afhaalgegevens");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new ApiError(400, "INVALID_ITEMS", "Kies 1 tot 50 verschillende gerechten.");
  const seen = new Set();
  const items = body.items.map((raw) => {
    const item = exactObject(raw, ["item_ref", "quantity"], "Bestelregel");
    if (!UUID.test(String(item.item_ref || "")) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || seen.has(item.item_ref)) {
      throw new ApiError(400, "INVALID_ITEMS", "Een bestelregel is ongeldig of dubbel.");
    }
    seen.add(item.item_ref);
    return { menu_item_id: item.item_ref, quantity: item.quantity };
  });
  const email = cleanText(customer.email, 3, 254, "E-mailadres", true);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "INVALID_REQUEST", "E-mailadres is ongeldig.");
  const pickupAt = cleanText(pickup.pickup_at, 10, 40, "Afhaaltijd", true);
  if (pickupAt && Number.isNaN(Date.parse(pickupAt))) throw new ApiError(400, "INVALID_REQUEST", "Afhaaltijd is ongeldig.");
  return {
    items,
    customer: {
      name: cleanText(customer.name, 1, 120, "Naam"),
      phone: cleanText(customer.phone, 6, 32, "Telefoonnummer"),
      ...(email ? { email } : {}),
    },
    fulfilment: pickupAt ? { pickup_at: pickupAt } : {},
    note: cleanText(body.note, 0, 1000, "Opmerking", true),
  };
}

function publicClientKey(event, slug) {
  const secret = String(process.env.FOOD_RATE_LIMIT_SECRET || "");
  if (secret.length < 32) throw new ApiError(503, "ORDERING_UNAVAILABLE", "Online bestellen is tijdelijk niet beschikbaar.");
  const client = String(event?.headers?.["x-nf-client-connection-ip"] || event?.headers?.["x-forwarded-for"] || event?.headers?.["client-ip"] || "").split(",")[0].trim();
  if (!client || client.length > 100) throw new ApiError(429, "RATE_LIMITED", "Probeer het later opnieuw.");
  return crypto.createHmac("sha256", secret).update(`food-v1:${slug}:${client}`).digest("hex");
}

async function createOrder(event, slug) {
  assertOrigin(event);
  if (String(process.env.FOOD_PUBLIC_ORDERING_ENABLED || "").toLowerCase() !== "true") {
    throw new ApiError(503, "ORDERING_UNAVAILABLE", "Online bestellen is nog niet beschikbaar.");
  }
  if (!SLUG.test(slug) || slug.length > 100) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const idempotencyKey = String(event?.headers?.["idempotency-key"] || event?.headers?.["Idempotency-Key"] || "").trim();
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Een geldige idempotency-sleutel is vereist.");
  const allowed = await serviceRpc("food_consume_order_rate_limit_v1", {
    input_location_slug: slug,
    input_rate_key_hash: publicClientKey(event, slug),
    input_max_requests: 8,
    input_window_seconds: 60,
  });
  if (allowed !== true) throw new ApiError(429, "RATE_LIMITED", "Te veel aanvragen. Probeer het later opnieuw.");
  const input = validateOrder(parseJsonBody(event));
  const created = await serviceRpc("food_create_order_v1", {
    input_location_slug: slug,
    input_idempotency_key: idempotencyKey,
    input_items: input.items,
    input_fulfilment_type: "pickup",
    input_customer_snapshot: input.customer,
    input_fulfilment_snapshot: input.fulfilment,
    input_customer_note: input.note,
  });
  return {
    public_reference: created.public_reference,
    status: created.status,
    currency: created.currency,
    subtotal_minor: Number(created.subtotal_minor),
    tax_minor: Number(created.tax_minor),
    total_minor: Number(created.total_minor),
    idempotent_replay: created.idempotent_replay === true,
    confirmation_path: `/api/food/v1/storefronts/${slug}/orders/${created.public_reference}/confirmation`,
  };
}

async function confirmation(slug, reference) {
  if (!SLUG.test(slug) || slug.length > 100 || !PUBLIC_REFERENCE.test(reference)) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const result = await serviceRpc("food_get_order_confirmation_v1", {
    input_location_slug: slug, input_public_reference: reference,
  });
  if (!result) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  return result;
}

async function authenticate(event, accountId) {
  if (!UUID.test(accountId)) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const header = String(event?.headers?.authorization || event?.headers?.Authorization || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!bearer) throw new ApiError(401, "AUTH_REQUIRED", "Inloggen is vereist.");
  const config = supabaseConfig();
  const authResponse = await timedFetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${bearer}` },
  }, "food_auth_user");
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) throw new ApiError(401, "INVALID_SESSION", "De sessie is ongeldig of verlopen.");
  const profiles = await sessionQuery("profiles", new URLSearchParams({
    select: "id,role,status", auth_user_id: `eq.${user.id}`, status: "eq.active", limit: "1",
  }).toString(), bearer);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) throw new ApiError(403, "FORBIDDEN", "Deze handeling is niet toegestaan.");
  const platformAdmin = ["super_admin", "admin"].includes(profile.role);
  const memberships = platformAdmin ? [] : await sessionQuery("food_account_members", new URLSearchParams({
    select: "food_account_id,location_id,role,status", food_account_id: `eq.${accountId}`,
    profile_id: `eq.${profile.id}`, status: "eq.active",
  }).toString(), bearer);
  if (!platformAdmin && (!Array.isArray(memberships) || !memberships.length)) throw new ApiError(403, "FORBIDDEN", "Deze handeling is niet toegestaan.");
  return { bearer, profile, platformAdmin, memberships };
}

function membershipFor(context, locationId, roles) {
  if (!UUID.test(locationId)) throw new ApiError(400, "INVALID_LOCATION", "Locatie is ongeldig.");
  if (context.platformAdmin) return { role: "platform_admin" };
  const membership = context.memberships.find((row) => (!row.location_id || row.location_id === locationId) && roles.has(row.role));
  if (!membership) throw new ApiError(403, "FORBIDDEN", "Deze handeling is niet toegestaan.");
  return membership;
}

async function requireCapability(context, accountId, locationId, capability) {
  const enabled = await sessionRpc("food_has_capability", {
    target_food_account_id: accountId, target_location_id: locationId, target_capability_key: capability,
  }, context.bearer);
  if (enabled !== true) throw new ApiError(403, "CAPABILITY_UNAVAILABLE", "Deze functie is niet beschikbaar.");
}

function pageInput(params) {
  const limit = params.get("limit") === null ? 25 : Number(params.get("limit"));
  const offset = params.get("offset") === null ? 0 : Number(params.get("offset"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new ApiError(400, "INVALID_PAGINATION", "Paginering is ongeldig.");
  }
  return { limit, offset };
}

function publicOrder(row) {
  return {
    id: row.id,
    location_id: row.location_id,
    status: row.status,
    fulfilment_type: row.fulfilment_type,
    channel: row.channel,
    currency: row.currency,
    subtotal_minor: Number(row.subtotal_minor),
    tax_minor: Number(row.tax_minor),
    total_minor: Number(row.total_minor),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listOrders(event, accountId, params) {
  const context = await authenticate(event, accountId);
  const locationId = String(params.get("location_id") || "");
  membershipFor(context, locationId, new Set([...ORDER_ROLES, "viewer"]));
  await requireCapability(context, accountId, locationId, "orders.management");
  const { limit, offset } = pageInput(params);
  const status = params.get("status");
  if (status && !ORDER_STATUSES.has(status)) throw new ApiError(400, "INVALID_STATUS", "Orderstatus is ongeldig.");
  const query = new URLSearchParams({
    select: "id,location_id,status,fulfilment_type,channel,currency,subtotal_minor,tax_minor,total_minor,created_at,updated_at",
    food_account_id: `eq.${accountId}`, location_id: `eq.${locationId}`, order: "created_at.desc,id.desc",
    limit: String(limit), offset: String(offset), ...(status ? { status: `eq.${status}` } : {}),
  });
  const rows = await sessionQuery("food_orders", query.toString(), context.bearer);
  return { orders: rows.map(publicOrder), page: { limit, offset, returned: rows.length } };
}

async function orderDetail(event, accountId, orderId) {
  if (!UUID.test(orderId)) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const context = await authenticate(event, accountId);
  const rows = await sessionQuery("food_orders", new URLSearchParams({
    select: "id,location_id,status,fulfilment_type,channel,currency,subtotal_minor,tax_minor,total_minor,customer_snapshot,fulfilment_snapshot,customer_note,created_at,updated_at",
    id: `eq.${orderId}`, food_account_id: `eq.${accountId}`, limit: "1",
  }).toString(), context.bearer);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  membershipFor(context, row.location_id, new Set([...ORDER_ROLES, "viewer"]));
  await requireCapability(context, accountId, row.location_id, "orders.management");
  const items = await sessionQuery("food_order_items", new URLSearchParams({
    select: "item_name_snapshot,item_description_snapshot,quantity,unit_price_minor,line_subtotal_minor,tax_rate_basis_points,tax_minor,line_total_minor",
    food_account_id: `eq.${accountId}`, order_id: `eq.${orderId}`, order: "created_at.asc,id.asc",
  }).toString(), context.bearer);
  return {
    ...publicOrder(row),
    customer: row.customer_snapshot,
    fulfilment: row.fulfilment_snapshot,
    customer_note: row.customer_note,
    items,
  };
}

async function changeStatus(event, accountId, orderId) {
  assertOrigin(event);
  if (!UUID.test(orderId)) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const body = exactObject(parseJsonBody(event), ["status", "reason"], "Statuswijziging");
  if (!ORDER_STATUSES.has(body.status) || body.status === "pending") throw new ApiError(400, "INVALID_STATUS", "Orderstatus is ongeldig.");
  const reason = cleanText(body.reason, 0, 500, "Reden", true);
  const context = await authenticate(event, accountId);
  const rows = await sessionQuery("food_orders", new URLSearchParams({
    select: "id,location_id", id: `eq.${orderId}`, food_account_id: `eq.${accountId}`, limit: "1",
  }).toString(), context.bearer);
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  membershipFor(context, order.location_id, ORDER_ROLES);
  await requireCapability(context, accountId, order.location_id, "orders.management");
  const changed = await serviceRpc("food_transition_order_status_v1", {
    input_order_id: orderId, input_new_status: body.status,
    input_actor_profile_id: context.profile.id, input_reason: reason,
  });
  return publicOrder(changed);
}

async function managementMenu(event, accountId, params) {
  const locationId = String(params.get("location_id") || "");
  const context = await authenticate(event, accountId);
  membershipFor(context, locationId, new Set([...MANAGER_ROLES, "staff", "kitchen_staff", "viewer"]));
  await requireCapability(context, accountId, locationId, "menu.management");
  const menus = await sessionQuery("menus", new URLSearchParams({
    select: "id,name,status,published_at,updated_at", food_account_id: `eq.${accountId}`, location_id: `eq.${locationId}`,
    order: "updated_at.desc",
  }).toString(), context.bearer);
  const categories = await sessionQuery("menu_categories", new URLSearchParams({
    select: "id,menu_id,name,sort_order,active", food_account_id: `eq.${accountId}`, location_id: `eq.${locationId}`,
    order: "sort_order.asc,id.asc",
  }).toString(), context.bearer);
  const items = await sessionQuery("menu_items", new URLSearchParams({
    select: "id,category_id,name,description,price_minor,active,available,sort_order,updated_at",
    food_account_id: `eq.${accountId}`, location_id: `eq.${locationId}`, order: "sort_order.asc,id.asc",
  }).toString(), context.bearer);
  return { location_id: locationId, menus, categories, items: items.map((item) => ({ ...item, price_minor: Number(item.price_minor) })) };
}

async function updateMenuItem(event, accountId, itemId) {
  assertOrigin(event);
  if (!UUID.test(itemId)) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  const body = exactObject(parseJsonBody(event), ["price_minor", "available", "active"], "Menu-item");
  if (!Object.keys(body).length) throw new ApiError(400, "NO_CHANGES", "Geef minimaal één wijziging op.");
  if (body.price_minor !== undefined && (!Number.isSafeInteger(body.price_minor) || body.price_minor < 0 || body.price_minor > 100000000)) {
    throw new ApiError(400, "INVALID_PRICE", "Prijs moet in geldige eurocenten staan.");
  }
  for (const field of ["available", "active"]) if (body[field] !== undefined && typeof body[field] !== "boolean") throw new ApiError(400, "INVALID_REQUEST", `${field} is ongeldig.`);
  const context = await authenticate(event, accountId);
  const rows = await sessionQuery("menu_items", new URLSearchParams({
    select: "id,location_id", id: `eq.${itemId}`, food_account_id: `eq.${accountId}`, limit: "1",
  }).toString(), context.bearer);
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  membershipFor(context, item.location_id, MANAGER_ROLES);
  await requireCapability(context, accountId, item.location_id, "menu.management");
  const updated = await sessionQuery("menu_items", new URLSearchParams({
    select: "id,location_id,name,price_minor,active,available,updated_at", id: `eq.${itemId}`,
    food_account_id: `eq.${accountId}`, location_id: `eq.${item.location_id}`,
  }).toString(), context.bearer, { method: "PATCH", body, prefer: "return=representation" });
  if (!Array.isArray(updated) || updated.length !== 1) throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
  return { ...updated[0], price_minor: Number(updated[0].price_minor) };
}

function routePath(event) {
  let path = String(event.path || event.rawPath || "").split("?")[0];
  path = path.replace(/^\/\.netlify\/functions\/food-v1/, "").replace(/^\/api\/food\/v1/, "");
  return path || "/";
}

async function dispatch(event) {
  const method = String(event.httpMethod || event.requestContext?.http?.method || "GET").toUpperCase();
  const path = routePath(event);
  const params = event.rawQuery || event.rawQueryString
    ? new URLSearchParams(event.rawQuery || event.rawQueryString)
    : new URLSearchParams(Object.entries(event.queryStringParameters || {}).filter(([, value]) => value !== undefined && value !== null));
  let match;
  if (method === "GET" && (match = path.match(/^\/storefronts\/([^/]+)$/))) return { status: 200, body: await storefront(match[1]) };
  if (method === "GET" && (match = path.match(/^\/storefronts\/([^/]+)\/menu$/))) return { status: 200, body: await publishedMenu(match[1]) };
  if (method === "POST" && (match = path.match(/^\/storefronts\/([^/]+)\/orders$/))) {
    const body = await createOrder(event, match[1]);
    return { status: body.idempotent_replay ? 200 : 201, body };
  }
  if (method === "GET" && (match = path.match(/^\/storefronts\/([^/]+)\/orders\/([^/]+)\/confirmation$/))) return { status: 200, body: await confirmation(match[1], match[2]) };
  if (method === "GET" && (match = path.match(/^\/accounts\/([^/]+)\/orders$/))) return { status: 200, body: await listOrders(event, match[1], params) };
  if (method === "GET" && (match = path.match(/^\/accounts\/([^/]+)\/orders\/([^/]+)$/))) return { status: 200, body: await orderDetail(event, match[1], match[2]) };
  if (method === "PATCH" && (match = path.match(/^\/accounts\/([^/]+)\/orders\/([^/]+)\/status$/))) return { status: 200, body: await changeStatus(event, match[1], match[2]) };
  if (method === "GET" && (match = path.match(/^\/accounts\/([^/]+)\/menu$/))) return { status: 200, body: await managementMenu(event, match[1], params) };
  if (method === "PATCH" && (match = path.match(/^\/accounts\/([^/]+)\/menu\/items\/([^/]+)$/))) return { status: 200, body: await updateMenuItem(event, match[1], match[2]) };
  throw new ApiError(404, "NOT_FOUND", "Niet gevonden.");
}

async function handler(event) {
  const traceId = requestId(event);
  if (String(event.httpMethod || "").toUpperCase() === "OPTIONS") return response(204, {}, traceId);
  try {
    const result = await dispatch(event);
    return response(result.status, { success: true, data: result.body, request_id: traceId }, traceId);
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "De Food-service kon de aanvraag niet verwerken.");
    console.error("Food API request failed", {
      requestId: traceId,
      code: safe.code,
      status: safe.status,
      upstreamCode: safe.upstreamCode || undefined,
      upstreamStatus: safe.upstreamStatus || undefined,
      phase: safe.phase || undefined,
    });
    return response(safe.status, { success: false, code: safe.code, error: safe.publicMessage, request_id: traceId }, traceId);
  }
}

module.exports = { handler, _private: { ApiError, dispatch, parseJsonBody, validateOrder, publicClientKey, routePath, membershipFor } };
