// Polizia: livello ricercato, volanti con la stessa fisica del giocatore, sirene.
// Nessun import di three al top-level: le dipendenze arrivano dal chiamante,
// così `Wanted` si può provare anche in Node.

export const WANTED_RULES = {
  speedCity: 90, speedCoast: 140,       // km/h oltre cui una volante interviene
  seeDist: 70, seeDistCoast: 140,       // m: vista delle volanti (la costa è aperta, senza edifici)
  bustSpeed: 5 / 3.6, bustDist: 7, bustTime: 3,
  evadeBase: 8, evadePer: 3,            // s per seminare: base + per stella
  maxUnits: [3, 2, 3, 4, 5, 6],         // volanti per livello (0 = pattuglie)
  maxTouch: 4, patrolsTouch: 2,
  pitLevel: 3, roadblockLevel: 4,
};
const R = WANTED_RULES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ */
export class Wanted {
  constructor() { this.reset(); }
  reset() { this.heat = 0; this.level = 0; this.lostT = 0; this.bustT = 0; this.seen = false; }
  get evadeTime() { return R.evadeBase + R.evadePer * this.level; }
  crime(kind, dt = 0) {
    if (kind === 'speed') this.heat = Math.min(this.heat + 0.6 * dt, Math.max(this.heat, 1.5));
    else this.heat += 1;
    this.heat = Math.min(this.heat, 5.99);
    this.level = Math.min(5, Math.floor(this.heat));
    if (this.level > 0) this.lostT = 0;
  }
  // Ritorna 'busted' | 'evaded' | undefined
  update(dt, { seen, playerSpeed, copNear }) {
    this.seen = seen;
    if (this.level === 0) { this.bustT = 0; this.lostT = 0; return; }
    if (seen) { this.lostT = 0; this.heat = Math.min(5.99, this.heat + dt / 35); }
    else { this.lostT += dt; if (this.lostT >= this.evadeTime) { this.reset(); return 'evaded'; } }
    this.level = Math.min(5, Math.floor(this.heat));
    if (playerSpeed < R.bustSpeed && copNear < R.bustDist) {
      this.bustT += dt; if (this.bustT >= R.bustTime) return 'busted';
    } else this.bustT = 0;
  }
}

/* ------------------------------------------------------------------ */
// Livrea Polizia di Stato: carrozzeria blu, fascia bianca con scritta, tetto bianco.
function liveryTexture(THREE) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f4f5'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#b01f24'; g.fillRect(0, 108, 1024, 8);           // filetto rosso
  g.fillStyle = '#153a78'; g.font = 'bold 84px Arial, Helvetica, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLIZIA', 512, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makePoliceConfig(THREE, extrudeBody) {
  return {
    id: 'police', name: 'POLIZIA', noHeadlights: true,
    mass: 1650, engineForce: 11500, power: 280000, brakeForce: 15000, topSpeed: 62,
    maxSteer: 0.6, steerFade: 0.0036, steerSpeed: 3.2,
    stiffF: 10, stiffR: 10, muF: 1.25, muR: 1.22,
    cgH: 0.5, wheelBase: 2.85, aDist: 1.4, bDist: 1.45,
    drag: 0.42, rollRes: 16, drive: 'R', ev: false,
    gears: [15, 27, 40, 54, 62],
    phys: { idle: 800, redline: 6500, torque: 470, peakRpm: 4000, lsd: 60 },
    body: { w: 1.86, h: 0.7, l: 4.8, color: 0x153a78, wheelR: 0.34, wheelW: 0.25, track: 1.74, clearance: 0.2, neon: 0x2a6bff },
    build(car) {
      const blue = new THREE.MeshPhysicalMaterial({ color: 0x153a78, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.9 });
      const white = new THREE.MeshPhysicalMaterial({ color: 0xeef0f2, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x1e2830, metalness: 0.2, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.2 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x0d1014, roughness: 0.6 });
      const band = new THREE.MeshStandardMaterial({ map: liveryTexture(THREE), roughness: 0.4 });
      const body = extrudeBody([
        [2.40, 0.30], [2.46, 0.58, 2.20, 0.70],
        [1.05, 0.80, 0.85, 0.82], [-1.55, 0.86],
        [-2.32, 0.82, -2.42, 0.62], [-2.42, 0.32],
        [-2.0, 0.22], [2.0, 0.22],
      ], 1.84, blue);
      body.castShadow = true; car.chassis.add(body);
      const cabin = extrudeBody([
        [0.85, 0.82], [0.15, 1.28, -0.15, 1.32], [-1.05, 1.32],
        [-1.62, 0.90, -1.72, 0.86], [-1.72, 0.80], [0.85, 0.80],
      ], 1.62, glass, 0.04);
      cabin.castShadow = true; car.chassis.add(cabin);
      car.addBox(1.46, 0.04, 1.02, 0, 1.335, -0.52, white);                 // tetto bianco
      for (const s of [-1, 1]) {                                            // fasce laterali
        const p = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 0.3), band);
        p.position.set(s * 0.935, 0.55, -0.05); p.rotation.y = s * Math.PI / 2;
        if (s < 0) p.scale.x = -1;
        car.chassis.add(p);
      }
      const hood = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), band);
      hood.rotation.x = -Math.PI / 2 + 0.08; hood.rotation.z = Math.PI; hood.position.set(0, 0.815, 1.5);
      car.chassis.add(hood);
      // barra lampeggianti: materiali propri della volante (lampeggio indipendente)
      car.addBox(1.22, 0.07, 0.30, 0, 1.38, -0.42, dark);
      car.lightBlue = new THREE.MeshStandardMaterial({ color: 0x0a1a55, emissive: 0x2a6bff, emissiveIntensity: 0, roughness: 0.3 });
      car.lightRed = new THREE.MeshStandardMaterial({ color: 0x0a1a55, emissive: 0x2a6bff, emissiveIntensity: 0, roughness: 0.3 });
      car.addBox(0.54, 0.1, 0.26, -0.31, 1.46, -0.42, car.lightBlue);
      car.addBox(0.54, 0.1, 0.26, 0.31, 1.46, -0.42, car.lightRed);
      car.addBox(1.5, 0.07, 0.05, 0, 0.62, 2.42, car.headMat);
      car.addBox(1.5, 0.08, 0.05, 0, 0.66, -2.43, car.tailMat);
      car.addBox(1.7, 0.16, 0.12, 0, 0.30, 2.43, dark);                     // paraurti
      car.addBox(1.7, 0.16, 0.12, 0, 0.30, -2.44, dark);
      for (const s of [-1, 1]) car.addBox(0.16, 0.07, 0.14, s * 0.96, 0.9, 0.72, blue);
      // ruote leggere: pneumatico + cerchio (2 mesh), agganciate come nella Car
      const b = car.cfg.body, cfg = car.cfg;
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.92 });
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.3, metalness: 0.85 });
      car.wheels = []; car.frontPivots = [];
      for (const [wx, wz, front] of [[-b.track / 2, cfg.aDist, true], [b.track / 2, cfg.aDist, true], [-b.track / 2, -cfg.bDist, false], [b.track / 2, -cfg.bDist, false]]) {
        const wheel = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(b.wheelR, b.wheelR, b.wheelW, 24), tireMat);
        tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(b.wheelR * 0.62, b.wheelR * 0.62, b.wheelW * 1.02, 16), rimMat);
        rim.rotation.z = Math.PI / 2; wheel.add(rim);
        const holder = new THREE.Group(); holder.position.set(wx, b.wheelR, wz); holder.add(wheel);
        car.group.add(holder);
        if (front) car.frontPivots.push(holder);
        car.wheels.push(wheel);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
