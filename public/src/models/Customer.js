/**
 * @typedef {Object} Customer
 * @property {string} id
 * @property {string} authUserId - Toekomstige Supabase Auth user id.
 * @property {string} name
 * @property {string} company
 * @property {string} email
 * @property {string} phone
 * @property {string} website
 * @property {string} package
 * @property {string} status
 * @property {string} customerSince
 * @property {string} portalStatus
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * Supabase table: customers
 * Migratie: crmCustomers is leidend; customers blijft fallback voor demo/portal.
 */
export const customerModel = { table: "customers", primaryKey: "id" };
