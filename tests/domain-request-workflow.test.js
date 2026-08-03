const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const service = require('../functions/services/domainRequestService');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('domain workflow normalizes domains and rejects URL noise', () => {
  assert.equal(service.normalizeDomain('https://www.Voorbeeld.nl/pad?q=1'), 'voorbeeld.nl');
  assert.equal(service.normalizeDomain('voorbeeld.nl:443'), 'voorbeeld.nl');
});

test('transfer codes use authenticated encryption and are never present in sanitized output', () => {
  const previous = process.env.DOMAIN_TRANSFER_ENCRYPTION_KEY;
  process.env.DOMAIN_TRANSFER_ENCRYPTION_KEY = 'test-only-domain-transfer-secret-with-enough-entropy';
  try {
    const encrypted = service._private.encryptSecret('EPP-heel-geheim');
    assert.match(encrypted, /^v1:/);
    assert.doesNotMatch(encrypted, /heel-geheim/);
    assert.equal(service._private.decryptSecret(encrypted), 'EPP-heel-geheim');
    const sanitized = service._private.sanitizeRequest({
      id: 'request', customer_id: 'customer', request_type: 'transfer', domain_name: 'voorbeeld.nl',
      transfer_secret_ciphertext: encrypted, transfer_secret_received_at: '2026-08-02T12:00:00Z',
    });
    assert.equal(sanitized.hasTransferCode, true);
    assert.equal(Object.hasOwn(sanitized, 'transfer_secret_ciphertext'), false);
  } finally {
    if (previous === undefined) delete process.env.DOMAIN_TRANSFER_ENCRYPTION_KEY;
    else process.env.DOMAIN_TRANSFER_ENCRYPTION_KEY = previous;
  }
});

test('customer submission requires holder, address, email and transfer context', () => {
  const missing = service._private.missingCustomerFields({ approval: false }, 'transfer');
  assert.deepEqual(missing, ['naam domeinhouder', 'volledig adres', 'e-mailadres', 'akkoord', 'huidige provider', 'e-mailgebruik op het domein']);
  const complete = service._private.missingCustomerFields({
    holderName: 'Voorbeeld B.V.', address: 'Dorpsstraat 1', postalCode: '1234 AB', city: 'Utrecht',
    email: 'beheer@voorbeeld.nl', approval: true, currentRegistrar: 'Registrar', hasDomainEmail: 'yes',
  }, 'transfer');
  assert.deepEqual(complete, []);
});

test('database migration keeps browser roles out and models requests, events and domain assets separately', () => {
  const sql = read('supabase/migrations/20260802120000_domain_request_workflow.sql');
  for (const table of ['domain_requests', 'domain_request_events', 'domains']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  }
  assert.match(sql, /transfer_secret_ciphertext text/);
  assert.match(sql, /unique \(customer_id, domain_name\)/);
});

test('admin and client UIs expose the task-driven domain workflow', () => {
  const admin = read('public/admin-domain-center.html');
  const client = read('public/klantportaal.html');
  assert.match(admin, /id="domain-request-form"/);
  assert.match(admin, /id="domain-request-metrics"/);
  assert.match(admin, /id="domain-request-detail"/);
  assert.match(admin, /id="domain-request-owner-filter"/);
  assert.match(admin, /Operationele werklijst/);
  assert.match(admin, /admin-domain-requests/);
  assert.match(admin, /reveal_transfer_code/);
  assert.match(client, /href="#domeinen"/);
  assert.match(client, /id="portal-domain-form"/);
  assert.match(client, /id="portal-domain-progress"/);
  assert.match(client, /portal-domain-primary-card/);
  assert.match(client, /Geen actie van jou nodig/);
  assert.match(client, /client-domain-requests/);
  assert.match(client, /We vragen nooit om het wachtwoord/);
});

test('ordinary API reads expose transfer-code presence but never ciphertext', () => {
  const serviceSource = read('functions/services/domainRequestService.js');
  const clientSource = read('functions/client-domain-requests.js');
  assert.match(serviceSource, /hasTransferCode: Boolean\(row\.transfer_secret_received_at\)/);
  assert.doesNotMatch(clientSource, /transfer_secret_ciphertext/);
  assert.match(clientSource, /customerForAuthUser/);
});

