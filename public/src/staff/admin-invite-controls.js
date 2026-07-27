import { getAdminAccessToken } from "../services/adminAuthBridgeService.js";

const endpoint = "/.netlify/functions/admin-invite-user";
const form = document.getElementById("invite-user-form");
const submitButton = document.getElementById("invite-user-submit");
const resetButton = document.getElementById("invite-user-reset-link");
const message = document.getElementById("invite-user-message");
let submitting = false;

function setMessage(text, type = "") {
  if (!message) return;
  message.textContent = text;
  message.className = `admin-form-message ${type}`.trim();
}

function setSubmitting(button, active, action) {
  submitting = active;
  if (!button) return;
  button.disabled = active;
  button.textContent = active
    ? action === "send_password_reset"
      ? "Setup-link versturen..."
      : "Uitnodiging versturen..."
    : action === "send_password_reset"
      ? "Password reset/setup link versturen"
      : "Uitnodiging versturen";
}

async function currentBearer() {
  return String(await getAdminAccessToken().catch(() => "")).trim();
}

async function sendInvite(action, button) {
  if (!form || submitting) return;
  const token = await currentBearer();
  if (!token) {
    setMessage("Log opnieuw in als superadmin om een geldige activatielink te versturen.", "error");
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  setSubmitting(button, true, action);
  setMessage(action === "send_password_reset" ? "Verse activatielink wordt verstuurd..." : "Uitnodiging wordt verstuurd...");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...data, action }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Versturen is niet gelukt (status ${response.status}).`);
    }
    const warning = String(result.mailWarning || "").trim();
    setMessage([result.message || "De activatielink is verstuurd.", warning].filter(Boolean).join(" "), warning ? "warning" : "success");
    window.dispatchEvent(new CustomEvent("maxwebstudio:user-invite-complete", { detail: { email: data.email, action } }));
  } catch (error) {
    setMessage(error?.message || "De activatielink kon niet worden verstuurd.", "error");
  } finally {
    setSubmitting(button, false, action);
  }
}

function handleButtonClick(event) {
  const button = event.currentTarget;
  event.preventDefault();
  event.stopImmediatePropagation();
  void sendInvite(button === resetButton ? "send_password_reset" : "invite", button);
}

function handleFormSubmit(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  void sendInvite("invite", submitButton);
}

submitButton?.addEventListener("click", handleButtonClick, true);
resetButton?.addEventListener("click", handleButtonClick, true);
form?.addEventListener("submit", handleFormSubmit, true);

document.documentElement.dataset.inviteControls = form && submitButton && resetButton ? "ready" : "missing";
