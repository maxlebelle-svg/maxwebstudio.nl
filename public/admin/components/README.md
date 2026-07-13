# Admin Components

Reusable Max Webstudio CRM components live in:

- CSS classes: `/public/admin/styles/premium-design-system.css`
- JS render helpers: `/public/admin/ui/premium-ui.js`

New admin pages should use the `mws-*` classes and helpers first. Existing `admin-*` classes are intentionally mapped to the same design tokens so older pages can migrate gradually without functionality changes.

## Sidebar foundation

Phase 1 adds an isolated sidebar foundation that is not loaded by existing pages yet:

- Navigation contract: `/public/admin/config/sidebar-navigation.js`
- DOM components: `/public/admin/components/admin-sidebar.js`
- Scoped styles: `/public/admin/styles/admin-sidebar-system.css`

The component module exposes `AdminSidebar`, `SidebarSection`, `SidebarItem`,
`WorkspaceCard`, `WorkspaceSelector`, `MetricBadge`, `StatusBadge`, `Avatar`,
`UserProfileMenu`, `EmptyWorkspaceState`, and `LoadingSkeleton` through
`window.MaxAdminSidebar`. It never mounts itself; a later migration phase must
explicitly render it into a page after authorization and workspace state are ready.
