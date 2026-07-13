const FEATURE_FLAGS = Object.freeze({
  JOURNEY_ENGINE_ENABLED: "JOURNEY_ENGINE_ENABLED",
  JOURNEY_PROGRESS_UI_ENABLED: "JOURNEY_PROGRESS_UI_ENABLED",
  JOURNEY_EMAIL_AUTOMATION_ENABLED: "JOURNEY_EMAIL_AUTOMATION_ENABLED",
  RESEND_EVENT_WEBHOOKS_ENABLED: "RESEND_EVENT_WEBHOOKS_ENABLED",
  JOURNEY_ADMIN_ENABLED: "JOURNEY_ADMIN_ENABLED",
});

const FEATURE_FLAG_MODES = Object.freeze(["off", "test_only", "allowlist", "on"]);
const ENVIRONMENTS = Object.freeze(["production", "test", "demo"]);

const JOURNEY_DEFINITION_STATUSES = Object.freeze(["draft", "published", "retired"]);
const JOURNEY_INSTANCE_STATUSES = Object.freeze(["active", "paused", "completed", "cancelled", "needs_review"]);
const PROCESSING_STATUSES = Object.freeze(["pending", "processing", "completed", "failed", "cancelled", "dead_letter"]);
const EXECUTION_DELIVERY_STATUSES = Object.freeze(["not_sent", "queued", "sent", "delivered", "delayed", "bounced", "complained", "failed"]);
const EXECUTION_ENGAGEMENT_STATUSES = Object.freeze(["unknown", "opened", "clicked", "unsubscribed"]);

const ENTITY_TYPES = Object.freeze([
  "lead",
  "application",
  "customer",
  "order",
  "payment",
  "invoice",
  "project",
  "website",
  "preview",
  "subscription",
  "domain",
  "logo",
  "seo",
  "google_business",
  "phone_number",
  "print_order",
  "review",
]);

const BUSINESS_EVENT_TYPES = Object.freeze([
  "lead.created",
  "application.received",
  "preview.requested",
  "preview.ready",
  "preview.viewed",
  "preview.feedback_received",
  "preview.approved",
  "payment.created",
  "payment.paid",
  "payment.failed",
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "invoice.overdue",
  "project.created",
  "project.started",
  "content.requested",
  "content.received",
  "website.build_started",
  "website.testing",
  "website.ready_for_launch",
  "website.live",
  "subscription.started",
  "subscription.renewed",
  "domain.registered",
  "domain.connected",
  "ssl.active",
  "logo.concept_ready",
  "logo.approved",
  "seo.started",
  "seo.report_ready",
  "google_business.started",
  "google_business.completed",
  "phone_number.activated",
  "print_order.created",
  "print_order.shipped",
  "review.requested",
]);

const PROVIDER_EVENT_TYPES = Object.freeze([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
]);

module.exports = {
  BUSINESS_EVENT_TYPES,
  ENTITY_TYPES,
  ENVIRONMENTS,
  EXECUTION_DELIVERY_STATUSES,
  EXECUTION_ENGAGEMENT_STATUSES,
  FEATURE_FLAGS,
  FEATURE_FLAG_MODES,
  JOURNEY_DEFINITION_STATUSES,
  JOURNEY_INSTANCE_STATUSES,
  PROCESSING_STATUSES,
  PROVIDER_EVENT_TYPES,
};
