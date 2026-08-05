import { getAdminAccessToken } from './services/adminAuthBridgeService.js';
import {
  catalogGroups,
  composerUrl,
  composerReadiness,
  documentsForSave,
  definitiveConfirmationDetails,
  draftFingerprint,
  findMatchingDraftVersion,
  formatElapsedTime,
  money,
  parseComposerContext,
  parseEuroToCents,
  selectionsFromState,
  stateFromSnapshot,
  statusLabel,
  validRecipientEmail,
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
  offerPurpose: 'personal_proposal',
  discountPercentage: 0,
  selectedDemoId: routeContext.demoJourneyId,
  selectedFactoryProjectId: routeContext.factoryProjectId,
  selectedDocumentTypes: [],
  snapshot: null,
  currentOfferId: routeContext.offerId,
  currentVersionId: '',
  currentVersionStatus: '',
  calculating: false,
  calculationPromise: null,
  calculationRequestId: 0,
  pricingRevision: 0,
  calculatedPricingRevision: -1,
  editRevision: 0,
  savePending: false,
  dirty: false,
  lastPreview: null,
  definitiveRequestPending: false,
  definitiveRequestLocked: false,
  definitiveActionKey: '',
  definitiveTrigger: null,
  revokeInterestPending: false,
  revokeInterestTrigger: null,
  preflightPending: false,
  recipientEmail: '',
};

const elements = Object.fromEntries([
  'composer-app','composer-message','composer-status','catalog-version','catalog-checksum','website-catalog-version','relationship-card','offer-purpose','offer-purpose-help','offer-flow-explanation','factory-context','demo-options','website-options','care-options','addon-options','addon-search','addon-category','discount-percentage','document-options','document-preview-dialog','document-preview-title','document-preview-meta','document-preview-frame','close-document-preview','done-document-preview','offer-title','change-reason','save-draft','ready-review','revoke-version','readiness-list','version-history','summary-version','summary-lines','sum-once-before-discount','sum-discount-label','sum-discount','sum-once-ex','sum-once-vat','sum-once-incl','sum-month-ex','sum-month-incl','sum-due','sum-remaining','summary-warning','open-preview','test-mail','definitive-send','revoke-interest','interest-access-summary','mail-preview','close-preview','preview-subject','preview-frame','manual-mail-text','copy-manual-mail','sequence-preview','sequence-test','sequence-definitive','definitive-send-dialog','definitive-staging-warning','definitive-send-warning','close-definitive-send','cancel-definitive-send','confirm-definitive-send','definitive-send-check','definitive-send-result','confirm-company','confirm-recipient','confirm-demo','confirm-website','confirm-care','confirm-once-before-discount','confirm-discount-label','confirm-discount','confirm-once','confirm-monthly','confirm-payment-label','confirm-payment','confirm-valid-until','revoke-interest-dialog','close-revoke-interest','cancel-revoke-interest','confirm-revoke-interest','revoke-interest-reason','revoke-interest-result','revoke-company','revoke-recipient','revoke-version-number','revoke-dispatch-date','revoke-expiry','revoke-confirmed','commercial-preflight-panel','commercial-preflight-run','commercial-preflight-status','commercial-preflight-flags'
].map((id) => [camel(id), document.getElementById(id)]));

let calculationTimer = 0;

async function init() {
  bindCommercialPreflight();
  if (!routeContext.valid) return waitForRelationship();
  bindEvents();
  const loadingToast = startComposerLoadToast();
  try {
    state.data = await request('GET', null, routeContext);
    state.recipientEmail = String(state.data.relationship?.email || '').trim();
    state.selectedDocumentTypes = state.data.documents.filter((document) => document.required).map((document) => document.documentType);
    hydrateExistingOffer();
    renderAll();
    if (selectedIds().length) await calculate();
    elements.composerApp.setAttribute('aria-busy', 'false');
    loadingToast?.update('Voorstel Composer is klaar voor gebruik.', 'success', { duration: 3200 });
  } catch (error) {
    loadingToast?.update('Voorstel Composer kon niet worden geladen.', 'error', { duration: 7000 });
    fatal(error.message || 'De Voorstel Composer kon niet veilig worden geladen.');
  }
}

function startComposerLoadToast() {
  return startComposerProgress('Voorstelgegevens en prijzen laden…');
}

function startComposerProgress(message) {
  if (typeof window.showToast !== 'function') return null;
  const startedAt = Date.now();
  let activeMessage = message;
  let timer = 0;
  const toast = window.showToast(`${activeMessage} · ${formatElapsedTime(0)}`, 'info', { loading: true, persistent: true });
  const stopTimer = () => { window.clearInterval(timer); timer = 0; };
  const controller = {
    update(nextMessage = activeMessage, nextType = 'info', nextOptions = {}) {
      activeMessage = nextMessage;
      if (nextOptions.loading || nextOptions.persistent) {
        toast?.update(`${activeMessage} · ${formatElapsedTime(Date.now() - startedAt)}`, nextType, { ...nextOptions, loading: true, persistent: true });
      } else {
        stopTimer();
        toast?.update(activeMessage, nextType, nextOptions);
      }
      return controller;
    },
    close() { stopTimer(); toast?.close(); },
  };
  timer = window.setInterval(() => {
    toast?.update(`${activeMessage} · ${formatElapsedTime(Date.now() - startedAt)}`, 'info', { loading: true, persistent: true });
  }, 1000);
  return controller;
}

function finishComposerProgress(progressToast, message, type = 'success') {
  progressToast?.update(message, type, { duration: type === 'error' ? 7000 : 3200 });
}

function waitForRelationship() {
  showMessage('Selecteer links in de actieve werkruimte eerst een lead of klant. Daarna opent de Composer automatisch met de juiste relatie.', 'warning');
  elements.catalogVersion.textContent = 'Wacht op relatie';
  elements.composerApp.setAttribute('aria-busy', 'false');
  elements.composerApp.querySelectorAll('button,input,select,textarea').forEach((item) => {
    if (!item.hasAttribute('data-keep-enabled')) item.disabled = true;
  });
  let navigating = false;
  const openRelationship = (relationship) => {
    if (navigating || !relationship) return;
    const relationshipType = relationship.relationshipType || relationship.entityType;
    const relationshipId = relationship.relationshipId || (relationshipType === 'lead' ? relationship.leadId : relationship.customerId);
    const target = composerUrl({ relationshipType, relationshipId, source: 'sidebar' });
    if (!target) return;
    navigating = true;
    window.location.assign(target);
  };
  window.addEventListener('maxwebstudio:relationship-change', (event) => openRelationship(event.detail?.relationship));
  window.addEventListener('maxwebstudio:relationship-ready', (event) => openRelationship(event.detail?.relationship));
  openRelationship(window.ActiveRelationship?.getActiveRelationship?.());
}

function bindCommercialPreflight() {
  if (!elements.commercialPreflightPanel || !elements.commercialPreflightRun) return;
  if (currentAdminRole() !== 'super_admin') return;
  elements.commercialPreflightPanel.hidden = false;
  elements.commercialPreflightRun.addEventListener('click', runCommercialPreflight);
}

