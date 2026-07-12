const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminPage = fs.readFileSync(path.join(root, "public/admin-assets.html"), "utf8");
const adminClient = fs.readFileSync(path.join(root, "public/admin/ui/central-asset-library.js"), "utf8");
const portal = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const backend = require("../functions/admin-relationship-assets")._test;

test("admin central library has search, filters, previews and direct workflow actions", () => {
  for (const id of ["central-asset-search", "central-asset-customer", "central-asset-category", "central-asset-type", "central-asset-status", "central-asset-grid"]) assert.match(adminPage, new RegExp(`id="${id}"`));
  for (const action of ["open", "download", "branding", "website"]) assert.match(adminClient, new RegExp(`data-central-action="${action}"`));
  assert.match(adminClient, /customerId/);
  assert.match(adminClient, /Preview niet beschikbaar/);
  assert.match(adminPage, /if \(document\.getElementById\("central-asset-library"\)\) return/);
});

test("admin asset contract is safe and retains useful customer context", () => {
  const asset = backend.safe({ id: "asset", customer_id: "customer", original_filename: "een-zeer-lange-bestandsnaam.png", storage_path: "customer/private.png", mime_type: "image/png", metadata: { description: "Primair logo", brandingRole: "logo", secret: "hidden" } }, { customerName: "FuelLinq" });
  assert.equal(asset.customerName, "FuelLinq");
  assert.equal(asset.description, "Primair logo");
  assert.equal(asset.brandingRole, "logo");
  assert.equal(asset.previewAvailable, true);
  assert.equal(asset.storage_path, undefined);
  assert.equal(asset.metadata, undefined);
});

test("premium branding uses the secured customer asset source and explicit approval", () => {
  for (const id of ["portal-branding-logo-preview", "portal-branding-foundation", "portal-branding-assets", "portal-branding-approve", "portal-branding-logo-open"]) assert.match(portal, new RegExp(`id="${id}"`));
  assert.match(portal, /portalRelationshipAssets\.filter/);
  assert.match(portal, /action: "approve_branding"/);
  assert.match(portal, /getRelationshipAssetPreview/);
  assert.match(portal, /Logo-preview niet beschikbaar/);
  assert.doesNotMatch(portal, /10 versies voorbereid/);
});

test("asset discovery and branding layouts remain usable on narrow screens and long names", () => {
  assert.match(styles, /\.central-asset-copy h3[^}]*text-overflow:ellipsis/);
  assert.match(styles, /@media\(max-width:700px\)/);
  assert.match(styles, /\.brand-logo-previews[^}]*grid-template-columns:repeat\(2/);
  assert.match(styles, /\.central-asset-grid[^}]*grid-template-columns:repeat\(3/);
  assert.match(styles, /object-fit:contain/);
});