// Sirena bitonale italiana sintetizzata (o buffer registrato, se fornito),
// spazializzata con HRTF e Doppler. Massimo 3 voci.
// Registrazione opzionale: assets/siren.ogg (loop). Se manca si usa la sintesi.
let sirenBufferPromise = null;
function loadSirenBuffer(ctx) {
  if (!sirenBufferPromise) {
    sirenBufferPromise = fetch(new URL('./assets/siren.ogg', import.meta.url))
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .then(b => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
  }
  return sirenBufferPromise;
}
class SirenAudio {
  constructor(audio) { this.audio = audio; this.voices = []; this.buffer = null; }
  ensure() {
    const a = this.audio; if (!a || !a.ready || !a.ctx) return false;
    if (this.voices.length) return true;
    const ctx = a.ctx;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'square';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.7;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1100; pk.gain.value = 6; pk.Q.value = 1.2;
      const mix2 = ctx.createGain(); mix2.gain.value = 0.35;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse';
      pan.refDistance = 14; pan.rolloffFactor = 1.1; pan.maxDistance = 600;
      const synth = ctx.createGain();
      osc.connect(lp); osc2.connect(mix2); mix2.connect(lp); lp.connect(pk); pk.connect(synth); synth.connect(gain); gain.connect(pan); pan.connect(a.master);
      osc.start(); osc2.start();
      this.voices.push({ osc, osc2, synth, gain, pan, src: null, phase: i * 0.37 });
    }
    loadSirenBuffer(ctx).then(buf => {
      if (!buf || !this.voices.length) return;
      this.buffer = buf;
      for (const v of this.voices) {                  // registrazione al posto della sintesi
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        src.connect(v.gain); src.start(0, Math.random() * buf.duration); v.src = src; v.synth.gain.value = 0;
      }
    });
    return true;
  }
  update(units, listener, listenerVel, time) {
    if (!this.ensure()) return;
    const ctx = this.audio.ctx, t0 = ctx.currentTime, muted = this.audio.muted;
    const L = ctx.listener;
    if (L.positionX) { L.positionX.value = listener.pos.x; L.positionY.value = listener.pos.y; L.positionZ.value = listener.pos.z;
      L.forwardX.value = listener.fwd.x; L.forwardY.value = listener.fwd.y; L.forwardZ.value = listener.fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(listener.pos.x, listener.pos.y, listener.pos.z); L.setOrientation(listener.fwd.x, listener.fwd.y, listener.fwd.z, 0, 1, 0); }
    const loud = units.filter(u => u.siren).map(u => ({ u, d: Math.hypot(u.car.pos.x - listener.pos.x, u.car.pos.z - listener.pos.z) }))
      .sort((a, b) => a.d - b.d).slice(0, 3);
    this.voices.forEach((v, i) => {
      const e = loud[i];
      v.gain.gain.setTargetAtTime(e && !muted ? 0.32 : 0, t0, 0.08);
      if (!e) return;
      const c = e.u.car, dx = c.pos.x - listener.pos.x, dz = c.pos.z - listener.pos.z, d = Math.max(1, e.d);
      const nx = dx / d, nz = dz / d;
      // Doppler: velocità radiali di sorgente e ascoltatore (positive = in avvicinamento)
      const vs = -(c.vel.x * nx + c.vel.z * nz), vl = listenerVel.x * nx + listenerVel.z * nz;
      const dop = clamp((343 + vl) / Math.max(200, 343 - vs), 0.75, 1.3);
      const hi = Math.floor((time + v.phase) / 0.55) % 2 === 1;
      if (v.src) v.src.playbackRate.setTargetAtTime(dop, t0, 0.05);
      v.osc.frequency.setTargetAtTime((hi ? 580 : 435) * dop, t0, 0.012);
      v.osc2.frequency.setTargetAtTime((hi ? 580 : 435) * dop * 1.003, t0, 0.012);
      if (v.pan.positionX) { v.pan.positionX.value = c.pos.x; v.pan.positionY.value = c.group.position.y + 1.4; v.pan.positionZ.value = c.pos.z; }
      else v.pan.setPosition(c.pos.x, c.group.position.y + 1.4, c.pos.z);
    });
  }
  silence() { if (!this.voices.length) return; const t = this.audio.ctx.currentTime; this.voices.forEach(v => v.gain.gain.setTargetAtTime(0, t, 0.05)); }
  dispose() {
    for (const v of this.voices) { try { v.osc.stop(); v.osc2.stop(); if (v.src) v.src.stop(); } catch (e) { /* già fermati */ } v.pan.disconnect(); }
    this.voices = [];
  }
}

export function playHorn(audio) {
  if (!audio || !audio.ready || audio.muted) return;
  const ctx = audio.ctx, t = ctx.currentTime, g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1800; g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.02); g.gain.setValueAtTime(0.28, t + 0.38); g.gain.linearRampToValueAtTime(0, t + 0.45);
  for (const f of [349, 440]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.47); }
  lp.connect(g); g.connect(audio.master);
}

/* ------------------------------------------------------------------ */
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const LANE = [[-3.3, 0], [0, 3.3], [3.3, 0], [0, -3.3]];   // corsia di destra (guida a destra)

export class PoliceUnit {
  constructor(d, cfg, x, z, h) {
    this.d = d;
    this.car = new d.Car(cfg);
    if (d.attachModel) d.attachModel(this.car);     // modello glTF della volante, se fornito
    this.car.input = { up: false, down: false, left: false, right: false, space: false };
    this.car.pad = { gas: 0, brake: 0, steer: 0, handbrake: false };
    this.car.reset(x, z, h);
    this.state = 'patrol'; this.siren = false; this.searching = false;
    this.stuckT = 0; this.reverseT = 0; this.wp = null; this.wpT = 0; this.blockT = 0; this.flashPhase = Math.random() * 6;
    this.idx = 0;
    this.initPatrol();
  }
  get pos() { return this.car.pos; }
  speed() { return Math.hypot(this.car.vel.x, this.car.vel.z); }

