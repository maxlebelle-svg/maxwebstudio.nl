/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} customerId
 * @property {string} websiteId
 * @property {string} name
 * @property {string} type
 * @property {string} status
 * @property {string} phase
 * @property {number} progress
 * @property {Array} checklist
 * @property {Array} tasks
 * @property {Array} timeline
 *
 * Supabase table: customer_projects
 * Migratie: checklist/tasks/timeline kunnen jsonb blijven of later aparte tabellen worden.
 */
export const projectModel = { table: "customer_projects", primaryKey: "id" };
