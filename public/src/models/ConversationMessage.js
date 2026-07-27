/**
 * @typedef {Object} ConversationMessage
 * @property {string} id
 * @property {string} conversationId
 * @property {'web'|'whatsapp'|'internal'} channel
 * @property {'inbound'|'outbound'|'internal'} direction
 * @property {'prospect'|'staff'|'bot'|'system'} senderType
 * @property {string|null} body
 * @property {boolean} aiGenerated
 * @property {'not_required'|'pending'|'approved'|'rejected'} approvalStatus
 * @property {string} createdAt
 */
export const conversationMessageModel = Object.freeze({
  table: "conversation_messages",
  primaryKey: "id",
  parentKey: "conversation_id",
});
