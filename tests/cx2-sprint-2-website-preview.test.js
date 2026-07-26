const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("public/start.html");
const script = read("public/src/dca-start.js");
const styles = read("public/styles.css");
const contextFunction = read("functions/client-activation-start.js");

test("Sprint 2 heeft exact de goedgekeurde previewhiërarchie", () => {
  for (const copy of [
    "Dit is versie",
    "Wacht op beoordeling",
    "Desktop",
    "Tablet",
    "Mobiel",
    "Ik wil iets aanpassen",
    "Deze website wil ik hebben",
  ]) assert.ok(html.includes(copy), `Ontbrekende CX2-copy: ${copy}`);
  assert.doesNotMatch(html, /dashboardzijbalk|interne id/i);
});

test("versienummer komt uit de bestaande veilig gebonden previewversie", () => {
  assert.match(contextFunction, /select=id,demo_journey_id,version,title,generated_package,metadata/);
  assert.match(contextFunction, /versionNumber: Number\.isFinite\(Number\(version\.version\)\)/);
  assert.match(script, /view\.versionNumber/);
  assert.doesNotMatch(script, /URLSearchParams|location\.search/);
});

test("device switcher wijzigt uitsluitend de lokale visuele viewport", () => {
  assert.match(html, /data-cx2-device="desktop"/);
  assert.match(html, /data-cx2-device="tablet"/);
  assert.match(html, /data-cx2-device="mobile"/);
  assert.match(script, /setAttribute\("data-device", device\)/);
  assert.match(script, /setAttribute\("aria-pressed"/);
  assert.doesNotMatch(script, /preview[_-]?url|new URL\(/i);
});

test("preview behoudt sandbox, sessiebinding en veilige frontendgrenzen", () => {
  assert.match(html, /id="dca-preview-frame"[^>]*sandbox="allow-scripts allow-forms allow-modals"/s);
  assert.match(script, /credentials: "same-origin"/);
  assert.match(script, /cache: "no-store"/);
  assert.match(contextFunction, /binding\.preview_version_id/);
  assert.match(contextFunction, /binding\.preview_publication_id/);
  for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "console."]) {
    assert.equal(script.includes(forbidden), false, `Verboden browsergebruik: ${forbidden}`);
  }
});

test("voorbereidende sheets voeren geen feedback, approval of accountmutatie uit", () => {
  const publicSource = `${html}\n${script}`;
  assert.match(publicSource, /Feedback geven wordt in de volgende stap beschikbaar\./);
  assert.match(publicSource, /Activeer straks jouw persoonlijke omgeving om verder te gaan\./);
  assert.match(script, /openActionSheet\("feedback"\)/);
  assert.match(script, /openActionSheet\("approval"\)/);
  assert.doesNotMatch(script, /requestContext\("(?:feedback|approval|activate)"\)/i);
});

test("loading, ready, failed, expired en revoked blijven veilige toestanden", () => {
  for (const id of ["cx2-preview-loading", "cx2-preview-failed", "cx2-preview-retry"]) assert.ok(html.includes(`id="${id}"`));
  assert.match(script, /setDialogState\("loading"\)/);
  assert.match(script, /setDialogState\("ready"\)/);
  assert.match(script, /setDialogState\("failed"\)/);
  assert.match(html, /Deze persoonlijke link werkt niet meer\./);
  assert.doesNotMatch(html, /publication|revoked|session|token|database/i);
});

test("responsive acties, safe area, focus en reduced motion zijn vastgelegd", () => {
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media\(max-width:720px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /\.cx2-preview-action:focus-visible/);
  assert.match(script, /event\.key !== "Escape"/);
  assert.match(html, /aria-modal="true"/);
});

test("Sprint 1 voortgang gebruikt één expliciet CX2-stappencontract", () => {
  assert.match(script, /const CX2_STEPS = Object\.freeze/);
  assert.match(script, /CX2_STEPS\.length - 1/);
});