function currentAdminRole() {
  for (const key of ['maxwebstudioCurrentSession', 'mws_admin_supabase_session']) {
    try {
      const session = JSON.parse(localStorage.getItem(key) || 'null');
      const role = String(session?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (role) return role;
    } catch { /* invalid derived session remains fail-closed */ }
  }
  return '';
}

async function runCommercialPreflight() {
  if (state.preflightPending || currentAdminRole() !== 'super_admin') return;
  state.preflightPending = true;
  const progressToast = startComposerProgress('Releasecontrole wordt uitgevoerd…');
  elements.commercialPreflightRun.disabled = true;
  setCommercialPreflightResult({ state: 'running', message: 'Read-only controles worden uitgevoerd…', probes: [] });
  try {
    const accessToken = await getAdminAccessToken();
    const response = await fetch('/api/admin-commercial-postgrest-preflight', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    const probes = normalizeCommercialPreflightProbes(payload?.probes);
    const passed = response.ok && probes.length === 2 && probes.every((probe) => probe.healthy);
    setCommercialPreflightResult({
      state: passed ? 'pass' : 'fail',
      message: passed ? 'PASS · beide read-only controles zijn gezond.' : 'FAIL · release blijft geblokkeerd.',
      probes,
      checkedAt: new Date().toISOString(),
    });
    finishComposerProgress(progressToast, passed ? 'Releasecontrole is succesvol afgerond.' : 'Releasecontrole is niet geslaagd.', passed ? 'success' : 'error');
  } catch {
    setCommercialPreflightResult({ state: 'fail', message: 'FAIL · preflight kon niet veilig worden voltooid.', probes: [], checkedAt: new Date().toISOString() });
    finishComposerProgress(progressToast, 'Releasecontrole kon niet worden voltooid.', 'error');
  } finally {
    state.preflightPending = false;
    elements.commercialPreflightRun.disabled = false;
  }
}

function normalizeCommercialPreflightProbes(input) {
  const expected = new Set(['profiles', 'customers']);
  if (!Array.isArray(input)) return [];
  return input
    .filter((probe) => expected.has(String(probe?.resource || '')))
    .map((probe) => ({
      resource: String(probe.resource),
      httpStatus: Number(probe.httpStatus) || 0,
      healthy: Number(probe.httpStatus) === 200 && String(probe.resultCategory || '') === 'healthy' && !String(probe.errorCode || ''),
    }));
}

function setCommercialPreflightResult(result) {
  const timestamp = result.checkedAt ? ` · ${new Date(result.checkedAt).toLocaleString('nl-NL')}` : '';
  elements.commercialPreflightStatus.dataset.state = result.state;
  elements.commercialPreflightStatus.textContent = `${result.message}${timestamp}`;
  elements.commercialPreflightFlags.replaceChildren(...result.probes.map((probe) => {
    const item = document.createElement('li');
    item.dataset.state = probe.healthy ? 'pass' : 'fail';
    item.textContent = `${probe.resource}: ${probe.healthy ? 'PASS' : 'FAIL'} (${probe.httpStatus || 'geen status'})`;
    return item;
  }));
}

function bindEvents() {
  elements.websiteOptions.addEventListener('change', (event) => selectSingle(event, 'websiteProductId'));
  elements.careOptions.addEventListener('change', (event) => selectSingle(event, 'careProductId'));
  elements.paymentOptions = document.getElementById('payment-options');
  elements.paymentOptions.addEventListener('change', (event) => { if (event.target.name === 'payment') { state.paymentChoice = event.target.value; changed(); } });
  elements.discountPercentage.addEventListener('change', () => { state.discountPercentage = Number(elements.discountPercentage.value); changed(); });
  elements.offerPurpose.addEventListener('change', () => { state.offerPurpose = elements.offerPurpose.value; changed(); renderOfferPurpose(); });
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
  elements.closeDocumentPreview.addEventListener('click', closeDocumentPreview);
  elements.doneDocumentPreview.addEventListener('click', closeDocumentPreview);
  elements.documentPreviewDialog.addEventListener('click', (event) => { if (event.target === elements.documentPreviewDialog) closeDocumentPreview(); });
  elements.offerTitle.addEventListener('input', markDirty);
  elements.changeReason.addEventListener('input', renderReadiness);
  elements.saveDraft.addEventListener('click', saveDraft);
  elements.readyReview.addEventListener('click', () => transition('ready_for_review'));
  elements.revokeVersion.addEventListener('click', () => transition('revoked'));
  elements.openPreview.addEventListener('click', openPreview);
  elements.testMail.addEventListener('click', sendTestMail);
  elements.definitiveSend.addEventListener('click', openDefinitiveSendDialog);
  elements.revokeInterest.addEventListener('click', openRevokeInterestDialog);
  elements.copyManualMail.addEventListener('click', copyManualMail);
  elements.closePreview.addEventListener('click', () => elements.mailPreview.close());
  elements.mailPreview.addEventListener('click', (event) => { if (event.target === elements.mailPreview) elements.mailPreview.close(); });
  elements.definitiveSendCheck.addEventListener('change', updateDefinitiveConfirmation);
  elements.confirmDefinitiveSend.addEventListener('click', sendDefinitiveMail);
  elements.cancelDefinitiveSend.addEventListener('click', closeDefinitiveSendDialog);
  elements.closeDefinitiveSend.addEventListener('click', closeDefinitiveSendDialog);
  elements.definitiveSendDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!state.definitiveRequestPending) closeDefinitiveSendDialog();
  });
  elements.definitiveSendDialog.addEventListener('keydown', trapDefinitiveDialogFocus);
  elements.revokeInterestReason.addEventListener('input', updateRevokeInterestConfirmation);
  elements.confirmRevokeInterest.addEventListener('click', revokeInterestAccess);
  elements.cancelRevokeInterest.addEventListener('click', closeRevokeInterestDialog);
  elements.closeRevokeInterest.addEventListener('click', closeRevokeInterestDialog);
  elements.revokeInterestDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!state.revokeInterestPending) closeRevokeInterestDialog();
  });
  elements.revokeInterestDialog.addEventListener('keydown', (event) => trapDialogFocus(event, elements.revokeInterestDialog, state.revokeInterestPending));
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
  elements.definitiveStagingWarning.hidden = !state.data?.capabilities?.stagingMail;
  elements.discountPercentage.value = String(state.discountPercentage);
  elements.offerPurpose.value = state.offerPurpose;
  renderOfferPurpose();
  renderRelationship(); renderFactory(); renderDemos(); renderCatalog(); renderDocuments(); renderHistory(); renderSummary(); renderReadiness(); renderStatus();
}

function renderRelationship() {
  const relation = state.data.relationship;
  const values = [['Type', relation.type === 'lead' ? 'Lead' : 'Klant'], ['Bedrijf', relation.companyName || 'Ontbreekt'], ['Contactpersoon', relation.contactName || 'Ontbreekt'], ['Opgeslagen e-mail', relation.email || 'Ontbreekt'], ['Telefoon', relation.phone || 'Ontbreekt'], ['Website', relation.website || 'Niet ingevuld']];
  elements.relationshipCard.innerHTML = values.map(([label, value], index) => `<div class="${index > 3 ? 'wide' : ''}"><span>${escapeHtml(label)}</span><strong class="${value === 'Ontbreekt' ? 'missing' : ''}">${escapeHtml(value)}</strong></div>`).join('') + `<label class="relation-recipient wide" for="relationship-recipient-email"><span>Verzendadres</span><input id="relationship-recipient-email" type="email" inputmode="email" autocomplete="email" maxlength="320" value="${escapeHtml(state.recipientEmail)}" placeholder="naam@bedrijf.nl" aria-describedby="relationship-recipient-help"/><small id="relationship-recipient-help">Dit adres ontvangt de definitieve klantmail. De lead of klant wordt niet aangepast.</small></label>`;
  const input = document.getElementById('relationship-recipient-email');
  input.addEventListener('input', () => {
    state.recipientEmail = input.value;
    input.setAttribute('aria-invalid', String(Boolean(input.value.trim()) && !validRecipientEmail(input.value)));
    renderReadiness();
  });
  input.addEventListener('blur', () => {
    if (input.value.trim() && !validRecipientEmail(input.value)) showMessage('Vul een geldig verzendadres in.', 'warning');
  });
  if (!state.recipientEmail) showMessage('E-mailadres ontbreekt. Vul hieronder het verzendadres voor deze offerte in.', 'warning');
}

function renderOfferPurpose() {
  const definitive = state.offerPurpose === 'definitive_offer';
  elements.offerPurposeHelp.textContent = definitive
    ? 'Bindend na ondertekening via Signhost. Pas de provider-webhook zet de sale op ondertekend.'
    : 'Vrijblijvend: interesse is nog geen sale of overeenkomst.';
  elements.offerFlowExplanation.textContent = definitive
    ? 'De klant controleert de offerte en tekent via Signhost. Daarna worden sale en klantportaal automatisch klaargezet; betaling blijft apart.'
    : 'De interesseknop maakt geen contract, betaling, factuur, abonnement of onboarding.';
  elements.definitiveSendWarning.textContent = definitive
    ? 'Na bevestiging wordt één e-mail met een beveiligde ondertekenlink verstuurd. Alleen een geldige Signhost-handtekening maakt de zakelijke overeenkomst definitief.'
    : 'Na bevestiging wordt er werkelijk één e-mail verstuurd. Er wordt geen contract, betaling, factuur, abonnement of onboarding gestart.';
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
  elements.documentOptions.innerHTML = docs.map((document) => {
    const inputId = `document-${document.documentType}`;
    const sourceUrl = safeDocumentUrl(document.sourceUrl);
    const previewAction = sourceUrl
      ? `<a class="document-preview-button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" aria-label="${escapeHtml(document.name)} bekijken">Bekijken</a>`
      : `<button class="document-preview-button" type="button" data-document-preview="${document.documentType}" aria-label="${escapeHtml(document.name)} bekijken">Bekijken</button>`;
    return `<article class="document-row"><input id="${inputId}" type="checkbox" data-document-type="${document.documentType}" ${state.selectedDocumentTypes.includes(document.documentType) ? 'checked' : ''}/><label class="document-copy" for="${inputId}"><strong>${escapeHtml(document.name)}</strong><p>Versie ${escapeHtml(document.versionCode)} · ingangsdatum ${escapeHtml(document.effectiveFrom)}${document.required ? ' · verplicht' : ''}</p><span class="checksum">✓ ${escapeHtml(document.checksumSha256.slice(0, 20))}…</span></label><div class="document-row-actions"><span class="classification">${escapeHtml(document.checksumStatus)}</span>${previewAction}</div></article>`;
  }).join('');
  elements.documentOptions.querySelectorAll('[data-document-preview]').forEach((button) => button.addEventListener('click', openDocumentPreview));
}

