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
 * Canonieke Supabase-tabellen: invoices en invoice_lines.
 */
export const invoiceModel = { table: "invoices", linesTable: "invoice_lines", primaryKey: "id" };
