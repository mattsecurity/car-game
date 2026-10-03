// Impacchetta un .gltf con .bin e immagini esterne in un unico .glb (nessuna dipendenza).
//   node tools/pack-glb.mjs <file.gltf> <uscita.glb>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packGlb(gltfPath, outPath) {
  const dir = dirname(gltfPath), j = JSON.parse(readFileSync(gltfPath, 'utf8'));
  const chunks = []; let offset = 0;
  const push = buf => { const pad = (4 - (buf.length % 4)) % 4; const at = offset; chunks.push(buf, Buffer.alloc(pad)); offset += buf.length + pad; return at; };
  // buffer esistenti (di solito uno) concatenati: si ricalcolano gli offset delle bufferView
  const bufferBase = (j.buffers || []).map(b => push(readFileSync(join(dir, decodeURIComponent(b.uri)))));
  for (const bv of j.bufferViews || []) { bv.byteOffset = (bv.byteOffset || 0) + bufferBase[bv.buffer]; bv.buffer = 0; }
  // immagini esterne → bufferView dentro il binario
  for (const img of j.images || []) {
    if (!img.uri || img.uri.startsWith('data:')) continue;
    const data = readFileSync(join(dir, decodeURIComponent(img.uri)));
    const at = push(data);
    j.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: data.length });
    img.bufferView = j.bufferViews.length - 1;
    img.mimeType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(img.uri).toLowerCase()];
    delete img.uri;
  }
  const bin = Buffer.concat(chunks);
  j.buffers = [{ byteLength: bin.length }];
  let json = Buffer.from(JSON.stringify(j), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  const total = 12 + 8 + json.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(outPath, Buffer.concat([header, jh, json, bh, bin]));
  return total;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [src, out] = process.argv.slice(2);
  console.log(out, (packGlb(src, out) / 1e6).toFixed(2), 'MB');
}
