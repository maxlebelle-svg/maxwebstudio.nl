# RLS Expected Access Matrix

Status: voorbereid. Canonical tabellen only.

Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` zijn legacy/not used voor nieuwe RLS.

| Role | Table | Select | Insert | Update | Archive/Delete | Condition | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| super_admin | all canonical | yes | yes | yes | yes | role = super_admin | volledige platformtoegang |
| admin | all canonical | yes | yes | yes | archive yes/delete beperkt | role = admin | beheer via app/server-side |
| sales | customers | yes | yes | limited | no delete | role = sales | salesvelden, geen security |
| sales | quotes/quote_lines | yes | yes | yes | no delete | role = sales | offerteproces |
| sales | invoices/invoice_lines | yes | no | no payment writes | no | role = sales | alleen inzage |
| support | customers/websites/projects/files | yes | no | projects limited | no | role = support | ondersteuning |
| support | invoices/invoice_lines | yes | no | no | no | role = support | geen betaling wijzigen |
| developer | settings/activity_logs/import_logs | yes | no | no | no | role = developer | technical read-only |
| developer | websites/projects/files | yes | no | websites update technical | no | role = developer | geen klantbetalingen |
| customer | customers | own only | no | no | no | owns_customer(id) | eigen klantrecord |
| customer | websites/projects/quotes/invoices/subscriptions/files | own only | no | no | no | owns_customer(customer_id) | eigen klantmodules |
| customer | quote_lines | own parent only | no | no | no | parent quote customer ownership | geen losse cross-access |
| customer | invoice_lines | own parent only | no | no | no | parent invoice customer ownership | geen losse cross-access |
| customer | change_requests | own only | no | no | no | auth_user_id = auth.uid() | totdat customer_id bestaat |
| demo_user | demo records | yes | no | no | no | is_demo = true or environment = demo | geen productie |
| anonymous | canonical customer data | no | no | no | no | no session | publieke site blijft app-laag |

## Expected failures

- Customer A select op Customer B records: blocked.
- Demo-user select op production records: blocked.
- Anonymous select op any canonical customer table: blocked.
- Support update invoice payment status: blocked.
- Developer mark invoice paid: blocked.
- Sales open Developer Tools/RLS configs: blocked.
