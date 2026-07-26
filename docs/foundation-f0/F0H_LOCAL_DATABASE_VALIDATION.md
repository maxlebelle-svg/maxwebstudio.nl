# Foundation F0-h — Local Empty Database Validation

Status: **PASS**

The corrected baseline was applied to a new PostgreSQL 17.6 cluster under `/private/tmp/f0h-local-validation.*`. PostgreSQL listened only on a temporary Unix socket: `inet_server_addr()` and `inet_server_port()` were both null. All known remote Supabase/database variables were removed and rejected by the runner. No project reference or remote connection was used.

Results:

- 29 public tables and 612 active baseline columns;
- `lead_intake_idempotency` has 11 columns, 7 validated constraints, one index, RLS enabled and forced RLS disabled;
- `merged_fields` is `text[] NOT NULL DEFAULT ARRAY[]::text[]`;
- `created_at` and `updated_at` default to `now()`;
- `expires_at` defaults to `(now() + interval '30 days')`;
- a minimal idempotency row proved the empty-array and transaction-stable timestamp/30-day retention behavior, then the transaction was rolled back; residual fixture rows: 0;
- all public tables have RLS; security results are detailed in `F0H_SECURITY_REVALIDATION.md`.

The recovered RPC definitions were not executed on top of the final-state baseline because their migration intentionally rejects an existing target table. Compatibility was therefore tested by final-state catalog and definition comparison, as required by the phase boundary.

The cluster stopped normally and its temporary directory was removed by the registered cleanup trap.
