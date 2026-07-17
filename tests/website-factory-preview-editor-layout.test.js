const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "public/admin/ui/website-factory-preview-editor.js"), "utf8");
const editor = require("../public/admin/ui/website-factory-preview-editor.js");

test("1 standard mode hides the settings panel", () => {
  assert.equal(editor.editorLayoutState({ enabled: false, editable: true }).showSettingsPanel, false);
  assert.match(html, /id="factory-section-context"[^>]*aria-hidden="true"[^>]*hidden/);
});

test("2 standard mode reserves no settings column", () => {
  assert.match(css, /\.factory-editor-workspace\{[^}]*grid-template-columns:minmax\(0,1fr\)[;}]/);
  assert.doesNotMatch(css, /\.factory-editor-workspace\{[^}]*grid-template-columns:minmax\(0,1fr\) 290px/);
});

test("3 the preview uses the available workspace width", () => {
  assert.match(css, /\.factory-editor-workspace>\.factory-guided-preview-main\{min-width:0\}/);
  assert.match(css, /\.factory-editor-workspace\{[^}]*overflow-x:hidden/);
});

test("4 activating edit mode opens the settings panel", () => {
  const layout = editor.editorLayoutState({ enabled: true, editable: true });
  assert.equal(layout.showSettingsPanel, true);
  assert.equal(layout.workspaceClass, "has-settings-panel");
});

test("5 edit mode uses the explicit two-column layout", () => {
  assert.match(css, /\.factory-editor-workspace\.has-settings-panel\{grid-template-columns:minmax\(0,1fr\) 290px\}/);
  assert.match(editorSource, /editorWorkspace\.classList\.toggle\("has-settings-panel", layout\.showSettingsPanel\)/);
});

test("6 closing edit mode hides the panel immediately", () => {
  assert.equal(editor.editorLayoutState({ enabled: false, editable: true }).showSettingsPanel, false);
  assert.match(editorSource, /settingsPanel\.hidden = !layout\.showSettingsPanel/);
  assert.match(editorSource, /toggle\.textContent = enabled \? "Bewerken sluiten" : "Bewerken"/);
});

test("7 closing edit mode clears the selected section", () => {
  const clearSelection = editorSource.slice(editorSource.indexOf("const clearSectionSelection"), editorSource.indexOf("const disable"));
  assert.match(clearSelection, /state\.selectedSection = null/);
  assert.match(clearSelection, /state\.hero = null/);
  assert.match(clearSelection, /state\.textSection = null/);
  assert.match(editorSource, /const disable = \(\) => \{\s*clearSectionSelection\(true\)/);
});

test("8 read-only ZIP never shows the settings panel", () => {
  assert.equal(editor.editorLayoutState({ enabled: true, editable: false }).showSettingsPanel, false);
  assert.match(html, /factory-preview-readonly-note/);
});

test("9 read-only ZIP cannot expose an active edit button", () => {
  assert.match(html, /editorToggle\.disabled = source === "manual" \|\| !capability\.editorAvailable/);
  assert.match(editorSource, /toggle\.disabled = !editable/);
});

test("10 switching from editable Factory to ZIP closes edit mode", () => {
  assert.match(editorSource, /if \(state\.enabled && !editable\) disable\(\)/);
});

test("11 switching back to Factory does not reopen edit mode", () => {
  assert.equal(editor.editorLayoutState({ enabled: false, editable: true }).showSettingsPanel, false);
  const contextHandler = editorSource.slice(editorSource.indexOf('globalScope.addEventListener("factory:preview-context"'), editorSource.indexOf('frame.addEventListener("load"'));
  assert.doesNotMatch(contextHandler, /else\s+enable\(\)/);
});

test("12 refresh initializes without a settings panel", () => {
  assert.match(editorSource, /setEnabledState\(false\);\s*resetPanel\(\)/);
  assert.match(html, /id="factory-section-context"[^>]*hidden/);
});

test("13 toggling edit mode leaves the device choice untouched", () => {
  assert.doesNotMatch(editorSource, /data-guided-preview-mode|data-preview-mode/);
});

test("14 desktop layout prevents horizontal overflow", () => {
  assert.match(css, /\.factory-editor-workspace\{[^}]*min-width:0[^}]*overflow-x:hidden/);
  assert.match(css, /\.factory-editor-workspace\.has-settings-panel\{grid-template-columns:minmax\(0,1fr\) 290px\}/);
});

test("15 mobile layout stacks the open settings panel without overflow", () => {
  assert.match(css, /@media\(max-width:1180px\)\{\.factory-editor-workspace\.has-settings-panel\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:620px\)\{\.factory-section-context dl\{grid-template-columns:1fr\}/);
});

test("16 missing-preview copy is not kept in a permanent empty column", () => {
  assert.match(editorSource, /missing_version/);
  assert.match(css, /\.factory-section-context\[hidden\]\{display:none\}/);
  assert.equal(editor.editorLayoutState({ enabled: false, editable: false }).showSettingsPanel, false);
});
