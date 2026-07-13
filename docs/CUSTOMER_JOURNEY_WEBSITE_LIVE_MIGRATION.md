# Fase 10 — `website.live` ownership en testmigratie

Datum: 13 juli 2026
Status: geïmplementeerd, standaard uit, uitsluitend expliciete testklanten

## Productieactivatie van Fase 9

Voor deze implementatie is uitsluitend migratie `20260713210000_enable_payment_paid_test_outbox.sql` toegepast op productieproject `maxwebstudio` (`yxxahurphdbblkuxoeje`) met SHA-256 `03a679d015365ddc4172c58eff819e67997ca5fe8e097c89ecf9413046665a83`. Remote history bevat de versie. De transactionele assertions voor `SECURITY DEFINER`, vaste `search_path`, rolrechten en de ongewijzigde journeydata waren groen. Journey-events, outboxitems en executions bleven elk één; instances bleven nul. Alleen de optionele lokale Docker/pg-delta-schema-exportcache was niet beschikbaar.

## Bestaande livegangflow

Het enige concrete server-side livegangcommando is Website Factory-actie `complete_launch`. Voor Fase 10 zette deze actie alleen projectmetadata en projectstatus op live, maakte timeline/notificationrecords, plande post-launch groei/reviewmetadata, kon automatisch een gepland onderhoudsabonnement aanmaken en stuurde direct een legacy-livegangmail. Het commando voerde zelf geen Netlify-deployment, custom-domainkoppeling, DNS-mutatie of SSL-uitgifte uit en valideerde geen bereikbare live-URL.

Previewpublicatie en handmatige ZIP-publicatie publiceren uitsluitend een reviewversie naar het klantenportaal. Zij zijn geen productielivegang. `admin-client-profiles` beheert handmatig `customer_websites`; `admin-website-health` bevat een expliciete mockcheck en is daarom geen zelfstandig livegangbewijs. Domeincentrum en health-admin zijn readmodels/beheerfuncties, geen canonieke launchproducer.

Het veilige canonieke moment is daarom na de duurzame `complete_launch`-projectwrite, maar alleen wanneer de gekoppelde website al een live/online status heeft, klant/project/website exact overeenkomen, een stabiele eerste publicatiereferentie bestaat en een begrensde server-side HTTPS-probe de toegestane canonical host bereikt. Zonder dat bewijs blijft de technische statusactie succesvol maar ontstaat geen definitieve livegangmail of journeycompletion.

## Event, URL-policy en ownership

Event: `website.live`

Effect: `email.website_live`

Template: `journey.website_live.v1`

Stabiele keys bevatten customer-ID, website-ID, project-ID, de bewaarde eerste publicatiereferentie, canonical host, effect en templateversie. Een latere deploy wijzigt die eerste businessreferentie niet en veroorzaakt dus geen tweede livegangmail.

De URL-policy vereist HTTPS, een websitegebonden custom host of expliciet afgesproken canonical Netlify-host, geen credentials of afwijkende poort, geen localhost/private IP, geen Function-/preview-/deployroute en geen technische queryparameters. De probe valideert DNS-adressen vóór ieder request, blokkeert private adressen, gebruikt handmatige redirects naar uitsluitend toegestane hosts en heeft begrensde timeout en redirectlimiet. Een netwerkfout draait de technische livegang niet terug.

Journey-owner vereist centrale engine- en mailflags, de afzonderlijke standaard lege `JOURNEY_WEBSITE_LIVE_TEST_CUSTOMERS`, een bestaande actieve `testOnly`-journey met `websiteLiveEmailOwner: journey`, beschikbare storage, veilige livecontext, recipient policy en geldige template. Voor duurzame acceptatie blijft een veilige niet-geselecteerde flow legacy-owned. Na event/outboxacceptatie blijft recovery uitsluitend Journey-owned en is legacyfallback uitgesloten. Een onveilige of onbewezen live-URL krijgt owner `none`.

## Side effects en nazorg

Project/live-opslag vindt vóór journeyregistratie plaats. Timeline en notification gebruiken stabiele dedupekeys. Fouten in URL-probe, journey, mail, progress, timeline of notification blokkeren of rollen de technische statuswrite niet terug.

`complete_launch` maakt geen onderhoudsabonnement meer aan. Een bestaand abonnement wordt alleen read-only opgezocht. Er wordt geen reviewmail, reviewevent of reviewplanning toegevoegd. Er worden geen facturen, orders, betalingen, deploys, DNS-mutaties of hostingactivaties gemaakt.

De additieve progress-overlay gebruikt de versioned v2-definitie van het bestaande journeytype. `website_live` wordt afgerond en `post_launch_check` wordt ready; een volledig voorbereide journey staat daardoor op 95% in plaats van onterecht volledig afgesloten. Commerciële, payment-, hosting-, review- of onderhoudsstates worden niet geforceerd.

## Template en admin

Testonderwerp: `[TEST] Uw website staat live`.

De template bevat HTML, plain text en preview text, Max Webstudio-branding, één primaire CTA naar de geverifieerde live-URL, een secundaire klantenportaal-CTA, nazorg, voortgang, feitelijke onderhoudscategorie en zakelijke contactfallback. Zij bevat geen reviewverzoek, betaalverzoek, SEO-/uptimegarantie of onbewezen hostingclaim. From blijft `Max Webstudio <info@maxwebstudio.nl>`.

De read-only adminweergave toont alleen website-/projectreferenties, publicatiecategorie, statuscategorieën, URL/DNS/SSL-categorie, hostnamefingerprint, progress, nazorg, onderhoudscategorie, owner, outbox/execution/providerstatus en foutcategorie. Volledige URL, deploypayload, recipient en secrets worden niet geselecteerd.

## Workeractivatie

Migratie `20260713220000_enable_website_live_test_outbox.sql` met SHA-256 `6e6a23fd52217f2ae366a989dbf24ebf3c217b7d79d6af7c3b699e99441fcfc5` breidt uitsluitend de begrensde testclaimfunctie uit met `email.website_live`. Zij is op 13 juli 2026 via een geïsoleerde, groene dry-run toegepast op productieproject `maxwebstudio` (`yxxahurphdbblkuxoeje`). De definitieve migration history, `SECURITY DEFINER`, vaste `search_path=public, pg_temp`, grants, RLS, 53 constraints en 24 indexen zijn groen gecontroleerd. Journey-events, outboxitems en executions bleven voor/na elk 1; journey-instances bleven 0. Er is geen scheduler, backfill, allowlistwaarde, journey-instance of testmail aangemaakt.
