import { getAdminAccessToken } from './services/adminAuthBridgeService.js';
import {
  buildMailPreview,
  catalogGroups,
  composerReadiness,
  documentsForSave,
  money,
  parseComposerContext,
  parseEuroToCents,
  selectionsFromState,
  stateFromSnapshot,
  statusLabel,
} from './offer-composer-core.mjs';

const endpoint = '/api/admin-commercial-offers';
const routeContext = parseComposerContext(window.location.search);
const state = {
  data: null,
  websiteProductId: '',
  careProductId: '',
  addOnIds: [],
  quantities: {},
  customPrices: {},
  paymentChoice: 'none',
  selectedDemoId: routeContext.demoJourneyId,
  selectedFactoryProjectId: routeContext.factoryProjectId,
  selectedDocumentTypes: [],
  snapshot: null,
  currentOfferId: routeContext.offerId,
  currentVersionId: '',
  currentVersionStatus: '',
  calculating: false,
  dirty: false,
};

const elements = Object.fromEntries([
  'composer-app','composer-message','composer-status','catalog-version','catalog-checksum','website-catalog-version','relationship-card','factory-context','demo-options','website-options','care-options','addon-options','addon-search','addon-category','document-options','offer-title','change-reason','save-draft','ready-review','revoke-version','readiness-list','version-history','summary-version','summary-lines','sum-once-ex','sum-once-vat','sum-once-incl','sum-month-ex','sum-month-incl','sum-due','sum-remaining','summary-warning','open-preview','test-mail','definitive-send','mail-preview','close-preview','preview-subject','preview-greeting','preview-desktop','preview-mobile','preview-qr','preview-offer','preview-validity'
].map((id) => [camel(id), document.getElementById(id)]));

let calculationTimer = 0;

async function init() {
  if (!routeContext.valid) return fatal('Open de composer vanuit een geldige lead, klant, demo of Factory-dossier.');
  bindEvents();
  try {
    state.data = await request('GET', null, routeContext);
    state.selectedDocumentTypes = state.data.documents.filter((document) => document.required).map((document) => document.documentType);
    hydrateExistingOffer();
    renderAll();
    if (selectedIds().length) await calculate();
    elements.composerApp.setAttribute('aria-busy', 'false');
  } catch (error) {
    fatal(error.message || 'De Voorstel Composer kon niet veilig worden geladen.');
  }
}

function bindEvents() {
  elements.websiteOptions.addEventListener('change', (event) => selectSingle(event, 'websiteProductId'));
  elements.careOptions.addEventListener('change', (event) => selectSingle(event, 'careProductId'));
  elements.paymentOptions = document.getElementById('payment-options');
  elements.paymentOptions.addEventListener('change', (event) => { if (event.target.name === 'payment') { state.paymentChoice = event.target.value; changed(); } });
  elements.demoOptions.addEventListener('change', (event) => { if (event.target.name === 'demo') { state.selectedDemoId = event.target.value; markDirty(); renderPreviewAvailability(); } });
  elements.addonOptions.addEventListener('change', handleAddonChange);
  elements.addonOptions.addEventListener('input', handleCustomInput);
  elements.addonSearch.addEventListener('input', renderAddOns);
  elements.addonCategory.addEventListener('change', renderAddOns);
  elements.documentOptions.addEventListener('change', (event) => {
    if (!event.target.matches('[data-document-type]')) return;
    state.selectedDocumentTypes = [...elements.documentOptions.querySelectorAll('[data-document-type]:checked')].map((item) => item.dataset.documentType);
    markDirty(); renderReadiness();
  });
  elements.offerTitle.addEventListener('input', markDirty);
  elements.changeReason.addEventListener('input', renderReadiness);
  elements.saveDraft.addEventListener('click', saveDraft);
  elements.readyReview.addEventListener('click', () => transition('ready_for_review'));
  elements.revokeVersion.addEventListener('click', () => transition('revoked'));
  elements.openPreview.addEventListener('click', openPreview);
  elements.closePreview.addEventListener('click', () => elements.mailPreview.close());
  elements.mailPreview.addEventListener('click', (event) => { if (event.target === elements.mailPreview) elements.mailPreview.close(); });
}

