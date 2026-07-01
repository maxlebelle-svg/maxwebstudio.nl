# Epic 2 - Production Rollout Plan

Status: `PLANNED / NO PRODUCTION CHANGES`

## Doel

Epic 2 beschrijft hoe de Digital Account Manager en het klantportaal veilig naar productie gaan.

Dit document is de poort tussen:

- Epic 1: staging/demo productervaring;
- productie: echte klanten, echte klantdata en echte toegang.

Er wordt in deze fase nog niets live gezet.

## Productiefilosofie

Max Webstudio gaat pas naar productie wanneer het platform veilig, aantoonbaar getest en terugdraaibaar is.

Elke nieuwe feature moet of:

- direct waarde toevoegen voor een klant;
- direct tijd besparen voor Max Webstudio.

Als een feature geen van beide doet, komt hij niet op de roadmap.

## Production Definition

Een productieomgeving bevat uitsluitend:

- echte klanten;
- echte klantprofielen;
- echte domeinen;
- echte websites;
- echte hostinginformatie;
- echte abonnementen;
- echte facturen;
- echte notificaties;
- echte beheeracties met audit trail.

Productie bevat nooit:

- demo-data;
- staging-accounts;
- testklanten;
- placeholder-content;
- mock responses;
- voorbeeldfacturen;
- testnotificaties;
- tijdelijke bypasses;
- developer-only meldingen voor normale gebruikers.

## Scope

Epic 2 omvat:

- productie Auth;
- echte klantdata;
- Supabase-tabellen;
- RLS/security;
- klantprofielkoppeling;
- adminbeheer;
- migratie van demo/staging naar productie;
- rollback;
- testplan;
- release approval.

Niet in scope:

- nieuwe klantportaalfeatures;
- OpenAI;
- Mollie live payments;
- Resend live e-mails;
- nieuwe demo-sites;
- storage uploads;
- production SQL-uitvoering zonder aparte approval;
- productie-auth activatie zonder go/no-go.

## Productie Auth

Doel: echte klanten kunnen veilig inloggen op `public/login.html` en alleen hun eigen klantportaal openen.

Vereist:

- productie `SUPABASE_URL` en public/anon key staan veilig in hosting environment variables;
- service role key blijft uitsluitend server-side;
- login UI wordt alleen actief wanneer production approval groen is;
- password reset werkt met productie redirect URLs;
- logout wist sessie en klantcontext;
- session restore werkt na refresh;
- foutmeldingen blijven klantvriendelijk;
- Developer Mode toont technische status alleen voor interne gebruikers.

Go/no-go:

- productie Auth blijft dicht totdat alle auth-tests groen zijn.

## Echte Klantdata

Doel: productie bevat alleen echte klantrecords die bewust zijn aangemaakt of gemigreerd.

Vereist:

- demo/staging data is niet aanwezig in productie;
- iedere klant heeft een uniek customer record;
- iedere klant heeft een gekoppeld profile/auth-user;
- klantdata is gekoppeld aan canonical tabellen;
- klantzichtbare data is gescheiden van interne adminnotities;
- migratiebron is per record herleidbaar.

Eerste productieklanten:

1. Maak eerst een interne pilotklant aan.
2. Test daarna een echte klant met beperkte scope.
3. Breid pas uit na evidence en approval.

## Supabase Tabellen

Canonical productietabellen:

- `profiles`
- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `files`
- `change_requests`
- `leads`
- `crm_tasks`
- `client_portal_messages`
- `client_portal_notifications`
- `ai_drafts`
- `ai_assistant_drafts`
- `audit_logs`

Voor Epic 2 productie-rollout zijn minimaal vereist:

- `profiles`
- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `change_requests`
- `client_portal_messages`
- `client_portal_notifications`
- `audit_logs`

## RLS en Security

Doel: klantisolatie is aantoonbaar bewezen voordat productie open gaat.

RLS-eisen:

- Customer A kan Customer B nooit lezen;
- Customer A kan Customer B nooit wijzigen;
- anonymous ziet geen klantdata;
- gebruikers zonder geldig profile worden geblokkeerd;
- interne rollen krijgen alleen noodzakelijke toegang;
- service role wordt nooit naar de browser gestuurd;
- runtime grants blijven minimaal en RLS blijft leidend.

Te bewijzen rollen:

- customer;
- admin;
- support;
- sales;
- developer;
- demo_user alleen buiten productie.

## Klantprofielkoppeling

Doel: iedere Auth-user is veilig gekoppeld aan precies de juiste klantcontext.

Vereist:

- `auth.users.id` koppelt naar `profiles.auth_user_id`;
- `profiles.customer_id` koppelt naar `customers.id`;
- klantportaal gebruikt alleen de eigen klantcontext;
- mismatch resulteert in veilige fallback;
- geen customer_id uit URL wordt blind vertrouwd;
- admin kan koppeling controleren en herstellen.

## Adminbeheer

Doel: Max Webstudio kan klanten beheren zonder production safety te omzeilen.

Vereist:

- admin ziet klantstatus en gekoppelde auth/profile status;
- admin kan zien of een klant portaaltoegang heeft;
- admin kan uitnodiging/resetproces begeleiden;
- admin kan geen service secrets zien;
- adminacties worden gelogd;
- rechten zijn rolgebaseerd.

