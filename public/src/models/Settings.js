/**
 * @typedef {Object} Settings
 * @property {string} companyName
 * @property {string} email
 * @property {string} invoicePrefix
 * @property {string} quotePrefix
 * @property {number} defaultVatRate
 * @property {number} paymentTermDays
 * @property {boolean} developerMode
 *
 * Supabase table: app_settings
 * Migratie: één record per workspace/tenant.
 */
export const settingsModel = { table: "app_settings", primaryKey: "workspace_id" };