function hydrateExistingOffer() {
  const offer = state.data.history?.[0];
  if (!offer || !routeContext.offerId) return;
  const version = offer.versions?.find((item) => item.id === offer.current_version_id) || offer.versions?.[0];
  if (!version?.snapshot) return;
  Object.assign(state, stateFromSnapshot(version.snapshot));
  state.snapshot = version.snapshot;
  state.currentOfferId = offer.id;
  state.currentVersionId = version.id;
  state.currentVersionStatus = version.status;
  state.selectedDemoId = offer.demo_journey_id || state.selectedDemoId;
  state.selectedFactoryProjectId = offer.factory_project_id || state.selectedFactoryProjectId;
  state.selectedDocumentTypes = (version.documents || []).map((document) => document.document_type);
  elements.offerTitle.value = offer.title || 'Websitevoorstel';
}

function renderAll() {
  elements.catalogVersion.textContent = state.data.catalog.version;
  elements.websiteCatalogVersion.textContent = state.data.catalog.version;
  elements.catalogChecksum.textContent = `SHA-256 ${state.data.catalog.checksum.slice(0, 16)}…`;
  renderRelationship(); renderFactory(); renderDemos(); renderCatalog(); renderDocuments(); renderHistory(); renderSummary(); renderReadiness(); renderStatus();
}

function renderRelationship() {
  const relation = state.data.relationship;
  const values = [['Type', relation.type === 'lead' ? 'Lead' : 'Klant'], ['Bedrijf', relation.companyName || 'Ontbreekt'], ['Contactpersoon', relation.contactName || 'Ontbreekt'], ['E-mail', relation.email || 'Ontbreekt'], ['Telefoon', relation.phone || 'Ontbreekt'], ['Website', relation.website || 'Niet ingevuld']];
  elements.relationshipCard.innerHTML = values.map(([label, value], index) => `<div class="${index > 3 ? 'wide' : ''}"><span>${escapeHtml(label)}</span><strong class="${value === 'Ontbreekt' ? 'missing' : ''}">${escapeHtml(value)}</strong></div>`).join('');
  if (!relation.email) showMessage('E-mailadres ontbreekt. Conceptopslag blijft mogelijk; toekomstige mailstappen blijven geblokkeerd.', 'warning');
}

function renderFactory() {
  const projects = state.data.factoryProjects || [];
  elements.factoryContext.innerHTML = projects.length ? projects.map((project) => `<article><small>Factory-dossier · ${escapeHtml(project.factory_type)}</small><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.status)} · blueprint ${escapeHtml(project.blueprint_key)} v${project.blueprint_version}</span><label><input type="radio" name="factory" value="${project.id}" ${project.id === state.selectedFactoryProjectId ? 'checked' : ''}/> Koppelen</label></article>`).join('') : '<article><small>Factory-dossier</small><strong>Niet gekoppeld</strong><span>Conceptopslag kan doorgaan.</span></article>';
  elements.factoryContext.querySelectorAll('input[name="factory"]').forEach((input) => input.addEventListener('change', () => { state.selectedFactoryProjectId = input.value; markDirty(); }));
}

function renderDemos() {
  const demos = state.data.demos || [];
  const none = `<label class="choice-card"><input type="radio" name="demo" value="" ${!state.selectedDemoId ? 'checked' : ''}/><strong>Geen demo koppelen</strong><span>Alleen intern commercieel concept.</span></label>`;
  elements.demoOptions.innerHTML = none + demos.map((demo) => `<label class="choice-card"><input type="radio" name="demo" value="${demo.id}" ${demo.id === state.selectedDemoId ? 'checked' : ''}/><strong>${escapeHtml(demo.name)}</strong><span>${escapeHtml(demo.type)} · ${escapeHtml(statusLabel(demo.status))}</span><small>${demo.desktopUrl ? 'Desktoplink beschikbaar' : 'Geen desktoplink'} · ${demo.mobileUrl ? 'Mobiele link beschikbaar' : 'Geen mobiele link'}</small>${demo.expiresAt ? `<small>Geldig tot ${escapeHtml(formatDate(demo.expiresAt))}</small>` : ''}</label>`).join('');
}