test('public domain reservation distinguishes definitive registrar checks from fallback checks', () => {
  const page = read('public/domein-kopen.html');
  const endpoint = read('functions/public-domain-order.js');
  assert.match(page, /We controleren direct of je domeinnaam beschikbaar is/);
  assert.match(page, /tijdelijke storing tonen we dit duidelijk als voorlopige controle/);
  assert.match(page, /\.netlify\/functions\/public-domain-order/);
  assert.match(endpoint, /possibly_available/);
  assert.match(endpoint, /registrar\.checkDomain/);
  assert.match(endpoint, /availability\.definitive/);
  assert.match(endpoint, /prepareAbuseControlRequest/);
  assert.match(endpoint, /Publieke Netlify-reservering/);
  assert.match(endpoint, /notifyAdminOfDomainReservation/);
  assert.doesNotMatch(endpoint, /api\.netlify\.com.*domains|transferCode/);
});

test('new public reservations send an idempotent admin notification with a customer deep link', async () => {
  const notifications = require('../functions/services/domainReservationNotificationService');
  let sent = null;
  const result = await notifications.notifyAdminOfDomainReservation({
    request: { id: '11111111-1111-4111-8111-111111111111', domainName: 'voorbeeld.nl' },
    customer: { id: '22222222-2222-4222-8222-222222222222', name: 'Ada Lovelace', company: 'Voorbeeld B.V.', email: 'ada@voorbeeld.nl', phone: '0612345678' },
    order: { holderName: 'Ada Lovelace', companyName: 'Voorbeeld B.V.', email: 'ada@voorbeeld.nl', phone: '0612345678' },
  }, {
    env: { ADMIN_EMAIL: 'max@maxwebstudio.nl', SITE_URL: 'https://maxwebstudio.nl' },
    sendEmail: async (input) => { sent = input; return { sent: true, id: 'mail-1' }; },
  });
  assert.equal(result.sent, true);
  assert.equal(sent.to, 'max@maxwebstudio.nl');
  assert.equal(sent.subject, 'Nieuwe domeinreservering: voorbeeld.nl');
  assert.equal(sent.idempotencyKey, 'domain.reservation.admin:11111111-1111-4111-8111-111111111111');
  assert.match(sent.text, /Registreer het domein pas nadat de betaling is bevestigd/);
  assert.match(sent.html, /relationshipId=22222222-2222-4222-8222-222222222222/);
  assert.equal(sent.sensitiveContent, true);
  assert.equal(sent.suppressTimelineEvent, true);
});

test('public domain payment catalog charges fixed VAT-inclusive prices only for signed extensions', () => {
  const payments = require('../functions/services/domainPaymentService');
  assert.deepEqual(payments.offerForDomain('voorbeeld.nl'), {
    extension: 'nl', amountCents: 2495, amount: '24.95', label: '€ 24,95', description: '.nl-domeinregistratie voor 1 jaar',
    automaticPayment: true, billingPeriod: 'year', vatIncluded: true,
  });
  assert.equal(payments.offerForDomain('voorbeeld.com').amount, '29.95');
  assert.equal(payments.offerForDomain('voorbeeld.eu').automaticPayment, false);
  assert.equal(payments.offerForDomain('voorbeeld.eu').label, 'Prijs op aanvraag');
});

test('domain payment automation requires explicit live switches and a live Mollie key', () => {
  const payments = require('../functions/services/domainPaymentService');
  assert.equal(payments._private.paymentConfig({ MOLLIE_API_KEY: 'live_example' }).enabled, false);
  assert.equal(payments._private.paymentConfig({ DOMAIN_PAYMENT_AUTOMATION_ENABLED: 'true', DOMAIN_PAYMENT_LIVE_ENABLED: 'true', MOLLIE_API_KEY: 'test_example' }).enabled, false);
  assert.equal(payments._private.paymentConfig({
    DOMAIN_PAYMENT_AUTOMATION_ENABLED: 'true', DOMAIN_PAYMENT_LIVE_ENABLED: 'true', MOLLIE_API_KEY: 'live_example',
    SITE_URL: 'https://maxwebstudio.nl', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret',
  }).enabled, true);
});