function openDocumentPreview(event) {
  const documentType = event.currentTarget.dataset.documentPreview;
  const document = activeDocuments().find((item) => item.documentType === documentType);
  if (!document) return;
  elements.documentPreviewTitle.textContent = document.name;
  elements.documentPreviewMeta.textContent = `Versie ${document.versionCode} · ingangsdatum ${document.effectiveFrom}`;
  elements.documentPreviewFrame.title = `Inhoud van ${document.name}`;
  elements.documentPreviewFrame.removeAttribute('src');
  elements.documentPreviewFrame.srcdoc = templateDocumentPreview(document);
  elements.documentPreviewDialog.showModal();
  elements.closeDocumentPreview.focus();
}

function closeDocumentPreview() {
  if (!elements.documentPreviewDialog.open) return;
  elements.documentPreviewDialog.close();
  elements.documentPreviewFrame.removeAttribute('src');
  elements.documentPreviewFrame.srcdoc = '';
}

function safeDocumentUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function templateDocumentPreview(document) {
  const relationship = state.data?.relationship || {};
  const snapshot = state.snapshot;
  const storedVersion = currentVersion();
  const lines = snapshot?.lines || [];
  const company = relationship.companyName || relationship.contactName || 'Nog geen relatiegegevens';
  const proposalReference = storedVersion?.version_number ? `Voorstelversie ${storedVersion.version_number}` : 'Concept · nog niet als versie opgeslagen';
  const snapshotChecksum = snapshot?.checksum ? `${snapshot.checksum.slice(0, 24)}…` : 'Wordt bij het opslaan vastgelegd';
  const productRows = lines.length ? lines.map((line) => `<tr><td><strong>${escapeHtml(`${line.quantity || 1}× ${line.productName}`)}</strong><small>${escapeHtml(line.productDescription || '')}${line.componentType === 'recurring' ? ' · per maand' : ' · eenmalig'}</small></td><td>${escapeHtml(line.bindingState === 'binding' ? money(line.subtotalExVatCents, { monthly: line.componentType === 'recurring' }) : 'Nog te bevestigen')}</td><td>${escapeHtml(line.bindingState === 'binding' ? money(line.totalInclVatCents, { monthly: line.componentType === 'recurring' }) : 'Nog te bevestigen')}</td></tr>`).join('') : '<tr><td colspan="3">Maak eerst een productkeuze om de actuele inhoud te zien.</td></tr>';
  const discountRow = Number(snapshot?.discountPercentage || 0) > 0 ? `<tr><td><strong>Handmatige korting (${snapshot.discountPercentage}%)</strong><small>Alleen over de eenmalige onderdelen; maandelijkse kosten blijven ongewijzigd.</small></td><td>− ${escapeHtml(money(snapshot.discountExVatCents))}</td><td>− ${escapeHtml(money(snapshot.discountExVatCents + Math.round(snapshot.discountExVatCents * Number(snapshot.vatRate || 21) / 100)))}</td></tr>` : '';
  const scopeRows = `${productRows}${discountRow}`;
  const common = `<section><h2>Relatie en zakelijk karakter</h2><dl><div><dt>Bedrijf</dt><dd>${escapeHtml(company)}</dd></div><div><dt>Contactpersoon</dt><dd>${escapeHtml(relationship.contactName || '—')}</dd></div><div><dt>E-mail</dt><dd>${escapeHtml(effectiveRecipientEmail() || relationship.email || '—')}</dd></div><div><dt>KvK-nummer</dt><dd>${escapeHtml(relationship.kvkNumber || 'Nog te bevestigen bij zakelijk akkoord')}</dd></div></dl><p class="muted">Deze offerte is opgesteld voor een klant die handelt in de uitoefening van een beroep of bedrijf.</p></section><section><h2>Scope van dit voorstel</h2><table class="scope-table"><thead><tr><th>Onderdeel en aantal</th><th>Excl. btw</th><th>Incl. btw</th></tr></thead><tbody>${scopeRows}</tbody></table><p class="muted">Alleen bindend bevestigde onderdelen en bedragen behoren tot deze offerteversie. Een inhoudelijke wijziging vereist een nieuwe versie.</p></section>`;
  const quote = `<section class="quote-intro"><div class="agreement-status">Zakelijke offerte · ${escapeHtml(proposalReference)}</div><h2>Voorstel voor ${escapeHtml(company)}</h2><p>Een helder overzicht van de afgesproken scope, prijsopbouw, betaalkeuze, geldigheid en gekoppelde documenten.</p></section>${common}<section><h2>Prijsopbouw</h2><dl><div><dt>Eenmalig excl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.oneTimeExVatCents) : '—')}</dd></div><div><dt>Btw eenmalig</dt><dd>${escapeHtml(snapshot ? money(snapshot.oneTimeVatCents) : '—')}</dd></div><div><dt>Eenmalig incl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.oneTimeInclVatCents) : '—')}</dd></div><div><dt>Per maand excl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.recurringExVatCents, { monthly: true }) : '—')}</dd></div><div><dt>Btw per maand</dt><dd>${escapeHtml(snapshot ? money(snapshot.recurringVatCents, { monthly: true }) : '—')}</dd></div><div><dt>Per maand incl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.recurringInclVatCents, { monthly: true }) : '—')}</dd></div></dl></section><section><h2>Betaalafspraak</h2><dl><div><dt>Gekozen betaalroute</dt><dd>${escapeHtml(paymentChoiceLabel(snapshot?.paymentChoice))}</dd></div><div><dt>Nu te betalen excl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.dueNowExVatCents) : '—')}</dd></div><div><dt>Btw over bedrag nu</dt><dd>${escapeHtml(snapshot ? money(snapshot.dueNowVatCents) : '—')}</dd></div><div><dt>Nu te betalen incl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.dueNowInclVatCents) : '—')}</dd></div><div><dt>Resterend eenmalig excl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.remainingExVatCents) : '—')}</dd></div></dl><p class="muted">Acceptatie van de offerte start niet automatisch een betaling. Facturatie en betaling volgen de gekoppelde overeenkomst en voorwaarden.</p></section><section><h2>Geldigheid en integriteit</h2><dl><div><dt>Referentie</dt><dd>${escapeHtml(proposalReference)}</dd></div><div><dt>Offerteweergave</dt><dd>${escapeHtml(document.versionCode)}</dd></div><div><dt>Geldig tot en met</dt><dd>${escapeHtml(snapshot?.validUntil ? formatDateOnly(snapshot.validUntil) : '—')}</dd></div><div><dt>Voorstelchecksum</dt><dd class="checksum-value">${escapeHtml(snapshotChecksum)}</dd></div></dl><p class="notice"><strong>Controleerbare versie.</strong> De definitieve offerte verwijst naar één onveranderlijke voorstelversie. Bij digitaal akkoord worden versie, documentchecksums, bedragen, tijdstip en beschikbare technische bewijsgegevens vastgelegd.</p></section><section><h2>Gekoppelde documenten</h2><ol><li><strong>Overeenkomsttemplate · zakelijke overeenkomst</strong><span>Legt partijen, uitvoering, betaling, intellectueel eigendom en acceptatie vast.</span></li><li><strong>Algemene voorwaarden · versie 2026-08 B2B</strong><span>Vullen de concrete scope en prijsafspraken aan.</span></li><li><strong>Hosting- en onderhoudsvoorwaarden</strong><span>Gelden wanneer een doorlopende hosting- of onderhoudsdienst is opgenomen.</span></li><li><strong>Privacyverklaring · versie 2026-08</strong><span>Beschrijft de verwerking van persoonsgegevens en staat naast de contractuele documentvolgorde.</span></li></ol></section><section class="acceptance"><div class="agreement-status">Zakelijke akkoordverklaring</div><h2>Wat gebeurt er bij acceptatie?</h2><p>De klant controleert eerst scope, prijzen, betaalafspraak, geldigheid en de gekoppelde documenten. Het akkoord wordt vervolgens aan precies deze voorstelversie gekoppeld; een wijziging vraagt om een nieuwe versie.</p><p class="notice"><strong>Conceptweergave.</strong> Sla het voorstel eerst als onveranderlijke versie op. Pas daarna kan deze offerteweergave definitief aan de klant worden aangeboden.</p></section>`;
  const recurringTerms = Number(snapshot?.recurringExVatCents || 0) > 0
    ? 'De gekoppelde hosting- en onderhoudsvoorwaarden maken onderdeel uit van deze overeenkomst.'
    : 'Hosting- en onderhoudsvoorwaarden gelden alleen wanneer een doorlopende dienst wordt toegevoegd.';
  const agreement = `<section class="agreement-intro"><div class="agreement-status">Uitsluitend zakelijke overeenkomst</div><h2>Partijen en uitgangspunt</h2><p>Deze overeenkomst wordt gesloten tussen <strong>Max Webstudio, onderdeel van Lebellebox / Lebelle Sales &amp; Marketing</strong>, hierna “Max Webstudio”, en <strong>${escapeHtml(company)}</strong>, hierna “klant”. De klant verklaart uitsluitend te handelen in de uitoefening van een beroep of bedrijf.</p><p class="muted">Het consumentenherroepingsrecht is niet van toepassing. Annulering en beëindiging volgen uit deze overeenkomst en de gekoppelde voorwaarden.</p></section>${common}<section><h2>Voorstelreferentie en integriteit</h2><dl><div><dt>Referentie</dt><dd>${escapeHtml(proposalReference)}</dd></div><div><dt>Templateversie</dt><dd>${escapeHtml(document.versionCode)}</dd></div><div><dt>Voorstelchecksum</dt><dd class="checksum-value">${escapeHtml(snapshotChecksum)}</dd></div><div><dt>Geldig tot en met</dt><dd>${escapeHtml(snapshot?.validUntil ? formatDateOnly(snapshot.validUntil) : '—')}</dd></div></dl><p class="muted">De definitieve overeenkomst verwijst naar één onveranderlijke voorstelversie. Een inhoudelijke wijziging vereist een nieuwe versie.</p></section><section><h2>Prijs en betaling</h2><dl><div><dt>Eenmalig excl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.oneTimeExVatCents) : '—')}</dd></div><div><dt>Eenmalig incl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.oneTimeInclVatCents) : '—')}</dd></div><div><dt>Maandelijks excl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.recurringExVatCents, { monthly: true }) : '—')}</dd></div><div><dt>Nu te betalen incl. btw</dt><dd>${escapeHtml(snapshot ? money(snapshot.dueNowInclVatCents) : '—')}</dd></div><div><dt>Betaalafspraak</dt><dd>${escapeHtml(paymentChoiceLabel(snapshot?.paymentChoice))}</dd></div></dl><p>Facturen hebben standaard een betaaltermijn van 14 dagen, tenzij de opgeslagen voorstelversie uitdrukkelijk iets anders bepaalt. Bij te late zakelijke betaling gelden de wettelijke handelsrente en redelijke incassokosten binnen de grenzen van de wet.</p></section><section><h2>Afspraken over de uitvoering</h2><div class="clause-grid"><article class="clause"><strong>1. Opdracht en afbakening</strong><p>Alleen de hierboven opgenomen producten, diensten, aantallen en bindend bevestigde prijzen behoren tot de opdracht.</p></article><article class="clause"><strong>2. Start en planning</strong><p>De uitvoering start na akkoord, een eventueel afgesproken aanbetaling en ontvangst van de benodigde informatie. Planningen zijn streefdata, tenzij schriftelijk een fatale termijn is overeengekomen.</p></article><article class="clause"><strong>3. Medewerking klant</strong><p>De klant levert teksten, beelden, toegang, feedback en toestemmingen tijdig aan en staat ervoor in dat aangeleverd materiaal rechtmatig mag worden gebruikt.</p></article><article class="clause"><strong>4. Oplevering en feedback</strong><p>De klant beoordeelt concepten en opleveringen binnen de afgesproken of een redelijke termijn. Max Webstudio krijgt eerst een redelijke mogelijkheid om een toerekenbare fout te herstellen.</p></article><article class="clause"><strong>5. Wijzigingen en meerwerk</strong><p>Werk buiten de vastgelegde scope, extra feedbackrondes of gewijzigde wensen gelden als meerwerk. Voorzienbaar meerwerk en gevolgen voor prijs en planning worden vooraf afgestemd.</p></article><article class="clause"><strong>6. Doorlopende diensten</strong><p>${escapeHtml(recurringTerms)} De toepasselijke looptijd en opzegtermijn volgen uit de voorstelversie en die specifieke voorwaarden.</p></article><article class="clause"><strong>7. Intellectueel eigendom</strong><p>Gebruiks- of overdrachtsrechten ontstaan pas na volledige betaling, voor zover in de offerte of algemene voorwaarden niet anders is bepaald. Rechten op bestaande bouwstenen en materialen van derden blijven bij de rechthebbende.</p></article><article class="clause"><strong>8. Privacy en vertrouwelijkheid</strong><p>Partijen behandelen vertrouwelijke informatie zorgvuldig. De privacyverklaring beschrijft hoe Max Webstudio persoonsgegevens verwerkt; indien nodig wordt afzonderlijk een verwerkersovereenkomst gesloten.</p></article><article class="clause"><strong>9. Aansprakelijkheid en overmacht</strong><p>De bepalingen over aansprakelijkheid, externe leveranciers, overmacht, beveiliging en back-ups uit de algemene voorwaarden zijn van toepassing.</p></article><article class="clause"><strong>10. Opschorting en einde</strong><p>Opschorting, annulering en beëindiging verlopen volgens de geaccepteerde voorstelversie en voorwaarden. Reeds verricht werk, gemaakte kosten en opeisbare bedragen blijven verschuldigd.</p></article></div></section><section><h2>Toepasselijke documenten en volgorde</h2><ol><li><strong>Schriftelijke afwijking of afzonderlijk ondertekende afspraak</strong><span>Gaat voor wanneer partijen deze uitdrukkelijk vastleggen.</span></li><li><strong>De geaccepteerde, onveranderlijke voorstelversie</strong><span>Bevat de concrete scope, prijzen, betaling en geldigheid.</span></li><li><strong>Specifieke product-, hosting- en onderhoudsvoorwaarden</strong><span>Gelden voor de diensten waarop zij betrekking hebben.</span></li><li><strong>Algemene voorwaarden · versie 2026-08 B2B</strong><span>Vullen de concrete afspraken aan.</span></li></ol><p class="muted">De privacyverklaring geeft informatie over de verwerking van persoonsgegevens en staat naast deze contractuele documentvolgorde.</p></section><section class="acceptance"><div class="agreement-status">Zakelijke akkoordverklaring</div><h2>Totstandkoming en bewijs</h2><p>De overeenkomst komt tot stand zodra de klant schriftelijk of digitaal akkoord geeft, de bestelling plaatst, een afgesproken betaling doet of Max Webstudio op verzoek van de klant met de uitvoering begint.</p><p>Bij digitale acceptatie worden de geaccepteerde voorstel- en documentversies, checksums, het acceptatietijdstip en de beschikbare technische bewijsgegevens vastgelegd. De klant bevestigt daarbij de overeenkomst uitsluitend zakelijk te sluiten en bevoegde vertegenwoordiger van de genoemde onderneming te zijn.</p><p class="notice"><strong>Conceptweergave.</strong> Sla het voorstel eerst als onveranderlijke versie op. Pas daarna kan deze template als definitieve overeenkomst aan precies die versie worden gekoppeld.</p></section>`;
  return documentPreviewShell(document.name, document.documentType === 'quote' ? quote : agreement);
}

