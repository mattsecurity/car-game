// Motore granulare: il suono è fatto di frammenti (grani) di una registrazione
// reale, scelti al tono giusto per il regime attuale e sovrapposti con
// inviluppo di Hann al 50%, così la somma resta continua.

export const GRAIN = { dur: 0.09, ahead: 0.12, lo: 0.8, hi: 1.75, minRate: 0.5, maxRate: 2.3 };

// Tono obiettivo per il regime normalizzato r (0 minimo .. 1 limitatore).
// La registrazione copre ~1.4×: sotto e sopra si estende con la velocità di riproduzione.
export function targetFreq(bank, r) {
  const lo = bank.fMin * GRAIN.lo, hi = bank.fMax * GRAIN.hi;
  return lo * Math.pow(hi / lo, Math.max(0, Math.min(1, r)));
}

// Sceglie un grano vicino al tono obiettivo (un po' di casualità evita il suono "a disco rotto").
export function pickGrain(bank, fT, rand = Math.random) {
  const g = bank.grains; let a = 0, b = g.length - 1;
  while (a < b) { const m = (a + b) >> 1; if (g[m][1] < fT) a = m + 1; else b = m; }
  const j = Math.max(0, Math.min(g.length - 1, a + Math.round((rand() - 0.5) * 6)));
  const rate = Math.max(GRAIN.minRate, Math.min(GRAIN.maxRate, fT / g[j][1]));
  return { t: g[j][0], rate };
}

let hann = null;
function hannCurve(n = 128) { if (!hann) { hann = new Float32Array(n); for (let i = 0; i < n; i++) hann[i] = Math.sin(Math.PI * i / (n - 1)) ** 2; } return hann; }

export class GranularEngine {
  constructor(ctx, dest, bank, buffer) {
    this.ctx = ctx; this.bank = bank; this.buffer = buffer; this.next = 0; this.scheduled = 0;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 9000; this.filter.Q.value = 0.5;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.filter.connect(this.out); this.out.connect(dest);
    this.level = 0; this.fT = targetFreq(bank, 0);
  }

  static async load(ctx, dest, id) {
    try {
      const [bank, raw] = await Promise.all([
        fetch(new URL(`./assets/engines/${id}.json`, import.meta.url)).then(r => (r.ok ? r.json() : null)),
        fetch(new URL(`./assets/engines/${id}.wav`, import.meta.url)).then(r => (r.ok ? r.arrayBuffer() : null)),
      ]);
      if (!bank || !raw || !bank.grains || bank.grains.length < 10) return null;
      const buffer = await ctx.decodeAudioData(raw);
      return new GranularEngine(ctx, dest, bank, buffer);
    } catch (e) { return null; }
  }

  grain(at, fT) {
    const ctx = this.ctx, { t, rate } = pickGrain(this.bank, fT), D = GRAIN.dur;
    const len = D * rate, off = Math.max(0, Math.min(this.buffer.duration - len, t - len / 2 + (Math.random() - 0.5) * 0.01));
    const src = ctx.createBufferSource(); src.buffer = this.buffer; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(hannCurve(), at, D);
    src.connect(g); g.connect(this.filter);
    src.start(at, off, len + 0.005); src.stop(at + D + 0.01);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    this.scheduled++;
  }

  // r: regime 0..1, thr: gas 0..1, level: volume complessivo (0 = muto)
  update(r, thr, level) {
    const ctx = this.ctx, now = ctx.currentTime;
    this.fT = targetFreq(this.bank, r);
    // in rilascio il suono si chiude e cala, a gas aperto è pieno
    this.filter.frequency.setTargetAtTime(1400 + thr * 7000 + r * 1500, now, 0.05);
    this.out.gain.setTargetAtTime(level * (0.55 + 0.45 * thr), now, 0.04);
    if (level <= 0.0005) { this.next = 0; return; }
    if (this.next < now) this.next = now + 0.005;
    while (this.next < now + GRAIN.ahead) { this.grain(this.next, this.fT); this.next += GRAIN.dur / 2; }
  }

  silence() { this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06); this.next = 0; }
  dispose() { this.out.disconnect(); this.filter.disconnect(); }
}