test('domain payment creates one invoice, one Mollie checkout and one customer email', async () => {
  const payments = require('../functions/services/domainPaymentService');
  const calls = [];
  const invoiceId = '33333333-3333-4333-8333-333333333333';
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null, headers: options.headers || {} });
    if (url.includes('/rest/v1/invoices?select=')) return { ok: true, status: 200, json: async () => [] };
    if (url.endsWith('/rest/v1/invoices') && method === 'POST') return { ok: true, status: 201, json: async () => [{ id: invoiceId, total: '24.95', invoice_number: 'DOM-request' }] };
    if (url.endsWith('/rest/v1/invoice_lines')) return { ok: true, status: 201, json: async () => null };
    if (url === 'https://api.mollie.com/v2/payments') return { ok: true, status: 201, json: async () => ({ id: 'tr_domain', status: 'open', _links: { checkout: { href: 'https://www.mollie.com/checkout/domain' } } }) };
    if (url.includes('/rest/v1/invoices?id=eq.')) return { ok: true, status: 200, json: async () => [{ id: invoiceId, total: '24.95', mollie_payment_id: 'tr_domain', mollie_checkout_url: 'https://www.mollie.com/checkout/domain' }] };
    return { ok: true, status: 204, json: async () => null };
  };
  let email = null;
  const result = await payments.createDomainPayment({
    request: { id: '11111111-1111-4111-8111-111111111111', customerId: '22222222-2222-4222-8222-222222222222', domainName: 'voorbeeld.nl', internalMetadata: {} },
    customer: { id: '22222222-2222-4222-8222-222222222222', email: 'ada@voorbeeld.nl', name: 'Ada Lovelace', company: 'Voorbeeld B.V.' },
    order: { domainName: 'voorbeeld.nl', holderName: 'Ada Lovelace', companyName: 'Voorbeeld B.V.', email: 'ada@voorbeeld.nl' },
  }, {
    env: {
      DOMAIN_PAYMENT_AUTOMATION_ENABLED: 'true', DOMAIN_PAYMENT_LIVE_ENABLED: 'true', MOLLIE_API_KEY: 'live_example',
      SITE_URL: 'https://maxwebstudio.nl', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret', ADMIN_EMAIL: 'max@maxwebstudio.nl',
    },
    fetchImpl,
    sendEmail: async (input) => { email = input; return { sent: true, id: 'mail-domain' }; },
  });
  assert.equal(result.created, true);
  assert.equal(result.checkoutUrl, 'https://www.mollie.com/checkout/domain');
  const invoiceCreate = calls.find((call) => call.url.endsWith('/rest/v1/invoices') && call.method === 'POST');
  assert.equal(invoiceCreate.body.id, '11111111-1111-4111-8111-111111111111');
  const mollieCall = calls.find((call) => call.url === 'https://api.mollie.com/v2/payments');
  assert.deepEqual(mollieCall.body.amount, { currency: 'EUR', value: '24.95' });
  assert.equal(mollieCall.body.metadata.source, 'domain_order');
  assert.equal(mollieCall.headers['Idempotency-Key'], 'domain-payment-11111111-1111-4111-8111-111111111111');
  assert.equal(email.to, 'ada@voorbeeld.nl');
  assert.equal(email.idempotencyKey, 'domain.payment.link:11111111-1111-4111-8111-111111111111:tr_domain');
  assert.match(email.text, /€ 24,95 inclusief btw/);
});

test('Mollie webhook routes a paid domain invoice back to the domain workflow', () => {
  const webhook = read('functions/mollie-webhook.js');
  assert.match(webhook, /finalizeDomainOrderPaymentIfNeeded/);
  assert.match(webhook, /domain_payment_paid/);
  assert.match(webhook, /status: "scheduled"/);
  assert.match(webhook, /Registreer het domein nu handmatig bij Openprovider/);
  assert.match(webhook, /domain\.payment\.paid\.admin/);
});

test('Openprovider registrar adapter authenticates, checks availability and normalizes reseller price', async () => {
  const registrar = require('../functions/services/domainRegistrarService');
  registrar._private.resetForTests();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { token: 'token', expires_in: 3600 } }) };
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { results: [{ domain: 'voorbeeld.nl', status: 'free', price: { reseller: { currency: 'EUR', price: 8.75 } } }] } }) };
  };
  const result = await registrar.checkDomain('voorbeeld.nl', { fetchImpl, env: { OPENPROVIDER_USERNAME: 'api@example.nl', OPENPROVIDER_PASSWORD: 'secret', OPENPROVIDER_API_URL: 'https://api.example.test/v1beta' } });
  assert.equal(result.definitive, true);
  assert.equal(result.available, true);
  assert.deepEqual(result.price, { amount: 8.75, currency: 'EUR' });
  assert.deepEqual(calls[1].body.domains, [{ name: 'voorbeeld', extension: 'nl' }]);
  assert.equal(calls[1].body.with_price, true);
});

