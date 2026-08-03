import { getAdminAccessToken } from './services/adminAuthBridgeService.js';

const endpoint = '/api/admin-commercial-offer-signing';
const params = new URLSearchParams(window.location.search);
const relationshipType = String(params.get('relationshipType') || '').trim().toLowerCase();
const relationshipId = String(params.get('relationshipId') || '').trim();
const offerId = String(params.get('offerId') || '').trim();
let state = null;
let pending = false;
let pollTimer = 0;

const card = buildCard();
const button = card.querySelector('[data-phase2-action]');
const sequence = card.querySelector('[data-phase2-sequence]');
const status = card.querySelector('[data-phase2-status]');
const details = card.querySelector('[data-phase2-details]');

button.addEventListener('click', requestSignature);
if (relationshipType && relationshipId) {
  refresh().finally(scheduleRefresh);
} else {
  renderMessage('Selecteer eerst een lead of klant.', true);
}

function buildCard() {
  const element = document.createElement('section');
  element.className = 'send-sequence';
  element.setAttribute('aria-labelledby', 'phase2-title');
  element.innerHTML = `
    <h2 id="phase2-title">Ondertekening en overdracht</h2>
    <ol>
      <li data-phase2-sequence class="blocked"><span>4</span><div><strong>Definitief ondertekenen</strong><small>Na bevestigde interesse</small></div></li>
    </ol>
    <button class="button primary" type="button" data-phase2-action disabled>Naar Signhost sturen</button>
    <p data-phase2-status role="status" aria-live="polite">Ondertekenstatus laden…</p>
    <p data-phase2-details>Na ondertekening worden klantstatus, factuur, betaallink en productieoverdracht automatisch klaargezet.</p>`;
  const sidebar = document.querySelector('.composer-sidebar');
  const mailSequence = sidebar?.querySelector('.send-sequence');
  if (mailSequence) mailSequence.insertAdjacentElement('afterend', element);
  else sidebar?.append(element);
  return element;
}

async function refresh() {
  try {
    state = await request('GET');
    render();
  } catch (error) {
    renderMessage(error.message || 'De ondertekenstatus kon niet worden geladen.', true);
  }
}

function render() {
  button.disabled = true;
  sequence.classList.remove('complete');
  sequence.classList.add('blocked');
  if (!state?.enabled) return renderMessage('De automatische onderteken- en betaalroute is in deze omgeving nog niet vrijgegeven.', true);
  if (!state.offer || !state.version) return renderMessage('Sla eerst een definitieve voorstelversie op.', true);
  const signing = state.signing;
  const fulfilment = state.fulfilment;
  if (fulfilment?.status === 'payment_pending') return complete('Ondertekend · factuur en Mollie-betaallink staan klaar · overdracht voorbereid.');
  if (['ready_for_production', 'completed'].includes(fulfilment?.status)) return complete('Betaald · opdracht is vrijgegeven voor productie.');
  if (fulfilment?.status === 'failed') return renderMessage(`Ondertekend · automatische opvolging vraagt aandacht${fulfilment.last_error_code ? ` (${fulfilment.last_error_code})` : ''}.`, true);
  if (signing) {
    const text = {
      creating: 'Ondertekenverzoek wordt voorbereid…', waiting_for_signer: 'Verstuurd · wacht op de handtekening van de klant.',
      signed_pending_processing: 'Handtekening ontvangen · klant, factuur en overdracht worden klaargezet…', completed: 'Ondertekening is verwerkt.',
      rejected: 'De klant heeft het ondertekenverzoek geweigerd.', expired: 'Het ondertekenverzoek is verlopen.',
      cancelled: 'Het ondertekenverzoek is geannuleerd.', failed: 'Het ondertekenverzoek vraagt aandacht.',
    }[signing.status] || 'Ondertekenstatus wordt gecontroleerd.';
    return ['completed', 'signed_pending_processing'].includes(signing.status) ? complete(text) : renderMessage(text, signing.status === 'failed');
  }
  if (!state.interestConfirmed) return renderMessage('Beschikbaar zodra de klant “Ik wil verder praten” heeft bevestigd.', true);
  if (!['sent', 'viewed'].includes(state.version.status)) return renderMessage('De actuele offerteversie is nog niet definitief verzonden.', true);
  button.disabled = pending;
  renderMessage(`Klaar om versie ${state.version.version_number} definitief ter ondertekening te sturen.`, false);
}

async function requestSignature() {
  if (button.disabled || pending || !state?.version) return;
  const company = state.relationship?.companyName || 'deze klant';
  const email = state.relationship?.email || '';
  if (!window.confirm(`Stuur versie ${state.version.version_number} nu definitief naar ${email} voor ondertekening namens ${company}?`)) return;
  pending = true;
  button.disabled = true;
  renderMessage('Ondertekenverzoek wordt veilig voorbereid…', false);
  const toast = typeof window.showToast === 'function' ? window.showToast('Offerte naar Signhost sturen…', 'info', { loading: true, persistent: true }) : null;
  try {
    await request('POST', {
      action: 'request_signature', offerVersionId: state.version.id,
      signerName: state.relationship?.contactName || company, signerEmail: email,
      actionKey: `commercial-signature:${state.version.id}:${crypto.randomUUID()}`,
    });
    await refresh();
    toast?.update('De offerte is verstuurd voor ondertekening.', 'success', { duration: 4500 });
  } catch (error) {
    renderMessage(error.message || 'De offerte kon niet voor ondertekening worden verstuurd.', true);
    toast?.update(error.message || 'Ondertekenverzoek mislukt.', 'error', { duration: 7000 });
  } finally {
    pending = false;
    render();
  }
}

async function request(method, body) {
  const token = await getAdminAccessToken();
  const query = new URLSearchParams({ relationshipType, relationshipId });
  if (offerId) query.set('offerId', offerId);
  const response = await fetch(`${endpoint}?${query}`, {
    method, cache: 'no-store', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'De ondertekenactie is niet gelukt.');
  return data;
}

function complete(message) {
  sequence.classList.remove('blocked');
  sequence.classList.add('complete');
  renderMessage(message, false);
}
function renderMessage(message, blocked) {
  status.textContent = message;
  if (blocked) sequence.classList.add('blocked');
}
function scheduleRefresh() {
  window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(async () => { await refresh(); scheduleRefresh(); }, 15000);
}
