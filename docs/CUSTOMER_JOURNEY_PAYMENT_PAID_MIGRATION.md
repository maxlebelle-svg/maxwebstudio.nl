# Fase 9 — `payment.paid` ownership en testmigratie

Datum: 13 juli 2026
Status: geïmplementeerd, standaard uit, uitsluitend expliciete testklanten

## Externe activatie van Fase 8

Productieproject `maxwebstudio` (`yxxahurphdbblkuxoeje`) is opnieuw bevestigd via de gekoppelde CLI en de live publieke auth-config. De byte-identieke migraties `20260713200000` en `20260713200100` zijn beide toegepast met SHA-256 `e6773d72987f25595b5597c1ed9dce265540a27cbb1b6275ce3085bdc84f0118`.

Beide transacties doorliepen hun assertions voor `SECURITY DEFINER`, vaste `search_path`, anon/authenticated-denial en service-role-execution. Remote history, tabellen en indexes zijn daarna read-only gecontroleerd. Journey-events, outboxitems en executions bleven elk één; journey-instances bleven nul. Er is geen klant, allowlist, instance, outboxitem, execution, providercall of mail aangemaakt. Alleen de lokale optionele pg-delta-cache gaf na de succesvolle commits een Dockerwaarschuwing.

## Bestaande betaalflow

De publieke checkout en `commercial-order` maken eerst een invoice en daarna expliciet een Mollie-payment. Previewbetaling maakt pas na approval en een expliciete klantactie een testdeposit-invoice/payment. De redirect naar `bedankt.html` is uitsluitend navigatie en geen betaalbewijs.

Het canonieke betaalmoment is `functions/mollie-webhook.js`: de webhook accepteert alleen een payment-ID, kiest volgens de bestaande test/live-policy een key en haalt de actuele payment opnieuw bij Mollie op. Alleen providerstatus `paid` gaat door naar de betaalde flow. Een invoice wordt server-side gevonden via `mollie_payment_id`; de lookup is nu begrensd op twee en stopt bij meerdere matches.

De bestaande volgorde blijft:

1. providerpayment ophalen;
2. invoice status, Mollie-status en `paid_at` opslaan;
3. gededupliceerd payment-timeline-event;
4. bestaande commerciële finalisatie voor commercial orders;
5. bestaande afzonderlijke onboarding/welcomeflow;
6. ownershipbesluit voor uitsluitend de betaalbevestigingsmail.

Subscriptionpayments, retries, refunds, chargebacks, failed/expired mails en website-live blijven buiten scope. Journey-, mail- of progressfouten draaien geen financiële verwerking terug en de webhook antwoordt zoals voorheen gecontroleerd met HTTP 200.

## Canoniek event en stabiele identiteit

Event: `payment.paid`

Effect: `email.payment_paid`

Template: `journey.payment_paid.v1`

De stabiele scope bevat provider, provider payment-ID, customer-ID, order- of invoice-ID, effect en templateversie. De providerreference wordt in journeydata en admininzage uitsluitend als SHA-256-fingerprint opgeslagen. Een actuele timestamp of willekeurige UUID is geen deduplicatiebron. De centrale databaseconstraints op eventkey, outbox-idempotency en event/effect voorkomen dubbele events en outboxitems.

## Paymentcontextresolver

`paymentPaidContextResolver` vertrouwt uitsluitend op de opnieuw bij Mollie opgehaalde status plus de duurzaam bijgewerkte invoice. Hij valideert:

- providerstatus `paid`;
- exacte payment-ID/invoicekoppeling;
- optionele provider invoice-ID;
- server-side customerkoppeling;
- test/live-consistentie;
- EUR;
- positief bedrag met maximaal twee decimalen;
- exacte provider-/invoicebedragmatch;
- betaalde invoicestatus en `paid_at`;
- niet-geannuleerde commerciële context.

Uitkomsten zijn volledige betaling, aanbetaling, restantbetaling, previewdeposit en losse gekoppelde factuurbetaling. Onzekere providerdata, verkeerde customer/invoice, meerdere facturen, bedrag-/valutamismatch, geannuleerde order of inconsistente invoice leiden tot `financial_review`: geen Journey-mail, geen progresswrite en geen reminderannulering. De bestaande financiële verwerking blijft leidend.

Structured logs bevatten alleen categorieën, owner, reden, omgeving en paymenttype; volledige metadata, e-mailadres en bedrag zijn uit de algemene Mollie-statuslogs verwijderd.

## Ownership en recovery

