# 02 Auth

Doel: Supabase Auth, profiles en rollen voorbereiden.

Bronnen:

- `docs/AUTH.md`
- `docs/AUTH_CLAIMS_STRATEGY.md`
- `public/src/config/roles.js`
- `public/src/config/permissions.js`
- `public/src/services/authProfileService.js`

Volgorde:

1. Auth-users in testomgeving aanmaken.
2. Profiles koppelen aan `auth.users.id`.
3. Rollen controleren.
4. Customer/profile ownership testen.

Rollback:

- testusers verwijderen
- profile testrecords verwijderen via testproject reset/backup

Let op: custom JWT-claims zijn nog toekomstig. De eerste strategie gebruikt `profiles` als controleerbare bron.
