/**
 * @typedef {Object} Website
 * @property {string} id
 * @property {string} profileId
 * @property {string} name
 * @property {string} domain
 * @property {string} liveUrl
 * @property {string} stagingUrl
 * @property {string} githubRepoUrl
 * @property {string} netlifyProjectName
 * @property {string} status
 * @property {string} hostingPackage
 * @property {string} carePackage
 * @property {string} sslStatus
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * Supabase table: customer_websites
 * Migratie: profileId wordt foreign key naar profiles.id.
 */
export const websiteModel = { table: "customer_websites", primaryKey: "id" };