function renderCatalog() {
  const groups = catalogGroups(state.data.catalog);
  elements.websiteOptions.innerHTML = choiceNone('website', 'Geen websitepakket', !state.websiteProductId) + groups.websites.map((product) => productChoice(product, 'website', state.websiteProductId)).join('');
  elements.careOptions.innerHTML = choiceNone('care', 'Geen onderhoud', !state.careProductId) + groups.care.map((product) => productChoice(product, 'care', state.careProductId)).join('');
  const categories = [...new Set(groups.addOns.map((item) => item.category))].sort();
  elements.addonCategory.innerHTML = '<option value="">Alle categorieën</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</option>`).join('');
  renderAddOns();
  syncPaymentAvailability();
}

function renderAddOns() {
  const products = catalogGroups(state.data.catalog).addOns;
  const query = elements.addonSearch.value.trim().toLowerCase();
  const category = elements.addonCategory.value;
  const filtered = products.filter((item) => (!category || item.category === category) && (!query || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(query)));
  elements.addonOptions.innerHTML = filtered.map((product) => {
    const selected = state.addOnIds.includes(product.id);
    const nonFixed = product.classification !== 'fixed';
    const custom = state.customPrices[product.id] || {};
    const component = product.components?.[0] || { code: 'proposal', type: 'one_time' };
    const canCustom = state.data.capabilities.customPrices;
    return `<article class="addon-card"><input type="checkbox" data-addon-id="${product.id}" ${selected ? 'checked' : ''} aria-label="${escapeHtml(product.name)} selecteren"/><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p><div class="component-tags">${(product.components || []).map(componentTag).join('') || '<span>Persoonlijk te bepalen</span>'}</div>${selected && nonFixed ? `<div class="custom-price-fields"><label>Definitieve prijs excl. btw (€)<input data-custom-amount="${product.id}" data-component-code="${component.code}" data-component-type="${component.type}" value="${custom.components?.[component.code]?.unitExVatCents != null ? centsInput(custom.components[component.code].unitExVatCents) : ''}" ${canCustom ? '' : 'disabled'} placeholder="Bijv. 425,00"/></label><label>Reden en scope<input data-custom-reason="${product.id}" value="${escapeHtml(custom.reason || '')}" ${canCustom ? '' : 'disabled'} placeholder="Minimaal 8 tekens"/></label>${canCustom ? '' : '<p class="missing">Alleen super_admin kan deze prijs definitief bevestigen.</p>'}</div>` : ''}</div><div><span class="classification ${product.classification}">${classificationLabel(product.classification)}</span><strong class="choice-price">${productPrice(product)}</strong></div></article>`;
  }).join('') || '<p>Geen diensten gevonden.</p>';
}

function renderDocuments() {
  const docs = activeDocuments();
  for (const document of docs) if (document.required && !state.selectedDocumentTypes.includes(document.documentType)) state.selectedDocumentTypes.push(document.documentType);
  elements.documentOptions.innerHTML = docs.map((document) => `<label class="document-row"><input type="checkbox" data-document-type="${document.documentType}" ${state.selectedDocumentTypes.includes(document.documentType) ? 'checked' : ''}/><div><strong>${escapeHtml(document.name)}</strong><p>Versie ${escapeHtml(document.versionCode)} · ingangsdatum ${escapeHtml(document.effectiveFrom)}${document.required ? ' · verplicht' : ''}</p><span class="checksum">✓ ${escapeHtml(document.checksumSha256.slice(0, 20))}…</span></div><span class="classification">${escapeHtml(document.checksumStatus)}</span></label>`).join('');
}

