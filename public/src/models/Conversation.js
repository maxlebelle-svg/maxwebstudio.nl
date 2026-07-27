/**
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {string|null} leadId
 * @property {string|null} customerId
 * @property {string|null} assignedUserId
 * @property {'new'|'open'|'waiting_for_prospect'|'waiting_for_staff'|'resolved'|'closed'|'spam'} status
 * @property {'shadow'|'assisted'|'autopilot'|'paused'} botMode
 * @property {'web'|'whatsapp'} activeChannel
 * @property {string|null} summary
 * @property {string|null} lastMessageAt
 */
export const conversationModel = Object.freeze({
  table: "conversations",
  primaryKey: "id",
  assignmentKey: "assigned_user_id",
});
