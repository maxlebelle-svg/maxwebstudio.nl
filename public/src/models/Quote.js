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
 * Supabase tables: quotes + quote_lines
 * Migratie: quote metadata staat in quotes; regels worden uitgesplitst naar quote_lines.
 */
export const quoteModel = { table: "quotes", linesTable: "quote_lines", primaryKey: "id" };