  /* --- griglia città --- */
  nearestIdx(v) { const S = this.d.world.streets, p = S[1] - S[0]; return clamp(Math.round((v - S[0]) / p), 0, S.length - 1); }
  initPatrol() {
    const W = this.d.world, c = this.car;
    if (W.id !== 'city') { this.idx = this.d.nearestSample(c.pos.x, c.pos.z, -1); this.sgn = Math.cos(c.heading - Math.atan2(W.samples[this.idx].dx, W.samples[this.idx].dz)) >= 0 ? 1 : -1; return; }
    // direzione di marcia più vicina all'heading attuale, incrocio di destinazione davanti
    let best = 0, bd = -2;
    DIRS.forEach((D, di) => { const dot = Math.sin(c.heading) * D[0] + Math.cos(c.heading) * D[1]; if (dot > bd) { bd = dot; best = di; } });
    const S = W.streets, L = S.length, D = DIRS[best];
    let ti = this.nearestIdx(c.pos.x), tj = this.nearestIdx(c.pos.z);
    if ((S[ti] - c.pos.x) * D[0] + (S[tj] - c.pos.z) * D[1] < 6) { ti += D[0]; tj += D[1]; }
    if (ti < 0 || tj < 0 || ti >= L || tj >= L) { ti = clamp(ti, 0, L - 1); tj = clamp(tj, 0, L - 1); best = (best + 2) % 4; }
    this.dir = best; this.ti = ti; this.tj = tj;
  }
  validDir(i, j, di) { const L = this.d.world.streets.length, D = DIRS[di]; return i + D[0] >= 0 && i + D[0] < L && j + D[1] >= 0 && j + D[1] < L; }

