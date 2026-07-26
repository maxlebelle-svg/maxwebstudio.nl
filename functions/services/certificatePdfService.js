const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;

function generateCertificatePdf(certificate, options = {}) {
  const value = normalizeCertificate(certificate);
  const verificationUrl = absoluteVerificationUrl(value.verificationPath, options.baseUrl);
  const nameSize = value.partnerName.length > 38 ? 28 : value.partnerName.length > 26 ? 34 : 42;
  const commands = [
    '0.027 0.067 0.118 rg', `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`,
    '0.82 0.69 0.36 RG', '2 w', `24 24 ${PAGE_WIDTH - 48} ${PAGE_HEIGHT - 48} re S`,
    '0.82 0.69 0.36 RG', '.7 w', `34 34 ${PAGE_WIDTH - 68} ${PAGE_HEIGHT - 68} re S`,
    textCommand('MAX WEBSTUDIO', 421, 520, 16, 'F2', [0.36, 0.88, 0.76]),
    textCommand('CERTIFICAAT', 421, 466, 28, 'F2', [0.91, 0.80, 0.48]),
    textCommand('Hierbij wordt verklaard dat', 421, 423, 13, 'F1', [0.78, 0.83, 0.90]),
    textCommand(value.partnerName, 421, 365, nameSize, 'F2', [0.98, 0.99, 1]),
    '0.82 0.69 0.36 RG', '1 w', '190 342 462 0 re S',
    textCommand('met succes is gecertificeerd als', 421, 311, 13, 'F1', [0.78, 0.83, 0.90]),
    textCommand(value.certificationType, 421, 272, 20, 'F2', [0.36, 0.88, 0.76]),
    textCommand(`Programma: ${value.trainingVersionCode}`, 421, 225, 11, 'F1', [0.78, 0.83, 0.90]),
    textCommand(`Certificaatversie: ${value.certificateVersion}`, 421, 207, 10, 'F1', [0.62, 0.69, 0.78]),
    textCommand(`Certificaatnummer: ${value.certificateId}`, 421, 177, 11, 'F2', [0.91, 0.80, 0.48]),
    textCommand(`Uitgegeven: ${formatDutchDate(value.issuedAt)}  |  Geldig tot: ${formatDutchDate(value.expiresAt)}`, 421, 154, 10, 'F1', [0.78, 0.83, 0.90]),
    '0.82 0.69 0.36 RG', '.8 w', '104 112 200 0 re S',
    textCommand(value.authorizedSignerName, 204, 93, 11, 'F2', [0.94, 0.96, 1]),
    textCommand(value.authorizedSignerTitle, 204, 77, 9, 'F1', [0.62, 0.69, 0.78]),
    textCommand(`Verificatie: ${verificationUrl}`, 590, 92, 8, 'F1', [0.62, 0.69, 0.78]),
    textCommand(value.disclaimer, 421, 52, 8, 'F1', [0.56, 0.63, 0.72]),
  ].join('\n');
  return buildPdf(commands, value);
}

function buildPdf(content, certificate) {
  const stream = binaryBuffer(content);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
    Buffer.concat([binaryBuffer(`<< /Length ${stream.length} >>\nstream\n`), stream, binaryBuffer('\nendstream')]),
    `<< /Title (${pdfText(`Max Webstudio certificaat ${certificate.certificateId}`)}) /Author (Max Webstudio) /Subject (${pdfText(certificate.certificationType)}) /Keywords (${pdfText(`${certificate.certificateId} ${certificate.trainingVersionCode}`)}) >>`,
  ];
  const chunks = [binaryBuffer('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const body = Buffer.isBuffer(object) ? object : binaryBuffer(object);
    const chunk = Buffer.concat([binaryBuffer(`${index + 1} 0 obj\n`), body, binaryBuffer('\nendobj\n')]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xrefOffset = length;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(binaryBuffer(xref));
  chunks.push(binaryBuffer(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

function textCommand(value, centerX, y, size, font, color) {
  const safe = pdfText(value);
  const estimatedWidth = printableLength(value) * size * (font === 'F2' ? 0.53 : 0.48);
  const x = Math.max(42, centerX - estimatedWidth / 2);
  return `${color.join(' ')} rg BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y} Tm (${safe}) Tj ET`;
}

function normalizeCertificate(input = {}) {
  const required = ['certificateId','partnerName','certificationType','trainingVersionCode','certificateVersion','authorizedSignerName','authorizedSignerTitle','verificationPath','issuedAt','expiresAt','disclaimer'];
  for (const key of required) if (!String(input[key] || '').trim()) throw new TypeError(`Certificate ${key} is required.`);
  if (!/^MWS-PARTNER-[A-F0-9]{16}$/.test(input.certificateId)) throw new TypeError('Certificate ID is invalid.');
  return Object.fromEntries(required.map((key) => [key, String(input[key]).trim()]));
}

function pdfText(value) {
  return Array.from(String(value || '')).map((character) => {
    const code = winAnsiCode(character);
    if (code === 40 || code === 41 || code === 92) return `\\${String.fromCharCode(code)}`;
    if (code < 32 || code > 126) return `\\${code.toString(8).padStart(3, '0')}`;
    return String.fromCharCode(code);
  }).join('');
}

function winAnsiCode(character) {
  const code = character.codePointAt(0);
  if (code <= 255) return code;
  const map = { '€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159 };
  return map[character] || 63;
}

function binaryBuffer(value) { return Buffer.from(value, 'binary'); }
function printableLength(value) { return Array.from(String(value || '')).length; }
function formatDutchDate(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new TypeError('Certificate date is invalid.'); return new Intl.DateTimeFormat('nl-NL',{day:'2-digit',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(date); }
function absoluteVerificationUrl(path, baseUrl = 'https://maxwebstudio.nl') { const base=String(baseUrl||'https://maxwebstudio.nl').replace(/\/$/,''); const relative=String(path||'').startsWith('/')?path:`/${path}`; return `${base}${relative}`; }

module.exports = { generateCertificatePdf, normalizeCertificate, pdfText, formatDutchDate };
