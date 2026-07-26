# Partner Onboarding V1 - canonical status and access matrix

## Separation of concerns

`profiles.role` expresses the maximum authorization class. `profiles.status`, `partner_profiles.status`, `partner_onboardings.status`, required step evidence, current document versions and certificate state determine whether that authorization is released. A `sales_partner` role alone never opens the Sales Workspace.

## Canonical states

| Business state | Profile | Partner profile | Onboarding | Certificate | Sales Workspace |
| --- | --- | --- | --- | --- | --- |
| Invitation/account created | `invited` | `invited` | `invited` | none | blocked |
| Account activated, onboarding not started | `pending` | `onboarding` | `account_activated` | none | blocked |
| Onboarding in progress | `pending` | `onboarding` | `in_progress` | none | blocked |
| Assessment failed | `pending` | `onboarding` | `assessment_failed` | none | blocked |
| Assessment passed, controlled steps open | `pending` | `onboarding` | `awaiting_documents` | none | blocked |
| Certified, explicit activation pending | `pending` | `onboarding` | `certified` | `valid` | blocked |
| Explicitly activated by admin | `active` | `active` | `active` | `valid` | allowed |
| Suspended | `disabled` | `paused` | `paused` | `valid` | blocked |
| Certificate revoked | `disabled` | `paused` | `revoked` | `revoked` | blocked |
| Certificate expired | `disabled` or `active` until expiry reconciliation | `paused` or `active` until reconciliation | `expired` or prior state | `expired` | blocked by certificate/gate reconciliation |

## Gate invariants

The canonical gate allows a partner only when all conditions are true:

1. role is `sales_partner`;
2. profile, partner profile and onboarding are all `active`;
3. all ten required onboarding steps are `completed`;
4. every currently published agreement/document version has an acceptance for this onboarding;
5. the assessment attempt passed the assigned published version;
6. a non-expired `valid` certificate exists;
7. activation was recorded by an active `super_admin` or `admin`.

Certification and activation are separate server-side transitions. Suspending or revoking changes the database state used by both Functions and RLS helpers, so a copied URL or direct API call remains blocked.

## Authorized transitions

- `invited -> pending`: account activation.
- `pending -> active`: explicit admin activation after certification.
- `active -> disabled`: suspension or revocation.
- `disabled -> active`: explicit admin reactivation while certification remains valid.
- onboarding progress may move to `assessment_failed` and back through a new attempt.
- `certified -> active`: explicit admin activation only.
- `active -> paused -> active`: reasoned, audited admin suspension/reactivation.
- `valid -> revoked|expired`: irreversible certificate transition; reissue creates new evidence.