  /* --- comandi: pure pursuit su un punto con velocità obiettivo --- */
  steerTo(tx, tz, vTarget, dt) {
    const c = this.car, p = c.pad;
    if (this.state !== 'patrol') { const a = this.d.avoid(this, tx, tz); tx = a.x; tz = a.z; vTarget = Math.min(vTarget, a.v); }
    const dx = tx - c.pos.x, dz = tz - c.pos.z, dist = Math.hypot(dx, dz);
    const err = wrap(Math.atan2(dx, dz) - c.heading);
    // limite di velocità in curva: raggio della corda di pure pursuit, R = d / (2 sin θ)
    const Rc = dist / (2 * Math.max(0.02, Math.sin(Math.min(Math.abs(err), 1.5))));
    const grip = this.d.grip() * this.d.world.surface(c.pos.x, c.pos.z).grip;   // pioggia + erba/sabbia
    vTarget = Math.min(vTarget, Math.sqrt(1.15 * 9.81 * Rc * grip) + 2);
    const v = c.vz;
    if (this.reverseT > 0) {                      // manovra di sblocco in retromarcia
      this.reverseT -= dt; p.gas = 0; p.brake = 1; p.handbrake = false; p.steer = -Math.sign(err || 1); return;
    }
    // guadagno che cala con la velocità + smorzamento d'imbardata: niente correzioni brusche in autostrada
    const kv = 2.1 / (1 + Math.max(0, v) / 14);
    p.steer = clamp(err * kv - c.yawRate * (0.12 + Math.max(0, v) * 0.006), -1, 1);
    // sbandata: controsterzo verso la direzione del moto e gas quasi chiuso finché le gomme riprendono
    const slip = Math.atan2(c.vx, Math.max(Math.abs(v), 1));
    if (Math.abs(slip) > 0.3 && Math.hypot(c.vel.x, c.vel.z) > 5) {
      p.steer = clamp(slip * 1.6, -1, 1); p.gas = 0.08; p.brake = 0; p.handbrake = false; this.stuckT = 0; return;
    }
    p.handbrake = false;
    const dv = vTarget - v;
    if (vTarget <= 0.5) {
      // fermarsi senza innescare la retromarcia automatica della Car (freno tenuto da fermi)
      p.gas = 0; p.brake = Math.abs(v) > 0.6 ? clamp(0.3 + Math.abs(v) * 0.15, 0, 1) : 0; p.handbrake = Math.abs(v) <= 0.6;
      this.stuckT = 0; return;
    }
    if (dv > 0.3) { p.gas = clamp(0.35 + dv * 0.3, 0, 1); p.brake = 0; }
    else if (dv < -1.2) { p.gas = 0; p.brake = clamp(-dv * 0.22, 0.15, 1); }
    else { p.gas = 0.18; p.brake = 0; }
    // incastrata contro qualcosa: retromarcia per 2 s
    if (p.gas > 0.3 && Math.abs(v) < 0.8) { this.stuckT += dt; if (this.stuckT > 1.6) { this.stuckT = 0; this.reverseT = 2.1; } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
  }
  hold() { const p = this.car.pad, v = this.car.vz; p.gas = 0; p.steer = 0; p.brake = Math.abs(v) > 0.6 ? 1 : 0; p.handbrake = Math.abs(v) <= 0.6; }

  /* --- pattuglia: segue le corsie, si ferma al rosso --- */
  patrol(dt, speed, obeyLights) {
    const W = this.d.world, c = this.car;
    if (W.id !== 'city') {
      this.idx = this.d.nearestSample(c.pos.x, c.pos.z, this.idx);
      const S = W.samples, N = S.length, a = S[((this.idx + this.sgn * 8) % N + N) % N];
      const dx = a.dx * this.sgn, dz = a.dz * this.sgn;
      this.steerTo(a.x - dz * 3.5, a.z + dx * 3.5, speed, dt); return;
    }
    const S = W.streets, D = DIRS[this.dir], off = LANE[this.dir];
    let tx = S[this.ti] + off[0], tz = S[this.tj] + off[1];
    const along = (S[this.ti] - c.pos.x) * D[0] + (S[this.tj] - c.pos.z) * D[1];
    if (Math.hypot(tx - c.pos.x, tz - c.pos.z) < 9 || along < 2) {
      const back = (this.dir + 2) % 4, opts = [];
      for (let di = 0; di < 4; di++) if (di !== back && this.validDir(this.ti, this.tj, di)) opts.push(di);
      this.dir = !opts.length ? back : (opts.includes(this.dir) && Math.random() < 0.55 ? this.dir : opts[Math.floor(Math.random() * opts.length)]);
      this.ti += DIRS[this.dir][0]; this.tj += DIRS[this.dir][1];
      return this.patrol(dt, speed, obeyLights);
    }
    let v = speed;
    if (obeyLights) {
      const axis = (this.dir === 0 || this.dir === 2) ? 0 : 1;
      if (this.d.signal(axis) !== 'green' && along > 19) v = Math.min(v, Math.sqrt(2 * 4 * Math.max(0, along - 19.8)));
    }
    // se c'è un'auto davanti in corsia, si accoda
    if (this.d.blockedAhead(this, 11)) v = 0;
    this.steerTo(tx, tz, v, dt);
  }

  /* --- inseguimento in città: griglia degli incroci verso il bersaglio --- */
  chaseCity(dt, goalX, goalZ, vMax) {
    const W = this.d.world, S = W.streets, L = S.length, c = this.car, p = S[1] - S[0];
    const gi = this.nearestIdx(goalX), gj = this.nearestIdx(goalZ);
    const man = (i, j) => (Math.abs(i - gi) + Math.abs(j - gj)) * p;
    this.wpT -= dt;
    const reached = this.wp && Math.hypot(S[this.wp[0]] - c.pos.x, S[this.wp[1]] - c.pos.z) < 11;
    if (!this.wp || reached || this.wpT <= 0) {
      this.wpT = 1;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      let cands = [];
      const ni = this.nearestIdx(c.pos.x), nj = this.nearestIdx(c.pos.z);
      const ex = Math.abs(c.pos.x - S[ni]), ez = Math.abs(c.pos.z - S[nj]);
      if (reached || (ex < 14 && ez < 14)) {
        const [ci, cj] = reached ? this.wp : [ni, nj];
        if (ci === gi && cj === gj) { this.wp = null; return this.steerTo(goalX, goalZ, vMax, dt); }
        for (const D of DIRS) { const i = ci + D[0], j = cj + D[1]; if (i >= 0 && j >= 0 && i < L && j < L) cands.push([i, j]); }
      } else if (ex < ez) {
        const j0 = clamp(Math.floor((c.pos.z - S[0]) / p), 0, L - 1); cands = [[ni, j0], [ni, Math.min(L - 1, j0 + 1)]];
      } else {
        const i0 = clamp(Math.floor((c.pos.x - S[0]) / p), 0, L - 1); cands = [[i0, nj], [Math.min(L - 1, i0 + 1), nj]];
      }
      let best = null, bc = Infinity;
      for (const [i, j] of cands) {
        const dx = S[i] - c.pos.x, dz = S[j] - c.pos.z, dd = Math.hypot(dx, dz);
        const behind = dd > 12 && (dx * fx + dz * fz) / dd < -0.3 ? 70 : 0;
        const cost = dd + man(i, j) + behind;
        if (cost < bc) { bc = cost; best = [i, j]; }
      }
      this.wp = best;
    }
    if (!this.wp) return this.steerTo(goalX, goalZ, vMax, dt);
    const [wi, wj] = this.wp, wx = S[wi], wz = S[wj];
    const dist = Math.hypot(wx - c.pos.x, wz - c.pos.z);
    // si prepara alla svolta: se dopo l'incrocio il percorso gira, rallenta in tempo
    const dxg = gi - wi, dzg = gj - wj;
    const inx = Math.abs(wx - c.pos.x) > Math.abs(wz - c.pos.z);
    const turns = inx ? (dxg === 0 && dzg !== 0) : (dzg === 0 && dxg !== 0);
    const vc = turns ? 13 * Math.sqrt(this.d.grip()) : vMax;
    const v = Math.min(vMax, Math.sqrt(vc * vc + 2 * 6.5 * Math.max(0, dist - 8)));
    this.steerTo(wx, wz, v, dt);
  }

  chaseCoast(dt, goalX, goalZ, vMax, direct) {
    const W = this.d.world, S = W.samples, N = S.length, c = this.car;
    this.idx = this.d.nearestSample(c.pos.x, c.pos.z, this.idx);
    const gi = this.d.nearestSample(goalX, goalZ, -1);
    let diff = ((gi - this.idx) % N + N) % N; if (diff > N / 2) diff -= N;
    if (direct || Math.abs(diff) < 3) return this.steerTo(goalX, goalZ, vMax, dt);
    // punto di mira sulla mezzeria a ~0.8 s di strada (più vicino in curva = niente tagli sull'erba)
    const step = Math.max(1, Math.hypot(S[1].x - S[0].x, S[1].z - S[0].z));
    const ahead = clamp(Math.round(clamp(Math.max(c.vz, 0) * 0.8, 12, 40) / step), 2, 12);
    const sg = Math.sign(diff), a = S[((this.idx + sg * ahead) % N + N) % N];
    // curvatura più avanti: frena prima dei tornanti
    const far = S[((this.idx + sg * 30) % N + N) % N], near = S[this.idx];
    const dth = Math.abs(wrap(Math.atan2(far.dx, far.dz) - Math.atan2(near.dx, near.dz)));
    const arc = Math.hypot(far.x - near.x, far.z - near.z);
    const Rf = arc / Math.max(0.05, dth);
    const v = Math.min(vMax, Math.sqrt(1.1 * 9.81 * Rf * this.d.grip()) + 3 + Math.sqrt(2 * 6 * arc) * 0.3);
    this.steerTo(a.x, a.z, v, dt);
  }

  // Lampeggianti: blu/rosso alternati durante l'inseguimento
  flash(time) {
    const c = this.car; if (!c.lightBlue) return;
    if (!this.siren) { c.lightBlue.emissiveIntensity = 0; c.lightRed.emissiveIntensity = 0; return; }
    const t = time * 7 + this.flashPhase, a = Math.floor(t) % 2 === 0;
    const strobe = (t % 1) < 0.45 ? 1 : 0.15;
    c.lightBlue.emissiveIntensity = a ? 7 * strobe : 0.2;
    c.lightRed.emissiveIntensity = a ? 0.2 : 7 * strobe;
  }
}

/* ------------------------------------------------------------------ */
export class PoliceDispatcher {
  /* deps: { THREE, Car, extrudeBody, disposeVehicle, scene, world, getPlayer, mobile, clock,
             signalState, getTraffic, getPeds, audio, camera, onBusted, onEvaded, onImpact } */
  constructor(deps) {
    this.d = deps; const d = deps, THREE = d.THREE;
    this.world = d.world; this.wanted = new Wanted(); this.units = [];
    this.seeDist = d.world.id === 'city' ? R.seeDist : R.seeDistCoast;
    this.cfg = makePoliceConfig(THREE, d.extrudeBody);
    this.siren = new SirenAudio(d.audio);
    this.light = new THREE.PointLight(0x2a6bff, 0, 38, 1.6); this.light.visible = true; d.scene.add(this.light);
    this.lastSeen = null; this.time = 0; this.spawnT = 0; this.roadblockT = 12; this.honkT = 0;
    this.crimeCool = new Map(); this.inCross = false; this.ramCool = 0; this.pedCool = 0;
    this.blockers = (this.world.colliders || []).filter(b => b.maxx - b.minx > 3 && b.maxz - b.minz > 3);
    // funzioni condivise con le unità
    const self = this;
    this.ctx = {
      world: this.world, Car: d.Car, attachModel: d.attachModel,
      grip: () => (d.gripMul ? d.gripMul() : 1),
      signal: axis => d.signalState(d.clock(), axis).phase,
      nearestSample: (x, z, hint) => self.nearestSample(x, z, hint),
      blockedAhead: (u, range) => self.blockedAhead(u, range),
      avoid: (u, tx, tz) => self.avoid(u, tx, tz),
    };
    const n = d.mobile ? R.patrolsTouch : R.maxUnits[0];
    for (let i = 0; i < n; i++) this.spawn('patrol', 150, 350, false);
  }
  get player() { return this.d.getPlayer(); }
  get maxUnits() { const m = R.maxUnits[this.wanted.level]; return this.d.mobile ? Math.min(R.maxTouch, m) : m; }

