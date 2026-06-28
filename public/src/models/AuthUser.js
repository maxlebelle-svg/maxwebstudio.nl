/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} authUserId - Toekomstige Supabase Auth id.
 * @property {string} email
 * @property {string} name
 * @property {string} role
 * @property {string} status
 * @property {boolean} isDemo
 * @property {string} customerId
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * Supabase table: auth.users + profiles/platform_users
 * Migratie: local demo-users worden later vervangen door Supabase Auth users met RLS/rollen.
 */
export const authUserModel = { table: "platform_users", primaryKey: "id" };
