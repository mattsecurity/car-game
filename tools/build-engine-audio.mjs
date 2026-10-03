// Costruisce i banchi del motore granulare da registrazioni reali:
//   node tools/build-engine-audio.mjs <cartella-sorgenti> [cartella-debug]
// Per ogni motore: ritaglia i tratti con traccia pulita, normalizza il volume,
// scrive assets/engines/<id>.wav (mono 32 kHz) e <id>.json con i "grani" {t, f}.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, spectrogram, trackComb, debugImage, } from './engine-pitch.mjs';

export const ENGINES = [
  { id: 'falcone', src: 'Ferrari_F355_under-hood_exhaust_sound.ogg', fmin: 25, fmax: 160, segments: [[0.3, 7.2]],
    credit: 'Ferrari F355 under-hood exhaust sound — enginemusic (Freesound), via Wikimedia Commons', license: 'CC BY 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:Ferrari_F355_under-hood_exhaust_sound.ogg' },
  { id: 'brutus', src: 'Lexus_IS-F_dynamometer_2UR-GSE_(2008).ogg', fmin: 25, fmax: 120, segments: [[2.45, 4.85], [5.4, 9.5], [10.0, 14.6]],
    credit: 'Lexus IS-F dynamometer 2UR-GSE (2008) — Altair78, via Wikimedia Commons', license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Lexus_IS-F_dynamometer_2UR-GSE_(2008).ogg' },
  { id: 'fuoco', src: 'Lexus_LFA_revving_1LR-GUE_(2009).ogg', fmin: 40, fmax: 300, segments: [[5.5, 8.3]],
    credit: 'Lexus LFA revving 1LR-GUE (2009) — Altair78, via Wikimedia Commons', license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Lexus_LFA_revving_1LR-GUE_(2009).ogg' },
];

const OUT_SR = 32000, TRACK_SR = 22050, JOIN_FADE = 0.03;

function wav16(samples, sr) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

export function buildEngine(e, srcDir, outDir, debugDir) {
  const full = decode(join(srcDir, e.src), OUT_SR), trackFull = decode(join(srcDir, e.src), TRACK_SR);
  const parts = [], grains = [];
  let outT = 0;
  for (const [a, b] of e.segments) {
    const seg = full.slice(Math.floor(a * OUT_SR), Math.floor(b * OUT_SR));
    const fade = Math.floor(JOIN_FADE * OUT_SR);
    for (let i = 0; i < fade; i++) { const g = i / fade; seg[i] *= g; seg[seg.length - 1 - i] *= g; }
    parts.push(seg);
    const tseg = trackFull.slice(Math.floor(a * TRACK_SR), Math.floor(b * TRACK_SR));
    const sp = spectrogram(tseg, TRACK_SR), tr = trackComb(sp, { fmin: e.fmin, fmax: e.fmax });
    if (debugDir) debugImage(sp, tr, join(debugDir, `${e.id}-${a}.png`));
    const maxDb = Math.max(...tr.map(p => p.db));
    tr.forEach((p, i) => {
      // scarta punti fuori dalla mediana locale (salti di pettine) e troppo deboli
      const win = tr.slice(Math.max(0, i - 5), i + 6).map(q => q.f).sort((x, y) => x - y), med = win[win.length >> 1];
      if (Math.abs(p.f / med - 1) > 0.04 || p.db < maxDb - 25) return;
      const t = outT + p.t;
      if (p.t < 0.08 || p.t > (b - a) - 0.08) return;              // lontano dalle giunzioni
      grains.push([+t.toFixed(4), +p.f.toFixed(2)]);
    });
    outT += seg.length / OUT_SR;
  }
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  // volume: RMS a -20 dBFS, picco massimo 0.95
  let e2 = 0, pk = 0; for (const v of out) { e2 += v * v; pk = Math.max(pk, Math.abs(v)); }
  const gain = Math.min(0.1 / Math.sqrt(e2 / out.length), 0.95 / pk);
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  grains.sort((x, y) => x[1] - y[1]);
  const fs = grains.map(g => g[1]);
  const data = { id: e.id, sr: OUT_SR, duration: +(out.length / OUT_SR).toFixed(4), fMin: fs[0], fMax: fs[fs.length - 1],
    credit: e.credit, license: e.license, url: e.url, grains };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${e.id}.wav`), wav16(out, OUT_SR));
  writeFileSync(join(outDir, `${e.id}.json`), JSON.stringify(data));
  return data;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [srcDir, debugDir] = process.argv.slice(2);
  if (!srcDir) { console.error('uso: node tools/build-engine-audio.mjs <cartella-sorgenti> [cartella-debug]'); process.exit(1); }
  const outDir = fileURLToPath(new URL('../assets/engines/', import.meta.url));
  for (const e of ENGINES) {
    const d = buildEngine(e, srcDir, outDir, debugDir);
    console.log(`${e.id}: ${d.grains.length} grani, ${d.duration}s, f ${d.fMin}–${d.fMax} Hz (×${(d.fMax / d.fMin).toFixed(2)})`);
  }
}
