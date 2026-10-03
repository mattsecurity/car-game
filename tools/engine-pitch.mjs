// Analisi offline delle registrazioni motore (Node + ffmpeg).
// Tono = spaziatura del pettine di armoniche (ordine di manovella), stimata
// con somma armonica sullo spettro e tracciamento a programmazione dinamica.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export function decode(file, sr = 22050) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// FFT radix-2 in place (re, im)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// Spettrogramma log-magnitudine: frames[t] = Float32Array(n/2)
export function spectrogram(x, sr, { n = 8192, hop = 512 } = {}) {
  const win = new Float32Array(n).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  const frames = [], times = [], db = [];
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let s = 0; s + n <= x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < n; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; e += x[s + i] * x[s + i]; }
    fft(re, im);
    const m = new Float32Array(n / 2);
    for (let k = 0; k < n / 2; k++) m[k] = Math.log(1e-9 + Math.hypot(re[k], im[k]));
    // sbiancamento: toglie l'inviluppo spettrale (media mobile) per far emergere le righe
    const w = new Float32Array(n / 2), R = 24; let acc = 0;
    for (let k = 0; k < n / 2 + R; k++) {
      if (k < n / 2) acc += m[k]; if (k - 2 * R - 1 >= 0) acc -= m[k - 2 * R - 1];
      const c = k - R; if (c >= 0 && c < n / 2) w[c] = m[c] - acc / Math.min(2 * R + 1, k + 1);
    }
    frames.push(w); times.push((s + n / 2) / sr); db.push(10 * Math.log10(e / n + 1e-12));
  }
  return { frames, times, db, binHz: sr / n };
}

// Somma armonica + Viterbi: restituisce [{t, f, score, db}]
export function trackComb(spec, { fmin, fmax, harmonics = 8, cands = 260, jump = 0.035 }) {
  const { frames, times, db, binHz } = spec;
  const F = Array.from({ length: cands }, (_, i) => fmin * Math.pow(fmax / fmin, i / (cands - 1)));
  const S = frames.map(fr => F.map(f => {
    let s = 0;
    for (let h = 1; h <= harmonics; h++) {
      const b = h * f / binHz; if (b >= fr.length - 2) break;
      const k = Math.round(b); s += Math.max(fr[k - 1], fr[k], fr[k + 1]);
      // penalità sotto-armonica: le mezze posizioni non devono essere forti quanto le righe
      const bh = Math.round((h - 0.5) * f / binHz); if (bh > 1) s -= 0.5 * fr[bh];
    }
    return s / harmonics;
  }));
  // Viterbi con costo sui salti in log-frequenza
  const T = S.length, step = Math.log(fmax / fmin) / (cands - 1), maxJ = Math.max(1, Math.round(jump / step));
  const score = new Float64Array(cands), back = [];
  for (let c = 0; c < cands; c++) score[c] = S[0][c];
  for (let t = 1; t < T; t++) {
    const next = new Float64Array(cands), bk = new Int16Array(cands);
    for (let c = 0; c < cands; c++) {
      let best = -Infinity, bi = c;
      for (let d = -maxJ * 3; d <= maxJ * 3; d++) {
        const p = c + d; if (p < 0 || p >= cands) continue;
        const v = score[p] - (Math.abs(d) > maxJ ? 0.35 * (Math.abs(d) - maxJ) / maxJ : 0);
        if (v > best) { best = v; bi = p; }
      }
      next[c] = best + S[t][c]; bk[c] = bi;
    }
    score.set(next); back.push(bk);
  }
  let c = 0; for (let k = 1; k < cands; k++) if (score[k] > score[c]) c = k;
  const path = new Array(T); path[T - 1] = c;
  for (let t = T - 1; t > 0; t--) { c = back[t - 1][c]; path[t - 1] = c; }
  return path.map((ci, t) => ({ t: times[t], f: F[ci], score: S[t][ci], db: db[t] }));
}

// Immagine di controllo: spettrogramma 0..maxHz con la traccia (e le sue armoniche) in ciano
export function debugImage(spec, track, file, maxHz = 1200, H = 360) {
  const { frames, binHz } = spec, W = frames.length, maxBin = Math.floor(maxHz / binHz);
  const img = Buffer.alloc(W * H * 3);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const k = Math.floor((H - 1 - y) / H * maxBin), v = Math.max(0, Math.min(255, 60 + frames[x][k] * 45));
    const o = (y * W + x) * 3; img[o] = v; img[o + 1] = v * 0.8; img[o + 2] = v * 0.5;
  }
  track.forEach((p, x) => { for (let h = 1; h <= 4; h++) { const y = H - 1 - Math.round(h * p.f / maxHz * H); if (y >= 0 && y < H) { const o = (y * W + x) * 3; img[o] = 0; img[o + 1] = 255; img[o + 2] = 255; } } });
  const ppm = file.replace(/\.png$/, '.ppm');
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), img]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', ppm, file]);
}
