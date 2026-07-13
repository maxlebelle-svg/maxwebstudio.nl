const { getCompanySettings } = require("../../company-settings");
const { TEMPLATE_KEY, TEMPLATE_VERSION } = require("./command");

function renderJourneyMail(command = {}) {
  if (command.templateKey !== TEMPLATE_KEY || Number(command.templateVersion) !== TEMPLATE_VERSION) templateError("template_not_found");
  const data = command.templateData || {};
  const company = getCompanySettings();
  const name = text(data.firstName) || "daar";
  const project = text(data.projectLabel) || "Uw websiteproject";
  const progress = percentage(data.percentage);
  const current = text(data.currentStep) || "Uw project wordt bijgewerkt";
  const next = text(data.nextStep);
  const contact = text(data.contactName) || "Team Max Webstudio";
  const actionUrl = escapeAttribute(command.actionUrl);
  const subjectLabel = text(command.subjectData?.label) || project;
  const subject = `[TEST] Projectupdate — ${subjectLabel}`;
  const previewText = `[TEST] ${project}: ${progress}% voltooid. ${current}`.slice(0, 180);
  const nextHtml = next ? `<p style="margin:0 0 18px;color:#c9d7e8;font-size:15px;line-height:1.65;"><strong style="color:#fff;">Hierna:</strong> ${escapeHtml(next)}</p>` : "";
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#061626;color:#fff;font-family:Inter,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061626;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#102a3d;border:1px solid rgba(68,180,255,.28);border-radius:22px;overflow:hidden;"><tr><td style="padding:12px 28px;background:#fbbf24;color:#111827;font-size:13px;font-weight:900;text-align:center;letter-spacing:.08em;">TESTMAIL — GEEN PRODUCTIEBERICHT</td></tr><tr><td style="padding:30px 28px 18px;"><div style="color:#27c7ff;font-size:13px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;">${escapeHtml(company.companyName)}</div><h1 style="margin:14px 0 10px;font-size:30px;line-height:1.15;color:#fff;">Uw projectupdate</h1><p style="margin:0;color:#c9d7e8;font-size:16px;line-height:1.7;">Hallo ${escapeHtml(name)}, dit is een veilige interne testweergave voor <strong style="color:#fff;">${escapeHtml(project)}</strong>.</p></td></tr><tr><td style="padding:0 28px 26px;"><p style="margin:0 0 8px;color:#fff;font-size:16px;font-weight:800;">${progress}% voltooid</p><div style="height:10px;border-radius:999px;background:#244055;overflow:hidden;margin-bottom:22px;"><div style="height:10px;width:${progress}%;background:#32d583;border-radius:999px;"></div></div><p style="margin:0 0 18px;color:#c9d7e8;font-size:15px;line-height:1.65;"><strong style="color:#fff;">Nu bezig:</strong> ${escapeHtml(current)}</p>${nextHtml}<p style="margin:22px 0;"><a href="${actionUrl}" style="display:inline-block;padding:13px 18px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:900;">Open veilige testpagina</a></p><div style="padding:16px;border:1px solid rgba(147,197,253,.18);border-radius:14px;background:rgba(255,255,255,.04);"><span style="display:block;color:#8ab4d8;font-size:12px;font-weight:800;">Uw contact</span><strong style="display:block;margin-top:4px;color:#fff;">${escapeHtml(contact)}</strong><span style="display:block;margin-top:3px;color:#c9d7e8;font-size:13px;">${escapeHtml(company.primaryEmail)} · ${escapeHtml(company.phoneDisplay)}</span></div></td></tr><tr><td style="padding:20px 28px;background:#0a2031;color:#9fb1c2;font-size:12px;line-height:1.6;">${escapeHtml(company.companyName)} · ${escapeHtml(company.websiteUrl)}<br>Dit bericht is uitsluitend gegenereerd als interne journey-automationtest.</td></tr></table></td></tr></table></body></html>`;
  const plain = [`[TEST] ${company.companyName}`, "", `Hallo ${name},`, "", `Project: ${project}`, `Voortgang: ${progress}%`, `Nu bezig: ${current}`, next ? `Hierna: ${next}` : "", "", `Open veilige testpagina: ${command.actionUrl}`, "", `Uw contact: ${contact}`, `${company.primaryEmail} · ${company.phoneDisplay}`, "", "Dit bericht is uitsluitend gegenereerd als interne journey-automationtest."].filter((line) => line !== "").join("\n");
  return { templateKey: TEMPLATE_KEY, templateVersion: TEMPLATE_VERSION, subject, previewText, html, text: plain };
}

function escapeHtml(value) { return text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function percentage(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0; }
function text(value) { return String(value || "").trim(); }
function templateError(code) { const error = new Error("Journey mailtemplate ontbreekt."); error.code = code; error.retryable = false; throw error; }

module.exports = { renderJourneyMail, _private: { escapeHtml, percentage } };
