# Max CRM Design System / UI Rules

Status: RC1 design governance  
Scope: Max CRM admin, sales, customer, website, project, finance and future internal workspaces

## Purpose

This document defines the fixed UI rules for Max CRM. Every future module must feel like it belongs to the same premium operating system for Max Webstudio.

New features may extend the product, but they may not introduce a new visual direction.

## Design Principles

- Max CRM is a premium dark business platform, not a generic admin panel.
- The interface must feel calm, focused and operational.
- Daily actions should be obvious within 10 seconds.
- The user should never see raw technical language unless Developer Mode is enabled.
- Important actions must be easy to find, but the page should never feel crowded.
- Every module should help the user answer: what needs attention, what is the next step, and what can I do now?
- Sales Workspace RC1 is feature-complete. Only bug fixes, small UX fixes and consistency improvements are allowed there until a new sprint explicitly reopens it.

## Layout Rules

- Use the existing Max CRM sidebar/workspace structure as the default layout.
- Each main module gets its own workspace: Dashboard, Leads, Klanten, Websites, Projecten, Offertes, Facturen, Abonnementen and Instellingen.
- Do not stack every module on one long page.
- Prefer a clear workspace layout:
  - header or module intro;
  - primary actions;
  - compact metrics or filters;
  - list/work area;
  - detail or contextual panel.
- Avoid floating panels that overlap unrelated content.
- Detail panels must end when their content ends. They may not stretch through the full page height unless the content requires it.
- Keep desktop layouts dense but readable.
- Mobile layouts should stack logically: primary action, form/list, detail, supporting cards.
- Avoid nested cards inside cards unless the inner element is a real repeated item, modal, or embedded tool.

## Cards

- Cards use the premium dark theme.
- Cards should have subtle borders, low-contrast depth and consistent padding.
- No large white cards are allowed inside Max CRM.
- White/light surfaces are only allowed for external embeds that require them, such as Google Maps.
- Cards should not use decorative gradients that introduce a different product style.
- A card should have one clear purpose.
- If a card contains actions, keep them grouped at the bottom or in a predictable action row.
- Avoid empty oversized cards. Use empty states instead.

## Buttons

Use a consistent action hierarchy:

- Primary actions: blue.
- Secondary actions: white or light neutral.
- Danger actions: red.
- Disabled actions: muted grey.
- Positive status actions: green only when the action confirms or activates something.

Rules:

- A page should have no more than three primary actions visible in the same action area.
- Primary buttons should be reserved for the next best action.
- Secondary buttons are for navigation, reset, preview, copy or supporting actions.
- Danger buttons must be visually separated from normal actions.
- Button labels must describe the result, not the implementation.
- Avoid duplicate buttons that do the same thing in the same viewport.

## Badges

Badges communicate state, not decoration.

- Positive: green.
- Warning: yellow/orange.
- Error or danger: red.
- Neutral or inactive: grey.
- Product mode or source labels: blue or muted neutral.

Rules:

- Keep badge text short.
- Use human language: "Live", "Klaar", "Geen resultaat", "Fout", "Voorbereid".
- Do not expose internal states like raw API names, stack traces or table errors outside Developer Mode.

## Forms

- Forms must match the dark CRM theme.
- Inputs must use dark backgrounds with subtle borders.
- Avoid default browser-white inputs.
- Labels should be short and clear.
- Placeholder text should guide, not replace labels.
- Required fields should be visually indicated.
- Field groups should follow the user's mental model, not database structure.
- Do not overwrite user-entered data without confirmation.
- Validation messages should explain what to do next.
- Use sensible defaults where possible.

## Tables And Lists

- Tables and lists should be compact and scannable.
- Avoid excessive row height.
- Show the most important columns first.
- Use badges for status.
- Use one clear primary row action when possible.
- Detail actions should move into the detail panel instead of cluttering the row.
- Empty lists need a helpful empty state, not an empty box.
- Demo data must not appear in normal production workspaces.
- If demo/local data is visible for testing, it must be clearly marked and hidden behind Developer Mode where possible.

## Detail Panels

- Detail panels should be contextual and compact.
- They should not stretch unnecessarily.
- They should never cover the main work area in a way that blocks active forms.
- Use a consistent structure:
  - title;
  - status badge;
  - key information;
  - editable fields or summary;
  - primary actions;
  - secondary actions;
  - history, files or technical notes only when needed.
