# DCA-0A Production Orphan Repair and Final Closure

Status: **PASS — DCA-0 production closure complete**

Execution date: 2026-07-26

Production project: `maxwebstudio`

Production project ref: `yxxahurphdbblkuxoeje`

Database role: `postgres`

## Authorized repair

The only production write was the prepared file:

`docs/deployment/DCA_0A_PRODUCTION_ORPHAN_REPAIR.sql`

SHA-256:

`c406ab74515205455624ae1adc1957922de6a9c210c5ea53227977ead8f9df86`

The script ran as one transaction. It locks and changes exactly one proven active orphan, aborts on zero or multiple candidates, performs no delete, does not update the preview version, does not reuse or update the public slug, and verifies the preview row is byte-equivalent before commit. The publication schema has no supported `reason`, `revocation_reason`, or `metadata` column, so the repair reason could not be persisted on the row. The script returned the fixed reason label `DCA_0_ORPHANED_LEAD_PUBLICATION_REPAIR` in its result.

## Anonymized preflight

Audit identifier (SHA-256 only):

`9e1b01bc9083117b4f6f1923e754fd14dcfc7c60b3e99aa66ee11552a00f09d5`

| Check | Result |
| --- | ---: |
| transaction read-only | on |
| candidate count | 1 |
| relationship type `lead` | 1 |
| linked lead missing | 1 |
| enabled | 1 |
| `revoked_at` null | 1 |
| preview version exists | 1 |
| active customer replacement | 0 |
| customer context | 0 |
| canonical preview approval | 0 |
| trust record | 0 |
| quote-acceptance context | 0 |
| invoice context | 0 |

No raw publication ID, relationship ID, preview ID, slug, person, email address, token, payload, or metadata value was included in the evidence.

## Repair result

| Check | Result |
| --- | ---: |
| exact rows changed | 1 |
| `enabled = false` | true |
| `revoked_at` populated | true |
| preview unchanged transaction check | passed |
| committed | true |

## Read-only postcheck

The canonical postcheck returned:

| Check | Result |
| --- | ---: |
| active orphan count | 0 |
| revoked orphan count | 1 |
| transaction read-only | on |

The expanded read-only postcheck returned:

| Check | Result |
| --- | ---: |
| repaired target count | 1 |
| repaired target preview exists | 1 |
| repaired target customer context | 0 |
| repaired target canonical approval | 0 |
| repaired target trust record | 0 |
| repaired target quote acceptance | 0 |
| repaired target invoice | 0 |
| other publications updated in the repair window | 0 |
| customers updated in the repair window | 0 |
| auth users updated in the repair window | 0 |
| quotes updated in the repair window | 0 |
| invoices updated in the repair window | 0 |
| approvals created in the repair window | 0 |
| trust records created in the repair window | 0 |
| publication user-trigger count | 0 |

## Integration

Integration branch: `codex/dca-0-final-closure`

The branch contains, in order:

1. DCA-0 commit `3160b2df20287b4bfb2fdc95ff185767279eb89b`;
2. governance commit `07c9eb01cd55a38dfa229c1d220b125dad5bb678`;
3. this final production-closure evidence commit.

## Test gates

| Gate | Result |
| --- | ---: |
| Foundation/governance | 58/58 |
| manifest classification | 5/5 |
| official root gate | 458/458 |
| modernized root gate | 463/463 |
| DCA-0 regression | 10/10 |

## Explicitly untouched production data and systems

- all other public preview publications;
- the referenced preview version and its package, checksum, URL and token fields;
- all leads and customers;
- all projects and websites;
- all auth users and profiles;
- all quotes, quote acceptances and invoices;
- all website preview approvals and customer portal trust records;
- all invitations and activation links;
- all production migrations, schema, policies, grants, functions and configuration;
- mail, WhatsApp and Mollie providers;
- staging data and fixtures;
- deployed application functionality.

No DCA-1 functionality was implemented or deployed.

## Decision

All DCA-0 production, governance and regression gates are closed. The active orphan blocker is removed without creating ownership or trust context.

`PASS_DCA_0_FULL_SUITE_AND_READY_FOR_DCA_1`
