# Bedrijfsinstellingen Inventarisatie

Datum: 2026-07-08

Doel: in kaart brengen waar Max Webstudio bedrijfsgegevens nu hardcoded of dubbel beheerd worden, voordat er een centrale Bedrijfsinstellingen-module wordt gebouwd.

## Gewenste Centrale Defaults

| Veld | Gewenste waarde |
| --- | --- |
| Bedrijfsnaam | Max Webstudio |
| Telefoon zichtbaar | 085 130 2326 |
| Telefoon intern | +31851302326 |
| WhatsApp | automatisch opbouwen vanuit telefoonnummer |
| E-mail | nog centraal te bevestigen, huidige fallback is `info@maxwebstudio.nl` |
| Website | `https://maxwebstudio.nl` |
| Logo | centraal logo-asset/config gebruiken |
| Socials | LinkedIn, Facebook, Instagram, Google Bedrijfsprofiel |
| CTA's | bellen, WhatsApp, e-mail, offerte aanvragen |

## Samenvatting

De bedrijfsgegevens staan nu verspreid over drie hoofdgebieden:

1. Publieke website en losse pagina's: telefoon, WhatsApp, e-mail, socials, logo en header/footer worden hardcoded gebruikt.
2. Admin/salesportaal: dezelfde bedrijfsinstellingen staan in veel gekloonde adminpagina's als lokale defaults en formulier-velden.
3. Backend/Netlify Functions: e-mailadressen en WhatsApp-links staan deels als environment fallback en deels hardcoded in e-mailtemplates.

Belangrijk: het huidige hardcoded telefoonnummer is vooral `het oude internationale 06-nummer` / `het oude WhatsApp-nummer`. Dat wijkt af van de gewenste centrale waarde `085 130 2326` / `+31851302326`.

## Publieke Website

| Categorie | Locatie | Wat staat er nu |
| --- | --- | --- |
| JSON-LD e-mail | `public/index.html:37` | `info@maxwebstudio.nl` |
| Contactblok WhatsApp | `public/index.html:724` | `oude WhatsApp-link` |
| Contactblok telefoon | `public/index.html:733` | `oude tel-link` |
| Contactblok e-mail | `public/index.html:741`, `public/index.html:748` | `mailto:info@maxwebstudio.nl` en zichtbare e-mail |
| Sticky CTA WhatsApp | `public/index.html:852` | `oude WhatsApp-link` |
| Sticky CTA telefoon | `public/index.html:853` | `oude tel-link` |
| Footer WhatsApp | `public/index.html:968` | `oude WhatsApp-link` |
| Footer telefoon | `public/index.html:972` | `oude tel-link` |
| Footer e-mail | `public/index.html:976` | `mailto:info@maxwebstudio.nl` |
| Instagram | `public/index.html:985` | `https://www.instagram.com/maxwebstudio.nl/` |
| Facebook | `public/index.html:988` | `https://www.facebook.com/profile.php?id=61591581955035` |
| LinkedIn | `public/index.html:991` | `https://www.linkedin.com/company/130444905/` |

Andere publieke pagina's met contactgegevens:

| Locatie | Wat staat er nu |
| --- | --- |
| `public/onboarding.html:18`, `public/onboarding.html:249` | WhatsApp naar `het oude WhatsApp-nummer` |
| `public/bedankt.html:27` | WhatsApp naar `het oude WhatsApp-nummer` |
| `public/bedankt-wijziging.html:113`, `public/bedankt-wijziging.html:117` | WhatsApp en telefoon |
| `public/wijziging-doorgeven.html:138`, `public/wijziging-doorgeven.html:211`, `public/wijziging-doorgeven.html:215` | WhatsApp en telefoon |
| `public/privacyverklaring.html:31`, `public/privacyverklaring.html:82` | `info@maxwebstudio.nl` |
| `public/veelgestelde-vragen.html:23` | `info@maxwebstudio.nl` als linktekst |

## Logo, Header En Footer

Logo-assets bestaan al:

| Asset | Opmerking |
| --- | --- |
| `public/max-webstudio-logo-mark.svg` | Los beeldmerk |
| `public/max-webstudio-logo-full.svg` | Volledig logo |
| `public/max-webstudio-logo-mollie-512.png` | PNG-variant |
| `public/assets/maxwebstudio-logo-mark.png` | PNG-beeldmerk |
| `public/favicon.svg` | Favicon |

