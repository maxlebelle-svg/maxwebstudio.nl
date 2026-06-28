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
 * Supabase table: customer_subscriptions
 * Migratie: Mollie velden later toevoegen zonder local demo te breken.
 */
export const subscriptionModel = { table: "customer_subscriptions", primaryKey: "id" };
