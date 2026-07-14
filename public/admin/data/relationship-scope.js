(function initRelationshipScope(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MaxRelationshipScope = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function relationshipScopeFactory() {
  "use strict";

  const TYPES = new Set(["lead", "customer"]);

  function canonicalRelationship(value = null) {
    if (!value || typeof value !== "object") return null;
    const relationshipType = String(value.relationshipType || value.entityType || "").trim().toLowerCase();
    const relationshipId = String(value.relationshipId || (relationshipType === "lead" ? value.leadId : value.customerId) || "").trim();
    if (!TYPES.has(relationshipType) || !relationshipId) return null;
    return Object.freeze({ relationshipType, relationshipId });
  }

  function relationshipQuery(value = null) {
    const relationship = canonicalRelationship(value);
    if (!relationship) return "";
    const query = new URLSearchParams({ relationshipType: relationship.relationshipType, relationshipId: relationship.relationshipId });
    if (relationship.relationshipType === "lead") query.set("leadId", relationship.relationshipId);
    if (relationship.relationshipType === "customer") query.set("customerId", relationship.relationshipId);
    return query.toString();
  }

  function projectIdsForRelationship(projects = [], value = null) {
    const relationship = canonicalRelationship(value);
    if (!relationship) return new Set();
    return new Set((Array.isArray(projects) ? projects : []).filter((project) => recordMatches(project, relationship, null)).map((project) => String(project.id || project.projectId || "").trim()).filter(Boolean));
  }

  function recordMatches(record = {}, value = null, projectIds = null) {
    const relationship = canonicalRelationship(value);
    if (!relationship || !record || typeof record !== "object") return false;
    const expected = relationship.relationshipId;
    const direct = relationship.relationshipType === "lead"
      ? [record.leadId, record.lead_id, record.originalLeadId, record.original_lead_id]
      : [record.customerId, record.customer_id];
    if (direct.some((id) => String(id || "").trim() === expected)) return true;
    if (!projectIds) return false;
    return [record.projectId, record.project_id].some((id) => projectIds.has(String(id || "").trim()));
  }

  function scopeBrandingState(state = {}, value = null) {
    const relationship = canonicalRelationship(value);
    const empty = {
      brandProfile: {}, brandKit: {}, projects: [], logoAssets: [], printAssets: [], brandingAssets: [],
      downloadAssets: [], socialAssets: [], marketingAssets: [], emailAssets: [], versions: [],
    };
    if (!relationship) return empty;
    const projectIds = projectIdsForRelationship(state.projects, relationship);
    const filter = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => recordMatches(row, relationship, projectIds));
    const projects = filter(state.projects);
    const firstProject = projects[0] || {};
    return {
      ...empty,
      brandProfile: firstProject.brandProfile && typeof firstProject.brandProfile === "object" ? firstProject.brandProfile : {},
      brandKit: firstProject.brandKit && typeof firstProject.brandKit === "object" ? firstProject.brandKit : {},
      projects,
      logoAssets: filter(state.logoAssets),
      printAssets: filter(state.printAssets),
      brandingAssets: filter(state.brandingAssets),
      downloadAssets: filter(state.downloadAssets),
      socialAssets: filter(state.socialAssets),
      marketingAssets: filter(state.marketingAssets),
      emailAssets: filter(state.emailAssets),
      versions: filter(state.versions),
    };
  }

  function attachRelationship(record = {}, value = null) {
    const relationship = canonicalRelationship(value);
    if (!relationship) throw new Error("Selecteer eerst een actieve relatie.");
    return {
      ...record,
      relationshipType: relationship.relationshipType,
      relationshipId: relationship.relationshipId,
      leadId: relationship.relationshipType === "lead" ? relationship.relationshipId : "",
      customerId: relationship.relationshipType === "customer" ? relationship.relationshipId : "",
    };
  }

  return Object.freeze({ attachRelationship, canonicalRelationship, projectIdsForRelationship, recordMatches, relationshipQuery, scopeBrandingState });
});
