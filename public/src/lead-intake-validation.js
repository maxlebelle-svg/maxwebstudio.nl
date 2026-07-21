(function attachLeadIntakeValidation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaxWebstudioLeadValidation = api;
}(typeof window === "object" ? window : null, function createLeadIntakeValidation() {
  "use strict";

  const LIMITS = Object.freeze({
    name: 240,
    company: 240,
    email: 320,
    phone: 80,
    message: 4000,
    source: 120,
    requestId: 255,
    packageInterest: 240,
    carePackage: 240,
  });
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function codePointLength(value) {
    return Array.from(String(value == null ? "" : value)).length;
  }

  function validateLeadDraft(value = {}) {
    const fields = Object.fromEntries(Object.keys(LIMITS).map((key) => [key, String(value[key] == null ? "" : value[key]).trim()]));
    const errors = {};

    if (!fields.name) errors.name = "required";
    else if (codePointLength(fields.name) > LIMITS.name) errors.name = "tooLong";
    if (codePointLength(fields.company) > LIMITS.company) errors.company = "tooLong";
    if (!emailPattern.test(fields.email)) errors.email = "invalid";
    else if (codePointLength(fields.email) > LIMITS.email) errors.email = "tooLong";
    if (codePointLength(fields.phone) > LIMITS.phone) errors.phone = "tooLong";
    if (!fields.message) errors.message = "required";
    else if (codePointLength(fields.message) > LIMITS.message) errors.message = "tooLong";
    for (const field of ["source", "requestId", "packageInterest", "carePackage"]) {
      if (codePointLength(fields[field]) > LIMITS[field]) errors[field] = "tooLong";
    }
    if (!fields.source) errors.source = "required";
    if (value.termsAccepted !== true) errors.termsAccepted = "required";

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function buildLeadRequestWithHoneypot(formData, leadRequest = {}) {
    if (!formData || typeof formData.get !== "function") {
      throw new TypeError("Lead intake requires FormData.");
    }

    return {
      ...leadRequest,
      _gotcha: formData.get("_gotcha") ?? "",
    };
  }

  return Object.freeze({ LIMITS, buildLeadRequestWithHoneypot, codePointLength, validateLeadDraft });
}));
