# Admin Components

Reusable Max Webstudio CRM components live in:

- CSS classes: `/public/admin/styles/premium-design-system.css`
- JS render helpers: `/public/admin/ui/premium-ui.js`

New admin pages should use the `mws-*` classes and helpers first. Existing `admin-*` classes are intentionally mapped to the same design tokens so older pages can migrate gradually without functionality changes.
