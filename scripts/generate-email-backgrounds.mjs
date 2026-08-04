import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'assets', 'email');
const backgrounds = {
  outer: '#030b14',
  card: '#071b2c',
  header: '#061523',
  panel: '#102a3d',
  sign: '#08283b',
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return result;
}

function solidPng(hex, size = 8) {
  const [red, green, blue] = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16));
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) row.set([red, green, blue], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels, { level: 9 })),
    chunk('IEND'),
  ]);
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const [name, color] of Object.entries(backgrounds)) {
  fs.writeFileSync(
    path.join(outputDirectory, `mws-email-bg-${name}-${color.slice(1)}-v2.png`),
    solidPng(color),
  );
}
