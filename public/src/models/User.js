/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} authUserId
 * @property {string} email
 * @property {string} role
 * @property {string} status
 * @property {string} createdAt
 *
 * Supabase table: users / auth.users
 * Migratie: frontend gebruikt nooit service role; rollen later via RLS/policies.
 */
export const userModel = { table: "users", primaryKey: "id" };
