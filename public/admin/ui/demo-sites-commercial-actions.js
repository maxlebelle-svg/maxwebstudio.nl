(function demoSitesCommercialActionsModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DemoSitesCommercialActions = Object.freeze(api);
})(typeof window !== "undefined" ? window : globalThis, function createDemoSitesCommercialActions() {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function text(value) { return String(value || "").trim(); }
  function source(value = "") {
    const normalized = text(value).toLowerCase();
    return ["manual", "manual_zip", "manual-zip", "zip"].includes(normalized) ? "manual_zip" : normalized ? "website_factory" : "";
  }
  function sourceLabel(value = "") { return source(value) === "manual_zip" ? "Handmatige ZIP" : "Website Factory"; }

  function shareContext(input = {}) {
    const publication = input.publication && typeof input.publication === "object" ? input.publication : {};
    const selectedVersion = input.selectedVersion && typeof input.selectedVersion === "object" ? input.selectedVersion : {};
    const previewVersionId = text(selectedVersion.id);
    const publicPreviewUrl = text(publication.publicPreviewUrl);
    const publishedPreviewVersionId = text(publication.previewVersionId || publication.publishedPreviewVersionId);
    const relationshipType = text(input.relationshipType).toLowerCase();
    const relationshipId = text(input.relationshipId);
    const published = publication.publicPreviewEnabled === true
      && UUID.test(previewVersionId)
      && previewVersionId === publishedPreviewVersionId
      && /^https:\/\/(?:preview\.)?maxwebstudio\.nl\//i.test(publicPreviewUrl);
    return {
      relationshipType,
      relationshipId,
      previewVersionId,
      previewVersion: Number(selectedVersion.version || 1),
      previewSource: source(selectedVersion.sourceType || selectedVersion.previewSource || selectedVersion.metadata?.previewSource),
      publicPreviewUrl: published ? publicPreviewUrl : "",
      published,
      hasEmail: EMAIL.test(text(input.email).toLowerCase()),
      email: text(input.email).toLowerCase(),
      canInvite: published && relationshipType === "lead" && UUID.test(relationshipId) && EMAIL.test(text(input.email).toLowerCase()),
      blockedReason: !published
        ? "Publiceer eerst exact deze demo."
        : relationshipType !== "lead"
          ? "De leaduitnodiging is alleen beschikbaar in een leadwerkruimte."
          : !EMAIL.test(text(input.email).toLowerCase())
            ? "Voeg eerst een geldig e-mailadres toe aan de lead."
            : "",
    };
  }

  function whatsappMessage(input = {}) {
    const previewUrl = text(input.publicPreviewUrl || input.previewUrl);
    if (!previewUrl) return "";
    const contactName = text(input.contactName) || "daar";
    const companyName = text(input.companyName) || "uw bedrijf";
    return `Hallo ${contactName},\n\nIk heb alvast een demo voor ${companyName} gemaakt.\n\nU kunt de website hier bekijken:\n${previewUrl}\n\nIk hoor graag wat u ervan vindt.`;
  }

  function whatsappUrl(input = {}) {
    const message = whatsappMessage(input);
    return message ? `https://wa.me/?text=${encodeURIComponent(message)}` : "";
  }

  function invitationAction(input = {}) {
    const status = text(input.status || "not_invited").toLowerCase();
    if (status === "activated") return { label: "Klantportaal openen", action: "open_portal", active: true };
    if (["planned", "sent", "send_failed", "link_expired"].includes(status)) return { label: "Uitnodiging opnieuw versturen", action: status === "link_expired" ? "new_link" : "resend", active: true };
    return { label: "Uitnodigen voor klantportaal", action: "invite", active: true };
  }

  function journeySteps(input = {}) {
    const invitation = input.invitation && typeof input.invitation === "object" ? input.invitation : {};
    const demo = input.demo && typeof input.demo === "object" ? input.demo : {};
    const payment = input.payment && typeof input.payment === "object" ? input.payment : {};
    const invitationStatus = text(invitation.status).toLowerCase();
    const approvalStatus = text(demo.approvalStatus || demo.approval_status).toLowerCase();
    const demoStatus = text(demo.demoStatus || demo.demo_status).toLowerCase();
    const paid = payment.paid === true || ["paid", "betaald"].includes(text(payment.status).toLowerCase());
    return [
      { key: "public", label: "Demo publiek gedeeld", complete: input.publicPreviewEnabled === true },
      { key: "invited", label: "Portaaluitnodiging verstuurd", complete: ["sent", "activated"].includes(invitationStatus), pending: invitationStatus === "planned" },
      { key: "account", label: "Account aangemaakt", complete: invitationStatus === "activated" || Boolean(invitation.activatedAt) },
      { key: "viewed", label: "Demo bekeken", complete: Boolean(invitation.openedAt) },
      { key: "feedback", label: "Feedback ontvangen", complete: demoStatus.includes("feedback") || Boolean(text(demo.feedback)) },
      { key: "approved", label: "Ontwerp goedgekeurd", complete: approvalStatus === "customer_approved" || Boolean(demo.previewApprovedAt || demo.preview_approved_at) },
      { key: "paid", label: "Betaling ontvangen", complete: paid, unavailable: !payment.available },
    ];
  }

  return { EMAIL, UUID, invitationAction, journeySteps, shareContext, source, sourceLabel, whatsappMessage, whatsappUrl };
});