function renderSummary() {
  const snapshot = state.snapshot;
  elements.summaryVersion.textContent = snapshot ? `Catalogus ${snapshot.catalogVersion}` : state.calculating ? 'Berekenen…' : 'Maak een productkeuze';
  elements.summaryLines.innerHTML = snapshot?.lines?.map((line) => `<div class="summary-line"><span>${escapeHtml(line.productName)}${line.componentType === 'recurring' ? ' · per maand' : ''}</span><strong>${line.bindingState === 'binding' ? money(line.totalInclVatCents, { monthly: line.componentType === 'recurring' }) : 'Te bevestigen'}</strong></div>`).join('') || '';
  setText('sumOnceEx', snapshot && money(snapshot.oneTimeExVatCents)); setText('sumOnceVat', snapshot && money(snapshot.oneTimeVatCents)); setText('sumOnceIncl', snapshot && money(snapshot.oneTimeInclVatCents)); setText('sumMonthEx', snapshot && money(snapshot.recurringExVatCents, { monthly: true })); setText('sumMonthIncl', snapshot && money(snapshot.recurringInclVatCents, { monthly: true })); setText('sumDue', snapshot && money(snapshot.dueNowInclVatCents)); setText('sumRemaining', snapshot && money(snapshot.remainingExVatCents));
  elements.summaryWarning.textContent = snapshot?.hasNonBindingLines ? 'Dit voorstel bevat nog een vanaf- of op-aanvraagprijs en kan niet gereed voor controle worden gemaakt.' : '';
  renderPreviewAvailability();
}

function renderReadiness() {
  const readiness = composerReadiness({ snapshot: state.snapshot, documents: activeDocuments(), selectedDocumentTypes: state.selectedDocumentTypes, email: state.data?.relationship?.email });
  const savedDraft = state.currentVersionId && state.currentVersionStatus === 'draft' && !state.dirty;
  elements.readyReview.disabled = !(readiness.readyForReview && savedDraft);
  elements.revokeVersion.disabled = !(state.currentVersionId && ['draft', 'ready_for_review'].includes(state.currentVersionStatus));
  elements.readinessList.innerHTML = [
    [Boolean(state.snapshot), 'Serverberekening beschikbaar'],
    [!readiness.nonBinding, 'Alle prijzen zijn bindend bevestigd'],
    [readiness.missingDocuments.length === 0, 'Alle verplichte documenten zijn gekoppeld'],
    [readiness.invalidChecksums.length === 0, 'Alle documentchecksums zijn geldig'],
    [savedDraft, 'Actuele inhoud is als immutable conceptversie opgeslagen'],
  ].map(([ok, label]) => `<div class="${ok ? 'ok' : 'blocked'}">${ok ? '✓' : '○'} ${escapeHtml(label)}</div>`).join('');
}

function renderHistory() {
  const offers = state.data?.history || [];
  const versions = offers.flatMap((offer) => (offer.versions || []).map((version) => ({ ...version, offerTitle: offer.title, current: offer.current_version_id === version.id })));
  elements.versionHistory.innerHTML = versions.length ? versions.map((version) => `<article class="version-item"><header><strong>Versie ${version.version_number} · ${escapeHtml(version.offerTitle)}</strong><span class="classification ${version.status}">${escapeHtml(statusLabel(version.status))}</span></header><dl><div><dt>Aangemaakt</dt><dd>${escapeHtml(formatDate(version.created_at))}</dd></div><div><dt>Actor</dt><dd>${escapeHtml(version.created_by_profile_id || 'Onbekend')}</dd></div><div><dt>Catalogus</dt><dd>${escapeHtml(version.catalog_version)}</dd></div><div><dt>Eenmalig</dt><dd>${money(Number(version.one_time_incl_vat_cents))}</dd></div><div><dt>Per maand</dt><dd>${money(Number(version.recurring_incl_vat_cents), { monthly: true })}</dd></div><div><dt>Documenten</dt><dd>${version.documents?.length || 0}</dd></div><div><dt>Maatwerk</dt><dd>${version.lines?.some((line) => line.price_classification === 'custom') ? 'Ja' : 'Nee'}</dd></div><div><dt>Reden</dt><dd>${escapeHtml(version.lifecycle_reason || version.internal_change_reason || '—')}</dd></div></dl></article>`).join('') : '<p>Nog geen opgeslagen versies voor deze relatie.</p>';
}