test('automatic Openprovider registration requires two live switches and verified nameservers', () => {
  const registrar = require('../functions/services/domainRegistrarService');
  const base = { OPENPROVIDER_USERNAME: 'api@example.nl', OPENPROVIDER_PASSWORD: 'secret' };
  assert.equal(registrar.registrationConfig(base, 'voorbeeld.nl').enabled, false);
  assert.equal(registrar.registrationConfig({ ...base, DOMAIN_REGISTRATION_AUTOMATION_ENABLED: 'true', DOMAIN_REGISTRATION_LIVE_ENABLED: 'true' }, 'voorbeeld.nl').enabled, false);
  assert.equal(registrar.registrationConfig({
    ...base,
    DOMAIN_REGISTRATION_AUTOMATION_ENABLED: 'true', DOMAIN_REGISTRATION_LIVE_ENABLED: 'true',
    OPENPROVIDER_NAMESERVERS: 'ns1.example.nl, ns2.example.nl',
  }, 'voorbeeld.nl').enabled, true);
  assert.equal(registrar.registrationConfig({
    ...base,
    DOMAIN_REGISTRATION_AUTOMATION_ENABLED: 'true', DOMAIN_REGISTRATION_LIVE_ENABLED: 'true',
    OPENPROVIDER_NAMESERVERS: 'ns1.example.nl, ns2.example.nl',
  }, 'voorbeeld.eu').enabled, false);
});

test('automatic Openprovider registration rechecks availability, creates the holder and registers once', async () => {
  const registrar = require('../functions/services/domainRegistrarService');
  registrar._private.resetForTests();
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body });
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { token: 'token', expires_in: 3600 } }) };
    if (url.endsWith('/domains/check')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { results: [{ domain: 'voorbeeld.com', status: 'free', is_premium: false, price: { reseller: { currency: 'EUR', price: 10.95 } } }] } }) };
    if (url.endsWith('/customers')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { handle: 'AL123456-NL' } }) };
    if (url.endsWith('/domains')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { id: 98765, status: 'ACT', activation_date: '2026-08-02 12:00:00' } }) };
    throw new Error(`Unexpected URL ${url}`);
  };
  const result = await registrar.registerDomain({
    requestId: '11111111-1111-4111-8111-111111111111', domainName: 'voorbeeld.com', autoRenew: true,
    holder: { holderType: 'company', holderName: 'Ada Lovelace', companyName: 'Voorbeeld B.V.', email: 'ada@voorbeeld.nl', phone: '06 12345678', address: 'Dorpsstraat 12 B', postalCode: '1234 AB', city: 'Utrecht', country: 'Nederland' },
  }, {
    fetchImpl,
    env: {
      OPENPROVIDER_USERNAME: 'api@example.nl', OPENPROVIDER_PASSWORD: 'secret', OPENPROVIDER_API_URL: 'https://api.example.test/v1beta',
      DOMAIN_REGISTRATION_AUTOMATION_ENABLED: 'true', DOMAIN_REGISTRATION_LIVE_ENABLED: 'true', OPENPROVIDER_NAMESERVERS: 'ns1.example.nl,ns2.example.nl',
    },
  });
  assert.equal(result.active, true);
  assert.equal(result.domainId, 98765);
  const customerCall = calls.find((call) => call.url.endsWith('/customers'));
  assert.equal(customerCall.body.company_name, 'Voorbeeld B.V.');
  assert.deepEqual(customerCall.body.address, { street: 'Dorpsstraat', number: '12', suffix: 'B', zipcode: '1234 AB', city: 'Utrecht', country: 'NL', state: '' });
  assert.deepEqual(customerCall.body.phone, { country_code: '+31', area_code: '6', subscriber_number: '12345678' });
  const registrationCall = calls.find((call) => call.url.endsWith('/domains'));
  assert.equal(registrationCall.body.owner_handle, 'AL123456-NL');
  assert.deepEqual(registrationCall.body.name_servers, [{ name: 'ns1.example.nl', seq_nr: 0 }, { name: 'ns2.example.nl', seq_nr: 1 }]);
  assert.equal(registrationCall.body.autorenew, 'on');
});

