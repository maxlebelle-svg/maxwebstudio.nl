/**
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} invoiceNumber
 * @property {string} customerId
 * @property {string} profileId
 * @property {string} websiteId
 * @property {string} projectId
 * @property {string} sourceQuoteId
 * @property {string} subscriptionId
 * @property {string} status
 * @property {string} paymentStatus
 * @property {string} invoiceDate
 * @property {string} dueDate
 * @property {string} paidAt
 * @property {Array} lines
 * @property {number} subtotal
 * @property {number} vatAmount
 * @property {number} total
 *
 * Supabase tables: invoices + invoice_lines
 * Migratie: Fase 12.6 gebruikt invoice_lines voor regels en houdt localStorage
 * als fallback totdat provider switch en live migratie expliciet worden goedgekeurd.
 */
export const invoiceModel = { table: "invoices", linesTable: "invoice_lines", primaryKey: "id" };
