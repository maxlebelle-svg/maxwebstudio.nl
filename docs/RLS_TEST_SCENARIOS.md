# RLS Test Scenarios

Status: voorbereid. Gebruik dit document als handmatige testlijst in het Supabase testproject.

| Scenario | Rol | Testuser | Verwachte toegang | Verwachte blokkade | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Admin alles lezen | admin | admin@test.maxwebstudio.local | alle customers, websites, projects, quotes, invoices, subscriptions, settings | geen klantdata-blokkade |  |  |
| Super admin alles beheren | super_admin | superadmin@test.maxwebstudio.local | alle tabellen select/insert/update/delete waar toegestaan | geen service role in frontend |  |  |
| Sales salesdata | sales | sales@test.maxwebstudio.local | leads/customers/quotes bekijken en beperkt beheren, invoices lezen | security/developer tools, RLS configs, payment writes |  |  |
| Support ondersteuning | support | support@test.maxwebstudio.local | klanten/projecten/facturen/bestanden lezen, project supportvelden beperkt | betalingen wijzigen, migraties starten |  |  |
| Developer technisch | developer | dev@test.maxwebstudio.local | technische logs/readiness/settings read | klantbetalingen aanpassen, customer impersonation |  |  |
| Customer A eigen data | customer | klant.a@test.maxwebstudio.local | eigen customer, websites, projects, quotes, invoices, subscriptions, files | Customer B en demo-productie data |  |  |
| Customer B eigen data | customer | klant.b@test.maxwebstudio.local | eigen customer, websites, projects, quotes, invoices, subscriptions, files | Customer A en demo-productie data |  |  |
| Customer A/B isolatie | customer | klant.a@test.maxwebstudio.local | alleen records met customer A ownership | records van customer B |  |  |
| Demo-user isolatie | demo_user | demo@test.maxwebstudio.local | records met `is_demo = true` of `environment = 'demo'` | productierecords |  |  |
| Anonymous publieke pagina's | anonymous | geen sessie | publieke marketing/demo pagina's via app-laag | alle klantdata in Supabase |  |  |
| Klantportaal mismatch | customer | klant.a@test.maxwebstudio.local | veilige empty state bij mismatch | data van andere klant |  |  |
| Quote lines parent access | customer | klant.a@test.maxwebstudio.local | quote_lines van eigen quote | quote_lines van andere quote |  |  |
| Invoice lines parent access | customer | klant.a@test.maxwebstudio.local | invoice_lines van eigen invoice | invoice_lines van andere invoice |  |  |
| Activity/import logs | developer | dev@test.maxwebstudio.local | technical read-only waar toegestaan | klant/customer role toegang |  |  |
| Settings | developer | dev@test.maxwebstudio.local | settings select technical | settings update |  |  |

## Belangrijk

Frontend self-tests blijven simulaties. Echte pass/fail komt pas uit Supabase testproject met echte Auth-sessies en RLS.