function paymentChoiceLabel(value) {
  return ({ fixed_deposit: 'vaste catalogusaanbetaling', full: 'volledige betaling', none: 'nog geen betaalkeuze' })[value] || 'nog geen betaalkeuze';
}

function documentPreviewShell(title, content) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;overflow-x:hidden;background:#f4f7fa;color:#10283a;font:16px/1.55 Inter,Arial,sans-serif}.page{max-width:900px;margin:auto;padding:42px 28px 70px}.brand{color:#147ca0;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:.3rem 0 2rem;font-size:clamp(2rem,5vw,3.3rem);line-height:1.05;overflow-wrap:anywhere}section{margin:18px 0;padding:24px;border:1px solid #d6e1e8;border-radius:16px;background:white}h2{margin:0 0 14px;font-size:1.2rem}p{margin:.65rem 0}dl{display:grid;gap:9px;margin:0}dl div{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #edf1f4;padding-bottom:8px}dt{color:#617483}dd{margin:0;font-weight:750;text-align:right}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #edf1f4}th:last-child,td:last-child{text-align:right}td small,ol span{display:block;color:#617483;font-weight:400}.notice{padding:14px;border-radius:10px;background:#eef8fb;color:#31586b}.muted{color:#617483}.agreement-intro,.acceptance{border-color:#9bd4e6;background:linear-gradient(135deg,#fff,#eef9fc)}.agreement-status{display:inline-flex;margin-bottom:12px;padding:5px 10px;border-radius:999px;background:#0c3449;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.clause-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.clause{padding:16px;border:1px solid #e0e9ee;border-radius:12px;background:#f9fbfc}.clause strong{display:block;color:#0d6687}.clause p{margin-bottom:0;color:#4f6675}.checksum-value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86rem;overflow-wrap:anywhere}ol{display:grid;gap:12px;padding-left:22px}@media(max-width:600px){.page{padding:24px 12px}section{padding:18px}.clause-grid{grid-template-columns:1fr}dl div{display:block}dd{text-align:left}th:nth-child(2),td:nth-child(2){display:none}}</style></head><body><main class="page"><span class="brand">Max Webstudio · documentinzage</span><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

