# Lead demo invitation deliverability audit — 2026-07-14

Scope: read-only public DNS and repository configuration. No DNS, Resend dashboard, production mail, user, or data was changed.

## Outcome

The public authentication records required for a Resend sender on `maxwebstudio.nl` are present. Public DNS alone cannot prove that the active Resend account currently marks the domain as verified, that Netlify uses the intended `FROM_EMAIL`, or why a specific message landed in spam. That requires the Resend domain screen plus the delivered message headers/provider event.

The new lead invitation is multipart (HTML and text), uses direct HTTPS links without a URL shortener, has restrained copy, a real support address and no password. Runtime sending is disabled by default. Email Studio shows an admin warning until both a From address is configured and `RESEND_DOMAIN_VERIFIED=true` is set intentionally.

## Public DNS observed

| Check | Observed | Assessment |
| --- | --- | --- |
| Apex SPF | `v=spf1 include:spf.protection.outlook.com include:_spf.google.com -all` | Valid for Microsoft/Google mail. Resend uses its dedicated return-path subdomain, so it does not need to be added to this apex SPF record. |
| Resend return-path MX | `send.maxwebstudio.nl` → `feedback-smtp.eu-west-1.amazonses.com` | Present and consistent with Resend/Amazon SES feedback handling. |
| Resend return-path SPF | `send.maxwebstudio.nl` → `v=spf1 include:amazonses.com ~all` | Present. With default relaxed DMARC alignment, `send.maxwebstudio.nl` aligns organizationally with `maxwebstudio.nl`. |
| DKIM | TXT at `resend._domainkey.maxwebstudio.nl` with an RSA public key | Present. Actual pass/selector use must be confirmed in delivered headers or the Resend dashboard. |
| DMARC | `v=DMARC1; p=reject;` | Strong enforcement is active. It has no aggregate reporting address (`rua`), so failures are harder to diagnose. Do not weaken this policy without a deliberate mail-source audit. |
| Custom tracking domain | No CNAME found at `links.maxwebstudio.nl` or `email.maxwebstudio.nl` | No public custom tracking domain was observed. Resend tracking is disabled by default; if it is enabled in the dashboard, configure and verify the exact CNAME returned by Resend before relying on it. |

Resend documents that a verified domain passes its SPF and DKIM checks, that the default return path is the `send` subdomain, and that tracking needs an explicitly configured and verified tracking subdomain. The dashboard remains the source of truth for the account-specific status.

## Code/configuration findings

Correct now:

- `resendMailService` submits `from`, `reply_to`, HTML and text to Resend and supports a provider idempotency key.
- The lead invitation has a dedicated template and does not reuse customer onboarding copy.
- The activation CTA points directly to the Supabase one-time link and then to a first-party `maxwebstudio.nl` portal.
- The explicit invitation is stored in the event/outbox transaction before any provider call.
- Non-production environments and a disabled `LEAD_DEMO_INVITATION_EMAIL_ENABLED` flag cannot send the lead invitation.
- Email Studio warns when the sender address is absent or the deployment has not explicitly asserted Resend domain verification.

Still to verify manually before enabling production sending:

1. In Resend Domains, confirm `maxwebstudio.nl` is `verified` and SPF/DKIM both pass.
2. In Netlify, confirm `LEAD_DEMO_INVITE_FROM_EMAIL` (or `FROM_EMAIL`) uses an address at that same verified domain, preferably `Max Webstudio <info@maxwebstudio.nl>`.
3. Confirm `REPLY_TO_EMAIL` is a monitored `@maxwebstudio.nl` mailbox.
4. Send one separately approved seed message and inspect `Authentication-Results` for `spf=pass`, `dkim=pass`, and `dmarc=pass`; also inspect From, Return-Path and Reply-To alignment.
5. Inspect the Resend message event for delivered/delayed/bounced/complained and record the provider response. No such production event or headers were available in this audit.
6. Check whether open/click tracking is enabled. If enabled, prefer a verified first-party tracking subdomain; otherwise leave tracking off for the activation mail.

## Possible later DNS actions (not applied)

- Optional but useful: add a DMARC aggregate reporting destination, for example a deliberately managed `rua=mailto:...`, only after confirming that mailbox/provider is ready to receive XML reports.
- Only if tracking will be enabled: add the exact tracking CNAME (and any CAA record) supplied by the active Resend domain configuration. Do not invent the target value from examples.
- No replacement of the currently observed SPF, DKIM, MX or `p=reject` DMARC records is recommended from this audit.

## Most likely explanation for spam placement

DNS authentication appears structurally present, so the available evidence does not support “missing SPF/DKIM/DMARC” as the sole cause. The remaining likely categories are deployment sender mismatch, a Resend account/domain verification mismatch, message/reputation signals, tracking/link reputation, or recipient-provider filtering. The exact cause cannot be established without the affected message headers and Resend event details.
