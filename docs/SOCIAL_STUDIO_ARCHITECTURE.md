# Social Studio Architecture

## MVP scope

Social Studio is an Admin CRM production module for creating, planning, reviewing, storing and exporting social content. The MVP is local-first and does not call AI or external publishing APIs.

## Module layers

1. `public/admin-social-media-studio.html` is the presentation shell.
2. `public/src/social-media-studio.js` coordinates editor interactions and rendering.
3. `public/src/social-studio/core.mjs` owns the versioned content contract, workflow statuses and capability registry.
4. `public/src/social-studio/local-repository.mjs` is the current persistence adapter.

UI code must not depend directly on a future database, AI provider, publishing network or analytics vendor. Those integrations belong behind adapters that consume and return the core content contract.

## Content contract

Every stored content item contains:

- `schemaVersion` and `entityType` for migrations;
- stable `id`, platform and workflow status;
- content, customer, campaign and planning fields;
- an approval namespace;
- `integrations` for external provider references;
- `metrics` for normalized performance data;
- `extensions` for capability-specific data that is not part of the core model;
- creation and update timestamps.

Unknown or legacy statuses normalize to `draft`. Existing flat MVP fields remain readable so stored browser data is migrated without destructive resets.

## Capability boundary

The capability registry declares what is active and what is planned. The MVP activates only the editor and local planning. Planned capabilities are:

- AI Content Creator;
- automatic publishing;
- Analytics;
- SEO Studio;
- Review Manager;
- Email Marketing;
- Campaigns.

Adding one of these capabilities should introduce an adapter and capability-specific UI, not provider logic in the core model or editor.

## Persistence evolution

`LocalSocialStudioRepository` is the MVP adapter. A future Supabase repository must expose the same read/write intent while enforcing admin authentication, tenant boundaries, approval state and audit metadata server-side. A migration should keep local import/export available as a recovery path.

## Safety boundary

- No automatic publication in the MVP.
- No API keys in browser code.
- No AI calls without a server-side endpoint and explicit product approval.
- No customer data sharing across tenant boundaries.
- External metrics and publication IDs belong in `integrations` or `metrics`, not ad-hoc UI storage.
