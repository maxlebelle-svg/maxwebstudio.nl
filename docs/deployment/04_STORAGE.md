# 04 Storage

Doel: private opslag voor uploads, facturen en klantbestanden voorbereiden.

Bestaande bronnen:

- `docs/supabase-change-requests.sql`
- `docs/supabase-invoice-storage.sql`
- `docs/SECURITY.md`

Belangrijk:

- buckets blijven private
- downloads via signed URLs/server-side functions
- geen publieke factuur- of klantbestandlinks opslaan
- service role key blijft server-side

Rollback:

- bucket policies handmatig terugzetten
- objecten alleen verwijderen na backup/export
