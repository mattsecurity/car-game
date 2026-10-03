// Dinamica del veicolo a 4 ruote: pneumatici "Magic Formula" (Pacejka) con slittamento
// combinato, rotazione delle ruote (integrazione implicita), sospensioni a molla e
// ammortizzatore per angolo con barre antirollio, corpo con sollevamento/beccheggio/rollio,
// motore con curva di coppia, cambio automatico, differenziale autobloccante, ABS/TC/ESC.
// Nessuna dipendenza: funzioni pure, provabili in Node.
//
// Convenzioni (come nel resto del gioco): avanti f=(sin h, cos h), laterale L=(cos h,-sin h)
// = sinistra del guidatore; imbardata positiva ruota f verso L; beccheggio positivo = muso giù;
// rollio positivo = lato sinistro (+L) su. Ogni ruota ha coordinate (d lungo f, l lungo L).

export const MF = { C: 1.35, B: 2.34 };            // picco a slittamento normalizzato 1, a pieno slittamento ≈ 85% del picco
export const mf = s => Math.sin(MF.C * Math.atan(MF.B * s));
export const mfSlope = s => { const bs = MF.B * s; return Math.cos(MF.C * Math.atan(bs)) * MF.C * MF.B / (1 + bs * bs); };

// Forze del pneumatico con slittamento combinato (vettore di slittamento normalizzato).
// kappa: rapporto di slittamento, alpha: angolo di deriva [rad], fz: carico [N], mu: attrito.
// Restituisce fx (avanti), fy (laterale, verso +L) e kx = dFx/dkappa (per l'integrazione implicita).
export function tireForces(kappa, alpha, fz, mu, kPeak, aPeak) {
  if (fz <= 0) return { fx: 0, fy: 0, kx: 0, s: 0 };
  const sx = kappa / kPeak, sy = alpha / aPeak, s = Math.hypot(sx, sy);
  if (s < 1e-7) return { fx: 0, fy: 0, kx: mu * fz * MF.C * MF.B / kPeak, s: 0 };
  const F = mu * fz * mf(s), q = sx * sx / (s * s);
  const kx = Math.max(0, mu * fz * ((mf(s) / s) * (1 - q) + mfSlope(s) * q)) / kPeak;
  return { fx: F * sx / s, fy: -F * sy / s, kx, s };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Parametri fisici derivati dalla configurazione del veicolo (cfg del gioco).
export function physParams(cfg) {
  const b = cfg.body, p = cfg.phys || {};
  const ev = !!cfg.ev, m = cfg.mass, L = cfg.wheelBase;
  const Rf = b.wheelR, Rr = b.wheelRR || b.wheelR;
  const engine = ev ? null : {
    idle: p.idle || 900, redline: p.redline || 7000, torque: p.torque || cfg.engineForce * Rr / 12, peakRpm: p.peakRpm || (p.redline || 7000) * 0.62,
  };
  // rapporti totali (cambio × finale) ricavati dalle velocità massime per marcia del gioco
  const ratios = ev ? [1] : cfg.gears.map(v => (engine.redline * Math.PI / 30) * Rr / v);
  const freq = p.freq || 1.7, zeta = p.zeta || 0.45;
  const cornerF = m * cfg.bDist / L / 2, cornerR = m * cfg.aDist / L / 2;
  const kF = cornerF * (2 * Math.PI * freq) ** 2, kR = cornerR * (2 * Math.PI * freq * 1.08) ** 2;
  return {
    m, L, a: cfg.aDist, b: cfg.bDist, h: cfg.cgH, ev, engine, ratios,
    Iz: m * L * L * 0.24, Ip: m * (0.33 * (b.l || 4.4)) ** 2, Ir: m * (0.3 * (b.w || 1.9)) ** 2,
    track: b.track || (b.w - 0.2), Rf, Rr, Iw: p.wheelInertia || 1.1,
    muF: cfg.muF, muR: cfg.muR, kPeak: p.kPeak || 0.11, aPeak: p.aPeak || (cfg.df ? 0.105 : 0.13),
    kF, kR, cF: 2 * zeta * Math.sqrt(kF * cornerF), cR: 2 * zeta * Math.sqrt(kR * cornerR),
    arbF: p.arbF ?? kF * 0.9, arbR: p.arbR ?? kR * 0.55,
    s0F: cornerF * 9.81 / kF, s0R: cornerR * 9.81 / kR,
    // freni capaci di arrivare al limite d'aderenza
    brake: Math.max(cfg.brakeForce, m * 9.81 * 1.45), bias: p.brakeBias || 0.64, drive: cfg.drive, lsd: p.lsd ?? 60,
    evForce: cfg.engineForce, evPower: p.power || cfg.power || 150000,
    drag: cfg.drag, df: cfg.df || 0, crr: 0.013, eta: 0.9, topSpeed: cfg.topSpeed,
  };
}

function torqueCurve(e, rpm) {
  const x = (rpm - e.peakRpm) / (e.redline - e.idle);
  return e.torque * clamp(1 - 1.35 * x * x, 0.45, 1);
}

export class VehicleDynamics {
  constructor(cfg) {
    this.p = physParams(cfg); const p = this.p, t = p.track / 2;
    this.wheels = [
      { d: p.a, l: t, front: true }, { d: p.a, l: -t, front: true },
      { d: -p.b, l: t, front: false }, { d: -p.b, l: -t, front: false },
    ].map(w => ({ ...w, R: w.front ? p.Rf : p.Rr, driven: p.drive === 'A' || (p.drive === 'F') === w.front, omega: 0, fz: 0, kappa: 0, alpha: 0, comp: 0, compPrev: null, fx: 0, fy: 0, slide: 0 }));
    this.assists = true;
    this.reset();
  }
  reset() {
    for (const w of this.wheels) { w.omega = 0; w.alpha = 0; w.kappa = 0; w.slide = 0; w.compPrev = null; }
    this.pitch = 0; this.pitchRate = 0; this.roll = 0; this.rollRate = 0;
    this.gear = 0; this.shiftT = 0; this.rpm = this.p.engine ? this.p.engine.idle : 0; this.synced = false; this.tc = 1;
    this.aLong = 0; this.aLat = 0;
  }
  // rpm del motore dalla velocità delle ruote motrici
  wheelRpm(gear) { const dw = this.wheels.filter(w => w.driven); const om = dw.reduce((s, w) => s + w.omega, 0) / dw.length; return Math.abs(om) * this.p.ratios[gear] * 30 / Math.PI; }

  // car: { pos, vel, heading, yawRate, rideY, verticalSpeed }; inp: { throttle, brake, handbrake, steer, reverse }
  // env: { height(x,z), surface(x,z) -> {grip, roll}, gripMul }
  step(car, dt, inp, env) {
    const p = this.p, W = this.wheels;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), Lx = fz, Lz = -fx;
    const vz = car.vel.x * fx + car.vel.z * fz, vx = car.vel.x * Lx + car.vel.z * Lz, w0 = car.yawRate;
    if (!this.synced) {                                  // ruote alla velocità del veicolo (dopo reset/teletrasporto)
      for (const w of W) w.omega = (vz - w0 * w.l) / w.R;
      if (p.engine) { let g = 0; while (g < p.ratios.length - 1 && this.wheelRpm(g) > p.engine.redline * 0.8) g++; this.gear = g; }
      this.synced = true;
    }
    // --- sospensioni: carichi verticali ---
    const surf = env.surface(car.pos.x, car.pos.z), v2 = vz * vz;
    const down = p.df * v2;
    let heaveF = 0, pitchM = 0, rollM = 0, anyContact = false;
    const comps = W.map(w => {
      const gx = car.pos.x + fx * w.d + Lx * w.l, gz = car.pos.z + fz * w.d + Lz * w.l;
      const ground = env.height(gx, gz), bodyY = car.rideY - w.d * this.pitch + w.l * this.roll;
      const s0 = w.front ? p.s0F : p.s0R;
      return ground - bodyY + s0;                         // compressione della molla [m]
    });
    for (let i = 0; i < 4; i++) {
      const w = W[i], c = comps[i], k = w.front ? p.kF : p.kR, cd = w.front ? p.cF : p.cR;
      const rate = w.compPrev === null ? 0 : (c - w.compPrev) / dt; w.compPrev = c;
      let F = 0;
      if (c > 0) { F = k * c + cd * rate; if (c > (w.front ? p.s0F : p.s0R) + 0.09) F += 40 * k * (c - (w.front ? p.s0F : p.s0R) - 0.09); anyContact = true; }
      w.comp = c; w.susp = Math.max(0, F);
    }
    for (const [iL, iR, arb] of [[0, 1, p.arbF], [2, 3, p.arbR]]) {    // barre antirollio
      if (W[iL].comp > 0 && W[iR].comp > 0) { const f = arb * (W[iL].comp - W[iR].comp); W[iL].susp = Math.max(0, W[iL].susp + f); W[iR].susp = Math.max(0, W[iR].susp - f); }
    }
    for (const w of W) {
      w.fz = w.comp > 0 ? w.susp + down * (w.front ? 0.42 : 0.58) / 2 : 0;
      heaveF += w.susp; pitchM -= w.susp * w.d; rollM += w.susp * w.l;
    }
    // --- motore / trasmissione ---
    const reverse = inp.reverse, e = p.engine;
    let axleTorque = 0;
    if (p.ev) {
      const om = Math.max(1, Math.abs(W.filter(w => w.driven).reduce((s, w) => s + w.omega, 0) / W.filter(w => w.driven).length));
      const Tmax = Math.min(p.evForce * p.Rr, p.evPower / om * p.Rr / p.Rr);
      axleTorque = inp.throttle * Tmax * (reverse ? -0.45 : 1);
      if (Math.abs(vz) > p.topSpeed && !reverse) axleTorque = 0;
      if (inp.throttle < 0.05 && vz > 2) axleTorque = -p.m * 1.1 * p.Rr;   // recupero in rilascio
      this.rpm = om * 9.5493;
    } else {
      this.shiftT = Math.max(0, this.shiftT - dt);
      const g = reverse ? 0 : this.gear, ratio = p.ratios[g] * (reverse ? 1.15 : 1);
      const wr = this.wheelRpm(g) * (reverse ? 1.15 : 1);
      // frizione che slitta in partenza: il motore sale di giri anche da fermo
      const launch = e.idle + inp.throttle * (e.redline * 0.42 - e.idle);
      this.rpm = clamp(Math.max(wr, g === 0 ? Math.min(launch, e.redline) : wr), e.idle, e.redline * 1.02);
      let T = inp.throttle * torqueCurve(e, this.rpm) * this.tc;
      if (this.rpm >= e.redline) T = 0;                                    // limitatore
      // freno motore: si oppone alla rotazione delle ruote, nullo sotto il minimo (frizione staccata)
      if (wr > e.idle * 1.1) T -= (1 - inp.throttle) * e.torque * 0.12 * (this.rpm / e.redline);
      if (this.shiftT > 0) T = Math.min(T, 0) * 0.3;                        // taglio di coppia in cambiata
      axleTorque = T * ratio * p.eta * (reverse ? -1 : 1);
      // cambio automatico con isteresi: sale al 94% del limitatore, scala solo quando il motore
      // "arranca" (sotto il 30%, o sotto il 40% se si frena) e mai subito dopo una cambiata
      this.shiftHold = Math.max(0, (this.shiftHold || 0) - dt);
      if (!reverse && this.shiftT <= 0) {
        // giri "veri" dalla velocità dell'auto: le ruote che pattinano non fanno salire di marcia
        const vehRpm = g2 => Math.abs(vz) / p.Rr * p.ratios[g2] * 30 / Math.PI;
        const r = Math.min(this.wheelRpm(this.gear), vehRpm(this.gear));
        if (r > e.redline * 0.94 && this.gear < p.ratios.length - 1 && inp.throttle > 0.1) { this.gear++; this.shiftT = 0.16; this.shiftHold = 1; }
        else if (this.gear > 0 && this.shiftHold <= 0 && vehRpm(this.gear - 1) < e.redline * 0.9 && r < e.redline * (inp.brake > 0.1 ? 0.4 : 0.3)) { this.gear--; this.shiftT = 0.1; this.shiftHold = 0.6; }
      }
    }
    // --- ruote: sterzo, slittamenti, forze, rotazione (implicita) ---
    const steer = inp.steer, assists = this.assists && inp.assists !== false;
    let Flong = 0, Flat = 0, Mz = 0, kmax = 0;
    const driven = W.filter(w => w.driven), axleShare = p.drive === 'A' ? 0.5 : 1;
    // medie per asse calcolate PRIMA di aggiornare le ruote (niente asimmetrie numeriche)
    const axleAvg = [true, false].map(axle => { const ws = driven.filter(w => w.front === axle); return ws.length ? ws.reduce((s, w) => s + w.omega, 0) / ws.length : 0; });
    const avgOm = axle => axleAvg[axle ? 0 : 1];
    for (const w of W) {
      const d = w.front ? steer : 0, cs = Math.cos(d), sn = Math.sin(d);
      const pz = vz - w0 * w.l, px = vx + w0 * w.d;
      const vl = pz * cs + px * sn, vt = -pz * sn + px * cs;
      const alpha = Math.atan2(vt, Math.max(Math.abs(vl), 2.0));
      w.alpha += (alpha - w.alpha) * Math.min(1, (Math.abs(vl) + 2) * dt / 0.3);   // lunghezza di rilassamento
      const mu = (w.front ? p.muF : p.muR) * surf.grip * env.gripMul * clamp(1 - 0.08 * (w.fz / (p.m * 2.45) - 1), 0.72, 1.12);
      const vden = Math.max(Math.abs(vl), 3);
      // coppie applicate: trazione (con autobloccante), freni (ABS), freno a mano
      let Td = 0;
      if (w.driven) Td = axleTorque * axleShare / 2 - p.lsd * (w.omega - avgOm(w.front));
      let Tb = inp.brake * p.brake * (w.front ? p.bias : 1 - p.bias) / 2 * w.R;
      if (assists && w.kappa < -0.16 && Math.abs(vl) > 2) Tb *= 0.3;          // ABS
      if (!w.front && inp.handbrake) Tb += 2600;
      const Trr = p.crr * w.fz * w.R * Math.sign(w.omega);
      let t = tireForces((w.omega * w.R - vl) / vden, w.alpha, w.fz, mu, p.kPeak, p.aPeak);
      const a = dt / p.Iw * t.kx * w.R * w.R / vden;
      let om = w.omega + dt / p.Iw * (Td - Trr - t.fx * w.R) / (1 + a);
      const db = Tb * dt / (p.Iw * (1 + a));
      om = Math.abs(om) <= db ? 0 : om - Math.sign(om) * db;
      w.omega = om; w.kappa = (om * w.R - vl) / vden;
      w.slide = Math.hypot(om * w.R - vl, vt);          // velocità di strisciamento del battistrada [m/s] (fumo)
      t = tireForces(w.kappa, w.alpha, w.fz, mu, p.kPeak, p.aPeak);
      w.fx = t.fx; w.fy = t.fy;
      if (w.driven) kmax = Math.max(kmax, Math.abs(w.kappa));
      const Fl = t.fx * cs - t.fy * sn, Ft = t.fx * sn + t.fy * cs;
      Flong += Fl; Flat += Ft; Mz += w.d * Ft - w.l * Fl;
    }
    // controllo di trazione: riduce la coppia se le motrici pattinano troppo (lascia un po' di sovrasterzo)
    this.tc = assists ? clamp(this.tc + (kmax > p.kPeak * 1.25 ? -dt * 10 : dt * 2.5), 0.15, 1) : 1;
    // controllo di stabilità leggero: interviene solo oltre ~30° di deriva al posteriore
    const rearSlip = (W[2].alpha + W[3].alpha) / 2;
    if (assists && !inp.handbrake && Math.abs(rearSlip) > 0.5 && Math.abs(vz) > 6) Mz -= Math.sign(w0) * p.Iz * 1.2;
    // --- dinamica planare ---
    const slope = env.slope || 0;
    Flong -= p.drag * vz * Math.abs(vz) + (anyContact ? p.m * 9.81 * slope : 0);
    const aL = Flong / p.m, aT = Flat / p.m;
    car.vel.x += (fx * aL + Lx * aT) * dt; car.vel.z += (fz * aL + Lz * aT) * dt;
    car.yawRate += Mz / p.Iz * dt;
    car.heading += car.yawRate * dt;
    car.pos.x += car.vel.x * dt; car.pos.z += car.vel.z * dt;
    this.aLong = aL; this.aLat = aT;
    // --- corpo: sollevamento, beccheggio, rollio ---
    const ay = (heaveF - down) / p.m - 9.81;
    car.verticalSpeed += ay * dt; car.rideY += car.verticalSpeed * dt;
    this.pitchRate += ((pitchM - p.h * Flong) / p.Ip - this.pitchRate * 2) * dt; this.pitch = clamp(this.pitch + this.pitchRate * dt, -0.2, 0.2);
    this.rollRate += ((rollM + p.h * Flat) / p.Ir - this.rollRate * 2) * dt; this.roll = clamp(this.roll + this.rollRate * dt, -0.2, 0.2);
    // sicurezza: mai sotto il terreno (atterraggi violenti, scalini)
    const g0 = env.height(car.pos.x, car.pos.z);
    if (car.rideY < g0 - 0.25) { car.rideY = g0 - 0.25; car.verticalSpeed = Math.max(0, car.verticalSpeed); }
    return {
      contact: anyContact,
      slipF: (W[0].alpha + W[1].alpha) / 2, slipR: rearSlip,
      spin: clamp((kmax - 0.12) / 0.5, 0, 1),
      abs: W.some(w => w.kappa < -0.16) && inp.brake > 0.05,
    };
  }
  get gearNum() { return this.gear + 1; }
}