  nearestSample(x, z, hint) {
    const S = this.world.samples, N = S.length;
    let best = 0, bd = Infinity;
    if (hint >= 0) { for (let k = -24; k <= 24; k++) { const i = ((hint + k) % N + N) % N, s = S[i], dd = (s.x - x) ** 2 + (s.z - z) ** 2; if (dd < bd) { bd = dd; best = i; } } if (bd < 900) return best; }
    for (let i = 0; i < N; i += 3) { const s = S[i], dd = (s.x - x) ** 2 + (s.z - z) ** 2; if (dd < bd) { bd = dd; best = i; } }
    // rifinitura attorno al campione grossolano
    const c0 = best;
    for (let k = -3; k <= 3; k++) { const i = ((c0 + k) % N + N) % N, s = S[i], dd = (s.x - x) ** 2 + (s.z - z) ** 2; if (dd < bd) { bd = dd; best = i; } }
    return best;
  }

  /* --- spawn su strada, possibilmente fuori dal campo visivo --- */
  spawnPoint(minD, maxD, hidden) {
    const W = this.world, P = this.player, cam = this.d.camera;
    const fx = cam ? -cam.matrixWorld.elements[8] : Math.sin(P.heading), fz = cam ? -cam.matrixWorld.elements[10] : Math.cos(P.heading);
    const ok = (x, z) => {
      const dx = x - P.pos.x, dz = z - P.pos.z, dd = Math.hypot(dx, dz);
      if (dd < minD || dd > maxD) return false;
      if (hidden && (dx * fx + dz * fz) / dd > Math.cos(70 * Math.PI / 180)) return false;
      return !this.units.some(u => Math.hypot(u.pos.x - x, u.pos.z - z) < 12);
    };
    for (let tries = 0; tries < 80; tries++) {
      if (W.id === 'city') {
        const S = W.streets, L = S.length, i = Math.floor(Math.random() * L), j = Math.floor(Math.random() * L);
        const di = Math.floor(Math.random() * 4), D = DIRS[di];
        if (i + D[0] < 0 || i + D[0] >= L || j + D[1] < 0 || j + D[1] >= L) continue;
        const t = rand(0.3, 0.6), off = LANE[di];
        const x = S[i] + D[0] * (S[1] - S[0]) * t + off[0], z = S[j] + D[1] * (S[1] - S[0]) * t + off[1];
        if (ok(x, z)) return { x, z, h: Math.atan2(D[0], D[1]) };
      } else {
        const S = W.samples, i = Math.floor(Math.random() * S.length), s = S[i], sg = Math.random() < 0.5 ? 1 : -1;
        const x = s.x - s.dz * sg * 3.5, z = s.z + s.dx * sg * 3.5;
        if (ok(x, z)) return { x, z, h: Math.atan2(s.dx * sg, s.dz * sg) };
      }
    }
    return null;
  }
  spawn(state, minD, maxD, hidden) {
    const p = this.spawnPoint(minD, maxD, hidden) || this.spawnPoint(minD * 0.5, maxD * 2, false);
    if (!p) return null;
    const u = new PoliceUnit(this.ctx, this.cfg, p.x, p.z, p.h);
    u.state = state; u.car.syncMesh(1, this.world);
    this.units.push(u); return u;
  }
  removeUnit(u) { this.d.disposeVehicle(u.car); this.units.splice(this.units.indexOf(u), 1); }
  relocate(u, minD, maxD) {
    const p = this.spawnPoint(minD, maxD, true); if (!p) return;
    u.car.reset(p.x, p.z, p.h); u.car.syncMesh(1, this.world); u.state = 'patrol'; u.siren = false; u.searching = false; u.wp = null; u.reverseT = 0; u.initPatrol();
  }

