import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([size, t, data, crc]); }
export function generateIcons(root) {
  const directory = resolve(root, 'public/icons'); mkdirSync(directory, { recursive: true });
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const data = Buffer.alloc((size * 3 + 1) * size);
    const polygon = (x, y, points) => { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const a = points[i], b = points[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = x * 192 / size, py = y * 192 / size;
      const mark = polygon(px, py, [[40,132],[89,56],[116,56],[69,132]]) || polygon(px,py,[[106,56],[149,56],[149,99],[132,99],[132,85],[101,132],[80,132],[119,73],[106,73]]);
      const color = mark ? [202,242,129] : [16,39,33]; const offset = y * (size * 3 + 1) + 1 + x * 3;
      color.forEach((c, i) => { data[offset + i] = c; });
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
    writeFileSync(resolve(directory, name), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]));
  }
}