function renderStatus() {
  elements.composerStatus.textContent = state.currentVersionId ? `${statusLabel(state.currentVersionStatus)}${state.dirty ? ' · niet-opgeslagen wijzigingen' : ''}` : 'Concept niet opgeslagen';
}

function renderPreviewAvailability() { elements.openPreview.disabled = !state.snapshot; }

function selectSingle(event, key) {
  if (!event.target.matches('input[type="radio"]')) return;
  state[key] = event.target.value;
  if (key === 'websiteProductId' && !state.websiteProductId && state.paymentChoice === 'fixed_deposit') state.paymentChoice = 'none';
  syncPaymentAvailability(); changed();
}

function handleAddonChange(event) {
  const id = event.target.dataset.addonId;
  if (!id) return;
  state.addOnIds = event.target.checked ? [...new Set([...state.addOnIds, id])] : state.addOnIds.filter((item) => item !== id);
  if (!event.target.checked) delete state.customPrices[id];
  renderAddOns(); changed();
}

function handleCustomInput(event) {
  const id = event.target.dataset.customAmount || event.target.dataset.customReason;
  if (!id) return;
  const current = state.customPrices[id] || { components: {}, reason: '' };
  if (event.target.dataset.customAmount) {
    const cents = parseEuroToCents(event.target.value);
    if (cents === null) delete current.components[event.target.dataset.componentCode];
    else current.components[event.target.dataset.componentCode] = { unitExVatCents: cents, type: event.target.dataset.componentType, billingInterval: event.target.dataset.componentType === 'recurring' ? 'monthly' : null };
  } else current.reason = event.target.value;
  state.customPrices[id] = current;
  changed();
}

function syncPaymentAvailability() {
  const deposit = elements.paymentOptions.querySelector('[value="fixed_deposit"]');
  deposit.disabled = !state.websiteProductId;
  if (!state.websiteProductId && state.paymentChoice === 'fixed_deposit') state.paymentChoice = 'none';
  const selected = elements.paymentOptions.querySelector(`[value="${state.paymentChoice}"]`);
  if (selected) selected.checked = true;
}

function changed() { markDirty(); window.clearTimeout(calculationTimer); calculationTimer = window.setTimeout(calculate, 180); }
function markDirty() { state.dirty = true; renderStatus(); renderReadiness(); }

async function calculate() {
  const selections = selectionsFromState(state, state.data.actor);
  if (!selections.length) { state.snapshot = null; renderSummary(); renderDocuments(); renderReadiness(); return; }
  state.calculating = true; renderSummary();
  try {
    const data = await request('POST', { action: 'prepare_snapshot', paymentChoice: state.paymentChoice, selections });
    state.snapshot = data.snapshot;
    renderDocuments(); renderSummary(); renderReadiness();
  } catch (error) {
    state.snapshot = null; showMessage(error.message, 'error'); renderSummary(); renderReadiness();
  } finally { state.calculating = false; }
}