test('automatic registration blocks premium domains before creating a holder', async () => {
  const registrar = require('../functions/services/domainRegistrarService');
  registrar._private.resetForTests();
  let customerCalls = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { token: 'token', expires_in: 3600 } }) };
    if (url.endsWith('/domains/check')) return { ok: true, status: 200, json: async () => ({ code: 0, data: { results: [{ domain: 'premium.com', status: 'free', is_premium: true }] } }) };
    if (url.endsWith('/customers')) customerCalls += 1;
    return { ok: true, status: 200, json: async () => ({ code: 0, data: {} }) };
  };
  await assert.rejects(() => registrar.registerDomain({
    requestId: 'request', domainName: 'premium.com', holder: {},
  }, { fetchImpl, env: { OPENPROVIDER_USERNAME: 'api', OPENPROVIDER_PASSWORD: 'secret', DOMAIN_REGISTRATION_AUTOMATION_ENABLED: 'true', DOMAIN_REGISTRATION_LIVE_ENABLED: 'true', OPENPROVIDER_NAMESERVERS: 'ns1.example.nl,ns2.example.nl' } }), (error) => error.code === 'registrar_premium_blocked');
  assert.equal(customerCalls, 0);
});

test('Openprovider registrar adapter stays disabled without Netlify secrets', async () => {
  const registrar = require('../functions/services/domainRegistrarService');
  registrar._private.resetForTests();
  assert.deepEqual(await registrar.checkDomain('voorbeeld.nl', { env: {} }), { configured: false, provider: 'openprovider' });
});

test('Openprovider registrar adapter exposes only stable authentication failure categories', () => {
  const registrar = require('../functions/services/domainRegistrarService');
  assert.equal(registrar._private.classifyAuthFailure({ code: 10005, desc: 'Access denied' }, 400), 'registrar_access_denied');
  assert.equal(registrar._private.classifyAuthFailure({ code: 10008, desc: 'API access disabled' }, 400), 'registrar_api_disabled');
  assert.equal(registrar._private.classifyAuthFailure({ code: 10004, desc: 'Invalid password' }, 401), 'registrar_credentials_rejected');
  assert.equal(registrar._private.classifyAuthFailure({ code: 197, desc: 'Account blocked' }, 400), 'registrar_contract_required');
  assert.equal(registrar._private.classifyAuthFailure({ code: 99999, desc: 'Unknown' }, 503), 'registrar_unavailable');
});

test('public domain order validates holder details without inventing a Netlify registration result', () => {
  const publicOrder = require('../functions/public-domain-order')._private;
  assert.equal(publicOrder.validDomain('voorbeeld.nl'), true);
  assert.equal(publicOrder.validDomain('https://voorbeeld.nl'), false);
  assert.throws(() => publicOrder.validateOrder({ email: 'fout', termsAccepted: true }, 'voorbeeld.nl'), /verplichte/);
  const order = publicOrder.validateOrder({
    holderType: 'company', holderName: 'Ada', companyName: 'Voorbeeld B.V.', email: 'ada@voorbeeld.nl', phone: '0612345678',
    address: 'Straat 1', postalCode: '1234 AB', city: 'Utrecht', country: 'Nederland', termsAccepted: true, autoRenew: true,
  }, 'voorbeeld.nl');
  assert.equal(order.domainName, 'voorbeeld.nl');
  assert.equal(order.autoRenew, true);
});

test('paid-domain webhook contains an atomic registration claim and safe manual fallback', () => {
  const webhook = read('functions/mollie-webhook.js');
  const registrar = read('functions/services/domainRegistrarService.js');
  assert.match(webhook, /attemptAutomaticDomainRegistration/);
  assert.match(webhook, /domain_registration_started/);
  assert.match(webhook, /status=in\.\(scheduled,awaiting_approval\)/);
  assert.match(webhook, /domain_registration_succeeded/);
  assert.match(webhook, /domain_registration_needs_action/);
  assert.match(registrar, /registrar_premium_blocked/);
  assert.match(webhook, /Registreer het domein nu handmatig bij Openprovider/);
});
