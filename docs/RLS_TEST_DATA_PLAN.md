# RLS Test Data Plan

Status: voorbereid. Gebruik geen echte persoonsgegevens.

## Testprofiles

Maak synthetische Auth-users/profiles:

- `superadmin@test.maxwebstudio.local` met rol `super_admin`
- `admin@test.maxwebstudio.local` met rol `admin`
- `sales@test.maxwebstudio.local` met rol `sales`
- `support@test.maxwebstudio.local` met rol `support`
- `dev@test.maxwebstudio.local` met rol `developer`
- `demo@test.maxwebstudio.local` met rol `demo_user`, `is_demo = true`, `environment = 'demo'`
- `klant.a@test.maxwebstudio.local` met rol `customer`
- `klant.b@test.maxwebstudio.local` met rol `customer`

## Customers

- Customer A: `customer-a`, gekoppeld aan klant A profile/auth user.
- Customer B: `customer-b`, gekoppeld aan klant B profile/auth user.
- Demo customer: `customer-demo`, `is_demo = true`, `environment = 'demo'`.

## Records per customer

Maak per customer A, B en demo minimaal:

- 1 website
- 1 project
- 1 quote
- 2 quote_lines
- 1 invoice
- 2 invoice_lines
- 1 subscription
- 1 file
- 1 change_request indien auth_user_id-koppeling getest wordt

## Logs

Maak synthetisch:

- 1 activity log voor customer A
- 1 activity log voor customer B
- 1 import log voor testmigratie

## ID-conventie

Gebruik herkenbare metadata:

- `metadata.testScenario = 'rls-dry-run'`
- `metadata.owner = 'customer-a'`, `customer-b` of `demo`
- `environment = 'test'` voor testrecords
- `environment = 'demo'` voor demo-records

## Niet gebruiken

- geen echte klantnamen
- geen echte factuurbedragen van klanten
- geen echte bestanden of contracten
- geen productie-Supabase project
