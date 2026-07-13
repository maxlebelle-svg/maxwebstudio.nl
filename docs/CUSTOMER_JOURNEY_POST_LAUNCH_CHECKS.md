# Fase 11 — veilige post-launch nazorg

Datum: 13 juli 2026
Status: geïmplementeerd, standaard uit en uitsluitend voor expliciet geselecteerde testjourneys

## Productieactivatie Fase 10

Op productieproject `maxwebstudio` (`yxxahurphdbblkuxoeje`) is uitsluitend `20260713220000_enable_website_live_test_outbox.sql` met SHA-256 `6e6a23fd52217f2ae366a989dbf24ebf3c217b7d79d6af7c3b699e99441fcfc5` toegepast. De geïsoleerde dry-run bood alleen versie `20260713220000` aan. De definitieve history bevat lokaal en remote versies `20260713173000`, `20260713173100`, `20260713173200`, `20260713190000`, `20260713190100`, `20260713200000`, `20260713200100`, `20260713210000` en `20260713220000`.

De functie is `SECURITY DEFINER`, gebruikt `search_path=public, pg_temp`, weigert andere environments dan `test`, begrenst batch op 20 en lease op 300 seconden, en ondersteunt alleen de bekende testeffecten. `anon` en `authenticated` hebben geen execute; `service_role` wel. RLS bleef actief op alle zes journeytabellen. De nacontrole telde 53 constraints en 24 indexen. Journey-events, outboxitems en executions bleven elk 1; journey-instances bleven 0. Er zijn geen flags, allowlists, workers, schedulers, events of mails geactiveerd.

## Bestaande post-launchprocessen

`complete_launch` in Website Factory is het canonieke technische livegangmoment. Het bewaart de eerste livegangdatum en publicatiereferentie, zet project en portalcontext op live/nazorg, maakt timeline- en notificationrecords en start de `website.live`-journeyovergang. Het voert zelf geen Netlify-deployment, DNS-mutatie of SSL-uitgifte uit.

Betrouwbaar zijn de opgeslagen klant/project/websitekoppeling, expliciete live-status, eerste publicatiereferentie, Journey-event-idempotentie en bestaande onderhoudsabonnementen. `customer_websites` DNS-, SSL-, hosting- en uptimevelden zijn indicatief omdat bron en actualiteit kunnen verschillen. `admin-website-health` actie `run_check` is expliciet een mock en vormt geen livebewijs. De oude post-launch growth/health-score is een interne heuristiek en geen SEO-, omzet-, uptime- of kwaliteitsbewijs. Previewpublicatie en handmatige ZIP-publicatie zijn reviewflows, geen productielivegang.

Er bestonden timeline/notification livegangrecords en optionele onderhoudsdata, maar geen betrouwbare begrensde technische nazorgcheck. Review- en growthmetadata konden daarnaast naast Journeyprogress bestaan; Fase 11 maakt Journey-instance metadata leidend voor de nieuwe nazorgstatus zonder legacydata te verwijderen.

## Checkservice en veiligheid

`postLaunchCheckService` is alleen bereikbaar via een beveiligde super-adminactie en vereist tegelijk de centrale Journey Engine-gate, een bestaande gekoppelde `testOnly`-journey en de aparte standaard lege `JOURNEY_POST_LAUNCH_CHECK_TEST_CUSTOMERS`. De website-live-allowlist wordt niet overgenomen. Er is geen scheduler.

De check valideert een websitegebonden canonical HTTPS-host, blokkeert credentials, afwijkende poorten, localhost, private IPv4/IPv6, Function-/previewroutes en technische queryparameters. DNS wordt vóór ieder request opnieuw gecontroleerd. Redirects zijn handmatig, maximaal drie en uitsluitend toegestaan naar de vooraf bepaalde websitehosts. Requests gebruiken geen authheaders, hebben maximaal vijf seconden timeout en lezen maximaal 256 KiB.

Vastgelegd worden uitsluitend veilige categorieën voor URL, HTTPS, DNS, SSL/TLS, response, redirects, minimale HTML-content, portal linkage en onderhoud. Er worden geen responsebody, certificaatinhoud, DNS-details, tokens of credentials opgeslagen. De check doet geen uitspraken over SEO, indexatie, conversie, PageSpeed, uptimepercentage, accessibility, cookies, juridische compliance, beveiligingsgarantie, omzet of leads.

## Events, idempotentie en progress

De events zijn `website.post_launch_check_started`, `website.post_launch_check_completed` en `website.post_launch_attention_required`. Keys zijn afgeleid van customerreference, website-id, eerste live-publicatiereferentie, canonical hostname, checktype, checkversie en poging. Een optimistic instance-claim voorkomt twee actieve runs. Completiontransitie en interne attention-notification gebruiken stabiele keys; herhaalde metingen veroorzaken geen tweede completion.

Een gezonde check voltooit `post_launch_check` en kan beide v2-journeytypes naar 100% brengen. `attention_required` blokkeert de stap en blijft onder 100%; `inconclusive` houdt de stap actief en retry-eligible. Geen enkel resultaat wijzigt de technische live-status of forceert betaling, factuur, onderhoud, review, deployment of commerciële afsluiting.

## Review eligibility en admin

De read-only eligibility resolver vereist een gezonde nazorgcheck, afgeronde journey, geen open technische blokkade, een configureerbare minimale periode sinds livegang en geen eerder reviewverzoek of ontvangen review. Uitkomsten zijn `not_eligible`, `eligible_later`, `eligible` of `blocked`. Onderhoud is geen verplichte voorwaarde. `reviewMailStatus` blijft altijd `not_scheduled`; er wordt geen event, reminder of mail gepland.

Journey & Mail Automation toont read-only checkdatum, versie, resultaatcategorieën, portal- en onderhoudsstatus, progress vóór/na, interne actie, reason codes en review eligibility. Volledige technische responses en geheimen worden niet getoond.

## Herstel en beperkingen

Een DNS-, netwerk- of meetfout resulteert waar passend in `inconclusive`; de bestaande live-status blijft staan. Een interne attentionmelding gebruikt de bestaande timeline-laag en kan veilig opnieuw worden geprobeerd. Er is bewust geen algemene scheduler of klantmail. Externe metingen blijven momentopnamen en bewijzen geen toekomstige beschikbaarheid.
