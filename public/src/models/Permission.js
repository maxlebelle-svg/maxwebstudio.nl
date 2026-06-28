/**
 * @typedef {Object} Permission
 * @property {string} role
 * @property {string} resource
 * @property {string} action
 *
 * Supabase table: role_permissions
 * Migratie: centrale permissies kunnen later naar database of edge-auth policies.
 */
export const permissionModel = { table: "role_permissions", primaryKey: "role_resource_action" };