  /* --- linea di vista contro gli edifici (segmento vs AABB, metodo delle lastre) --- */
  canSee(u) {
    const P = this.player, ax = u.pos.x, az = u.pos.z, bx = P.pos.x, bz = P.pos.z;
    if (Math.hypot(bx - ax, bz - az) > this.seeDist) return false;
    const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
    const dx = bx - ax, dz = bz - az;
    for (const b of this.blockers) {
      if (b.maxx < minx || b.minx > maxx || b.maxz < minz || b.minz > maxz) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-6) { if (ax < b.minx || ax > b.maxx) continue; }
      else { let a = (b.minx - ax) / dx, c = (b.maxx - ax) / dx; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
      if (Math.abs(dz) < 1e-6) { if (az < b.minz || az > b.maxz) continue; }
      else { let a = (b.minz - az) / dz, c = (b.maxz - az) / dz; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
      if (t0 <= t1) return false;
    }
    return true;
  }

  blockedAhead(u, range) {
    const c = u.car, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const test = (x, z) => { const rx = x - c.pos.x, rz = z - c.pos.z, d = rx * fx + rz * fz; return d > 1 && d < range && Math.abs(rx * fz - rz * fx) < 2.4; };
    const tr = this.d.getTraffic && this.d.getTraffic();
    if (tr) for (const o of tr.cars) if (test(o.pos.x, o.pos.z)) return true;
    for (const o of this.units) if (o !== u && test(o.pos.x, o.pos.z)) return true;
    const P = this.player; return this.wanted.level === 0 && test(P.pos.x, P.pos.z);
  }

  // Schivata: se un'auto occupa il corridoio davanti, sposta il bersaglio di lato
  // (verso lo spazio libero) e, se troppo vicina, adegua la velocità.
  avoid(u, tx, tz) {
    const c = u.car, v = Math.max(c.vz, 0), fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const look = clamp(v * 1.8, 16, 55), P = this.player;
    const cars = [];
    const tr = this.d.getTraffic && this.d.getTraffic();
    if (tr) for (const o of tr.cars) cars.push({ x: o.pos.x, z: o.pos.z, sp: o.speed, h: o.heading });
    for (const o of this.units) if (o !== u) cars.push({ x: o.pos.x, z: o.pos.z, sp: Math.hypot(o.car.vel.x, o.car.vel.z), h: o.car.heading });
    let best = null, bd = look;
    for (const o of cars) {
      const rx = o.x - c.pos.x, rz = o.z - c.pos.z, d = rx * fx + rz * fz, lat = rx * fz - rz * fx;
      if (d > 2 && d < bd && Math.abs(lat) < 2.6) { bd = d; best = o; }
    }
    if (!best) return { x: tx, z: tz, v: Infinity };
    // il giocatore stesso non è un ostacolo da evitare se è lui il bersaglio vicino
    if (Math.hypot(tx - P.pos.x, tz - P.pos.z) < 6 && Math.hypot(tx - c.pos.x, tz - c.pos.z) < bd) return { x: tx, z: tz, v: Infinity };
    const follow = { x: tx, z: tz, v: bd < 25 ? best.sp + clamp((bd - 8) * 0.4, -3, 6) : Infinity };
    if (this.world.id === 'city') {
      // viali larghi 26 m: si passa dal lato opposto all'ostacolo
      const lat = (best.x - c.pos.x) * fz - (best.z - c.pos.z) * fx, side = lat > 0 ? -1 : 1;
      const ahead = Math.max(bd, v * 0.9, 12), off = lat + 3.6 * side;
      return { x: c.pos.x + fx * ahead + fz * off, z: c.pos.z + fz * ahead - fx * off, v: bd < 10 ? best.sp + 4 : Infinity };
    }
    // costa: carreggiata da 14 m, sorpasso nella corsia opposta solo se libera (anche in senso contrario)
    const S = this.world.samples, N = S.length, k = this.nearestSample(best.x, best.z, u.idx), s = S[k];
    const rX = s.dz, rZ = -s.dx, dir = Math.sign(fx * s.dx + fz * s.dz) || 1;
    const obsOff = (best.x - s.x) * rX + (best.z - s.z) * rZ;
    const lane = obsOff * dir > 0 ? -3.4 * dir : 3.4 * dir;         // offset (sistema della spline) della corsia di sorpasso
    const passLen = look + 30;
    for (const o of cars) {
      if (o === best) continue;
      const rx = o.x - c.pos.x, rz = o.z - c.pos.z, d = rx * fx + rz * fz;
      if (d < -5 || d > passLen * (1 + o.sp / Math.max(v, 8))) continue;
      const ko = this.nearestSample(o.x, o.z, k), so = S[ko], off = (o.x - so.x) * so.dz - (o.z - so.z) * so.dx;
      if (Math.abs(off - lane) < 2.8) return follow;               // corsia occupata: ci si accoda
    }
    const ka = ((k + dir * 3) % N + N) % N, sa = S[ka];
    return { x: sa.x + sa.dz * lane, z: sa.z - sa.dx * lane, v: Infinity };
  }

  /* --- urti fra rettangoli orientati (SAT) con impulso a masse reali --- */
  collide(A, B, isPlayerA) {
    const fa = { x: Math.sin(A.heading), z: Math.cos(A.heading) }, fb = { x: Math.sin(B.heading), z: Math.cos(B.heading) };
    const ra = { x: fa.z, z: -fa.x }, rb = { x: fb.z, z: -fb.x };
    const ha = [A.cfg.body.w * 0.49, A.cfg.body.l * 0.49], hb = [B.cfg.body.w * 0.49, B.cfg.body.l * 0.49];
    const dx = A.pos.x - B.pos.x, dz = A.pos.z - B.pos.z;
    if (dx * dx + dz * dz > 36) return;
    let pen = Infinity, nx = 0, nz = 0;
    for (const ax of [ra, fa, rb, fb]) {
      const proj = dx * ax.x + dz * ax.z;
      const rA = ha[0] * Math.abs(ra.x * ax.x + ra.z * ax.z) + ha[1] * Math.abs(fa.x * ax.x + fa.z * ax.z);
      const rB = hb[0] * Math.abs(rb.x * ax.x + rb.z * ax.z) + hb[1] * Math.abs(fb.x * ax.x + fb.z * ax.z);
      const depth = rA + rB - Math.abs(proj);
      if (depth <= 0) return;
      if (depth < pen) { pen = depth; const s = proj < 0 ? -1 : 1; nx = ax.x * s; nz = ax.z * s; }
    }
    const mA = A.cfg.mass, mB = B.cfg.mass, tot = mA + mB;
    A.pos.x += nx * pen * mB / tot; A.pos.z += nz * pen * mB / tot;
    B.pos.x -= nx * pen * mA / tot; B.pos.z -= nz * pen * mA / tot;
    const vn = (A.vel.x - B.vel.x) * nx + (A.vel.z - B.vel.z) * nz;
    if (vn >= 0) return;
    const j = -(1 + 0.25) * vn / (1 / mA + 1 / mB);
    A.vel.x += nx * j / mA; A.vel.z += nz * j / mA; B.vel.x -= nx * j / mB; B.vel.z -= nz * j / mB;
    // coppia d'imbardata dal punto di contatto (a metà tra i centri)
    const cx = (A.pos.x + B.pos.x) / 2, cz = (A.pos.z + B.pos.z) / 2;
    const yaw = (car, s) => { const rx = cx - car.pos.x, rz = cz - car.pos.z; car.yawRate += s * (rz * nx * j - rx * nz * j) / car.Iz * 0.6; };
    yaw(A, 1); yaw(B, -1);
    if (-vn > 4) {
      const im = { x: cx, z: cz, speed: -vn };
      if (isPlayerA) {
        A.impacts.push(im);
        // colpa del giocatore se era lui ad andare addosso alla volante
        const pv = -(A.vel.x * nx + A.vel.z * nz) + j / mA;
        if (pv > 3 && this.ramCool <= 0) { this.wanted.crime('ram'); this.ramCool = 1.5; this.alertAll(); }
      } else if (this.d.onImpact) this.d.onImpact(im);
    }
  }

  step(dt) {
    const W = this.world, P = this.player;
    for (const u of this.units) { u.car.update(dt, W); if (u.car.impacts.length) { if (this.d.onImpact) for (const im of u.car.impacts) if (im.speed > 6) this.d.onImpact(im); u.car.impacts.length = 0; } }
    for (let i = 0; i < this.units.length; i++) {
      this.collide(P, this.units[i].car, true);
      for (let k = i + 1; k < this.units.length; k++) this.collide(this.units[i].car, this.units[k].car, false);
    }
    const tr = this.d.getTraffic && this.d.getTraffic();
    if (tr) for (const u of this.units) for (const o of tr.cars) {
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 2.6 && dd > 0.01) {
        const nx = dx / dd, nz = dz / dd; u.pos.x += nx * (2.6 - dd); u.pos.z += nz * (2.6 - dd);
        // l'auto del traffico è cinematica: impulso come contro una massa di 1400 kg (e = 0.25)
        const vn = u.car.vel.x * nx + u.car.vel.z * nz, k = 1.25 * 1400 / (1400 + u.car.cfg.mass);
        if (vn < 0) { u.car.vel.x -= nx * vn * k; u.car.vel.z -= nz * vn * k; if (-vn > 6 && this.d.onImpact) this.d.onImpact({ x: o.pos.x, z: o.pos.z, speed: -vn }); }
        o.speed *= 0.3;
      }
    }
  }

