/**
 * @typedef {Object} Quote
 * @property {string} id
 * @property {string} quoteNumber
 * @property {string} profileId
 * @property {string} websiteId
 * @property {string} projectId
 * @property {string} status
 * @property {Array} lines
 * @property {number} total
 * @property {string} convertedToInvoiceId
 *
 * Supabase table: customer_quotes
 * Migratie: lines wordt jsonb; later eventueel quote_lines.
 */
export const quoteModel = { table: "customer_quotes", primaryKey: "id" };
