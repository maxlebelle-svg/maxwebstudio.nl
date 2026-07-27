export const CONVERSATION_CHANNELS = Object.freeze({
  WEB: "web",
  WHATSAPP: "whatsapp",
  INTERNAL: "internal",
});

export const CONVERSATION_STATUSES = Object.freeze({
  NEW: "new",
  OPEN: "open",
  WAITING_FOR_PROSPECT: "waiting_for_prospect",
  WAITING_FOR_STAFF: "waiting_for_staff",
  RESOLVED: "resolved",
  CLOSED: "closed",
  SPAM: "spam",
});

export const CONVERSATION_BOT_MODES = Object.freeze({
  SHADOW: "shadow",
  ASSISTED: "assisted",
  AUTOPILOT: "autopilot",
  PAUSED: "paused",
});

export const CONVERSATION_SENDER_TYPES = Object.freeze({
  PROSPECT: "prospect",
  STAFF: "staff",
  BOT: "bot",
  SYSTEM: "system",
});

export const CONVERSATION_APPROVAL_STATUSES = Object.freeze({
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export function isHumanTakeoverMode(mode) {
  return mode === CONVERSATION_BOT_MODES.PAUSED;
}

export function canBotSendWithoutReview(mode) {
  return mode === CONVERSATION_BOT_MODES.AUTOPILOT;
}