  alertAll() {
    for (const u of this.units) if (u.state === 'patrol' && Math.hypot(u.pos.x - this.player.pos.x, u.pos.z - this.player.pos.z) < 260) { u.state = 'pursuit'; u.wp = null; u.arrive = false; }
  }

  // Reati del giocatore: valgono solo se una volante li vede (salvo urti alle volanti)
  detectCrimes(dt, seen) {
    const W = this.world, P = this.player, w = this.wanted, spd = Math.hypot(P.vel.x, P.vel.z);
    const limit = (W.id === 'city' ? R.speedCity : R.speedCoast) / 3.6;
    let crime = false;
    if (seen && spd > limit) { w.crime('speed', dt); crime = true; }
    if (W.id === 'city') {
      const S = W.streets, p = S[1] - S[0], iN = clamp(Math.round((P.pos.x - S[0]) / p), 0, S.length - 1), jN = clamp(Math.round((P.pos.z - S[0]) / p), 0, S.length - 1);
      const inside = Math.abs(P.pos.x - S[iN]) < 13 && Math.abs(P.pos.z - S[jN]) < 13;
      if (inside && !this.inCross && spd > 3) {
        const axis = Math.abs(P.vel.z) > Math.abs(P.vel.x) ? 0 : 1;
        if (seen && this.d.signalState(this.d.clock(), axis).phase === 'red') { w.crime('red'); crime = true; }
      }
      this.inCross = inside;
    }
    const tr = this.d.getTraffic && this.d.getTraffic();
    if (tr) for (const o of tr.cars) {
      const dd = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
      if (dd < 2.9 && spd > 4 && (this.crimeCool.get(o) || 0) <= this.time) { this.crimeCool.set(o, this.time + 2); if (seen) { w.crime('crash'); crime = true; } }
    }
    const pd = this.d.getPeds && this.d.getPeds();
    this.pedCool -= dt;
    if (pd && spd > 3 && this.pedCool <= 0) for (const q of pd.peds) {
      if (Math.abs(q.x - P.pos.x) < 1.4 && Math.abs(q.z - P.pos.z) < 1.4 && Math.hypot(q.x - P.pos.x, q.z - P.pos.z) < 1.3) { this.pedCool = 2; if (seen) { w.crime('crash'); crime = true; } break; }
    }
    if (crime) this.alertAll();
  }

  honk() {
    this.honkT = 0.5;
    if (this.wanted.level === 0 && this.units.some(u => Math.hypot(u.pos.x - this.player.pos.x, u.pos.z - this.player.pos.z) < 40)) {
      this.wanted.heat = Math.max(this.wanted.heat, 1); this.wanted.level = 1; this.alertAll();
    }
  }

  roadblock() {
    const W = this.world, P = this.player, S = W.streets, p = S[1] - S[0];
    const spd = Math.hypot(P.vel.x, P.vel.z); if (spd < 12) return false;
    const t = rand(3, 6), fx = P.pos.x + P.vel.x * t, fz = P.pos.z + P.vel.z * t;
    const i = clamp(Math.round((fx - S[0]) / p), 0, S.length - 1), j = clamp(Math.round((fz - S[0]) / p), 0, S.length - 1);
    const cx = S[i], cz = S[j], dx = cx - P.pos.x, dz = cz - P.pos.z, dd = Math.hypot(dx, dz);
    if (dd < 60 || (dx * P.vel.x + dz * P.vel.z) / (dd * spd) < 0.8) return false;
    // posto di blocco all'ingresso dell'incrocio, di traverso rispetto al moto del giocatore
    const alongX = Math.abs(P.vel.x) > Math.abs(P.vel.z), sx = Math.sign(alongX ? P.vel.x : P.vel.z);
    const bx = alongX ? cx - sx * 15 : cx, bz = alongX ? cz : cz - sx * 15;
    const h = alongX ? 0 : Math.PI / 2;
    for (const o of [-2.6, 2.6]) {
      if (this.units.length >= this.maxUnits + 2) break;
      const x = alongX ? bx : bx + o, z = alongX ? bz + o : bz;
      const u = new PoliceUnit(this.ctx, this.cfg, x, z, h + (o > 0 ? Math.PI : 0));
      u.state = 'roadblock'; u.siren = true; u.blockT = 25; u.car.syncMesh(1, W); this.units.push(u);
    }
    return true;
  }

  frame(dt, alpha = 1) {
    const W = this.world, P = this.player, w = this.wanted;
    this.time += dt; this.ramCool -= dt; this.spawnT -= dt; this.roadblockT -= dt; this.honkT -= dt;
    // vista: basta una volante (la radio condivide la posizione)
    let seen = false, copNear = Infinity;
    for (const u of this.units) {
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z); copNear = Math.min(copNear, d);
      u.sees = u.state !== 'roadblock' || d < this.seeDist ? this.canSee(u) : false;
      if (u.sees) seen = true;
    }
    this.detectCrimes(dt, seen);
    if (seen && w.level > 0) this.lastSeen = { x: P.pos.x, z: P.pos.z };
    const res = w.update(dt, { seen, playerSpeed: Math.hypot(P.vel.x, P.vel.z), copNear });
    if (res === 'busted') { this.bust(); return; }
    if (res === 'evaded') { this.calmDown(); if (this.d.onEvaded) this.d.onEvaded(); }

