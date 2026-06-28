/**
 * @typedef {Object} DemoEmail
 * @property {string} id
 * @property {string} customerId
 * @property {string} type
 * @property {string} subject
 * @property {string} to
 * @property {string} body
 * @property {string} status
 * @property {string} createdAt
 *
 * Supabase table: email_events
 * Migratie: demo records scheiden van echte Resend events.
 */
export const demoEmailModel = { table: "email_events", primaryKey: "id" };
