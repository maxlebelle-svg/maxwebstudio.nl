# Publieke preview-URL rollout

## Huidige repositorystatus

- De Netlify-site publiceert `public/` en bundelt serverfuncties uit `functions/`.
- De werkende terugvalroute is `/preview/{slug}` en rendert intern via `public-preview-render`.
- De domeinregel voor `https://preview.maxwebstudio.nl/{slug}` staat passief klaar als domeinspecifieke `200`-rewrite. Deze regel raakt `maxwebstudio.nl` niet.
- DNS, een Netlify-domeinalias en TLS worden niet als code in deze repository beheerd en zijn in deze wijziging niet aangepast.
- Zolang `PUBLIC_PREVIEW_BASE_URL` ontbreekt, deelt de Factory bewust de werkende terugvalroute. Na activering van het subdomein schakelt dezelfde UI zonder datamigratie over op de branded URL.

## Veilige uitrolvolgorde

1. Voer eerst `supabase/migrations/20260718110000_public_preview_slugs.sql` uit. Controleer daarna de unieke index en laat de bestaande RLS-policies ongewijzigd.
2. Voer voor relatie-onafhankelijke publicaties daarna afzonderlijk `supabase/migrations/20260718190000_public_preview_publications.sql` uit. Deze migratie maakt alleen de gesloten, server-only tabel `public_preview_publications`; de bestaande klantkolommen blijven als legacy fallback bestaan.
3. Deploy vervolgens de applicatiecode en controleer een onbekende fallback-URL: `/preview/onbekende-preview` moet een branded 404 met `noindex` en `no-store` geven.
4. Publiceer één testpreview. Controleer dat `/preview/{slug}` rendert, assets laadt en geen token of versie-id in HTML, netwerk-URL's of adresbalk toont.
5. Voeg in Netlify bij **Domain management** `preview.maxwebstudio.nl` als domeinalias aan dezelfde productie-site toe. Netlify vereist dat een domein aan de site is toegewezen voordat een domeinspecifieke rewrite werkt.
6. Beheer externe DNS: maak `preview` als CNAME naar de exacte `<site-name>.netlify.app`-host die Netlify voor deze site toont. Gebruik bij Netlify DNS de door Netlify voorgestelde recordconfiguratie.
7. Wacht tot Netlify het TLS-certificaat als actief toont. Publiceer vóór dat moment nog geen branded link naar klanten.
8. Smoke-test `https://preview.maxwebstudio.nl/{testslug}` en controleer: status 200, URL blijft branded, assets blijven branded, 404/410 zijn netjes en responseheaders bevatten `X-Robots-Tag: noindex`.
9. Zet pas daarna de runtimevariabele `PUBLIC_PREVIEW_BASE_URL=https://preview.maxwebstudio.nl` en deploy opnieuw. Vanaf dat moment gebruiken kopiëren, openen en WhatsApp automatisch de branded link.
10. Test tot slot desktop en mobiel, wijzig één slug met bevestiging en trek één testlink in. Controleer dat de oude slug 404 en de ingetrokken huidige slug 410 geeft.

## Lead naar klant

- Een leadpublicatie staat in `public_preview_publications` met `relationship_type = 'lead'`. Publiceren maakt geen klant aan en verandert geen lead-, preview- of goedkeuringsstatus.
- De resolver leest eerst deze generieke publicatie en valt voor bestaande klanten daarna terug op `customers.public_preview_*` en `metadata.publishedPreviewVersionId`.
- Er is in de huidige repository geen centrale, atomische lead-naar-klantconversiehook waarin de publicatie veilig kan worden overgedragen. Daarom wordt overdracht niet automatisch aangeroepen.
- `transferPublicPreviewPublication` in `functions/admin-preview-publication.js` is de beperkte serverhelper voor een toekomstige integratie. Roep deze pas aan nadat de bestaande conversieflow `lead.customer_id` of `lead.converted_customer_id` aantoonbaar naar de doelklant heeft gezet. De helper weigert een onbekende koppeling en een klant met een conflicterende actieve generieke publicatie; slug, doelversie en intrekstatus blijven behouden.

## Rollback

- Verwijder of leeg eerst `PUBLIC_PREVIEW_BASE_URL`; de Factory valt dan terug op `/preview/{slug}`.
- Laat slugs en publicatiepointers in de database staan: daardoor blijft een latere heractivering stabiel.
- Verwijder de Netlify-domeinalias of DNS-record pas nadat de fallback opnieuw is getest.

Bronnen: [Netlify domain-level redirects](https://docs.netlify.com/manage/routing/redirects/redirect-options/#domain-level-redirects), [Netlify custom domain setup](https://docs.netlify.com/manage/domains/get-started-with-domains/), [Netlify rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