Veel pagina's gebruiken nog inline SVG/logo markup in plaats van een centrale logo-config. Daardoor is het logo gevoelig voor inconsistenties, zoals eerder zichtbaar werd in het klantportaal.

## Admin En Salesportaal

De adminpagina's bevatten al een instellingenblok, maar dit is in veel losse HTML-bestanden gedupliceerd. Voorbeelden:

| Locatie | Wat staat er nu |
| --- | --- |
| `public/admin-instellingen.html:1470` t/m `public/admin-instellingen.html:1518` | Velden voor KvK, BTW, BTW %, afzender e-mail, reply-to |
| `public/admin-dashboard.html:1470` t/m `public/admin-dashboard.html:1518` | Zelfde instellingenvelden |
| `public/admin-sales.html:1718` t/m `public/admin-sales.html:1766` | Zelfde instellingenvelden |
| `public/admin-facturen.html:1471` t/m `public/admin-facturen.html:1519` | Zelfde instellingenvelden |
| `public/admin-offertes.html:1471` t/m `public/admin-offertes.html:1519` | Zelfde instellingenvelden |
| `public/admin-klanten.html:1471` t/m `public/admin-klanten.html:1519` | Zelfde instellingenvelden |

Dezelfde default bedrijfsinstellingen staan daarna opnieuw als JavaScript object in dezelfde adminbestanden:

| Locatie | Voorbeelden |
| --- | --- |
| `public/admin-instellingen.html:2464` t/m `public/admin-instellingen.html:2501` | `companyName`, `tradeName`, `invoiceFooter`, `senderEmail`, `replyToEmail`, `portalWelcomeText` |
| `public/admin-dashboard.html:2450` t/m `public/admin-dashboard.html:2487` | Zelfde defaults |
| `public/admin-sales.html:2715` t/m `public/admin-sales.html:2752` | Zelfde defaults |
| `public/admin-facturen.html:2452` t/m `public/admin-facturen.html:2489` | Zelfde defaults |
| `public/admin-offertes.html:2451` t/m `public/admin-offertes.html:2488` | Zelfde defaults |
| `public/admin-demo-sites.html:2765` t/m `public/admin-demo-sites.html:2802` | Zelfde defaults |

Ook admin-gebruikers en uitnodigingen zijn op meerdere plekken hardcoded:

| Locatie | Wat staat er nu |
| --- | --- |
| `public/admin-*.html:63` en `public/admin-*.html:107` | `max@maxwebstudio.nl` in sidebar/login |
| Meerdere adminpagina's rond uitnodigingsvelden | `lisanne@maxwebstudio.nl` als standaard invite |
| `public/admin-sales.html:19584`, `public/admin-sales.html:19585` | Medewerkeropties Max en Lisanne |
| `public/admin-lead-generator.html:19551`, `public/admin-lead-generator.html:19552` | Medewerkeropties Max en Lisanne |

Advies: admin-gebruikers en bedrijfsgegevens niet volledig mengen. Bedrijfsgegevens horen in Company Settings; medewerkers/teamaccounts horen later in een aparte Team/Users-laag.

## E-mails En Functions

| Locatie | Wat staat er nu |
| --- | --- |
| `functions/email.js:3` | `FROM_EMAIL || "info@maxwebstudio.nl"` |
| `functions/submit-onboarding.js:112` | `ADMIN_EMAIL || "info@maxwebstudio.nl"` |
| `functions/submit-onboarding.js:128`, `functions/submit-onboarding.js:193` | Mailtekst met `info@maxwebstudio.nl` |
| `functions/send-lead.js:27` | `LEAD_TO_EMAIL || ADMIN_EMAIL || "info@maxwebstudio.nl"` |
| `functions/send-lead.js:238`, `functions/send-lead.js:284` | WhatsApp-link naar `het oude WhatsApp-nummer` |
| `functions/submit-change-request.js:318` | `ADMIN_EMAIL || "info@maxwebstudio.nl"` |
| `functions/submit-change-request.js:351` | Mailtekst met `info@maxwebstudio.nl` |
| `functions/list-change-requests.js:132` | `info@maxwebstudio.nl` in response/default |

Voor functions is het belangrijk dat private keys en Supabase service-role waarden server-side blijven. De frontend mag alleen publieke, veilige bedrijfsinstellingen krijgen.