    // gestione organico: rinforzi, rientri, posti di blocco
    if (w.level > 0) {
      const chasing = this.units.filter(u => u.state !== 'patrol').length;
      if (this.spawnT <= 0 && this.units.length < this.maxUnits) { this.spawnT = 4; const u = this.spawn('pursuit', 120, 200, true); if (u) { u.siren = true; } }
      if (!chasing) this.alertAll();
      if (W.id === 'city' && w.level >= R.roadblockLevel && this.roadblockT <= 0) this.roadblockT = this.roadblock() ? 20 : 3;
    } else {
      for (const u of [...this.units]) {
        const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
        if (this.units.length > (this.d.mobile ? R.patrolsTouch : R.maxUnits[0]) && d > 150 && !this.canSee(u)) this.removeUnit(u);
      }
    }
    for (const u of [...this.units]) {
      const c = u.car, d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      if (!Number.isFinite(c.pos.x) || !Number.isFinite(c.pos.z) || !Number.isFinite(c.vel.x)) { this.removeUnit(u); this.spawn(w.level ? 'pursuit' : 'patrol', 150, 300, true); continue; }
      if (u.state === 'patrol' && d > 420) this.relocate(u, 150, 320);
      if (u.state === 'roadblock') {
        u.blockT -= dt; u.hold();
        const passed = (u.pos.x - P.pos.x) * P.vel.x + (u.pos.z - P.pos.z) * P.vel.z < 0 && d > 20;
        if (u.blockT <= 0 || passed || w.level === 0) { u.state = w.level ? 'pursuit' : 'patrol'; u.initPatrol(); }
        continue;
      }
      if (u.state === 'pursuit') {
        u.siren = true;
        const vMax = c.cfg.topSpeed;
        const spd = Math.hypot(P.vel.x, P.vel.z);
        if (u.sees && d < 60) {
          u.searching = false;
          // pure pursuit sulla posizione prevista; PIT dal livello 3
          const la = Math.min(1.5, d / Math.max(u.speed(), 10));
          // velocità di avvicinamento proporzionale al distacco: niente staccate al limite a ridosso
          let tx = P.pos.x + P.vel.x * la, tz = P.pos.z + P.vel.z * la, v = Math.min(vMax, spd + clamp((d - 8) * 0.7, 4, 30));
          // giocatore fermo (o spinto, senza gas): accostarsi e fermarsi a ~5 m.
          // Isteresi: si torna a speronare solo se il giocatore riparte davvero.
          if (spd < 6 && d < 70) u.arrive = true;
          else if (spd > 10 && P.throttle > 0.2) u.arrive = false;
          if (u.arrive) {
            const err = Math.abs(wrap(Math.atan2(P.pos.x - u.pos.x, P.pos.z - u.pos.z) - u.car.heading));
            tx = P.pos.x; tz = P.pos.z;
            v = err > 1.3 && d < 10 ? 0 : Math.min(vMax, Math.sqrt(2 * 4.5 * this.ctx.grip() * Math.max(0, d - 6.5)));
          }
          const pf = { x: Math.sin(P.heading), z: Math.cos(P.heading) }, pr = { x: pf.z, z: -pf.x };
          const rx = u.pos.x - P.pos.x, rz = u.pos.z - P.pos.z, lon = rx * pf.x + rz * pf.z, lat = rx * pr.x + rz * pr.z;
          if (w.level >= R.pitLevel && spd > 8 && Math.abs(lat) < 3.4 && lon > -3.8 && lon < 1.5) {
            tx = P.pos.x - pf.x * 1.6 - pr.x * Math.sign(lat) * 1.2; tz = P.pos.z - pf.z * 1.6 - pr.z * Math.sign(lat) * 1.2; v = spd + 3;
          }
          // sulla costa la strada curva: si segue il nastro finché non si è a ridosso
          if (W.id !== 'city' && d > 18 && !u.arrive) u.chaseCoast(dt, P.pos.x, P.pos.z, v, false);
          else u.steerTo(tx, tz, v, dt);
        } else if (this.lastSeen) {
          const g = seen ? { x: P.pos.x, z: P.pos.z } : this.lastSeen;
          if (!seen && Math.hypot(g.x - u.pos.x, g.z - u.pos.z) < 18) u.searching = true;
          if (u.searching && !seen) { if (u.dir === undefined && W.id === 'city') u.initPatrol(); u.patrol(dt, 15, false); }
          else if (W.id === 'city') u.chaseCity(dt, g.x, g.z, vMax);
          else u.chaseCoast(dt, g.x, g.z, vMax, false);
          if (seen) u.searching = false;
        } else if (W.id === 'city') u.chaseCity(dt, P.pos.x, P.pos.z, vMax);
        else u.chaseCoast(dt, P.pos.x, P.pos.z, vMax, false);
      } else {
        u.siren = false; u.patrol(dt, 11, true);
      }
    }
    for (const u of this.units) { if (W.id !== 'city') u.idx = this.nearestSample(u.pos.x, u.pos.z, u.idx); u.car.syncMesh(dt, W, alpha); u.flash(this.time); }
    // una sola luce reale: sulla volante con sirena più vicina
    let near = null, nd = 70;
    for (const u of this.units) if (u.siren) { const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z); if (d < nd) { nd = d; near = u; } }
    if (near) {
      const blue = Math.floor(this.time * 7 + near.flashPhase) % 2 === 0;
      this.light.color.setHex(blue ? 0x2a6bff : 0xff2030); this.light.intensity = 60;
      this.light.position.set(near.pos.x, near.car.group.position.y + 2.2, near.pos.z);
    } else this.light.intensity = 0;
    this.updateAudio();
  }

  updateAudio() {
    const cam = this.d.camera, P = this.player; if (!cam) return;
    const e = cam.matrixWorld.elements;
    this.siren.update(this.units, { pos: cam.position, fwd: { x: -e[8], y: -e[9], z: -e[10] } }, P.vel, this.time);
  }

  calmDown() {
    this.lastSeen = null;
    for (const u of this.units) { u.state = 'patrol'; u.siren = false; u.searching = false; u.wp = null; u.initPatrol(); }
  }
  bust() {
    this.wanted.reset(); this.calmDown();
    for (const u of [...this.units]) if (u.state === 'roadblock' || this.units.length > (this.d.mobile ? R.patrolsTouch : R.maxUnits[0])) this.removeUnit(u);
    if (this.d.onBusted) this.d.onBusted();
    for (const u of this.units) this.relocate(u, 150, 320);
    this.siren.silence();
  }
  pause() { this.siren.silence(); }
  dispose() {
    for (const u of [...this.units]) this.removeUnit(u);
    this.siren.dispose(); this.d.scene.remove(this.light); this.light.dispose();
  }
}