Journey-owner vereist tegelijk de engine- en mailflags, de aparte lege standaardallowlist `JOURNEY_PAYMENT_PAID_TEST_CUSTOMERS`, een bestaande actieve `testOnly`-journey met `paymentPaidEmailOwner: journey`, beschikbare storage, betrouwbare paymentcontext, recipient policy en geldige template/CTA.

Vóór acceptatie houden niet-geselecteerde of ongeldige situaties de bestaande legacy betaalmail. Na atomaire event/outboxacceptatie is legacyfallback uitgesloten; pending, retry, failed, dead-letter en ambiguous blijven Journey-owned. Provideracceptatie gevolgd door een databasefout gebruikt de bestaande `ambiguous_send`-bescherming en wordt niet blind opnieuw verstuurd.

De beveiligde super-adminactie kan alleen een al bestaande geselecteerde testjourney markeren. Zij maakt geen klant of reguliere instance.

## Progress en reminders

Journeyrelevante volledige, deposit- en restantbetalingen voltooien de commerciële/paymentstap en zetten `project_handover` ready. Een losse factuurbetaling kan wel een bevestigingsmail krijgen maar verandert zonder journeyverband geen progress. Geen transition forceert preview approval, invoice paid, website live, hosting of project completion; die financiële status is al door de bestaande webhookbusinessregel bepaald.

Na een betrouwbaar ownershipbesluit zoekt de repository maximaal honderd test-only `email.payment_reminder`/`email.invoice_reminder`-items voor exact dezelfde customer en invoice/order. Alleen `pending` of `failed` wordt idempotent `cancelled` met reason `payment_already_received`. Sent/completed, andere klanten en andere referenties blijven onaangeraakt. Bij onzekere scope wordt niets geannuleerd. Het geannuleerde aantal wordt veilig in event/outboxdiagnostiek opgeslagen.

## Template en CTA-policy

Testonderwerp: `[TEST] Uw betaling is ontvangen`.

De centrale template levert HTML, plain text en preview text voor volledige betaling, aanbetaling, restantbetaling en factuurbetaling. Een bedrag wordt alleen getoond bij een gevalideerde provider-/invoicebedragmatch; aanbetalingen claimen nooit dat alles betaald is. From blijft `Max Webstudio <info@maxwebstudio.nl>` en Reply-To volgt de centrale zakelijke policy.

CTA's blijven beperkt tot bestaande maxwebstudio.nl-klantportaalroutes, waaronder dashboard en `#facturen`. Er wordt geen Mollie-link, Function-URL, clientredirect of nieuwe betaalactie toegevoegd.

## Admin, worker en activatie

De read-only adminweergave toont veilige providercategorie, test/live, paymentfingerprint, order-/invoicereference, paymenttype/state, invoicestate, commerciële completionstate, paid/remaining component, next-step, acties, progress, reminder-count, outbox/execution/providerstatus, templateversie, attempts en foutcategorie. Recipient, providerpayload, API-keys en bedrag worden niet geselecteerd.

De additieve migratie `20260713210000_enable_payment_paid_test_outbox.sql` breidt uitsluitend de begrensde testworkerclaim uit met `email.payment_paid`. Zij behoudt vaste `search_path`, service-role-only execution, lease recovery en batchlimiet.

## Productieactivatie van Fase 9

Op 13 juli 2026 is uitsluitend migratie `20260713210000` toegepast op productieproject `maxwebstudio` (`yxxahurphdbblkuxoeje`). De lokale bron en de geïsoleerde uitvoerkopie waren byte-identiek met SHA-256 `03a679d015365ddc4172c58eff819e67997ca5fe8e097c89ecf9413046665a83`. De voorafgaande dry-run noemde exact deze ene migratie en de definitieve remote history bevat dezelfde versie.

De transactionele catalogusasserties bevestigden `SECURITY DEFINER`, vaste `search_path = public, pg_temp`, geen execute voor `public`, `anon` of `authenticated`, en wel execute voor `service_role`. De migratie raakte geen RLS-policy, tabelconstraint of index. De bestaande journey-indexen bleven aanwezig. Journey-events, outboxitems en executions bleven vóór en na elk één; journey-instances bleven nul.

Er is geen feature flag geactiveerd, geen allowlistwaarde, klant, journey-instance, outboxitem of execution aangemaakt, geen worker of scheduler gestart en geen providercall of mail uitgevoerd. Na de succesvolle databasecommit kon alleen de optionele lokale pg-delta/schema-exportcache niet worden bijgewerkt doordat Docker Desktop uitstond; dit veranderde de remote migratie of databasecontrole niet.
