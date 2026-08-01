const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function composerUrl({ relationshipType, relationshipId, demoJourneyId, factoryProjectId, offerId, source } = {}) {
  if (!['lead', 'customer'].includes(relationshipType) || !UUID.test(String(relationshipId || ''))) return '';
  const params = new URLSearchParams({ relationshipType, relationshipId });
  for (const [key, value] of Object.entries({ demoJourneyId, factoryProjectId, offerId, source })) if (value) params.set(key, value);
  return `admin-offer-composer.html?${params.toString()}`;
}

export function parseComposerContext(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const relationshipType = params.get('relationshipType') || '';
  const relationshipId = params.get('relationshipId') || '';
  return {
    relationshipType,
    relationshipId,
    demoJourneyId: validOptionalUuid(params.get('demoJourneyId')),
    factoryProjectId: validOptionalUuid(params.get('factoryProjectId')),
    offerId: validOptionalUuid(params.get('offerId')),
    source: clean(params.get('source')),
    valid: ['lead', 'customer'].includes(relationshipType) && UUID.test(relationshipId),
  };
}

export function parseEuroToCents(value) {
  const normalized = clean(value).replace(/\s/g, '').replace(/^€/, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [euros, decimals = ''] = normalized.split('.');
  const cents = Number(euros) * 100 + Number((decimals + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function money(cents, options = {}) {
  if (!Number.isInteger(Number(cents))) return '—';
  const suffix = options.monthly ? ' p/m' : '';
  return `${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(cents) / 100)}${suffix}`;
}

export function maskEmail(value) {
  const [local = '', domain = ''] = clean(value).toLowerCase().split('@');
  if (!local || !domain) return 'Geen geldig e-mailadres';
  const parts = domain.split('.');
  const name = parts.shift() || '';
  const suffix = parts.join('.');
  const hidden = (part) => `${part.slice(0, 1)}${'•'.repeat(Math.max(3, Math.min(8, part.length - 1)))}`;
  return `${hidden(local)}@${hidden(name)}${suffix ? `.${suffix}` : ''}`;
}

export function validRecipientEmail(value) {
  const email = clean(value).toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function definitiveConfirmationDetails({ relationship = {}, demo = {}, snapshot = {} } = {}) {
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const website = lines.find((line) => ['starter_site', 'business_website', 'premium_growth'].includes(line.productId));
  const care = lines.find((line) => ['care_basic', 'care_plus', 'care_growth'].includes(line.productId));
  return {
    companyName: clean(relationship.companyName) || '—',
    maskedEmail: maskEmail(relationship.email),
    demoName: clean(demo.name) || '—',
    websiteName: clean(website?.productName) || 'Geen websitepakket',
    careName: clean(care?.productName) || 'Geen onderhoud',
    oneTimeExVatCents: Number(snapshot.oneTimeExVatCents || 0),
    recurringExVatCents: Number(snapshot.recurringExVatCents || 0),
    dueNowExVatCents: Number(snapshot.dueNowExVatCents || 0),
    paymentLabel: snapshot.paymentChoice === 'full' ? 'Volledig betaalbedrag excl. btw' : 'Vaste aanbetaling excl. btw',
    validUntil: clean(snapshot.validUntil),
  };
}

export function catalogGroups(catalog = {}) {
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  return {
    websites: products.filter((item) => item.category === 'website'),
    care: products.filter((item) => ['care_basic', 'care_plus', 'care_growth'].includes(item.id)),
    addOns: products.filter((item) => item.category !== 'website' && !['care_basic', 'care_plus', 'care_growth'].includes(item.id)),
  };
}

export function selectionsFromState(state = {}, actor = {}) {
  const ids = [state.websiteProductId, state.careProductId, ...(state.addOnIds || [])].filter(Boolean);
  return ids.map((productId) => {
    const selection = { productId, quantity: Math.max(1, Number(state.quantities?.[productId] || 1)) };
    const custom = state.customPrices?.[productId];
    if (custom && normalizeRole(actor.role) === 'super_admin') {
      selection.customComponents = Object.entries(custom.components || {}).map(([componentCode, entry]) => ({
        componentCode,
        unitExVatCents: Number(entry.unitExVatCents),
        reason: clean(custom.reason),
        type: entry.type,
        billingInterval: entry.billingInterval,
      }));
    }
    return selection;
  });
}

export function documentsForSave(documents = [], selectedTypes = []) {
  const selected = new Set(selectedTypes);
  return documents.filter((document) => selected.has(document.documentType)).map((document) => ({
    documentType: document.documentType,
    versionCode: document.versionCode,
    templateCode: document.templateCode || null,
    checksumSha256: document.checksumSha256,
    storageBucket: document.storageBucket || null,
    storagePath: document.storagePath || null,
    sourceUrl: document.sourceUrl || null,
    required: Boolean(document.required),
  }));
}

export function composerReadiness({ snapshot, documents = [], selectedDocumentTypes = [], email = '' } = {}) {
  const missingDocuments = documents.filter((document) => document.required && !selectedDocumentTypes.includes(document.documentType)).map((document) => document.documentType);
  const invalidChecksums = documents.filter((document) => selectedDocumentTypes.includes(document.documentType) && (document.checksumStatus !== 'verified' || !/^[a-f0-9]{64}$/.test(document.checksumSha256 || ''))).map((document) => document.documentType);
  const nonBinding = Boolean(snapshot?.hasNonBindingLines);
  return {
    readyForReview: Boolean(snapshot) && !nonBinding && missingDocuments.length === 0 && invalidChecksums.length === 0,
    canTestMailLater: validRecipientEmail(email) && Boolean(snapshot),
    nonBinding,
    missingDocuments,
    invalidChecksums,
  };
}

export function buildMailPreview({ relationship = {}, demo = {}, snapshot = {}, validUntil = '', contactEmail = 'info@maxwebstudio.nl' } = {}) {
  const firstName = clean(relationship.contactName).split(/\s+/)[0] || 'ondernemer';
  return {
    subject: `Jouw demo en voorstel van Max Webstudio`,
    greeting: `Hoi ${firstName},`,
    companyName: clean(relationship.companyName),
    desktopUrl: safePreviewUrl(demo.desktopUrl),
    mobileUrl: safePreviewUrl(demo.mobileUrl || demo.desktopUrl),
    qrTarget: safePreviewUrl(demo.qrTarget || demo.mobileUrl || demo.desktopUrl),
    oneTimeExVatCents: Number(snapshot.oneTimeExVatCents || 0),
    oneTimeInclVatCents: Number(snapshot.oneTimeInclVatCents || 0),
    recurringExVatCents: Number(snapshot.recurringExVatCents || 0),
    recurringInclVatCents: Number(snapshot.recurringInclVatCents || 0),
    dueNowInclVatCents: Number(snapshot.dueNowInclVatCents || 0),
    remainingExVatCents: Number(snapshot.remainingExVatCents || 0),
    validUntil,
    contactEmail,
    lines: Array.isArray(snapshot.lines) ? snapshot.lines : [],
  };
}

export function safePreviewUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : '';
  } catch { return ''; }
}

export function stateFromSnapshot(snapshot = {}) {
  const productIds = [...new Set((snapshot.lines || []).map((line) => line.productId))];
  const websiteProductId = productIds.find((id) => ['starter_site', 'business_website', 'premium_growth'].includes(id)) || '';
  const careProductId = productIds.find((id) => ['care_basic', 'care_plus', 'care_growth'].includes(id)) || '';
  return {
    websiteProductId,
    careProductId,
    addOnIds: productIds.filter((id) => id !== websiteProductId && id !== careProductId),
    paymentChoice: snapshot.paymentChoice || 'none',
    quantities: Object.fromEntries((snapshot.lines || []).map((line) => [line.productId, line.quantity || 1])),
  };
}

export function statusLabel(value = '') {
  return ({ draft: 'Concept', ready_for_review: 'Gereed voor controle', revoked: 'Ingetrokken', superseded: 'Vervangen', sent: 'Verzonden', viewed: 'Bekeken', interested: 'Interesse bevestigd', signed: 'Ondertekend', payment_pending: 'Betaling open', paid: 'Betaald', accepted: 'Geaccepteerd', expired: 'Verlopen', declined: 'Afgewezen', failed: 'Mislukt' })[value] || value || 'Onbekend';
}

function validOptionalUuid(value) { return UUID.test(String(value || '')) ? String(value) : ''; }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, '_'); }
function clean(value) { return String(value || '').trim(); }