async function saveDraft() {
  if (!state.snapshot) return showMessage('Kies minimaal één product en wacht op de serverberekening.', 'warning');
  const title = elements.offerTitle.value.trim();
  if (title.length < 2) return showMessage('Geef het voorstel een duidelijke titel.', 'warning');
  const previous = currentVersion();
  if (previous?.snapshot_checksum_sha256 === state.snapshot.checksum && state.currentVersionStatus === 'draft') { state.dirty = false; renderStatus(); renderReadiness(); return showMessage('Deze exacte immutable conceptversie is al opgeslagen.', 'success'); }
  const documents = documentsForSave(activeDocuments(), state.selectedDocumentTypes);
  elements.saveDraft.disabled = true;
  try {
    const result = await request('POST', {
      action: 'create_version',
      relationshipType: routeContext.relationshipType,
      relationshipId: routeContext.relationshipId,
      offerId: state.currentOfferId || null,
      title,
      demoJourneyId: state.selectedDemoId || null,
      factoryProjectId: state.selectedFactoryProjectId || null,
      paymentChoice: state.paymentChoice,
      selections: selectionsFromState(state, state.data.actor),
      documents,
      changeReason: elements.changeReason.value.trim() || null,
      actionKey: actionKey('version'),
    });
    state.currentOfferId = result.offer.offerId;
    state.currentVersionId = result.offer.offerVersionId;
    state.currentVersionStatus = result.offer.status;
    state.dirty = false;
    await reloadContext();
    showMessage(`Conceptversie ${result.offer.versionNumber} is immutable opgeslagen.`, 'success');
  } catch (error) { showMessage(error.message, 'error'); }
  finally { elements.saveDraft.disabled = false; renderStatus(); renderReadiness(); }
}

async function transition(targetStatus) {
  if (!state.currentVersionId) return;
  const reason = elements.changeReason.value.trim();
  if (targetStatus === 'revoked' && reason.length < 8) return showMessage('Intrekken vereist een duidelijke reden van minimaal 8 tekens.', 'warning');
  try {
    const result = await request('POST', { action: 'transition', offerVersionId: state.currentVersionId, targetStatus, reason: reason || null, actionKey: actionKey(targetStatus) });
    state.currentVersionStatus = result.offer.status;
    state.dirty = false;
    await reloadContext();
    showMessage(targetStatus === 'ready_for_review' ? 'Versie is gereed voor interne controle.' : 'Versie is ingetrokken en blijft als bewijs bestaan.', 'success');
  } catch (error) { showMessage(error.message, 'error'); }
}

async function reloadContext() {
  state.data = await request('GET', null, { ...routeContext, offerId: state.currentOfferId });
  renderHistory(); renderStatus(); renderReadiness();
}

function openPreview() {
  if (!state.snapshot) return;
  const demo = state.data.demos.find((item) => item.id === state.selectedDemoId) || {};
  const valid = new Date(); valid.setDate(valid.getDate() + 14);
  const preview = buildMailPreview({ relationship: state.data.relationship, demo, snapshot: state.snapshot, validUntil: valid.toLocaleDateString('nl-NL') });
  elements.previewSubject.textContent = preview.subject;
  elements.previewGreeting.textContent = preview.greeting;
  linkPreview(elements.previewDesktop, preview.desktopUrl); linkPreview(elements.previewMobile, preview.mobileUrl);
  elements.previewQr.title = preview.qrTarget ? `QR-doel: ${preview.qrTarget}` : 'QR-doel ontbreekt';
  elements.previewOffer.innerHTML = `<strong>Persoonlijk aanbod voor ${escapeHtml(preview.companyName || 'jou')}</strong><p>Eenmalig: ${money(preview.oneTimeInclVatCents)} incl. btw<br/>Per maand: ${money(preview.recurringInclVatCents, { monthly: true })} incl. btw<br/>Nu te betalen: ${money(preview.dueNowInclVatCents)}</p>`;
  elements.previewValidity.textContent = `Dit voorstel is geldig tot en met ${preview.validUntil}. Dit is uitsluitend een lokale voorbeeldweergave.`;
  elements.mailPreview.showModal();
}

function activeDocuments() {
  const recurring = Number(state.snapshot?.recurringExVatCents || 0) > 0;
  return (state.data?.documents || []).map((document) => ({ ...document, required: document.required || (document.requiredWhenRecurring && recurring) }));
}

