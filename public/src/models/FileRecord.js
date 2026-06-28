/**
 * @typedef {Object} FileRecord
 * @property {string} id
 * @property {string} customerId
 * @property {string} websiteId
 * @property {string} projectId
 * @property {string} name
 * @property {string} type
 * @property {string} category
 * @property {string} location
 * @property {string} status
 *
 * Supabase table: customer_files
 * Migratie: location wordt later storage path of signed URL bron.
 */
export const fileRecordModel = { table: "customer_files", primaryKey: "id" };
