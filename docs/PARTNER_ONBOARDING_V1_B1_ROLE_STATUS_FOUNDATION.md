# Partner Onboarding V1 — B1 rol- en statusfundament

Status: lokaal ontwerp en forward-only migration; niet toegepast op staging of productie.

## Canonieke rollen

`super_admin`, `admin`, `sales_manager`, `sales_partner`, `designer`, `developer`, `support`, `customer`, `demo_user`.

De legacywaarde `sales` wordt bij migratie uitsluitend genormaliseerd naar `sales_partner`. Andere onbekende waarden laten de migration fail-closed stoppen.

## Canonieke profielstatussen

- `invited`: Auth-uitnodiging bestaat; operationele toegang is geblokkeerd.
- `pending`: account is geactiveerd, maar verplichte toelating ontbreekt; operationele toegang is geblokkeerd.
- `active`: account mag, naast domeinspecifieke autorisatie, operationele functies gebruiken.
- `disabled`: tijdelijk geblokkeerd; herstel door een bevoegde beheerder blijft mogelijk.
- `archived`: terminale profielstatus; historische relaties blijven bewaard.

Onboarding, certificering, overeenkomst en samenwerking krijgen eigen statusmachines. Zij worden niet in `profiles.status` gepropt.

## Overgangen

| Van | Naar |
|---|---|
| invited | pending, active, disabled, archived |
| pending | invited, active, disabled, archived |
| active | disabled, archived |
| disabled | invited, pending, active, archived |
| archived | archived |

Een overgang naar `active` geeft niet vanzelf partnerrechten: de server-side onboardinggate uit B2 blijft aanvullend verplicht voor `sales_partner`.

## Autorisatiebesluit

`current_profile_id()` en `current_app_role()` herkennen uitsluitend `active`. Daardoor kunnen algemene RLS-policies een invited/pending salespartner niet abusievelijk als operationele medewerker behandelen. B2 introduceert eigen onboarding-RLS die rechtstreeks bindt aan `auth.uid()` en alleen de strikt noodzakelijke partnertabellen ontsluit.

Voor leads geldt:

- super admin/admin: beheer;
- sales manager: select/update, geen insert/delete;
- sales partner: select/insert/update van eigen records via `assigned_user_id = auth.uid()`, geen delete;
- overige bestaande demo/support-regels blijven afzonderlijke policies.

## Releasevoorwaarden

Voor toepassing op staging moet een read-only preflight bevestigen:

1. alle actuele rol- en statuswaarden;
2. betekenis en datatype van `leads.assigned_user_id`;
3. actuele policyset en grants;
4. afwezigheid van onbekende profielwaarden;
5. dat de legacywaarde `sales` veilig naar `sales_partner` kan worden genormaliseerd.
