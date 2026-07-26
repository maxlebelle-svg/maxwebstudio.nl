# R2-A — Security Validation

Status: **PASS**

Both local scenarios end with eight `SECURITY DEFINER` helpers on fixed `search_path=pg_catalog`. Target owner and ACL are unchanged within each line; existing retains owner `postgres` and its captured PUBLIC/postgres/service_role/authenticated ACL. Bootstrap retains its baseline-local owner/ACL. All non-target SECURITY DEFINER definitions, policies, policy roles, RLS/forced-RLS flags, table/sequence ACLs and Storage bucket configuration have identical before/after SHA-256 fingerprints.

Storage objects: 0. Auth fixture users remaining: 0. Application fixture rows remaining: 0. No remote environment was contacted.

The local security fingerprints are identical across existing and bootstrap after migration for non-target definers, policies, RLS, table ACLs and bucket configuration. No ACL, grant, owner, policy, table, data, Auth or Storage statement appears in the migration.
