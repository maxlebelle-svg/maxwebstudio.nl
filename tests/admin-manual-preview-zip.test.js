const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _private } = require("../functions/admin-manual-preview");

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBody = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBody.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBody, eocd]);
}

test("valid static ZIP is safely extracted with a root index", () => {
  const result = _private.extractZip(zip([["index.html", "<h1>Fuellinq</h1>"], ["assets/style.css", "body{color:#fff}"]]));
  assert.equal(_private.resolveEntryFile(result.files), "index.html");
  assert.equal(result.files.length, 2);
});

test("single wrapper directory is normalized", () => {
  const result = _private.extractZip(zip([["fuellinq/index.html", "<h1>Fuellinq</h1>"], ["fuellinq/styles.css", "body{}"]]));
  assert.equal(_private.resolveEntryFile(result.files), "index.html");
  assert(result.files.some((file) => file.path === "styles.css"));
});

test("missing and ambiguous entry files are rejected", () => {
  const missing = _private.extractZip(zip([["readme.txt", "none"]]));
  assert.throws(() => _private.resolveEntryFile(missing.files), (error) => error.code === "index_not_found");
  const ambiguous = _private.extractZip(zip([["one/index.html", "one"], ["two/index.html", "two"]]));
  assert.throws(() => _private.resolveEntryFile(ambiguous.files), (error) => error.code === "ambiguous_entry_file");
});

test("path traversal, absolute paths and executable files are rejected", () => {
  for (const unsafe of ["../index.html", "..\\index.html", "/index.html", "C:/index.html", "%2e%2e/index.html", "server.php"]) {
    assert.throws(() => _private.safePath(unsafe), (error) => ["unsafe_zip_path", "invalid_file_type"].includes(error.code));
  }
});

test("frontend sends the ZIP to server validation and does not require Demo Sites or a journey", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/admin-website-factory.html"), "utf8");
  assert.match(html, /admin-manual-preview/);
  assert.match(html, /zipBase64/);
  assert.doesNotMatch(html, /async function uploadManualZipFile\(file\) \{\s*if \(!journey\?\.id\)/);
  assert.match(html, /ZIP succesvol verwerkt/);
  assert.match(html, /buildHistory = \{[\s\S]*activeVersion: normalizedVersion/);
});

test("the actual Fuellinq regression ZIP is accepted and has a root index", () => {
  const buffer = fs.readFileSync(path.join(__dirname, "../Website factory maxwebstudio.nl/fuellinq.com-website-factory.zip"));
  const result = _private.extractZip(buffer);
  assert.equal(_private.resolveEntryFile(result.files), "index.html");
  assert(result.files.some((file) => file.path === "styles.css"));
});
