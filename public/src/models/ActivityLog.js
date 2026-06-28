/**
 * @typedef {Object} ActivityLog
 * @property {string} id
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} action
 * @property {string} performedBy
 * @property {string} createdAt
 * @property {Object} metadata
 *
 * Supabase table: activity_logs
 * Migratie: admin/user actor later koppelen aan auth.users.
 */
export const activityLogModel = { table: "activity_logs", primaryKey: "id" };
