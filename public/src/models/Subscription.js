/**
 * @typedef {Object} Subscription
 * @property {string} id
 * @property {string} profileId
 * @property {string} websiteId
 * @property {string} projectId
 * @property {string} plan
 * @property {string} status
 * @property {string} billingCycle
 * @property {number} priceExVat
 * @property {string} nextInvoiceDate
 * @property {string} lastInvoiceId
 *
 * Canonieke Supabase-tabel: subscriptions.
 */
export const subscriptionModel = { table: "subscriptions", primaryKey: "id" };
