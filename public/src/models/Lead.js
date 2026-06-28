/**
 * @typedef {Object} Lead
 * @property {string} id
 * @property {string} name
 * @property {string} company
 * @property {string} email
 * @property {string} phone
 * @property {string} source
 * @property {string} interest
 * @property {string} status
 * @property {string} convertedCustomerId
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * Supabase table: leads
 * Migratie: formulieraanvragen en demo-leads normaliseren naar één leadtabel.
 */
export const leadModel = { table: "leads", primaryKey: "id" };
