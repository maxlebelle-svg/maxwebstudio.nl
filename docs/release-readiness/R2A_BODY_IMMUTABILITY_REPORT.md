# R2-A — Body Immutability Report

Status: **PASS**

All eight migration bodies are exact UTF-8 byte matches to their R2-A.1 deployed `prosrc` evidence. Extraction retained the leading and trailing newline between `AS $function$` and `$function$`; no whitespace normalization was used for the acceptance hash.

Migration: `20260721010000_harden_role_helper_search_paths.sql`
Size: 3578 bytes
SHA-256: `fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966`

Every authoritative body checksum matches. The SQL header and explicit default metadata clauses are outside function bodies and do not alter runtime semantics. Database catalog validation confirms the only existing-line definition change is `search_path=public` to `search_path=pg_catalog`. The bootstrap baseline used compact but semantically equivalent helper bodies; the common migration deterministically converges that line to the exact runtime-evidence bodies.
