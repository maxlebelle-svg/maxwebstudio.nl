const { createHash } = require("crypto");
const {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PIXELS,
  IMAGE_MIN_HEIGHT,
  IMAGE_MIN_WIDTH,
} = require("./_preview-editor-image-schema");

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MIME_BY_EXTENSION = Object.freeze({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" });
const EXTENSION_BY_MIME = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" });
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function validateImageMetadata(input = {}) {
  const filename = clean(input.filename || input.name);
  const mimeType = normalizeMime(input.mimeType || input.mime_type);
  const sizeBytes = Number(input.sizeBytes ?? input.size);
  if (!filename || filename.length > 255 || CONTROL_CHARACTERS.test(filename) || /[\\/]/.test(filename) || filename === "." || filename === "..") {
    throw imageError("IMAGE_FILENAME_INVALID", "De bestandsnaam is ongeldig.", 400, "validate_image_metadata");
  }
  const extension = extensionFor(filename);
  if (!IMAGE_ALLOWED_MIME_TYPES.includes(mimeType) || MIME_BY_EXTENSION[extension] !== mimeType) {
    throw imageError("IMAGE_TYPE_UNSUPPORTED", "Gebruik een JPEG-, PNG- of WebP-afbeelding met de juiste extensie.", 400, "validate_image_metadata");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw imageError("IMAGE_EMPTY", "De afbeelding is leeg.", 400, "validate_image_metadata");
  if (sizeBytes > IMAGE_MAX_BYTES) throw imageError("IMAGE_TOO_LARGE", "De afbeelding is groter dan 8 MiB.", 413, "validate_image_metadata");
  return { filename, mimeType, sizeBytes, extension };
}

function validateImageBytes(value, options = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  const metadata = validateImageMetadata({
    filename: options.filename || `image.${EXTENSION_BY_MIME[normalizeMime(options.mimeType)] || "bin"}`,
    mimeType: options.mimeType,
    sizeBytes: options.declaredSize ?? bytes.length,
  });
  if (!bytes.length) throw imageError("IMAGE_EMPTY", "De afbeelding is leeg.", 400, "validate_image_bytes");
  if (bytes.length > IMAGE_MAX_BYTES) throw imageError("IMAGE_TOO_LARGE", "De afbeelding is groter dan 8 MiB.", 413, "validate_image_bytes");
  if (Number.isSafeInteger(options.declaredSize) && options.declaredSize !== bytes.length) throw imageError("IMAGE_SIZE_MISMATCH", "De opgeslagen afbeelding heeft een onverwachte grootte.", 400, "validate_image_bytes");
  const detected = inspectRaster(bytes, metadata.mimeType);
  if (detected.mimeType !== metadata.mimeType) throw imageError("IMAGE_MIME_MISMATCH", "Het bestandstype komt niet overeen met de afbeeldingsinhoud.", 400, "validate_image_bytes");
  if (detected.animated) throw imageError("IMAGE_ANIMATION_UNSUPPORTED", "Geanimeerde afbeeldingen worden niet ondersteund.", 400, "validate_image_animation");
  if (detected.hasExif && options.rejectExif !== false) throw imageError("IMAGE_EXIF_UNSUPPORTED", "Verwijder EXIF-metadata voordat je deze afbeelding uploadt.", 400, "validate_image_privacy");
  if (!Number.isSafeInteger(detected.width) || !Number.isSafeInteger(detected.height) || detected.width <= 0 || detected.height <= 0) {
    throw imageError("IMAGE_DIMENSIONS_INVALID", "De afmetingen van de afbeelding konden niet veilig worden gelezen.", 400, "validate_image_dimensions");
  }
  const pixels = detected.width * detected.height;
  if (!Number.isSafeInteger(pixels) || pixels > IMAGE_MAX_PIXELS) throw imageError("IMAGE_PIXELS_EXCEEDED", "De afbeelding bevat te veel pixels.", 413, "validate_image_dimensions");
  if (options.requireHeroMinimum !== false && (detected.width < IMAGE_MIN_WIDTH || detected.height < IMAGE_MIN_HEIGHT)) {
    throw imageError("IMAGE_TOO_SMALL", `De Hero-afbeelding moet minimaal ${IMAGE_MIN_WIDTH} × ${IMAGE_MIN_HEIGHT} pixels zijn.`, 400, "validate_image_dimensions");
  }
  return {
    ...metadata,
    width: detected.width,
    height: detected.height,
    aspectRatio: Number((detected.width / detected.height).toFixed(4)),
    animated: false,
    hasExif: Boolean(detected.hasExif),
    checksum: createHash("sha256").update(bytes).digest("hex"),
    packageExtension: EXTENSION_BY_MIME[metadata.mimeType],
  };
}

function inspectRaster(bytes, expectedMime = "") {
  if (isPng(bytes)) return inspectPng(bytes);
  if (isJpeg(bytes)) return inspectJpeg(bytes);
  if (isWebp(bytes)) return inspectWebp(bytes);
  throw imageError("IMAGE_MAGIC_INVALID", expectedMime ? "De inhoud komt niet overeen met het gekozen afbeeldingstype." : "De afbeeldingsinhoud is ongeldig.", 400, "validate_image_magic");
}

function inspectPng(bytes) {
  if (bytes.length < 33 || !isPng(bytes)) throw imageError("IMAGE_PNG_CORRUPT", "Het PNG-bestand is beschadigd.", 400, "validate_image_png");
  let offset = 8;
  let width = 0;
  let height = 0;
  let animated = false;
  let hasExif = false;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (length > IMAGE_MAX_BYTES || next > bytes.length) throw imageError("IMAGE_PNG_CORRUPT", "Het PNG-bestand is beschadigd.", 400, "validate_image_png");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) throw imageError("IMAGE_PNG_CORRUPT", "Het PNG-bestand heeft geen geldige header.", 400, "validate_image_png");
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
    }
    if (type === "acTL" || type === "fcTL" || type === "fdAT") animated = true;
    if (type === "eXIf") hasExif = true;
    if (type === "IEND") { if (length !== 0 || next !== bytes.length) throw imageError("IMAGE_PNG_CORRUPT", "Het PNG-bestand heeft ongeldige einddata.", 400, "validate_image_png"); ended = true; break; }
    offset = next;
  }
  if (!ended || !width || !height) throw imageError("IMAGE_PNG_CORRUPT", "Het PNG-bestand is onvolledig.", 400, "validate_image_png");
  return { mimeType: "image/png", width, height, animated, hasExif };
}