function renderSummary() {
  const snapshot = state.snapshot;
  elements.summaryVersion.textContent = snapshot ? `Catalogus ${snapshot.catalogVersion}` : state.calculating ? 'Berekenen…' : 'Maak een productkeuze';
  elements.summaryLines.innerHTML = snapshot?.lines?.map((line) => `<div class="summary-line"><span>${escapeHtml(line.productName)}${line.componentType === 'recurring' ? ' · per maand' : ''}</span><strong>${line.bindingState === 'binding' ? money(line.totalInclVatCents, { monthly: line.componentType === 'recurring' }) : 'Te bevestigen'}</strong></div>`).join('') || '';
  setText('sumOnceBeforeDiscount', snapshot && money(snapshot.oneTimeBeforeDiscountExVatCents));
  if (elements.sumDiscountLabel) elements.sumDiscountLabel.textContent = `Korting${snapshot ? ` (${snapshot.discountPercentage}%)` : ''}`;
  setText('sumDiscount', snapshot && `− ${money(snapshot.discountExVatCents)}`);
  setText('sumOnceEx', snapshot && money(snapshot.oneTimeExVatCents)); setText('sumOnceVat', snapshot && money(snapshot.oneTimeVatCents)); setText('sumOnceIncl', snapshot && money(snapshot.oneTimeInclVatCents)); setText('sumMonthEx', snapshot && money(snapshot.recurringExVatCents, { monthly: true })); setText('sumMonthIncl', snapshot && money(snapshot.recurringInclVatCents, { monthly: true })); setText('sumDue', snapshot && money(snapshot.dueNowInclVatCents)); setText('sumRemaining', snapshot && money(snapshot.remainingExVatCents));
  elements.summaryWarning.textContent = snapshot?.hasNonBindingLines ? 'Dit voorstel bevat nog een vanaf- of op-aanvraagprijs en kan niet gereed voor controle worden gemaakt.' : '';
  renderPreviewAvailability();
}

function renderReadiness() {
  const readiness = composerReadiness({ snapshot: state.snapshot, documents: activeDocuments(), selectedDocumentTypes: state.selectedDocumentTypes, email: effectiveRecipientEmail() });
  const savedCurrentVersion = Boolean(currentVersion() && !state.dirty);
  const savedDraft = savedCurrentVersion && state.currentVersionStatus === 'draft';
  elements.readyReview.disabled = state.savePending || !(readiness.readyForReview && savedDraft);
  elements.revokeVersion.disabled = !(state.currentVersionId && ['draft', 'ready_for_review'].includes(state.currentVersionStatus));
  elements.readinessList.innerHTML = [
    [Boolean(state.snapshot), 'Serverberekening beschikbaar'],
    [!readiness.nonBinding, 'Alle prijzen zijn bindend bevestigd'],
    [readiness.missingDocuments.length === 0, 'Alle verplichte documenten zijn gekoppeld'],
    [readiness.invalidChecksums.length === 0, 'Alle documentchecksums zijn geldig'],
    [savedCurrentVersion, 'Actuele inhoud is als immutable versie opgeslagen'],
  ].map(([ok, label]) => `<div class="${ok ? 'ok' : 'blocked'}">${ok ? '✓' : '○'} ${escapeHtml(label)}</div>`).join('');
  renderPreviewAvailability();
}

function renderHistory() {
  const offers = state.data?.history || [];
  const versions = offers.flatMap((offer) => (offer.versions || []).map((version) => ({ ...version, offerId: offer.id, offerTitle: offer.title, demoJourneyId: offer.demo_journey_id, factoryProjectId: offer.factory_project_id, current: offer.current_version_id === version.id })));
  elements.versionHistory.innerHTML = versions.length ? versions.map((version) => `<article class="version-item ${version.id === state.currentVersionId ? 'selected' : ''}"><header><strong>Versie ${version.version_number} · ${escapeHtml(version.offerTitle)}</strong><span class="classification ${version.status}">${escapeHtml(statusLabel(version.status))}</span></header><dl><div><dt>Aangemaakt</dt><dd>${escapeHtml(formatDate(version.created_at))}</dd></div><div><dt>Actor</dt><dd>${escapeHtml(version.created_by_profile_id || 'Onbekend')}</dd></div><div><dt>Catalogus</dt><dd>${escapeHtml(version.catalog_version)}</dd></div><div><dt>Eenmalig</dt><dd>${money(Number(version.one_time_incl_vat_cents))}</dd></div><div><dt>Per maand</dt><dd>${money(Number(version.recurring_incl_vat_cents), { monthly: true })}</dd></div><div><dt>Documenten</dt><dd>${version.documents?.length || 0}</dd></div><div><dt>Maatwerk</dt><dd>${version.lines?.some((line) => line.price_classification === 'custom') ? 'Ja' : 'Nee'}</dd></div><div><dt>Reden</dt><dd>${escapeHtml(version.lifecycle_reason || version.internal_change_reason || '—')}</dd></div></dl><button type="button" class="version-select" data-offer-id="${version.offerId}" data-version-id="${version.id}">${version.current ? (version.id === state.currentVersionId ? 'Geselecteerd voorstel' : 'Dit voorstel kiezen') : 'Oude bewijsversie bekijken'}</button></article>`).join('') : '<p>Nog geen opgeslagen versies voor deze relatie.</p>';
  elements.versionHistory.querySelectorAll('.version-select').forEach((button) => button.addEventListener('click', selectHistoryVersion));
}

function selectHistoryVersion(event) {
  const offer = (state.data?.history || []).find((item) => item.id === event.currentTarget.dataset.offerId);
  const version = offer?.versions?.find((item) => item.id === event.currentTarget.dataset.versionId);
  if (!offer || !version) return;
  if (offer.current_version_id !== version.id) {
    showMessage('Dit is een oude bewijsversie. Alleen de actuele versie van een voorstel kan veilig worden verzonden.', 'warning');
    return;
  }
  Object.assign(state, stateFromSnapshot(version.snapshot || {}));
  state.snapshot = version.snapshot || null;
  state.currentOfferId = offer.id;
  state.currentVersionId = version.id;
  state.currentVersionStatus = version.status;
  state.selectedDemoId = offer.demo_journey_id || '';
  state.selectedFactoryProjectId = offer.factory_project_id || '';
  state.selectedDocumentTypes = (version.documents || []).map((document) => document.document_type);
  state.dirty = false;
  elements.offerTitle.value = offer.title || 'Websitevoorstel';
  renderAll();
  showMessage(`Versie ${version.version_number} van ${offer.title} is geselecteerd voor controle en verzending.`, 'success');
}

function renderStatus() {
  elements.composerStatus.textContent = state.currentVersionId ? `${statusLabel(state.currentVersionStatus)}${state.dirty ? ' · niet-opgeslagen wijzigingen' : ''}` : 'Concept niet opgeslagen';
}

function renderPreviewAvailability() {
  const version = currentVersion();
  const sendReady = Boolean(version && state.currentVersionStatus === 'ready_for_review' && !state.dirty && state.selectedDemoId && !state.snapshot?.hasNonBindingLines);
  const resendReady = Boolean(version && state.currentVersionStatus === 'sent' && !state.dirty && state.selectedDemoId && !state.snapshot?.hasNonBindingLines);
  const previewed = Boolean(version?.events?.some((event) => event.event_type === 'offer.previewed'));
  const tested = Boolean(version?.dispatches?.some((dispatch) => dispatch.dispatch_kind === 'test' && dispatch.status === 'sent'));
  const definitiveSent = Boolean(version?.dispatches?.some((dispatch) => dispatch.dispatch_kind === 'definitive' && dispatch.status === 'sent'));
  const interestConfirmed = Boolean(version?.interestTokens?.some((token) => token.confirmed_at));
  const activeInterestTokens = (version?.interestTokens || []).filter((token) => !token.confirmed_at && !token.revoked_at && new Date(token.expires_at).getTime() > Date.now());
  const activeSigningTokens = (version?.signingAccessTokens || []).filter((token) => !token.revoked_at && new Date(token.expires_at).getTime() > Date.now());
  const signingTransaction = version?.signingTransactions?.[0];
  const definitiveOffer = state.offerPurpose === 'definitive_offer';
  const providerReady = !definitiveOffer || state.data?.capabilities?.providersEnabled;
  elements.openPreview.disabled = state.savePending || !(sendReady && state.data?.capabilities?.previewMail);
  elements.testMail.disabled = state.savePending || !(sendReady && previewed && state.data?.capabilities?.testMail);
  elements.definitiveSend.disabled = state.savePending || !((sendReady || (resendReady && !interestConfirmed && !signingTransaction)) && previewed && tested && validRecipientEmail(effectiveRecipientEmail()) && state.data?.capabilities?.definitiveSend && providerReady);
  elements.revokeInterest.disabled = !((activeInterestTokens.length || (activeSigningTokens.length && !signingTransaction)) && state.data?.capabilities?.revokeInterest && !state.revokeInterestPending);
  elements.interestAccessSummary.textContent = definitiveOffer
    ? signingTransaction ? `Signhost-status: ${statusLabel(signingTransaction.status)}${signingTransaction.signed_at ? ` · ${formatDate(signingTransaction.signed_at)}` : ''}` : activeSigningTokens.length ? `Actieve ondertekenlink · geldig tot ${formatDate(activeSigningTokens[0].expires_at)}` : providerReady ? 'Geen actieve ondertekenlink.' : 'Signhost is nog niet geconfigureerd.'
    : activeInterestTokens.length ? `${activeInterestTokens.length} actieve, onbevestigde interesselink · geldig tot ${formatDate(activeInterestTokens[0].expires_at)}` : version?.interestTokens?.some((token) => token.confirmed_at) ? 'Interesse is bevestigd; er is geen onbevestigde link actief.' : 'Geen actieve interesselink.';
  setSequence(elements.sequencePreview, previewed, !sendReady);
  setSequence(elements.sequenceTest, tested, !previewed);
  setSequence(elements.sequenceDefinitive, definitiveSent, !tested);
}

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