- If no item is selected, show a calm empty state explaining what to select.
- Do not show a giant blank panel.

## Empty States

Empty states should help the user continue.

Good examples:

- "Nog geen lead geselecteerd. Kies een lead uit de lijst om opvolging te beheren."
- "Nog geen facturen. Maak een factuur aan zodra de klant akkoord heeft gegeven."
- "Geen resultaten gevonden. Probeer bedrijfsnaam + plaats."

Rules:

- Empty states should be short.
- Always include a next step when possible.
- Do not show raw null, undefined, object names or internal service states.

## Loading States

- Loading states should be calm and brief.
- Prefer "Laden..." or a skeleton-style placeholder over raw technical status.
- Loading should never block unrelated modules.
- If a module fails, the rest of the dashboard must remain usable.
- Long-running actions need feedback and a retry path.

## Error Messages

Users should see understandable errors.

Use:

- "Website niet bereikbaar. Probeer het later opnieuw."
- "Geen bedrijf gevonden voor deze zoekopdracht."
- "Klantgegevens konden niet worden geladen. Controleer je toegang of probeer opnieuw."

Do not show outside Developer Mode:

- JavaScript stack traces.
- Supabase table names.
- API keys.
- Raw policy errors.
- Internal function names.
- Raw object properties such as `_source`.

Developer Mode may show technical details when useful, but never secrets.

## Developer Mode

Developer Mode is for internal diagnostics only.

Visible only in Developer Mode:

- localStorage tools;
- raw data source labels;
- readiness checks;
- API statuses;
- migration/debug information;
- raw Supabase or function diagnostics;
- detailed Google Places debug output;
- stack traces or internal error codes.

Normal users and daily admin users should see clean product messages only.

## Google Maps And Website Scan Exceptions

Google Maps and Website Scan have a few specific rules.

Google Maps:

- The actual map may be light because it is an external Google embed.
- Everything around the map must remain Max CRM dark theme.
- The Google Maps panel uses:
  - title;
  - subtext;
  - status badge top-right;
  - search input;
  - primary blue search button;
  - dark result card on the left;
  - real interactive map on the right;
  - dark "Over te nemen gegevens" card below.
- No fake business data in production.
- No bulk scraping in Sales Workspace RC1.
- If Places fails, show a human error and keep the rest of the CRM usable.

Website Scan:

- Website Scan is an objective check layer, not AI.
- It should show clear checks, status colors and a score.
- It must never crash the UI when a website is unreachable.
- It should show user-friendly failure reasons such as timeout, DNS, SSL, 404 or 500 when available.
- Raw scan internals are Developer Mode only.

## Do's For Codex

- Reuse existing Max CRM styles before adding new ones.
- Keep every new module visually consistent with the premium dark theme.
- Keep daily workflows short and obvious.
- Use blue for the next primary action.
- Keep tables compact.
- Keep detail panels content-sized.
- Hide technical details behind Developer Mode.
- Add helpful empty, loading and error states.
- Treat Sales Workspace RC1 as stable unless the user explicitly starts a new sprint.
- Preserve existing working Google Places and Website Scan behavior when doing UI polish.

## Don'ts For Codex

- Do not introduce white admin panels.
- Do not invent a new visual style per module.
- Do not expose raw errors to normal users.
- Do not add bulk scraping, auto outreach, AI or new sales automation inside Sales Workspace RC1 without an explicit sprint.
- Do not stretch detail panels through the full page when content is short.
- Do not place demo leads or fake customers in normal production views.
- Do not overwrite manually entered form data without confirmation.
- Do not let one failing widget block the whole dashboard.
- Do not add new dependencies for basic UI polish.

## Pre-Release UI Checklist

Before a Max CRM UI change is considered ready:

- The page follows the premium dark theme.
- No unintended white panels are visible.
- Primary, secondary and danger actions follow the button rules.
- Empty states are helpful.
- Loading states are calm.
- Errors are understandable.
- Developer details are hidden unless Developer Mode is enabled.
- Detail panels do not stretch unnecessarily.
- Tables/lists are compact and scannable.
- Mobile layout is usable.
- Existing Google Maps, Website Scan, auth and CRM flows still work.
