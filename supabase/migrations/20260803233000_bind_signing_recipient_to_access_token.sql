-- Bind the verified dispatch recipient to the opaque signing link.
-- The plaintext value is private, short-lived and cleared after start or revocation.
begin;

alter table public.commercial_offer_signing_access_tokens
  add column if not exists signer_email text;

alter table public.commercial_offer_signing_access_tokens
  add constraint commercial_offer_signing_access_signer_email_check
  check (
    signer_email is null
    or (
      signer_email = lower(btrim(signer_email))
      and char_length(signer_email) <= 320
      and signer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

comment on column public.commercial_offer_signing_access_tokens.signer_email is
  'Private verified dispatch recipient. Cleared after Signhost start, failure, or access revocation.';

notify pgrst,'reload schema';
commit;
