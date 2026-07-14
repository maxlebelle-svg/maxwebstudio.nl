(function exposeWebsiteFactoryContextSync(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WebsiteFactoryContextSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWebsiteFactoryContextSync() {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseCanonicalContext(search = "") {
    const params = new URLSearchParams(search);
    const hasCanonicalContext = params.has("relationshipType") || params.has("relationshipId");
    if (!hasCanonicalContext) return { state: "absent", relationshipType: "", relationshipId: "" };

    const relationshipType = String(params.get("relationshipType") || "").trim().toLowerCase();
    const relationshipId = String(params.get("relationshipId") || "").trim();
    const typedId = String(relationshipType === "lead" ? params.get("leadId") || "" : relationshipType === "customer" ? params.get("customerId") || "" : "").trim();
    const foreignId = String(relationshipType === "lead" ? params.get("customerId") || "" : relationshipType === "customer" ? params.get("leadId") || "" : "").trim();
    if (!["lead", "customer"].includes(relationshipType) || !UUID.test(relationshipId) || foreignId || (typedId && typedId !== relationshipId)) {
      return { state: "invalid", relationshipType, relationshipId, error: "De actieve relatiecontext is ongeldig of niet eenduidig." };
    }
    return { state: "valid", relationshipType, relationshipId };
  }

  function decideLeadSelection({ context, relationship, manualLeadId = "" } = {}) {
    const explicitManualLeadId = String(manualLeadId || "").trim();
    if (explicitManualLeadId) return { state: "selected", source: "manual", leadId: explicitManualLeadId };
    if (!context || context.state === "absent") return { state: "none", source: "none", leadId: "" };
    if (context.state !== "valid") return { state: "error", source: "context", leadId: "", error: context.error || "De actieve relatiecontext is ongeldig." };
    if (context.relationshipType === "customer") return { state: "customer", source: "context", leadId: "" };
    const resolvedType = String(relationship?.relationshipType || relationship?.entityType || "").trim().toLowerCase();
    const resolvedId = String(relationship?.relationshipId || relationship?.leadId || "").trim();
    if (resolvedType !== "lead" || resolvedId !== context.relationshipId) {
      return { state: "error", source: "context", leadId: "", error: "De actieve lead kon niet veilig worden geladen." };
    }
    return { state: "selected", source: "context", leadId: context.relationshipId };
  }

  function createRequestGuard() {
    let current = 0;
    return {
      begin() { current += 1; return current; },
      isCurrent(token) { return token === current; },
      invalidate() { current += 1; return current; },
    };
  }

  return { UUID, parseCanonicalContext, decideLeadSelection, createRequestGuard };
});
