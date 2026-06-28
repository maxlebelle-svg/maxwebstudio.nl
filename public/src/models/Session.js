/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} userId
 * @property {string} role
 * @property {string} environment
 * @property {boolean} isDemo
 * @property {string} customerId
 * @property {string} startedAt
 * @property {string} expiresAt
 *
 * Supabase table: auth.sessions
 * Migratie: tijdelijke localStorage-sessie wordt later vervangen door Supabase Auth session.
 */
export const sessionModel = { table: "auth.sessions", primaryKey: "id" };
