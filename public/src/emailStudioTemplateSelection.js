(function initEmailStudioTemplateSelection(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EmailStudioTemplateSelection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEmailStudioTemplateSelection() {
  "use strict";

  function invitationAction(status) {
    if (status === "activated") return "new_link";
    if (status === "not_invited") return "invite";
    return "resend";
  }

  function manualSendSummary({ recipient, template, subject }) {
    if (!recipient) return "Selecteer een lead of klant. Er wordt nooit automatisch verzonden.";
    const relationshipLabel = recipient.relationshipType === "lead" ? "Lead" : "Klant";
    const recipientLabel = recipient.companyName || recipient.contactName || "relatie";
    return `Controleer vóór verzenden: ${relationshipLabel} · ${recipientLabel} · ${recipient.email || "geen e-mail"} · ${template?.name || "template"} · ${subject || "geen onderwerp"}.`;
  }

  function accountInvitationRequest({ recipient, status, actionKey }) {
    if (!recipient || !["lead", "customer"].includes(recipient.relationshipType) || !recipient.relationshipId) {
      throw new Error("Een canonieke lead- of klantrelatie is verplicht.");
    }
    const action = invitationAction(status);
    if (recipient.relationshipType === "lead") {
      return {
        endpoint: "/.netlify/functions/admin-lead-demo-invitation",
        action,
        payload: { leadId: recipient.relationshipId, action, actionKey },
      };
    }
    return {
      endpoint: "/.netlify/functions/admin-customer-welcome-email",
      action,
      payload: { customerId: recipient.relationshipId, action, actionKey },
    };
  }

  return { invitationAction, manualSendSummary, accountInvitationRequest };
});
