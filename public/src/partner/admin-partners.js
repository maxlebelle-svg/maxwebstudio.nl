const endpoint = "/.netlify/functions/admin-partner-onboarding";
const state = { data: null };
const byId = (id) => document.getElementById(id);

function token() {
  for (const key of ["maxwebstudioSupabaseAuthSession", "mws_admin_supabase_session"]) {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); if (value?.access_token || value?.accessToken) return value.access_token || value.accessToken; } catch { /* signed out */ }
  }
  return "";
}
async function request(query = "", body) {
  const response = await fetch(`${endpoint}${query}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Partnerbeheer kon niet worden geladen.");
  return data;
}
function label(value) { return ({ invited:"Uitgenodigd",account_activated:"Account geactiveerd",in_progress:"Bezig",assessment_failed:"Toets onvoldoende",awaiting_documents:"Wacht op afronding",active:"Actief",revoked:"Ingetrokken" })[value] || value || "Onbekend"; }
function formatDate(value) { return value ? new Intl.DateTimeFormat("nl-NL", { dateStyle:"medium" }).format(new Date(value)) : "–"; }

function render() {
  const data = state.data;
  const filter = byId("statusFilter").value;
  const profiles = new Map(data.profiles.map((profile) => [profile.id, profile]));
  const onboardings = new Map(data.onboardings.map((onboarding) => [onboarding.partner_profile_id, onboarding]));
  const certificates = new Map(data.certificates.map((certificate) => [certificate.partner_profile_id, certificate]));
  const partners = data.partnerProfiles.filter((partner) => !filter || onboardings.get(partner.id)?.status === filter);
  byId("partnerCount").textContent = String(data.partnerProfiles.length);
  byId("notice").hidden = partners.length > 0;
  byId("notice").textContent = data.partnerProfiles.length ? "Geen partners binnen dit filter." : "Er zijn nog geen partners zichtbaar.";
  byId("partners").replaceChildren(...partners.map((partner) => {
    const profile = profiles.get(partner.profile_id) || {};
    const onboarding = onboardings.get(partner.id) || {};
    const certificate = certificates.get(partner.id);
    const node = document.createElement("article"); node.className = "partner";
    const identity = document.createElement("div"); identity.innerHTML = `<h3>${escapeHtml(profile.name || "Naam ontbreekt")}</h3><p>${escapeHtml(profile.email || "")}</p>`;
    const progress = cell("Status", label(onboarding.status), `badge ${onboarding.status || ""}`);
    const current = cell("Huidige stap", onboarding.current_step || "–");
    const cert = document.createElement("div"); cert.className = "cell";
    cert.innerHTML = certificate ? `<span>Certificaat</span><strong>${escapeHtml(certificate.certificate_id)}</strong><span class="badge ${certificate.status}">${label(certificate.status)}</span>` : "<span>Certificaat</span><strong>Niet uitgegeven</strong>";
    if (certificate?.status === "valid") { const button = document.createElement("button"); button.className="danger"; button.textContent="Intrekken"; button.addEventListener("click", () => revoke(certificate.certificate_id)); cert.append(button); }
    node.append(identity, progress, current, cert); return node;
  }));
}
function cell(caption, value, className="") { const node=document.createElement("div"); node.className="cell"; const title=document.createElement("span"); title.textContent=caption; const strong=document.createElement("strong"); strong.textContent=value; if(className) strong.className=className; node.append(title,strong); return node; }
function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
async function revoke(certificateId) { const reason=prompt("Geef een concrete reden voor intrekking (minimaal 5 tekens):"); if(!reason) return; try { state.data=await request("",{action:"revoke_certificate",certificateId,reason,idempotencyKey:crypto.randomUUID()}); render(); } catch(error){ alert(error.message); } }

byId("statusFilter").addEventListener("change", render);
byId("verifyForm").addEventListener("submit", async (event) => { event.preventDefault(); const output=byId("verification"); output.hidden=false; output.className="result"; output.textContent="Controleren…"; try { const data=await request(`?certificateId=${encodeURIComponent(byId("certificateId").value.trim())}`); const certificate=data.certificates[0]; if(!certificate) throw new Error("Geen toegankelijk certificaat met dit ID gevonden."); output.innerHTML=`<strong>${escapeHtml(certificate.status === "valid" ? "Geldig certificaat" : `Status: ${label(certificate.status)}`)}</strong><p>${escapeHtml(certificate.partner_name)} · ${escapeHtml(certificate.certification_type)}<br>Uitgegeven ${formatDate(certificate.issued_at)} · geldig tot ${formatDate(certificate.expires_at)}<br>${escapeHtml(certificate.training_version_code)}</p><small>${escapeHtml(certificate.disclaimer)}</small>`; if(certificate.status!=="valid") output.classList.add("invalid"); } catch(error){ output.className="result invalid"; output.textContent=error.message; } });

async function initialize() {
  try { state.data = await request(); render(); }
  catch (error) { byId("notice").textContent = error.message; }
}
initialize();
