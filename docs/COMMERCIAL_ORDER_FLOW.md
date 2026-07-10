# Commercial Order Flow

Dit document kiest de canonieke betaal- en orderflow.

## Canonieke Keuze

`/.netlify/functions/commercial-order` is de enige canonieke checkout-ingang voor nieuwe opdrachten.

Reden:

- admin-only via `verifyAdmin()`;
- gebruikt server-side pakket- en optieprijzen;
- bewaart klant/profiel/factuurcontext;
- bewaart acceptatie van algemene voorwaarden;
- maakt Mollie checkout server-side aan;
- koppelt Mollie webhookstatus terug naar factuur/timeline.

## Legacy Route

`/.netlify/functions/create-payment` is legacy.

Status:

- Maakt alleen een Mollie payment voor de oude publieke betaalpagina.
- Heeft niet dezelfde volledige CRM/order/account/projectcontext.
- Geeft in productie standaard `410 Gone`, tenzij `ALLOW_LEGACY_CREATE_PAYMENT=true` expliciet tijdelijk is gezet.

Gebruik de override alleen voor een korte gecontroleerde overgang. Nieuwe features mogen niet op `create-payment` bouwen.

## Bedragen

Bedragen moeten server-side worden bepaald.

Voor `commercial-order`:

- `PACKAGE_CATALOG` bepaalt pakketprijzen.
- `OPTION_CATALOG` bepaalt optieprijzen.
- De server berekent subtotaal, btw, totaal, aanbetaling en resterend bedrag.
- Mollie krijgt `totals.paymentAmount` uit de serverberekening.

Frontendbedragen zijn alleen invoer/preview en nooit de autoriteit voor afrekening.

## Webhook

`mollie-webhook`:

- haalt de betaalstatus opnieuw op bij Mollie;
- zoekt facturen op via `customer_invoices.mollie_payment_id`;
- zet status en `paid_at`;
- rondt commercial orders af wanneer betaling `paid` is;
- stuurt betaalbevestiging alleen wanneer `paid_email_sent_at` nog leeg is.

## Controlepunten

Voor live validatie:

1. Maak vanuit Max CRM een nieuwe opdracht aan.
2. Controleer dat een `customer`, `profile` en `customer_invoices` record ontstaan.
3. Controleer dat Mollie checkoutbedrag gelijk is aan de serverberekening.
4. Simuleer of voltooi betaling.
5. Controleer dat webhook exact dezelfde factuur bijwerkt.
6. Controleer dat herhaalde webhookcalls geen dubbele betaalmail sturen.