Niet toegestaan in eerste productie-rollout:

- massadelete;
- rolwijzigingen zonder extra approval;
- factuurbedragen aanpassen zonder audit;
- deploymentacties vanuit klantportaal;
- AI-mutaties.

## Migratie van Demo/Staging naar Productie

Principes:

- staging bewijst gedrag;
- productie krijgt alleen echte data;
- demo-data wordt niet gemigreerd;
- mock responses blijven buiten productie;
- migratie gebeurt per module en met evidence.

Stappen:

1. Controleer productie-env en projectref.
2. Bevestig dat productieproject `maxwebstudio` is.
3. Controleer dat staging/testproject niet wordt gebruikt.
4. Maak backup of export vóór eerste echte datawijziging.
5. Maak eerste echte klant handmatig of via goedgekeurde adminflow.
6. Koppel profile/Auth-user.
7. Koppel website/project/finance records.
8. Test klantportaal met Customer A.
9. Test klantisolatie met Customer B.
10. Leg evidence vast.

## Rollback

Rollback moet beschikbaar zijn voordat productie live gaat.

Rollback-opties:

- feature flag voor klantportaal-auth uitzetten;
- login UI terugzetten naar `Binnenkort beschikbaar`;
- production env flag terugzetten;
- records archiveren in plaats van verwijderen;
- laatste veilige deploy herstellen;
- database restore alleen na expliciete approval.

Rollback evidence:

- reden;
- tijdstip;
- uitvoerder;
- getroffen modules;
- herstelstatus;
- klantimpact;
- vervolgactie.

## Testplan

Minimale productie-rollout tests:

### Auth

- geldige login;
- foutieve login;
- password reset;
- session restore na refresh;
- logout;
- directe toegang zonder sessie;
- directe toegang met verkeerde klantcontext.

### RLS

- Customer A leest eigen data;
- Customer A kan Customer B niet lezen;
- Customer A kan Customer B niet wijzigen;
- anonymous wordt geblokkeerd;
- no-profile user wordt geblokkeerd;
- interne rollen werken volgens policy.

### Klantportaal

- Vandaag/overzicht toont echte klantdata;
- Mijn Website toont juiste website;
- Wijzigingen tonen alleen eigen verzoeken;
- Berichten tonen alleen eigen thread;
- Facturen/offertes tonen alleen eigen records;
- Notificaties tonen alleen eigen meldingen;
- Max AI placeholder blijft duidelijk zonder echte AI-call.

### Admin

- admin kan klantkoppeling controleren;
- admin ziet geen secrets;
- adminacties worden gelogd;
- support/sales/developer rechten zijn begrensd.

### Recovery

- fallback zonder sessie werkt;
- rollback naar auth uit werkt;
- staging blijft gescheiden;
- productie blijft vrij van demo/testdata.

## Production Go/No-Go Criteria

Een productie-uitrol mag pas plaatsvinden als aan alle onderstaande punten is voldaan:

- [ ] Auth volledig getest
- [ ] Password reset bewezen
- [ ] Session restore bewezen
- [ ] Logout bewezen
- [ ] RLS getest met meerdere klanten
- [ ] Customer A kan Customer B nooit zien
- [ ] Demo-data volledig verwijderd uit productie
- [ ] Adminrechten gecontroleerd
- [ ] Audit logging actief
- [ ] Backups gecontroleerd
- [ ] Rollback getest
- [ ] Testplan volledig groen
- [ ] Release goedgekeurd

Automatische NO-GO:

- open security blocker;
- onbekende klantdata in productie;
- demo/testaccount in productie;
- service role zichtbaar in browser;
- RLS-fout of customer isolation twijfel;
- rollback niet getest;
- password reset niet bewezen;
- ontbrekende release approval.

## Release Approval

Voor productie is expliciete approval nodig van:

- developer;
- admin/eigenaar;
- release approver.

Approval bevat:

- versie/commit;
- testresultaten;
- open blockers;
- rollbackplan;
- productie-env bevestiging;
- go/no-go besluit.

## Eerste Productievolgorde

Aanbevolen volgorde:

1. Productie-env controleren zonder waarden te tonen.
2. Auth UI achter production feature flag voorbereiden.
3. Eerste interne pilotklant aanmaken.
4. Auth/profile/customer koppeling testen.
5. Customer A/B RLS bewijzen.
6. Klantportaal read-only productie testen.
7. Low-risk writes pas na aparte approval activeren.
8. Sprint review en release evidence vastleggen.

## Wat Bewust Nog Niet Wordt Uitgevoerd

- geen SQL;
- geen Supabase schemawijzigingen;
- geen productie-auth activatie;
- geen echte klantdatawijzigingen;
- geen OpenAI;
- geen Mollie/Resend;
- geen storage uploads;
- geen nieuwe runtimefeatures.

## Conclusie

Epic 2 is pas klaar wanneer Max Webstudio exact weet:

- welke data naar productie mag;
- welke checks verplicht zijn;
- wie release mag goedkeuren;
- hoe rollback werkt;
- hoe klantisolatie bewezen wordt;
- wanneer productie `GO` of `NO-GO` is.

Tot die tijd blijft het klantportaal production-safe gesloten.