## Facturen En Offertes

Relevante bestanden:

| Bestand | Rol |
| --- | --- |
| `public/factuur.html` | Publieke/portal factuurweergave |
| `public/offerte.html` | Publieke/portal offerteweergave |
| `public/admin-facturen.html` | Admin factuurbeheer + duplicated settings |
| `public/admin-offertes.html` | Admin offertebeheer + duplicated settings |
| `public/src/repositories/InvoiceRepository.js` | Factuurdata |
| `public/src/repositories/QuoteRepository.js` | Offertedata |
| `public/src/utils/invoiceNormalizer.js` | Factuur-normalisatie |
| `public/src/utils/quoteNormalizer.js` | Offerte-normalisatie |
| `functions/admin-invoice-email.js` | Factuurmail-flow |
| `functions/invoice-download.js` | Factuurdownload |

De factuur/offerte-modules hebben al data-normalizers en repositories. Bedrijfsgegevens zoals afzender, footer, KvK, BTW, logo en contactgegevens moeten straks vanuit dezelfde centrale bron komen, met fallback defaults zodat bestaande facturen blijven renderen.

## Bestaande Settings-Patronen

Er bestaat al een lokale settings-structuur:

| Locatie | Wat staat er nu |
| --- | --- |
| `public/src/config/storageKeys.js:18` | `settings: "maxwebstudioSettings"` |
| `public/src/config/storageKeys.js:66` | `clientPortalSettings: "maxwebstudioClientPortalSettings"` |
| `public/src/repositories/SettingsRepository.js:4` | Repository voor settings-module |
| `public/src/services/migrationService.js:30` | Settings voorbereid als module/table |
| `public/src/services/clientPortalDataService.js:83` | Leest bestaande settings mee |

Dit is de beste plek om op voort te bouwen. De nieuwe Company Settings-laag moet niet als losse hack naast deze structuur komen, maar als nette uitbreiding van de bestaande settings/repository/service-aanpak.

## Aanbevolen Volgende Sprint

1. Maak een centrale `companySettings` service/config met fallback defaults.
2. Laat die service veilige publieke velden teruggeven: naam, telefoon, WhatsApp-link, e-mail, website, logo, socials en CTA's.
3. Houd gevoelige waarden server-side. Geen Supabase service keys of private config in frontend.
4. Laat eerst publieke website, header/footer, contact CTA's en klantportaal het centrale object gebruiken.
5. Sluit daarna facturen, offertes en e-mailtemplates aan.
6. Vervang daarna pas de duplicated settings-blokken in de adminpagina's door één centrale adminpagina: Instellingen -> Bedrijfsgegevens.

## Risico's

| Risico | Waarom belangrijk |
| --- | --- |
| Adminpagina's zijn gekloond | Eén wijziging moet anders op veel plekken worden herhaald. |
| Functions gebruiken env fallbacks | Server-side bedrijfsgegevens moeten veilig en consistent worden opgelost. |
| Facturen/offertes zijn financieel gevoelig | Oude facturen moeten blijven werken, ook als settings later veranderen. |
| Logo staat inline op meerdere plekken | Kans op visuele verschillen tussen website, klantportaal en admin. |
| Huidig telefoonnummer wijkt af | Centrale migratie moet bewust overschakelen naar `085 130 2326`. |

## Conclusie

De centrale Bedrijfsinstellingen-module is zinvol en moet eerst komen voordat telefoon/WhatsApp, reseller-telefonie, Brand Center of e-mailtemplates verder worden uitgebreid.

De codebase heeft al genoeg aanknopingspunten (`STORAGE_KEYS.settings`, `SettingsRepository`, bestaande admin-instellingen), maar de huidige duplicatie in admin HTML-bestanden is de grootste technische schuld. De veiligste route is: eerst centrale service met defaults, daarna gefaseerd aansluiten per oppervlak.

## Sprintupdate 2026-07-08

Uitgevoerd:

| Onderdeel | Status |
| --- | --- |
| Centrale browser-veilige company settings service | Opgelost in `public/src/services/companySettingsService.js` |
| DOM-helper voor publieke pagina's | Opgelost in `public/src/services/companySettingsDomService.js` |
| Fallback defaults voor naam, telefoon, WhatsApp, e-mail en website | Opgelost |
| Helper voor telefoonlink | Opgelost: `tel:+31851302326` |
| Helper voor WhatsApp-link | Opgelost: `https://wa.me/31851302326` |
| Helper voor mailto-link | Opgelost |
| Homepage contact-CTA's | Aangesloten via `data-company-*` attributen |
| Homepage footer contactgegevens | Aangesloten via `data-company-*` attributen |
| Homepage structured data | Aangesloten via `data-company-json-ld` |
| Losse publieke WhatsApp/telefoonlinks | Oude Max Webstudio nummer vervangen door `31851302326` / `085 130 2326` |
| Leadbevestiging e-mailtemplate | WhatsApp-link vervangen door `https://wa.me/31851302326` |

Nog open:

| Onderdeel | Waarom nog open |
| --- | --- |
| Admin/salesportaal instellingenpagina | Bewust nog niet gedaan; eerst publieke laag veilig gezet. |
| Factuur/offerte-weergave volledig koppelen | Financieel gevoelig; apart aansluiten met regressiecheck. |
| E-mailtemplates volledig centraliseren | Functions gebruiken server-side patronen; aparte gedeelde server-helper is nodig. |
| Logo overal centraal maken | Veel pagina's gebruiken inline SVG; apart visueel controleren. |
| Social links overal centraal maken | Homepage is voorbereid, andere pagina's volgen in volgende sprint. |
| Persistente adminbeheerpagina `Instellingen -> Bedrijfsgegevens` | Volgende veilige stap na servicefundament. |

## Sprintupdate 2 2026-07-08

Uitgevoerd:

| Onderdeel | Status |
| --- | --- |
| Server-side company settings helper | Opgelost in `functions/company-settings.js` |
| Factuurpagina | Contactacties toegevoegd via `companySettingsService.js` helpers |
| Offertepagina | Contactacties toegevoegd via `companySettingsService.js` helpers |
| Klantportaal | Sidebar-contact en fallback/account-acties gekoppeld aan company settings |
| Bedankpagina's | WhatsApp/telefoonwaarden gekoppeld via `data-company-*` en DOM-service |
| Onboardingpagina | WhatsApp CTA's gekoppeld via `data-company-*` en DOM-service |
| Leadbevestiging | Ontvangerfallback en WhatsApp-link via server company settings |
| Project intake/onboarding e-mail | Adminfallback, contactregels en afsluiting via server company settings |
| Wijzigingsverzoek e-mail | Adminfallback, contactregels en afsluiting via server company settings |
| Factuurmails | Factuur, herinnering, betaald en verlopen contactregels via server company settings |
| Klantportaal welkomsmails | Loginfallback, merknaam en contactregel via server company settings |
| Websitepakket-update e-mail | Merknaam, contactregel en portal-url fallback via server company settings |
| Mollie betaalbevestiging/retry mails | Merknaam, site-url en contactregel via server company settings |
| Subscription retry mail | Merknaam, site-url en contactregel via server company settings |

Bewust niet aangepast:

| Onderdeel | Reden |
| --- | --- |
| Dynamische klant-telefoonnummers in admin/sales leadkaarten | Dit zijn telefoonnummers van leads/klanten, niet Max Webstudio contactgegevens. |
| Interne medewerker-invite flow | Vooral team/auth flow; geen publieke klantcontact-CTA. |
| Demo-seed records in `list-change-requests.js` | Demo-data, niet productie contactconfig. |
| Productomschrijvingen zoals `Max Web Studio onderhoud` | Productnaam/administratieve omschrijving, geen contactgegeven. |
| Volledige admin-instellingenpagina | Volgende sprint; vereist UI/state-migratie over gekloonde adminpagina's. |

Nog open:

| Onderdeel | Waarom nog open |
| --- | --- |
| Een echte beheerpagina `Instellingen -> Bedrijfsgegevens` | Eerst centrale read/helpers afgerond; beheer-UI is de volgende veilige stap. |
| Factuur/offerte PDF-generator als aparte server-PDF | Er is nu print/PDF vanuit pagina's; aparte PDF-storage flow moet apart gecontroleerd worden. |
| Admin/sales UI volledig migreren naar gedeelde frontend module | Grote gekloonde HTML-bestanden; apart doen om regressies te beperken. |
| Logo centraal afdwingen op alle pagina's en e-mails | Moet visueel worden getest per portaal/template. |
