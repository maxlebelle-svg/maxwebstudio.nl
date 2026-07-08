# Premium CRM Design System

Central source for Max Webstudio admin UI:

- CSS: `/public/admin/styles/premium-design-system.css`
- JS render helpers: `/public/admin/ui/premium-ui.js`

Use this layer for every new admin module. Do not invent one-off card, button, badge, table or form styles inside pages unless a module truly needs a local layout exception.

## Layouts

- `mws-dashboard-layout`: hero, toolbar, content sections.
- `mws-master-detail-layout`: left list, center content, optional right panel.
- `mws-settings-layout`: left navigation, right content.
- `mws-editor-layout`: sidebar, editor, inspector.
- `mws-empty-layout`: centered empty state with action.

## Core Components

- Hero: `mws-hero-banner`
- Cards: `mws-premium-card`, `mws-card`
- Stats and KPIs: `mws-stat-card`, `mws-kpi-card`
- Section header: `mws-section-header`
- Toolbar and filters: `mws-toolbar`, `mws-filter-bar`
- Search: `mws-search-bar`
- Forms: `mws-form-field`, `mws-text-input`, `mws-select`, `mws-date-picker`, `mws-toggle`
- Buttons: `mws-button`, `mws-button-primary`, `mws-button-secondary`, `mws-button-ghost`, `mws-button-danger`, `mws-button-success`, `mws-button-small`, `mws-button-large`
- Icon button: `mws-icon-button`
- Badges and tags: `mws-status-badge`, `mws-tag`, `mws-badge-success`, `mws-badge-pending`, `mws-badge-draft`, `mws-badge-warning`, `mws-badge-failed`, `mws-badge-info`, `mws-badge-processing`, `mws-badge-active`, `mws-badge-inactive`
- Tables: `mws-table-wrap`, `mws-table`, `mws-data-row`, `mws-sortable-header`
- Timeline: `mws-timeline`, `mws-activity-item`
- Feedback: `mws-alert`, `mws-success-message`, `mws-warning-message`, `mws-error-message`
- Loading: `mws-loading-state`, `mws-skeleton`, `mws-skeleton-card`, `mws-skeleton-row`, `mws-skeleton-form`, `mws-skeleton-editor`, `mws-skeleton-list`
- Overlays: `mws-slide-over`, `mws-modal-backdrop`, `mws-modal`, `mws-confirmation-dialog`
- Navigation controls: `mws-tabs`, `mws-tab`, `mws-breadcrumb`, `mws-pagination`, `mws-dropdown`
- Identity: `mws-avatar`
- Empty states: `mws-empty-state`, `mws-empty-state-icon`

## Tokens

Use `--mws-*` tokens for spacing, radius, typography, colors, gradients, transitions, shadows and blur. Examples:

- Spacing: `--mws-space-1` through `--mws-space-12`
- Radius: `--mws-radius-sm`, `--mws-radius-md`, `--mws-radius-pill`
- Typography: `--mws-font-size-hero`, `--mws-font-size-section`, `--mws-font-size-card-title`
- Colors: `--mws-color-primary`, `--mws-color-success`, `--mws-color-warning`, `--mws-color-danger`
- Surfaces: `--mws-gradient-page`, `--mws-gradient-hero`, `--mws-gradient-card`, `--mws-gradient-field`
- Motion: `--mws-transition`, `--mws-transition-slow`

## Migration Rule

Existing admin classes such as `admin-hero`, `admin-card`, `button`, `status-badge`, `admin-section-heading`, and standard form fields are mapped onto the same design system tokens. This keeps older modules stable while new modules can use the `mws-*` names directly.