function changed() {
  state.pricingRevision += 1;
  markDirty();
  window.clearTimeout(calculationTimer);
  calculationTimer = window.setTimeout(calculate, 180);
}
function markDirty() { state.editRevision += 1; state.dirty = true; renderStatus(); renderReadiness(); }

function calculate() {
  const requestId = ++state.calculationRequestId;
  const pricingRevision = state.pricingRevision;
  const selections = selectionsFromState(state, state.data.actor);
  if (!selections.length) {
    state.snapshot = null;
    state.calculatedPricingRevision = pricingRevision;
    state.calculating = false;
    state.calculationPromise = null;
    renderSummary(); renderDocuments(); renderReadiness();
    return Promise.resolve(null);
  }
  state.calculating = true; renderSummary();
  const pending = (async () => {
    try {
      const data = await request('POST', { action: 'prepare_snapshot', offerPurpose: state.offerPurpose, paymentChoice: state.paymentChoice, discountPercentage: state.discountPercentage, selections });
      if (requestId !== state.calculationRequestId || pricingRevision !== state.pricingRevision) return null;
      state.snapshot = data.snapshot;
      state.calculatedPricingRevision = pricingRevision;
      renderDocuments(); renderSummary(); renderReadiness();
      return data.snapshot;
    } catch (error) {
      if (requestId === state.calculationRequestId && pricingRevision === state.pricingRevision) {
        state.snapshot = null; showMessage(error.message, 'error'); renderSummary(); renderReadiness();
      }
      return null;
    } finally {
      if (requestId === state.calculationRequestId) {
        state.calculating = false;
        if (state.calculationPromise === pending) state.calculationPromise = null;
        renderSummary();
      }
    }
  })();
  state.calculationPromise = pending;
  return pending;
}

async function saveDraft() {
  if (state.savePending) return;
  state.savePending = true;
  elements.saveDraft.disabled = true;
  renderReadiness();
  const progressToast = startComposerProgress('Conceptversie wordt veilig opgeslagen…');
  try {
    progressToast?.update('Actuele prijzen en korting worden gecontroleerd…', 'info', { loading: true, persistent: true });
    const snapshot = await ensureCurrentSnapshot();
    if (!snapshot) throw userProblem('Kies minimaal één product en wacht op de serverberekening.');
    const title = elements.offerTitle.value.trim();
    if (title.length < 2) throw userProblem('Geef het voorstel een duidelijke titel.');
    const documents = documentsForSave(activeDocuments(), state.selectedDocumentTypes);
    const savedRevision = state.editRevision;
    const draft = {
      offerId: state.currentOfferId || '',
      title,
      demoJourneyId: state.selectedDemoId || '',
      factoryProjectId: state.selectedFactoryProjectId || '',
      snapshotChecksum: snapshot.checksum,
      documents,
    };
    const exactExisting = state.currentOfferId ? findMatchingDraftVersion(state.data?.history, draft) : null;
    if (exactExisting) {
      applyPersistedVersion(exactExisting, savedRevision);
      clearPendingSave();
      showMessage('Deze exacte immutable conceptversie is al opgeslagen.', 'success');
      finishComposerProgress(progressToast, 'De bestaande conceptversie is geselecteerd.');
      return;
    }
    const pendingSave = reusablePendingSave(draft);
    const actionKeyValue = pendingSave?.actionKey || actionKey('version');
    const startedAtMs = pendingSave?.startedAtMs || Date.now();
    const payload = {
      action: 'create_version',
      relationshipType: routeContext.relationshipType,
      relationshipId: routeContext.relationshipId,
      offerId: state.currentOfferId || null,
      title,
      demoJourneyId: state.selectedDemoId || null,
      factoryProjectId: state.selectedFactoryProjectId || null,
      paymentChoice: state.paymentChoice,
      offerPurpose: state.offerPurpose,
      discountPercentage: state.discountPercentage,
      selections: selectionsFromState(state, state.data.actor),
      documents,
      changeReason: elements.changeReason.value.trim() || null,
      actionKey: actionKeyValue,
    };
    rememberPendingSave({ actionKey: actionKeyValue, startedAtMs, draft });
    progressToast?.update('Conceptversie wordt veilig opgeslagen…', 'info', { loading: true, persistent: true });
    const saved = await createVersionWithRecovery(payload, { ...draft, minimumCreatedAtMs: startedAtMs - 10000 }, savedRevision, progressToast);
    clearPendingSave();
    showMessage(saved.recovered ? `Conceptversie ${saved.versionNumber} is opgeslagen; de vertraagde serverbevestiging is hersteld.` : `Conceptversie ${saved.versionNumber} is immutable opgeslagen.`, 'success');
    finishComposerProgress(progressToast, `Conceptversie ${saved.versionNumber} is opgeslagen.`);
  } catch (error) {
    showMessage(error.message, 'error');
    finishComposerProgress(progressToast, error.message || 'Conceptversie kon niet worden opgeslagen.', 'error');
  }
  finally { state.savePending = false; elements.saveDraft.disabled = false; renderStatus(); renderReadiness(); }
}

async function ensureCurrentSnapshot() {
  window.clearTimeout(calculationTimer);
  calculationTimer = 0;
  if (state.calculationPromise) await state.calculationPromise;
  if (!state.snapshot || state.calculatedPricingRevision !== state.pricingRevision) return calculate();
  return state.snapshot;
}

async function createVersionWithRecovery(payload, draft, savedRevision, progressToast) {
  try {
    const result = await request('POST', payload);
    return confirmSavedVersion(result, savedRevision);
  } catch (firstError) {
    if (!isAmbiguousSaveError(firstError)) throw firstError;
    progressToast?.update('De serverbevestiging duurt langer; de opslag wordt gecontroleerd…', 'info', { loading: true, persistent: true });
    const firstRecovery = await reconcileSavedDraft(draft, savedRevision, [0, 700, 1600]);
    if (firstRecovery) return firstRecovery;
    progressToast?.update('Dezelfde opslag wordt één keer veilig hervat…', 'info', { loading: true, persistent: true });
    try {
      const retried = await request('POST', payload);
      return confirmSavedVersion(retried, savedRevision);
    } catch (retryError) {
      if (!isAmbiguousSaveError(retryError)) throw retryError;
      const finalRecovery = await reconcileSavedDraft(draft, savedRevision, [500, 1500, 3000]);
      if (finalRecovery) return finalRecovery;
      throw userProblem('De serverbevestiging duurt nog te lang. Je invoer is behouden. Wacht even en klik daarna één keer opnieuw op Concept opslaan; dezelfde opslagreferentie wordt veilig hergebruikt.');
    }
  }
}

async function confirmSavedVersion(result, savedRevision) {
  state.currentOfferId = result.offer.offerId;
  state.currentVersionId = result.offer.offerVersionId;
  state.currentVersionStatus = result.offer.status;
  await reloadContext();
  const version = currentVersion();
  if (!version || version.snapshot_checksum_sha256 !== result.offer.snapshotChecksum) throw userProblem('De opgeslagen versie kon niet betrouwbaar worden bevestigd. De invoer is behouden.');
  applyPersistedVersion({ offer: state.data.history.find((offer) => offer.id === state.currentOfferId), version }, savedRevision);
  return { versionNumber: result.offer.versionNumber, recovered: Boolean(result.offer.duplicate) };
}

async function reconcileSavedDraft(draft, savedRevision, delays) {
  for (const waitMs of delays) {
    if (waitMs) await delay(waitMs);
    try {
      const data = await request('GET', null, { relationshipType: routeContext.relationshipType, relationshipId: routeContext.relationshipId });
      state.data = data;
      const match = findMatchingDraftVersion(data.history, draft);
      if (match) {
        applyPersistedVersion(match, savedRevision);
        renderHistory(); renderStatus(); renderReadiness();
        return { versionNumber: match.version.version_number, recovered: true };
      }
    } catch { /* Een volgende controle of de veilige retry blijft beschikbaar. */ }
  }
  return null;
}

function applyPersistedVersion(match, savedRevision) {
  if (!match?.offer || !match?.version) return;
  state.currentOfferId = match.offer.id;
  state.currentVersionId = match.version.id;
  state.currentVersionStatus = match.version.status;
  state.dirty = state.editRevision !== savedRevision;
  rememberOfferInUrl(match.offer.id);
}

function pendingSaveKey() { return `mws:offer-composer:pending-save:${routeContext.relationshipType}:${routeContext.relationshipId}`; }
function rememberPendingSave(value) {
  try { window.sessionStorage.setItem(pendingSaveKey(), JSON.stringify({ ...value, fingerprint: draftFingerprint(value.draft) })); } catch { /* Geheugenherstel is aanvullend; server-idempotentie blijft leidend. */ }
}
function reusablePendingSave(draft) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(pendingSaveKey()) || 'null');
    if (!value?.actionKey || value.fingerprint !== draftFingerprint(draft) || Date.now() - Number(value.startedAtMs || 0) > 30 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}
