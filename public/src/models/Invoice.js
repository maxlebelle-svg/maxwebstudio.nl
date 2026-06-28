/**
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} invoiceNumber
 * @property {string} profileId
 * @property {string} websiteId
 * @property {string} projectId
 * @property {string} sourceQuoteId
 * @property {string} subscriptionId
 * @property {string} status
 * @property {Array} lines
 * @property {number} total
 *
 * Supabase table: customer_invoices
 * Migratie: lines blijft jsonb tot PDF/boekhouding wordt gekoppeld.
 */
export const invoiceModel = { table: "customer_invoices", primaryKey: "id" };
