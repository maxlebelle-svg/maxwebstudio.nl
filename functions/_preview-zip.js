const { createHash } = require("crypto");
const zlib = require("zlib");

const MAX_FILES = 180;
const MAX_UNPACKED_BYTES = 18 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const SOURCE_FACTORY = "factory";
const SOURCE_MANUAL = "manual_zip";
const SOURCE_VALUES = new Set([SOURCE_FACTORY, SOURCE_MANUAL]);

function normalizePreviewSource(value = "") {
  const source = text(value).toLowerCase();
  if ([SOURCE_FACTORY, "factory_build", "factory-build", "website_factory", "website-factory"].includes(source)) return SOURCE_FACTORY;
  if ([SOURCE_MANUAL, "manual", "manual-zip", "zip"].includes(source)) return SOURCE_MANUAL;
  return "";
}

function previewSourceForVersion(version = {}) {
  const metadata = object(version.metadata);
  const generatedPackage = object(version.generatedPackage || version.generated_package);
  const packageMeta = object(version.packageMeta || version.package_meta || generatedPackage.meta);
  const explicit = [
    version.sourceType,
    version.source_type,
    version.previewSource,
    version.preview_source,
    metadata.sourceType,
    metadata.source_type,
    metadata.previewSource,
    metadata.preview_source,
    packageMeta.sourceType,
    packageMeta.source_type,
    packageMeta.previewSource,
    packageMeta.preview_source,
  ].map(normalizePreviewSource).filter(Boolean);
  const explicitSources = [...new Set(explicit)];
  if (explicitSources.length > 1) return "";
  if (explicitSources.length === 1) return explicitSources[0];

  const previewUrl = text(version.previewUrl || version.preview_url);
  const manualEvidence = Boolean(
    text(metadata.manualZipContentHash || metadata.manual_zip_content_hash)
    || text(packageMeta.manualZipContentHash || packageMeta.manual_zip_content_hash)
    || /\/\.netlify\/functions\/manual-preview-render(?:[/?#]|$)/i.test(previewUrl)
  );
  const factoryEvidence = Boolean(
    text(version.buildJobId || version.build_job_id)
    || /\/(?:\.netlify\/functions\/demo-preview|demo-preview(?:\.html)?)(?:[/?#]|$)/i.test(previewUrl)
    || metadata.editorManifestAvailable === true
    || Number(packageMeta.editorManifest?.version || 0) === 1
    || Boolean(packageMeta.editorEnrichment || packageMeta.industryIntelligence)
  );
  if (manualEvidence === factoryEvidence) return "";
  return manualEvidence ? SOURCE_MANUAL : SOURCE_FACTORY;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function preparePreviewPackage(value = {}) {
  const files = Array.isArray(value?.files) ? value.files : [];
  if (!files.length) throw zipError("PREVIEW_PACKAGE_EMPTY", "Deze preview bevat geen downloadbaar pakket.", 409, "validate_package");
  if (files.length > MAX_FILES) throw zipError("PREVIEW_PACKAGE_FILE_LIMIT", "Deze preview bevat te veel bestanden voor een veilige ZIP-download.", 413, "validate_file_count");
  const seen = new Set();
  let unpackedBytes = 0;
  const entries = files.map((file) => {
    if (file?.symlink || file?.link || text(file?.type).toLowerCase() === "symlink") throw zipError("PREVIEW_PACKAGE_SYMLINK", "Deze preview bevat een niet-toegestane koppeling.", 400, "validate_file_type");
    const path = safePath(file?.path);
    if (!path) throw zipError("PREVIEW_PACKAGE_PATH_INVALID", "Deze preview bevat een ongeldig bestandspad.", 400, "validate_file_path");
    if (seen.has(path)) throw zipError("PREVIEW_PACKAGE_DUPLICATE_PATH", "Deze preview bevat een dubbel bestandspad.", 409, "validate_file_path");
    seen.add(path);
    const bytes = decodeFile(file);
    if (bytes.length > MAX_FILE_BYTES) throw zipError("PREVIEW_PACKAGE_FILE_TOO_LARGE", "Deze preview bevat een bestand dat te groot is voor ZIP-generatie.", 413, "validate_file_size");
    unpackedBytes += bytes.length;
    if (unpackedBytes > MAX_UNPACKED_BYTES) throw zipError("PREVIEW_PACKAGE_TOO_LARGE", "Deze preview is te groot voor veilige ZIP-generatie.", 413, "validate_package_size");
    return { path, bytes };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const entryFile = safePath(value.entryFile || value.meta?.entryFile || "index.html");
  if (!entryFile || !seen.has(entryFile)) throw zipError("PREVIEW_ENTRY_FILE_MISSING", "Het startbestand van deze preview ontbreekt.", 409, "validate_entry_file");
  return { entries, entryFile, fileCount: entries.length, unpackedBytes };
}

function packageContentHash(prepared, source = "") {
  const hash = createHash("sha256");
  hash.update(`preview-zip-v1\0${normalizePreviewSource(source)}\0${prepared.entryFile}\0`);
  for (const entry of prepared.entries) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(String(entry.bytes.length));
    hash.update("\0");
    hash.update(entry.bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function createCompressedZip(prepared) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let compressedContentBytes = 0;
  for (const entry of prepared.entries) {
    const name = Buffer.from(entry.path, "utf8");
    const deflated = zlib.deflateRawSync(entry.bytes, { level: 6 });
    const compressed = deflated.length < entry.bytes.length ? deflated : entry.bytes;
    const method = compressed === deflated ? 8 : 0;
    const crc = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
    compressedContentBytes += compressed.length;
  }
  const centralBody = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(prepared.entries.length, 8);
  end.writeUInt16LE(prepared.entries.length, 10);
  end.writeUInt32LE(centralBody.length, 12);
  end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...localParts, centralBody, end]);
  if (bytes.length > MAX_ZIP_BYTES) throw zipError("PREVIEW_ZIP_TOO_LARGE", "De voorbereide ZIP is te groot voor veilige opslag.", 413, "validate_zip_size");
  return { bytes, zipBytes: bytes.length, compressedContentBytes };
}

function decodeFile(file = {}) {
  const content = file.content === undefined || file.content === null ? "" : String(file.content);
  if (text(file.encoding).toLowerCase() === "base64") {
    if (content && !/^[A-Za-z0-9+/]*={0,2}$/.test(content.replace(/\s/g, ""))) throw zipError("PREVIEW_FILE_ENCODING_INVALID", "Een previewbestand heeft ongeldige base64-inhoud.", 400, "decode_file");
    return Buffer.from(content, "base64");
  }
  return Buffer.from(content, "utf8");
}

function safePath(value = "") {
  let clean = text(value).replace(/\\/g, "/");
  try { clean = decodeURIComponent(clean); } catch { return ""; }
  clean = clean.replace(/^\.\//, "").split(/[?#]/)[0];
  const segments = clean.split("/");
  if (!clean || clean.startsWith("/") || /^[a-z]:/i.test(clean) || /[\u0000-\u001f\u007f]/.test(clean) || segments.some((segment) => !segment || segment === "." || segment === "..")) return "";
  return clean;
}

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function zipError(code, message, status = 400, phase = "preview_zip") { return Object.assign(new Error(message), { code, status, phase }); }
function text(value = "") { return String(value || "").trim(); }

module.exports = {
  MAX_FILES,
  MAX_UNPACKED_BYTES,
  MAX_ZIP_BYTES,
  SOURCE_FACTORY,
  SOURCE_MANUAL,
  SOURCE_VALUES,
  createCompressedZip,
  normalizePreviewSource,
  packageContentHash,
  preparePreviewPackage,
  previewSourceForVersion,
  safePath,
  zipError,
};