function clearPendingSave() { try { window.sessionStorage.removeItem(pendingSaveKey()); } catch { /* no-op */ } }
function rememberOfferInUrl(offerId) {
  if (!offerId || routeContext.offerId === offerId) return;
  routeContext.offerId = offerId;
  const url = new URL(window.location.href);
  url.searchParams.set('offerId', offerId);
  window.history.replaceState(window.history.state, '', url);
}
function isAmbiguousSaveError(error) { return !Number(error?.status) || Number(error.status) >= 500; }
function userProblem(message) { return Object.assign(new Error(message), { status: 400, code: 'COMPOSER_INPUT' }); }
function delay(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

async function transition(targetStatus) {
  if (!state.currentVersionId) return;
  const reason = elements.changeReason.value.trim();
  if (targetStatus === 'revoked' && reason.length < 8) return showMessage('Intrekken vereist een duidelijke reden van minimaal 8 tekens.', 'warning');
  const progressToast = startComposerProgress(targetStatus === 'ready_for_review' ? 'Versie wordt gereedgemaakt voor controle…' : 'Versie wordt veilig ingetrokken…');
  try {
    const result = await request('POST', { action: 'transition', offerVersionId: state.currentVersionId, targetStatus, reason: reason || null, actionKey: actionKey(targetStatus) });
    state.currentVersionStatus = result.offer.status;
    state.dirty = false;
    await reloadContext();
    showMessage(targetStatus === 'ready_for_review' ? 'Versie is gereed voor interne controle.' : 'Versie is ingetrokken en blijft als bewijs bestaan.', 'success');
    finishComposerProgress(progressToast, targetStatus === 'ready_for_review' ? 'Versie is gereed voor controle.' : 'Versie is ingetrokken.');
  } catch (error) {
    showMessage(error.message, 'error');
    finishComposerProgress(progressToast, error.message || 'De status kon niet worden bijgewerkt.', 'error');
  }
}

async function reloadContext() {
  state.data = await request('GET', null, { relationshipType: routeContext.relationshipType, relationshipId: routeContext.relationshipId });
  const version = currentVersion();
  if (version) state.currentVersionStatus = version.status;
  renderHistory(); renderStatus(); renderReadiness();
}

async function openPreview() {
  if (!state.currentVersionId || elements.openPreview.disabled) return;
  elements.openPreview.disabled = true;
  const progressToast = startComposerProgress('Exact mailvoorbeeld wordt opgebouwd…');
  try {
    const result = await request('POST', { action: 'preview_mail', offerVersionId: state.currentVersionId, actionKey: actionKey('preview') });
    state.lastPreview = result.preview;
    elements.previewSubject.textContent = result.preview.subject;
    elements.previewFrame.srcdoc = result.preview.html;
    elements.manualMailText.value = `${result.manualFallback.subject}\n\n${result.manualFallback.text}`;
    elements.mailPreview.showModal();
    await reloadContext();
    showMessage('Het exacte servervoorbeeld is gecontroleerd en in de audittrail vastgelegd.', 'success');
    finishComposerProgress(progressToast, 'Mailvoorbeeld is klaar.');
  } catch (error) {
    showMessage(error.message, 'error');
    finishComposerProgress(progressToast, error.message || 'Mailvoorbeeld kon niet worden opgebouwd.', 'error');
    elements.composerMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  finally { renderPreviewAvailability(); }
}

async function sendTestMail() {
  if (elements.testMail.disabled) return;
  elements.testMail.disabled = true;
  const progressToast = startComposerProgress('Testmail wordt gecontroleerd en verzonden…');
  try {
    const result = await request('POST', { action: 'test_mail', offerVersionId: state.currentVersionId, actionKey: actionKey('test-mail') });
    await reloadContext();
    showMessage(`TEST-mail is uitsluitend verzonden naar ${result.recipient}.`, 'success');
    finishComposerProgress(progressToast, 'Testmail is succesvol verzonden.');
  } catch (error) {
    showMessage(error.message, 'error');
    finishComposerProgress(progressToast, error.message || 'Testmail kon niet worden verzonden.', 'error');
  }
  finally { renderPreviewAvailability(); }
}

function openDefinitiveSendDialog() {
  if (elements.definitiveSend.disabled || state.definitiveRequestPending) return;
  const demo = (state.data.demos || []).find((item) => item.id === state.selectedDemoId) || {};
  const details = definitiveConfirmationDetails({ relationship: { ...state.data.relationship, email: effectiveRecipientEmail() }, demo, snapshot: state.snapshot });
  elements.confirmCompany.textContent = details.companyName;
  elements.confirmRecipient.textContent = details.maskedEmail;
  elements.confirmDemo.textContent = details.demoName;
  elements.confirmWebsite.textContent = details.websiteName;
  elements.confirmCare.textContent = details.careName;
  elements.confirmOnceBeforeDiscount.textContent = money(details.oneTimeBeforeDiscountExVatCents);
  elements.confirmDiscountLabel.textContent = `Korting (${details.discountPercentage}%)`;
  elements.confirmDiscount.textContent = `− ${money(details.discountExVatCents)}`;
  elements.confirmOnce.textContent = money(details.oneTimeExVatCents);
  elements.confirmMonthly.textContent = money(details.recurringExVatCents, { monthly: true });
  elements.confirmPaymentLabel.textContent = details.paymentLabel;
  elements.confirmPayment.textContent = money(details.dueNowExVatCents);
  elements.confirmValidUntil.textContent = formatDateOnly(details.validUntil);
  elements.definitiveSendCheck.checked = false;
  elements.definitiveSendResult.textContent = '';
  elements.confirmDefinitiveSend.textContent = 'Definitief verzenden';
  state.definitiveRequestLocked = false;
  state.definitiveActionKey = actionKey('definitive-send');
  state.definitiveTrigger = elements.definitiveSend;
  updateDefinitiveConfirmation();
  elements.definitiveSendDialog.showModal();
  elements.definitiveSendCheck.focus();
}

function closeDefinitiveSendDialog() {
  if (state.definitiveRequestPending || !elements.definitiveSendDialog.open) return;
  elements.definitiveSendDialog.close();
  const trigger = state.definitiveTrigger;
  state.definitiveTrigger = null;
  trigger?.focus();
}

function updateDefinitiveConfirmation() {
  elements.confirmDefinitiveSend.disabled = !elements.definitiveSendCheck.checked || state.definitiveRequestPending || state.definitiveRequestLocked;
}

function trapDefinitiveDialogFocus(event) {
  trapDialogFocus(event, elements.definitiveSendDialog, state.definitiveRequestPending);
}

function trapDialogFocus(event, dialog, pending) {
  if (event.key !== 'Tab' || pending) return;
  const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')].filter((item) => !item.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function openRevokeInterestDialog() {
  if (elements.revokeInterest.disabled || state.revokeInterestPending) return;
  const version = currentVersion();
  const token = state.offerPurpose === 'definitive_offer'
    ? (version?.signingAccessTokens || []).find((item) => !item.started_at && !item.revoked_at && new Date(item.expires_at).getTime() > Date.now())
    : (version?.interestTokens || []).find((item) => !item.confirmed_at && !item.revoked_at && new Date(item.expires_at).getTime() > Date.now());
  const dispatch = (version?.dispatches || []).find((item) => item.dispatch_kind === 'definitive' && item.status === 'sent');
  if (!token) return renderPreviewAvailability();
  const details = definitiveConfirmationDetails({ relationship: state.data.relationship, demo: {}, snapshot: state.snapshot || version.snapshot });
  elements.revokeCompany.textContent = state.data.relationship.companyName || state.data.relationship.contactName || '—';
  elements.revokeRecipient.textContent = details.maskedEmail;
  elements.revokeVersionNumber.textContent = `Versie ${version.version_number}`;
  elements.revokeDispatchDate.textContent = formatDate(dispatch?.completed_at || dispatch?.reserved_at);
  elements.revokeExpiry.textContent = formatDate(token.expires_at);
  elements.revokeConfirmed.textContent = 'Nee';
  elements.revokeInterestReason.value = '';
  elements.revokeInterestResult.textContent = '';
  state.revokeInterestTrigger = elements.revokeInterest;
  updateRevokeInterestConfirmation();
  elements.revokeInterestDialog.showModal();
  elements.revokeInterestReason.focus();
}

function closeRevokeInterestDialog() {
  if (state.revokeInterestPending || !elements.revokeInterestDialog.open) return;
  elements.revokeInterestDialog.close();
  const trigger = state.revokeInterestTrigger;
  state.revokeInterestTrigger = null;
  trigger?.focus();
}

function updateRevokeInterestConfirmation() {
  const length = elements.revokeInterestReason.value.trim().length;
  elements.confirmRevokeInterest.disabled = state.revokeInterestPending || length < 8 || length > 500;
}

async function revokeInterestAccess() {
  const reason = elements.revokeInterestReason.value.trim();
  if (state.revokeInterestPending || reason.length < 8 || reason.length > 500) return;
  state.revokeInterestPending = true;
  const progressToast = startComposerProgress('Actieve klantlink wordt veilig ingetrokken…');
  elements.revokeInterestDialog.setAttribute('aria-busy', 'true');
  elements.confirmRevokeInterest.disabled = true;
  elements.cancelRevokeInterest.disabled = true;
  elements.closeRevokeInterest.disabled = true;
  elements.revokeInterestResult.textContent = 'De server trekt de actieve link in en redigeert beveiligde maillogs…';
  try {
    const result = await request('POST', {
      action: 'revoke_interest',
      offerVersionId: state.currentVersionId,
      reason,
      actionKey: actionKey('revoke-interest'),
      redactionActionKey: actionKey('redact-sensitive-mail'),
    });
    await reloadContext();
    elements.revokeInterestResult.textContent = `${result.result.revokedCount || 0} link(s) ingetrokken; ${result.redaction.redactedCount || 0} beveiligde maillog(s) geredigeerd.`;
    elements.revokeInterestDialog.close();
    state.revokeInterestTrigger?.focus();
    state.revokeInterestTrigger = null;
    showMessage('De actieve interesselink is ingetrokken en gevoelige mailloginhoud is veilig verwijderd.', 'success');
    finishComposerProgress(progressToast, 'De actieve klantlink is ingetrokken.');
  } catch (error) {
    try { await reloadContext(); } catch { /* De oorspronkelijke fout blijft leidend. */ }
    elements.revokeInterestResult.textContent = error.message;
    showMessage(error.message, 'error');
    finishComposerProgress(progressToast, error.message || 'De actieve klantlink kon niet worden ingetrokken.', 'error');
  } finally {
    state.revokeInterestPending = false;
    elements.revokeInterestDialog.removeAttribute('aria-busy');
    elements.cancelRevokeInterest.disabled = false;
    elements.closeRevokeInterest.disabled = false;
    updateRevokeInterestConfirmation();
    renderPreviewAvailability();
  }
}

async function sendDefinitiveMail() {
  if (state.definitiveRequestPending || state.definitiveRequestLocked || !elements.definitiveSendCheck.checked || elements.confirmDefinitiveSend.disabled) return;
  state.definitiveRequestPending = true;
  const progressToast = startComposerProgress('Definitieve verzending wordt veilig verwerkt…');
  elements.definitiveSendDialog.setAttribute('aria-busy', 'true');
  elements.confirmDefinitiveSend.disabled = true;
  elements.cancelDefinitiveSend.disabled = true;
  elements.closeDefinitiveSend.disabled = true;
  elements.confirmDefinitiveSend.textContent = 'Veilig verzenden…';
  elements.definitiveSendResult.textContent = 'De server controleert de actuele status en verstuurt maximaal één e-mail…';
  try {
    await request('POST', { action: 'definitive_send', offerVersionId: state.currentVersionId, actionKey: state.definitiveActionKey, recipientEmail: effectiveRecipientEmail() });
    await reloadContext();
    elements.definitiveSendResult.textContent = 'Verzending bevestigd.';
    elements.definitiveSendDialog.close();
    state.definitiveTrigger?.focus();
    state.definitiveTrigger = null;
    showMessage(state.offerPurpose === 'definitive_offer' ? 'De definitieve offerte is verzonden. De sale wordt pas gewonnen na de Signhost-handtekening.' : 'Het persoonlijke voorstel is verzonden. Interesse is nog geen contract, betaling of onboarding.', 'success');
    finishComposerProgress(progressToast, state.offerPurpose === 'definitive_offer' ? 'Definitieve offerte is verzonden.' : 'Persoonlijk voorstel is verzonden.');
  } catch (error) {
    try { await reloadContext(); } catch { /* De oorspronkelijke fout blijft leidend. */ }
    const hasDispatch = Boolean(currentVersion()?.dispatches?.some((dispatch) => dispatch.dispatch_kind === 'definitive'));
    const ambiguous = error.status >= 500 || error.code === 'DISPATCH_ALREADY_RESERVED' || hasDispatch;
    state.definitiveRequestLocked = ambiguous;
    elements.definitiveSendResult.textContent = ambiguous
      ? 'De verzendstatus is opnieuw gecontroleerd. Uit veiligheid wordt deze actie niet blind herhaald; controleer eerst de auditstatus.'
      : error.message;
    showMessage(error.message, 'error');
    finishComposerProgress(progressToast, error.message || 'De definitieve verzending kon niet worden voltooid.', 'error');
  } finally {
    state.definitiveRequestPending = false;
    elements.definitiveSendDialog.removeAttribute('aria-busy');
    elements.cancelDefinitiveSend.disabled = false;
    elements.closeDefinitiveSend.disabled = false;
    elements.confirmDefinitiveSend.textContent = state.definitiveRequestLocked ? 'Auditcontrole vereist' : 'Definitief verzenden';
    updateDefinitiveConfirmation();
    renderPreviewAvailability();
  }
}

async function copyManualMail() {
  if (!elements.manualMailText.value) return;
  try { await navigator.clipboard.writeText(elements.manualMailText.value); showMessage('De handmatige mailtekst is gekopieerd.', 'success'); }
  catch { elements.manualMailText.select(); showMessage('Kopiëren is geblokkeerd; de tekst is geselecteerd.', 'warning'); }
}

function activeDocuments() {
  const recurring = Number(state.snapshot?.recurringExVatCents || 0) > 0;
  return (state.data?.documents || []).map((document) => ({ ...document, required: document.required || (document.requiredWhenRecurring && recurring) }));
}

function selectedIds() { return [state.websiteProductId, state.careProductId, ...state.addOnIds].filter(Boolean); }
function effectiveRecipientEmail() { return String(state.recipientEmail || '').trim().toLowerCase(); }
function currentVersion() { return state.data?.history?.flatMap((offer) => offer.versions || []).find((version) => version.id === state.currentVersionId); }
function productChoice(product, name, selected) { const once = product.components.find((item) => item.type === 'one_time'); const recurring = product.components.find((item) => item.type === 'recurring'); return `<label class="choice-card"><input type="radio" name="${name}" value="${product.id}" ${selected === product.id ? 'checked' : ''}/><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.description)}</span><small>${escapeHtml(classificationLabel(product.classification))}</small><span class="choice-price">${once ? money(once.amountExVatCents ?? once.startingAmountExVatCents) : money(recurring?.amountExVatCents ?? recurring?.startingAmountExVatCents, { monthly: true })} excl. btw${product.fixedDepositExVatCents ? ` · aanbetaling ${money(product.fixedDepositExVatCents)}` : ''}</span></label>`; }
function choiceNone(name, label, checked) { return `<label class="choice-card"><input type="radio" name="${name}" value="" ${checked ? 'checked' : ''}/><strong>${label}</strong><span>Geen keuze voor deze categorie.</span><span class="choice-price">${money(0)}</span></label>`; }
function componentTag(component) { const value = component.amountExVatCents ?? component.startingAmountExVatCents; return `<span>${component.type === 'recurring' ? 'Per maand' : 'Eenmalig'} · ${component.amountExVatCents == null ? 'vanaf ' : ''}${money(value, { monthly: component.type === 'recurring' })}</span>`; }
function productPrice(product) { if (product.classification === 'on_request') return 'Op aanvraag'; return product.components.map((component) => `${component.amountExVatCents == null ? 'vanaf ' : ''}${money(component.amountExVatCents ?? component.startingAmountExVatCents, { monthly: component.type === 'recurring' })}`).join(' + '); }
function classificationLabel(value) { return ({ fixed: 'Vaste prijs', starting_at: 'Vanafprijs', on_request: 'Op aanvraag', custom: 'Maatwerk bevestigd' })[value] || value; }
function categoryLabel(value) { return ({ branding: 'Branding', domain_email: 'Domein en e-mail', telephony: 'Telefonie', website_expansion: 'Website-uitbreiding', marketing: 'Marketing', content: 'Content', care: 'Onderhoud', custom: 'Maatwerk' })[value] || value; }
function centsInput(value) { return `${Math.floor(Number(value) / 100)},${String(Number(value) % 100).padStart(2, '0')}`; }
function setSequence(element, complete, blocked) { element.classList.toggle('complete', complete); element.classList.toggle('blocked', !complete && blocked); element.classList.toggle('active', !complete && !blocked); }
function formatDate(value) { const date = new Date(value || ''); return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleString('nl-NL'); }
function formatDateOnly(value) { const date = new Date(`${value || ''}T12:00:00Z`); return Number.isNaN(date.getTime()) ? value || '—' : new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date); }
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
  if (!response.ok || data.success === false) throw Object.assign(new Error(data.error || `De serveractie mislukte (${response.status}).`), { status: response.status, code: data.code || 'REQUEST_FAILED' });
  return data;
}

function showMessage(message, type = 'warning') { elements.composerMessage.textContent = message; elements.composerMessage.className = `composer-alert ${type}`; elements.composerMessage.hidden = false; }
function fatal(message) { showMessage(message, 'error'); elements.composerApp.setAttribute('aria-busy', 'false'); elements.composerApp.querySelectorAll('button,input,select,textarea').forEach((item) => { item.disabled = true; }); }

init();