function selectedIds() { return [state.websiteProductId, state.careProductId, ...state.addOnIds].filter(Boolean); }
function currentVersion() { return state.data?.history?.flatMap((offer) => offer.versions || []).find((version) => version.id === state.currentVersionId); }
function productChoice(product, name, selected) { const once = product.components.find((item) => item.type === 'one_time'); const recurring = product.components.find((item) => item.type === 'recurring'); return `<label class="choice-card"><input type="radio" name="${name}" value="${product.id}" ${selected === product.id ? 'checked' : ''}/><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.description)}</span><small>${escapeHtml(classificationLabel(product.classification))}</small><span class="choice-price">${once ? money(once.amountExVatCents ?? once.startingAmountExVatCents) : money(recurring?.amountExVatCents ?? recurring?.startingAmountExVatCents, { monthly: true })} excl. btw${product.fixedDepositExVatCents ? ` · aanbetaling ${money(product.fixedDepositExVatCents)}` : ''}</span></label>`; }
function choiceNone(name, label, checked) { return `<label class="choice-card"><input type="radio" name="${name}" value="" ${checked ? 'checked' : ''}/><strong>${label}</strong><span>Geen keuze voor deze categorie.</span><span class="choice-price">${money(0)}</span></label>`; }
function componentTag(component) { const value = component.amountExVatCents ?? component.startingAmountExVatCents; return `<span>${component.type === 'recurring' ? 'Per maand' : 'Eenmalig'} · ${component.amountExVatCents == null ? 'vanaf ' : ''}${money(value, { monthly: component.type === 'recurring' })}</span>`; }
function productPrice(product) { if (product.classification === 'on_request') return 'Op aanvraag'; return product.components.map((component) => `${component.amountExVatCents == null ? 'vanaf ' : ''}${money(component.amountExVatCents ?? component.startingAmountExVatCents, { monthly: component.type === 'recurring' })}`).join(' + '); }
function classificationLabel(value) { return ({ fixed: 'Vaste prijs', starting_at: 'Vanafprijs', on_request: 'Op aanvraag', custom: 'Maatwerk bevestigd' })[value] || value; }
function categoryLabel(value) { return ({ branding: 'Branding', domain_email: 'Domein en e-mail', telephony: 'Telefonie', website_expansion: 'Website-uitbreiding', marketing: 'Marketing', content: 'Content', care: 'Onderhoud', custom: 'Maatwerk' })[value] || value; }
function centsInput(value) { return `${Math.floor(Number(value) / 100)},${String(Number(value) % 100).padStart(2, '0')}`; }
function linkPreview(anchor, href) { anchor.href = href || '#'; anchor.setAttribute('aria-disabled', href ? 'false' : 'true'); anchor.onclick = href ? null : (event) => event.preventDefault(); }
function formatDate(value) { const date = new Date(value || ''); return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleString('nl-NL'); }
function actionKey(action) { return `composer:${action}:${crypto.randomUUID()}`; }
function setText(key, value) { elements[key].textContent = value || '—'; }
function camel(value) { return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }

async function request(method, body, query = {}) {
  const token = await getAdminAccessToken();
  const url = new URL(endpoint, window.location.origin);
  if (method === 'GET') for (const [key, value] of Object.entries(query)) if (value && key !== 'valid') url.searchParams.set(key, value);
  const response = await fetch(url, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || `De serveractie mislukte (${response.status}).`);
  return data;
}

function showMessage(message, type = 'warning') { elements.composerMessage.textContent = message; elements.composerMessage.className = `composer-alert ${type}`; elements.composerMessage.hidden = false; }
function fatal(message) { showMessage(message, 'error'); elements.composerApp.setAttribute('aria-busy', 'false'); elements.composerApp.querySelectorAll('button,input,select,textarea').forEach((item) => { item.disabled = true; }); }

init();
