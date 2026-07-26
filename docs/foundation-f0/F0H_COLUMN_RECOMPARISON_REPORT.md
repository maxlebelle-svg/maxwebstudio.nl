# Foundation F0-h — Column Recomparison Report

Status: **PASS / ZERO BASELINE DEFECTS**

The unchanged F0-g runtime evidence was compared with a fresh catalog from the corrected baseline. No F0-h remote query was performed.

| measure | result |
|---|---:|
| runtime tables covered | 33 |
| runtime active columns covered | 657 |
| baseline tables | 29 |
| baseline active columns | 612 |
| union column keys | 678 |
| equivalent after normalization | 591 |
| intentional baseline exclusions | 66 |
| intentional security/design differences | 21 |
| unresolved baseline defects | 0 |
| unclassified differences | 0 |

All four former `baseline_defect` rows are now `equivalent_after_normalization`. The 66 exclusions remain confined to `ai_assistant_drafts`, `ai_drafts`, `client_portal_notifications` and `demo_preview_accesses`. The 21 baseline-only portal-ready fields on `website_preview_versions` remain intentional. No future-not-deployed asset table was introduced.