function inspectJpeg(bytes) {
  if (bytes.length < 12 || !isJpeg(bytes) || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw imageError("IMAGE_JPEG_CORRUPT", "Het JPEG-bestand is beschadigd.", 400, "validate_image_jpeg");
  let offset = 2;
  let width = 0;
  let height = 0;
  let hasExif = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw imageError("IMAGE_JPEG_CORRUPT", "Het JPEG-bestand is onvolledig.", 400, "validate_image_jpeg");
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw imageError("IMAGE_JPEG_CORRUPT", "Het JPEG-bestand bevat een ongeldige sectie.", 400, "validate_image_jpeg");
    const dataStart = offset + 2;
    if (marker === 0xe1 && bytes.subarray(dataStart, dataStart + 6).toString("binary") === "Exif\0\0") hasExif = true;
    if (JPEG_SOF.has(marker)) {
      if (length < 7) throw imageError("IMAGE_JPEG_CORRUPT", "Het JPEG-bestand bevat ongeldige afmetingen.", 400, "validate_image_jpeg");
      height = bytes.readUInt16BE(dataStart + 1);
      width = bytes.readUInt16BE(dataStart + 3);
    }
    offset += length;
  }
  if (!width || !height) throw imageError("IMAGE_JPEG_CORRUPT", "De JPEG-afmetingen konden niet worden gelezen.", 400, "validate_image_jpeg");
  return { mimeType: "image/jpeg", width, height, animated: false, hasExif };
}

function inspectWebp(bytes) {
  if (bytes.length < 20 || !isWebp(bytes) || bytes.readUInt32LE(4) + 8 !== bytes.length) throw imageError("IMAGE_WEBP_CORRUPT", "Het WebP-bestand is beschadigd.", 400, "validate_image_webp");
  let offset = 12;
  let width = 0;
  let height = 0;
  let animated = false;
  let hasExif = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    const next = data + length + (length % 2);
    if (length > IMAGE_MAX_BYTES || next > bytes.length) throw imageError("IMAGE_WEBP_CORRUPT", "Het WebP-bestand bevat een ongeldige sectie.", 400, "validate_image_webp");
    if (type === "VP8X") {
      if (length < 10) throw imageError("IMAGE_WEBP_CORRUPT", "De WebP-header is ongeldig.", 400, "validate_image_webp");
      const flags = bytes[data];
      animated ||= Boolean(flags & 0x02);
      hasExif ||= Boolean(flags & 0x08);
      width = readUInt24LE(bytes, data + 4) + 1;
      height = readUInt24LE(bytes, data + 7) + 1;
    } else if (type === "VP8 ") {
      if (length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) throw imageError("IMAGE_WEBP_CORRUPT", "De WebP-frameheader is ongeldig.", 400, "validate_image_webp");
      width ||= bytes.readUInt16LE(data + 6) & 0x3fff;
      height ||= bytes.readUInt16LE(data + 8) & 0x3fff;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[data] !== 0x2f) throw imageError("IMAGE_WEBP_CORRUPT", "De lossless WebP-header is ongeldig.", 400, "validate_image_webp");
      const bits = bytes.readUInt32LE(data + 1);
      width ||= (bits & 0x3fff) + 1;
      height ||= ((bits >> 14) & 0x3fff) + 1;
    } else if (type === "ANIM" || type === "ANMF") animated = true;
    else if (type === "EXIF") hasExif = true;
    offset = next;
  }
  if (!width || !height) throw imageError("IMAGE_WEBP_CORRUPT", "De WebP-afmetingen konden niet worden gelezen.", 400, "validate_image_webp");
  return { mimeType: "image/webp", width, height, animated, hasExif };
}

function isPng(bytes) { return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); }
function isJpeg(bytes) { return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8; }
function isWebp(bytes) { return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"; }
function readUInt24LE(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }
function extensionFor(filename) { const match = clean(filename).toLowerCase().match(/\.([a-z0-9]{1,10})$/); return match?.[1] || ""; }
function normalizeMime(value) { return clean(String(value || "").split(";", 1)[0]).toLowerCase(); }
function clean(value) { return String(value ?? "").trim(); }
function imageError(code, message, status = 400, phase = "validate_image") { return Object.assign(new Error(message), { code, status, phase }); }

module.exports = {
  EXTENSION_BY_MIME,
  MIME_BY_EXTENSION,
  extensionFor,
  imageError,
  inspectRaster,
  normalizeMime,
  validateImageBytes,
  validateImageMetadata,
};
