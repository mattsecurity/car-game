# Sospensioni sul terreno (Fase 5B) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** far sentire alle sospensioni marciapiedi, dossi, tombini e cordoli, con ruote dotate di massa propria e ruote disegnate che seguono la corsa.

**Architecture:** `vehicle-physics.js` ottiene un grado di libertà verticale per ruota (gomma-molla verso il suolo, sospensione verso la scocca, fine corsa), un contatto a inviluppo del pneumatico con normale inclinata e il contatto del fondo scocca. Un nuovo modulo puro `road-features.js` descrive gli elementi del terreno (profilo dei marciapiedi, dossi, tombini, rattoppi, cordoli costieri) e costruisce le loro mesh. `index.html` usa questi profili nelle funzioni `height()` delle due mappe, abbassa i marciapiedi a 15 cm, orienta l'auto solo in imbardata e muove le ruote disegnate.

**Tech Stack:** JavaScript ES modules, Three.js r160, Vite, Playwright (`@playwright/test`, test Node e browser).

**Spec:** `docs/superpowers/specs/2026-09-26-suspension-terrain-design.md`

## Global Constraints

- `CURB_H = 0.15` m (marciapiedi di Valdora; prima 0.30).
- Massa non sospesa per ruota: 40 kg (20 kg se `cfg.df`, cioè la F1 `fuoco`), sovrascrivibile con `cfg.phys.unsprung`.
- Gomma verticale: `kt` = 250 000 N/m, `ct` = 400 N·s/m (`cfg.phys.tireK`, `cfg.phys.tireC`).
- Corsa oltre la statica: `travel` = 0.09 m (0.03 m con `cfg.df`), tampone `40·k` oltre `s0 + travel`, arresto in estensione `40·k·cs` sotto `cs = 0`.
- Inviluppo: passo `0.9R/6`, 15 campioni longitudinali (13 per la quota + 2 per la pendenza) + 2 laterali a ±0.35·larghezza gomma; volanti (`dyn.fast`) passo `0.9R`, 5 campioni, nessun laterale. |grad| limitato a 3 nelle forze orizzontali.
- Clamp di beccheggio e rollio: ±0.35 rad.
- Nessun nuovo collider. Traffico invariato (altezza al centro dell'auto).
- **Le soglie di tutti i test esistenti restano invariate.** `tests/physics.spec.js` deve passare senza modifiche.
- Il progetto **non è un repository git**: al posto dei commit, ogni task termina con la suite indicata verde.
- La porta 5175 può essere occupata da server di altre sessioni: i comandi usano `PW_PORT=5191` (Task 1 rende la porta configurabile).
- Commenti nel codice in italiano, stile del file circostante.

---

## File Structure

| File | Responsabilità |
|---|---|
| `road-features.js` (nuovo) | `CURB_H`, profili puri (`cityCurbHeight`, `kerbHeight`, `kerbTooth`), fabbriche `speedBump`/`manhole`/`patch`, griglia `RoadFeatures` (`add`, `heightAt`, `count`, `buildMeshes`). |
| `vehicle-physics.js` | `probeContact` (inviluppo), ruote con massa, sospensione con fine corsa, normale di contatto inclinata, fondo scocca, uscite `hubY/hubRest/gc/travel/contact/hit`, `hitPeak`, `scrape`, `scrapeCount`, `fast`. |
| `index.html` | Mappe (marciapiedi 15 cm, elementi, cordoli costieri, banchina), `Car.update`/`Car.syncMesh` (assetto, ruote, piano a terra), effetti (scintille, scossone, vibrazione, segni). |
| `pedestrians.js` | Pedoni alla quota `CURB_H`. |
| `enhancements.js` | Ombra di contatto agganciata a `car.ground`. |
| `playwright.config.js` | Porta configurabile con `PW_PORT`. |
| `tests/road-features.spec.js` (nuovo, Node) | Profili e griglia. |
| `tests/suspension.spec.js` (nuovo, Node) | Inviluppo e dinamica verticale. |
| `tests/terrain.spec.js` (nuovo, browser) | Mappe, integrazione auto, effetti. |

---

### Task 1: Modulo `road-features.js` (profili e griglia) + porta dei test configurabile

**Files:**
- Create: `road-features.js`
- Modify: `playwright.config.js`
- Test: `tests/road-features.spec.js`

**Interfaces:**
- Produces: `CURB_H: number`, `smoothstep(e0,e1,x)`, `cityCurbHeight(x, z, {pitch=96, half=35, n=5, r=1.5, h=CURB_H}={}) → number`, `KERB_PITCH = 0.25`, `KERB_RISE = 0.8`, `kerbTooth(s) → [0,1]`, `kerbHeight(u, s) → number`, `speedBump(x, z, axis:'x'|'z', {halfSpan=9.8, len=0.9, h=0.07}={}) → Feature`, `manhole(x, z, {r=0.35, depth=0.015, rim=0.03}={}) → Feature`, `patch(x, z, w, d, dh, {edge=0.05}={}) → Feature`, `class RoadFeatures { constructor(cell=8); add(f) → f; heightAt(x,z) → number; count(kind) → number; list: Feature[]; buildMeshes(group) → Mesh[] }`. Feature = `{ kind, minx, maxx, minz, maxz, height(x,z), ...parametri }`.

- [ ] **Step 1: Rendi configurabile la porta dei test**

Sostituisci l'intero `playwright.config.js` con:

```js
import {defineConfig} from '@playwright/test';
// PW_PORT: porta alternativa quando la 5175 è occupata da un altro server
const port=Number(process.env.PW_PORT)||5175;
export default defineConfig({testDir:'./tests',timeout:90000,workers:1,use:{baseURL:`http://localhost:${port}`,viewport:{width:1440,height:900},headless:true,launchOptions:{args:['--use-angle=metal']}},webServer:{command:`npm run dev -- --port ${port} --strictPort`,url:`http://localhost:${port}`,reuseExistingServer:true},reporter:'list'});
```

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `tests/road-features.spec.js`:

```js
import {test,expect} from '@playwright/test';
import {CURB_H,cityCurbHeight,kerbHeight,kerbTooth,speedBump,manhole,patch,RoadFeatures} from '../road-features.js';

test('city curb: road 0, sidewalk CURB_H, steep face, rounded corners',()=>{
  expect(CURB_H).toBe(0.15);
  expect(cityCurbHeight(48,48)).toBe(0);                 // incrocio
  expect(cityCurbHeight(0,0)).toBeCloseTo(0.15,6);       // centro isolato
  expect(cityCurbHeight(34.9,0)).toBeCloseTo(0.15,3);    // appena dentro il bordo
  expect(cityCurbHeight(35.02,0)).toBe(0);               // appena fuori
  let prev=cityCurbHeight(34.9,0),maxSlope=0;
  for(let x=34.901;x<=35.05;x+=0.001){const h=cityCurbHeight(x,0);maxSlope=Math.max(maxSlope,Math.abs(h-prev)/0.001);prev=h;}
  expect(maxSlope).toBeGreaterThan(3);expect(maxSlope).toBeLessThan(8);   // faccia quasi verticale, non un gradino
  expect(cityCurbHeight(34.8,34.8)).toBe(0);             // angolo arrotondato (r 1.5 m)
  expect(cityCurbHeight(33,33)).toBeCloseTo(0.15,3);
  expect(cityCurbHeight(600,0)).toBe(0);                 // fuori città
});

test('coast kerb: 4 cm ramp outward with 1 cm saw teeth every 25 cm',()=>{
  expect(kerbHeight(0,1.23)).toBe(0);
  expect(kerbHeight(1,0)).toBeCloseTo(0.04,6);
  expect(kerbHeight(1,0.2)).toBeCloseTo(0.05,6);          // cima del dente
  expect(kerbHeight(1,0.25)).toBeCloseTo(kerbHeight(1,0),6);
  expect(kerbHeight(0.5,0.2)).toBeCloseTo(0.025,6);
  expect(kerbTooth(-0.05)).toBeCloseTo(kerbTooth(0.2),6); // periodico anche per s negativo
  for(let s=0;s<1;s+=0.01)expect(kerbHeight(1,s)).toBeGreaterThanOrEqual(0.04-1e-9);
});

test('bumps, manholes and patches add up through the 8 m grid',()=>{
  const f=new RoadFeatures();
  f.add(speedBump(10,0,'x'));f.add(manhole(20,3));f.add(patch(30,-2,2,1,0.01));
  expect(f.heightAt(10,0)).toBeCloseTo(0.07,6);           // cresta
  expect(f.heightAt(10.45,0)).toBe(0);
  expect(f.heightAt(10,9)).toBeCloseTo(0.07,6);           // su tutte le corsie
  expect(f.heightAt(10,10.5)).toBe(0);                    // non sulla fascia dei parcheggi
  expect(f.heightAt(20,3)).toBeCloseTo(-0.015,6);
  expect(f.heightAt(20.36,3)).toBe(0);
  expect(f.heightAt(30,-2)).toBeCloseTo(0.01,6);
  expect(f.heightAt(-50,-50)).toBe(0);
  const g=new RoadFeatures();g.add(speedBump(0,5,'z'));
  expect(g.heightAt(3,5)).toBeCloseTo(0.07,6);expect(g.heightAt(0,5.5)).toBe(0);
  expect(f.count('bump')).toBe(1);expect(f.count('manhole')).toBe(1);expect(f.count('patch')).toBe(1);
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `PW_PORT=5191 npx playwright test tests/road-features.spec.js`
Expected: FAIL, "Cannot find module '../road-features.js'" (o simile).

- [ ] **Step 4: Implementa `road-features.js`**

```js
// Elementi puntuali del terreno sentiti dalle sospensioni: marciapiedi (formula diretta sulla
// griglia regolare degli isolati), dossi, tombini, rattoppi (griglia hash a celle di 8 m) e il
// profilo dei cordoli a dente di sega della Riviera. Le quote sono funzioni pure (provabili in
// Node); buildMeshes() crea la grafica e va chiamato solo nel browser (usa canvas).
import * as THREE from 'three';

export const CURB_H = 0.15;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Marciapiede dell'isolato più vicino: rettangolo 2·half con angoli di raggio r. La quota sale
// in 4.5 cm dal bordo (pendenza massima ≈ 5: faccia quasi verticale con spigoli smussati).
export function cityCurbHeight(x, z, { pitch = 96, half = 35, n = 5, r = 1.5, h = CURB_H } = {}) {
  const i = Math.round(x / pitch), j = Math.round(z / pitch);
  if (Math.abs(i) > n || Math.abs(j) > n) return 0;
  const qx = Math.abs(x - i * pitch) - (half - r), qz = Math.abs(z - j * pitch) - (half - r);
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
  return h * smoothstep(-0.01, 0.035, -sd);
}

// Cordolo costiero: u = 0 bordo interno (lato strada) … 1 bordo esterno; s = ascissa lungo la
// strada [m]. Rampa di 4 cm verso l'esterno + denti di 1 cm (salita 20 cm, discesa 5 cm).
export const KERB_PITCH = 0.25, KERB_RISE = 0.8;
export function kerbTooth(s) { const p = ((s / KERB_PITCH) % 1 + 1) % 1; return p < KERB_RISE ? p / KERB_RISE : (1 - p) / (1 - KERB_RISE); }
export function kerbHeight(u, s) { const uu = clamp(u, 0, 1); return uu * (0.04 + 0.01 * kerbTooth(s)); }

// Dosso rallentatore: profilo a coseno lungo `axis` (direzione di marcia), largo 2·halfSpan
// (solo le corsie: la fascia dei parcheggi a ±11.6 m resta libera).
export function speedBump(x, z, axis, { halfSpan = 9.8, len = 0.9, h = 0.07 } = {}) {
  const hl = len / 2, along = axis === 'x';
  return { kind: 'bump', x, z, axis, len, h, halfSpan,
    minx: along ? x - hl : x - halfSpan, maxx: along ? x + hl : x + halfSpan,
    minz: along ? z - halfSpan : z - hl, maxz: along ? z + halfSpan : z + hl,
    height: (px, pz) => { const t = along ? px - x : pz - z; return Math.abs(t) >= hl ? 0 : h * 0.5 * (1 + Math.cos(Math.PI * t / hl)); } };
}
// Tombino in ghisa: 1.5 cm sotto l'asfalto, bordo raccordato in 3 cm
export function manhole(x, z, { r = 0.35, depth = 0.015, rim = 0.03 } = {}) {
  return { kind: 'manhole', x, z, r, minx: x - r, maxx: x + r, minz: z - r, maxz: z + r,
    height: (px, pz) => { const d = Math.hypot(px - x, pz - z); return d >= r ? 0 : -depth * smoothstep(r, r - rim, d); } };
}
// Rattoppo (o giardino rialzato): rettangolo w×d alzato/abbassato di dh, bordo raccordato in `edge`
export function patch(x, z, w, d, dh, { edge = 0.05 } = {}) {
  return { kind: 'patch', x, z, w, d, dh, minx: x - w / 2, maxx: x + w / 2, minz: z - d / 2, maxz: z + d / 2,
    height: (px, pz) => { const e = Math.min(w / 2 - Math.abs(px - x), d / 2 - Math.abs(pz - z)); return e <= 0 ? 0 : dh * smoothstep(0, edge, e); } };
}

export class RoadFeatures {
  constructor(cell = 8) { this.cell = cell; this.grid = new Map(); this.list = []; }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }      // collisioni innocue: c'è il controllo del riquadro
  add(f) {
    this.list.push(f);
    const c = this.cell;
    for (let ix = Math.floor(f.minx / c); ix <= Math.floor(f.maxx / c); ix++)
      for (let iz = Math.floor(f.minz / c); iz <= Math.floor(f.maxz / c); iz++) {
        const k = this.key(ix, iz); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(f);
      }
    return f;
  }
  heightAt(x, z) {
    const a = this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!a) return 0;
    let h = 0;
    for (const f of a) if (x > f.minx && x < f.maxx && z > f.minz && z < f.maxz) h += f.height(x, z);
    return h;
  }
  count(kind) { let n = 0; for (const f of this.list) if (f.kind === kind) n++; return n; }

  // Grafica: una InstancedMesh per tipo (dossi a strisce gialle/nere, tombini, rattoppi).
  buildMeshes(group) {
    const out = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    const make = (kind, geo, mat, place) => {
      const list = this.list.filter(f => f.kind === kind); if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((f, i) => { place(f); im.setMatrixAt(i, M.compose(P, Q, S)); });
      im.receiveShadow = true; im.name = kind === 'bump' ? 'speedBumps' : kind === 'manhole' ? 'manholes' : 'roadPatches';
      group.add(im); out.push(im);
    };
    // dosso: profilo a coseno unitario lungo x (scalato in altezza per istanza), campata lungo z
    const bumpGeo = new THREE.PlaneGeometry(1, 1, 8, 1); bumpGeo.rotateX(-Math.PI / 2);
    { const p = bumpGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.5 * (1 + Math.cos(Math.PI * p.getX(i) * 2))); bumpGeo.computeVertexNormals(); }
    const stripes = canvasTex(64, 8, (g, w, h) => { for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#15161a' : '#e8b822'; g.fillRect(k * w / 4, 0, w / 4, h); } });
    stripes.repeat.set(1, 5);
    { const uv = bumpGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); }   // strisce lungo la campata
    make('bump', bumpGeo, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }), f => {
      P.set(f.x, 0.004, f.z); Q.setFromAxisAngle(Y, f.axis === 'x' ? 0 : Math.PI / 2); S.set(f.len, f.h, f.halfSpan * 2); });
    // tombino: disco in ghisa con griglia a rombi
    const iron = canvasTex(128, 128, (g, w) => { g.fillStyle = '#2b2d30'; g.fillRect(0, 0, w, w); g.strokeStyle = '#4a4d52'; g.lineWidth = 3;
      for (let k = -w; k < w * 2; k += 14) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + w, w); g.stroke(); g.beginPath(); g.moveTo(k, w); g.lineTo(k + w, 0); g.stroke(); }
      g.strokeStyle = '#1a1b1d'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2); g.stroke(); });
    const discGeo = new THREE.CircleGeometry(1, 24); discGeo.rotateX(-Math.PI / 2);
    make('manhole', discGeo, new THREE.MeshStandardMaterial({ map: iron, roughness: 0.55, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), f => {
      P.set(f.x, 0.006, f.z); Q.identity(); S.set(f.r, 1, f.r); });
    // rattoppo: asfalto più scuro e fresco
    const quadGeo = new THREE.PlaneGeometry(1, 1); quadGeo.rotateX(-Math.PI / 2);
    make('patch', quadGeo, new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -1 }), f => {
      P.set(f.x, 0.005, f.z); Q.identity(); S.set(f.w, 1, f.d); });
    return out;
  }
}
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `PW_PORT=5191 npx playwright test tests/road-features.spec.js`
Expected: `3 passed`.

- [ ] **Step 6: Checkpoint** — nessun commit (non è un repo git). Suite del task verde.

---

### Task 2: Inviluppo del pneumatico `probeContact`

**Files:**
- Modify: `vehicle-physics.js` (nuova funzione esportata dopo `tireForces`)
- Test: `tests/suspension.spec.js` (nuovo)

**Interfaces:**
- Produces: `probeContact(height:(x,z)=>number, x, z, fx, fz, R, halfW, n=6) → { h, gradF, gradL }`. `(fx,fz)` = direzione di rotolamento (versore); laterale `L = (fz, −fx)`. `h` = quota del fondo della gomma indeformata; `gradF`, `gradL` = pendenze del contatto lungo f e L. `halfW = 0` disattiva i campioni laterali (`gradL = 0`). `n` = campioni per semi-raggio (6 giocatore, 1 volanti).

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `tests/suspension.spec.js`:

```js
import {test,expect} from '@playwright/test';
import {VehicleDynamics,probeContact} from '../vehicle-physics.js';
import {VEHICLES} from '../vehicles.js';
import {kerbHeight} from '../road-features.js';

const DT=1/240, cfg=id=>VEHICLES.find(v=>v.id===id);
const env=height=>({height,surface:()=>({grip:1,roll:1}),gripMul:1});
const car0=()=>({pos:{x:0,z:0},vel:{x:0,z:0},heading:0,yawRate:0,rideY:0,verticalSpeed:0});
const speed=c=>Math.hypot(c.vel.x,c.vel.z);
function settle(d,c,e){for(let i=0;i<480;i++)d.step(c,DT,{throttle:0,brake:0,steer:0},e);}

test('tyre envelope: flat, uniform slope and a curb seen before the hub reaches it',()=>{
  const R=0.34;
  let c=probeContact(()=>0,0,0,0,1,R,0.1);expect(c.h).toBe(0);expect(c.gradF).toBe(0);expect(c.gradL).toBe(0);
  c=probeContact((x,z)=>0.1*z,0,0,0,1,R,0.1);
  expect(c.gradF).toBeCloseTo(0.1,9);expect(c.h).toBeGreaterThanOrEqual(0);expect(c.h).toBeLessThan(0.002);
  expect(probeContact((x,z)=>0.05*x,0,0,0,1,R,0.1).gradL).toBeCloseTo(0.05,9);
  const curb=(x,z)=>z>0.2?0.15:0;
  c=probeContact(curb,0,0,0,1,R,0.1);
  expect(c.h).toBeGreaterThan(0.04);expect(c.h).toBeLessThan(0.12);expect(c.gradF).toBeGreaterThan(0.3);
  expect(probeContact(curb,0,-0.2,0,1,R,0.1).h).toBe(0);            // cordolo a 0.4 m: fuori dal cerchio
  expect(probeContact(curb,0,0.5,0,1,R,0.1).h).toBeCloseTo(0.15,9);  // sopra
  const fast=probeContact(curb,0,0,0,1,R,0,1);expect(Number.isFinite(fast.h)).toBe(true);expect(fast.gradL).toBe(0);
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/suspension.spec.js`
Expected: FAIL, `probeContact` non esportato.

- [ ] **Step 3: Implementa `probeContact`** in `vehicle-physics.js`, subito dopo `tireForces`:

```js
// Inviluppo del pneumatico: il cerchio di raggio R appoggiato sul profilo del terreno lungo la
// direzione di rotolamento (fx,fz), più due punti laterali. h = quota del fondo della gomma
// indeformata; gradF/gradL = pendenza del contatto lungo f e lungo L (la normale inclinata spinge
// indietro chi sale su un cordolo). Le pendenze vengono dall'inviluppo spostato di ±un passo,
// ricavato dagli stessi campioni: esatte sulle pendenze uniformi.
const probeBuf = new Float64Array(64);
export function probeContact(height, x, z, fx, fz, R, halfW, n = 6) {
  const step = 0.9 * R / n, lim = 0.9 * R + 1e-9, N = n + 1;
  for (let k = -N; k <= N; k++) probeBuf[k + N] = height(x + fx * k * step, z + fz * k * step);
  const env = shift => {
    let best = -Infinity;
    for (let k = -N; k <= N; k++) {
      const s = k * step - shift;
      if (Math.abs(s) > lim) continue;
      const v = probeBuf[k + N] - (R - Math.sqrt(R * R - s * s));
      if (v > best) best = v;
    }
    return best;
  };
  const h0 = env(0), gradF = (env(step) - env(-step)) / (2 * step);
  if (!(halfW > 0)) return { h: h0, gradF, gradL: 0 };
  const Lx = fz, Lz = -fx, a = height(x + Lx * halfW, z + Lz * halfW), b = height(x - Lx * halfW, z - Lz * halfW);
  return { h: Math.max(h0, a, b), gradF, gradL: (a - b) / (2 * halfW) };
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `PW_PORT=5191 npx playwright test tests/suspension.spec.js tests/physics.spec.js`
Expected: `7 passed` (1 nuovo + 6 esistenti).

- [ ] **Step 5: Checkpoint** — suite del task verde.

---

### Task 3: Ruote con massa propria, sospensione con fine corsa, normale di contatto

**Files:**
- Modify: `vehicle-physics.js` (`physParams`, costruttore/`reset` di `VehicleDynamics`, blocco sospensioni di `step`, ciclo ruote, dinamica planare, corpo)
- Test: `tests/suspension.spec.js` (aggiunte), `tests/physics.spec.js` (invariato, regressione)

**Interfaces:**
- Consumes: `probeContact` (Task 2).
- Produces (su ogni `dyn.wheels[i]`): `hubY` (quota mondo del mozzo, `NaN` prima dell'inizializzazione), `hubV`, `hubRest` (= `R − dt0`: altezza del mozzo sopra `rideY` a riposo), `gc` (quota di contatto), `gradF`, `gradL`, `cs`, `travel` (= `cs − s0`), `contact` (bool), `hit` (picco di forza gomma / carico statico d'angolo), `fz` (carico gomma, entra in Pacejka), `wx`, `wz` (posizione mondo della ruota). Su `dyn`: `hitPeak` (max di `hit` dall'ultimo azzeramento, lo azzera chi lo legge), `fast` (bool), `p.mu`, `p.ms`, `p.kt`, `p.track`. `env.reprobe` (opzionale, default `true`). `env.slope` non è più letto.

- [ ] **Step 1: Aggiungi i test che falliscono** in fondo a `tests/suspension.spec.js`:

```js
test('at rest every tyre carries its corner weight and the wheel hops at 9-18 Hz',()=>{
  for(const v of VEHICLES){
    const d=new VehicleDynamics(v),c=car0(),e=env(()=>0);settle(d,c,e);
    const g=9.81,L=v.wheelBase,front=v.mass*g*v.bDist/L/2,rear=v.mass*g*v.aDist/L/2;
    d.wheels.forEach((w,i)=>{const r=w.fz/(i<2?front:rear);expect(r,v.id).toBeGreaterThan(0.98);expect(r,v.id).toBeLessThan(1.02);});
    expect(Math.abs(c.rideY),v.id).toBeLessThan(0.01);
    // colpo verticale a una ruota posteriore: mezzo periodo dai primi due passaggi per l'equilibrio
    const w=d.wheels[2],eq=w.hubY;w.hubV=0.5;const cross=[];let prev=0;
    for(let i=0;i<240;i++){d.step(c,DT,{throttle:0,brake:0,steer:0},e);const x=w.hubY-eq;if(prev!==0&&Math.sign(x)!==Math.sign(prev))cross.push(i*DT);prev=x;}
    expect(cross.length,v.id).toBeGreaterThanOrEqual(2);
    const f=1/(2*(cross[1]-cross[0]));expect(f,v.id).toBeGreaterThan(9);expect(f,v.id).toBeLessThan(18);
  }
});

test('climbing a 15 cm sidewalk at 20 km/h lifts all four wheels and costs speed',()=>{
  const curb=(x,z)=>z>4?0.15:0;
  for(const id of ['falcone','brutus','volt']){
    const v=cfg(id);
    const run=h=>{const d=new VehicleDynamics(v),c=car0(),e=env(h);settle(d,c,e);c.vel.z=5.56;d.synced=false;let peak=0;
      for(let i=0;i<240*3;i++){d.step(c,DT,{throttle:0.25,brake:0,steer:0},e);peak=Math.max(peak,...d.wheels.map(w=>w.fz));}
      return {d,c,peak};};
    const flat=run(()=>0),up=run(curb);
    expect(up.d.wheels.every(w=>w.gc>0.149),id).toBe(true);
    expect(up.c.rideY,id).toBeGreaterThan(0.13);expect(up.c.rideY,id).toBeLessThan(0.17);
    expect([up.c.rideY,up.d.pitch,up.d.roll,...up.d.wheels.map(w=>w.hubY)].every(Number.isFinite),id).toBe(true);
    expect(up.peak/(v.mass*9.81/4),id).toBeLessThan(12);
    expect(up.c.pos.z,id).toBeLessThan(flat.c.pos.z);             // il cordolo costa velocità
  }
});

test('a 7 cm speed bump: tyres stay planted at 30 km/h, wheels leave the ground at 80 km/h',()=>{
  const v=cfg('falcone'),bump=(x,z)=>Math.abs(z-15)<0.45?0.07*0.5*(1+Math.cos(Math.PI*(z-15)/0.45)):0;
  const run=kmh=>{const d=new VehicleDynamics(v),c=car0(),e=env(bump);settle(d,c,e);c.vel.z=kmh/3.6;d.synced=false;
    let minFz=Infinity,air=0,maxAir=0;
    for(let i=0;i<240*2.5;i++){d.step(c,DT,{throttle:Math.max(0,Math.min(1,(kmh/3.6-speed(c))*0.8)),brake:0,steer:0},e);
      if(c.pos.z>10&&c.pos.z<25){minFz=Math.min(minFz,...d.wheels.map(w=>w.fz));air=d.wheels.some(w=>!w.contact)?air+DT:0;maxAir=Math.max(maxAir,air);}}
    return {minFz,maxAir,rideY:c.rideY,scrapes:d.scrapeCount,finite:[c.rideY,d.pitch,...d.wheels.map(w=>w.hubY)].every(Number.isFinite)};};
  const slow=run(30),fast=run(80);
  expect(slow.minFz).toBeGreaterThan(0);expect(slow.scrapes).toBe(0);
  expect(fast.maxAir).toBeGreaterThan(0.03);expect(fast.finite).toBe(true);expect(Math.abs(fast.rideY)).toBeLessThan(0.03);
});

test('saw-tooth kerb makes the tyre load oscillate and costs lateral grip',()=>{
  const v=cfg('falcone');
  {const d=new VehicleDynamics(v),c=car0(),e=env((x,z)=>kerbHeight(1,z));settle(d,c,e);c.vel.z=16.7;d.synced=false;let lo=Infinity,hi=0;
    for(let i=0;i<240;i++){d.step(c,DT,{throttle:0.3,brake:0,steer:0},e);if(i>60){lo=Math.min(lo,d.wheels[0].fz);hi=Math.max(hi,d.wheels[0].fz);}}
    expect((hi-lo)/(v.mass*9.81*v.bDist/v.wheelBase/2)).toBeGreaterThan(0.25);}
  // curva al limite (sottosterzo stabile): accelerazione laterale media dell'ultimo secondo
  const corner=h=>{const d=new VehicleDynamics(v),c=car0(),e=env(h);settle(d,c,e);c.vel.z=22;d.synced=false;let sum=0,n=0;
    for(let i=0;i<240*7;i++){const s=speed(c);d.step(c,DT,{throttle:Math.max(0,Math.min(1,(22-s)*0.5)),brake:0,steer:Math.min(0.12,i/(240*3)*0.12)},e);
      if(i>=240*6){sum+=Math.abs(d.aLat);n++;}}return sum/n;};
  expect(corner((x,z)=>kerbHeight(1,x)+kerbHeight(1,z))).toBeLessThan(corner(()=>0));
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/suspension.spec.js`
Expected: FAIL sui nuovi test (es. `fz` delle ruote da rivedere, `w.contact`/`scrapeCount` undefined).

- [ ] **Step 3: `physParams`** — sostituisci le righe da `const freq = p.freq || 1.7, zeta = p.zeta || 0.45;` fino alla chiusura del `return { ... }` con:

```js
  const freq = p.freq || 1.7, zeta = p.zeta || 0.45;
  // masse d'angolo: la ruota (massa non sospesa) ha il suo grado di libertà verticale
  const unsprung = p.unsprung ?? (cfg.df ? 20 : 40);
  const cornerF = m * cfg.bDist / L / 2, cornerR = m * cfg.aDist / L / 2;
  const msF = cornerF - unsprung, msR = cornerR - unsprung;
  const kF = msF * (2 * Math.PI * freq) ** 2, kR = msR * (2 * Math.PI * freq * 1.08) ** 2;
  const kt = p.tireK ?? 250000;
  return {
    m, L, a: cfg.aDist, b: cfg.bDist, h: cfg.cgH, ev, engine, ratios,
    Iz: m * L * L * 0.24, Ip: m * (0.33 * (b.l || 4.4)) ** 2, Ir: m * (0.3 * (b.w || 1.9)) ** 2,
    track: b.track || (b.w - 0.2), Rf, Rr, Iw: p.wheelInertia || 1.1,
    muF: cfg.muF, muR: cfg.muR, kPeak: p.kPeak || 0.11, aPeak: p.aPeak || (cfg.df ? 0.105 : 0.13),
    mu: unsprung, ms: m - 4 * unsprung, kt, ct: p.tireC ?? 400,
    kF, kR, cF: 2 * zeta * Math.sqrt(kF * msF), cR: 2 * zeta * Math.sqrt(kR * msR),
    arbF: p.arbF ?? kF * 0.9, arbR: p.arbR ?? kR * 0.55,
    s0F: msF * 9.81 / kF, s0R: msR * 9.81 / kR,                 // schiacciamento statico delle molle (come prima)
    dtF: cornerF * 9.81 / kt, dtR: cornerR * 9.81 / kt,         // schiacciamento statico delle gomme
    loadF: cornerF * 9.81, loadR: cornerR * 9.81,
    travel: p.travel ?? (cfg.df ? 0.03 : 0.09),
    halfWF: 0.35 * (b.wheelW || 0.28), halfWR: 0.35 * (b.wheelWR || b.wheelW || 0.28),
    clearance: b.clearance ?? 0.2, bodyW: b.w || 1.9, bodyL: b.l || 4.4,
    // freni capaci di arrivare al limite d'aderenza
    brake: Math.max(cfg.brakeForce, m * 9.81 * 1.45), bias: p.brakeBias || 0.64, drive: cfg.drive, lsd: p.lsd ?? 60,
    evForce: cfg.engineForce, evPower: p.power || cfg.power || 150000,
    drag: cfg.drag, df: cfg.df || 0, crr: 0.013, eta: 0.9, topSpeed: cfg.topSpeed,
  };
```

- [ ] **Step 4: Costruttore e `reset`** — sostituisci il `.map(w => ({ ...w, R: ... }))` delle ruote e `reset()` con:

```js
    ].map(w => {
      const f = w.front;
      return { ...w, R: f ? p.Rf : p.Rr, driven: p.drive === 'A' || (p.drive === 'F') === f,
        omega: 0, fz: 0, kappa: 0, alpha: 0, fx: 0, fy: 0, slide: 0,
        k: f ? p.kF : p.kR, c: f ? p.cF : p.cR, s0: f ? p.s0F : p.s0R, dt0: f ? p.dtF : p.dtR, load: f ? p.loadF : p.loadR,
        halfW: f ? p.halfWF : p.halfWR, hubRest: (f ? p.Rf : p.Rr) - (f ? p.dtF : p.dtR),
        hubY: NaN, hubV: 0, gc: 0, gcPrev: 0, gradF: 0, gradL: 0, cs: 0, travel: 0, contact: false, hit: 0, wx: 0, wz: 0 };
    });
    this.assists = true; this.fast = false;
    this.reset();
  }
  reset() {
    for (const w of this.wheels) { w.omega = 0; w.alpha = 0; w.kappa = 0; w.slide = 0; w.hubY = NaN; w.hubV = 0; w.hit = 0; w.contact = false; }
    this.pitch = 0; this.pitchRate = 0; this.roll = 0; this.rollRate = 0;
    this.gear = 0; this.shiftT = 0; this.rpm = this.p.engine ? this.p.engine.idle : 0; this.synced = false; this.tc = 1;
    this.aLong = 0; this.aLat = 0; this.hitPeak = 0; this.scrape = null; this.scrapeCount = 0;
  }
```

(Rimuovi `this.assists = true; this.reset();` duplicati del vecchio costruttore: devono restare una sola volta come sopra.)

- [ ] **Step 5: Blocco sospensioni di `step`** — sostituisci tutto da `// --- sospensioni: carichi verticali ---` fino alla fine del ciclo `for (const w of W) { w.fz = ...; heaveF += ...; }` con:

```js
    // --- ruote con massa propria: contatto (inviluppo della gomma), gomma verticale, sospensione ---
    const surf = env.surface(car.pos.x, car.pos.z), v2 = vz * vz;
    const down = p.df * v2;                                   // deportanza: agisce sulla scocca
    const reprobe = env.reprobe !== false, nProbe = this.fast ? 1 : 6;
    let heaveF = 0, pitchM = down * (0.42 * p.a - 0.58 * p.b), rollM = 0, anyContact = false;
    for (const w of W) {
      const gx = car.pos.x + fx * w.d + Lx * w.l, gz = car.pos.z + fz * w.d + Lz * w.l;
      w.wx = gx; w.wz = gz; w.gcPrev = w.gc;
      if (reprobe || !Number.isFinite(w.hubY)) {
        const c = probeContact(env.height, gx, gz, fx, fz, w.R, this.fast ? 0 : w.halfW, nProbe);
        w.gc = c.h; w.gradF = c.gradF; w.gradL = c.gradL;
      } else w.gc += (w.gradF * vz + w.gradL * vx) * dt;      // secondo sotto-passo: stessa superficie, estrapolata
      if (!Number.isFinite(w.hubY)) { w.hubY = w.gc + w.hubRest; w.hubV = 0; w.gcPrev = w.gc; }
    }
    // integrazione delle ruote in 4 sotto-passi (gomma e tamponi sono rigidi); la scocca vede le forze medie
    const NW = 4, hW = dt / NW;
    const yc = W.map(w => car.rideY - w.d * this.pitch + w.l * this.roll);
    const ycV = W.map(w => car.verticalSpeed - w.d * this.pitchRate + w.l * this.rollRate);
    const FsAvg = [0, 0, 0, 0], FtAvg = [0, 0, 0, 0], FtPk = [0, 0, 0, 0], Fs = [0, 0, 0, 0], Fg = [0, 0, 0, 0];
    for (let sub = 0; sub < NW; sub++) {
      for (let i = 0; i < 4; i++) {
        const w = W[i], pen = w.gc - (w.hubY - w.R);
        Fg[i] = pen > 0 ? Math.max(0, p.kt * pen + p.ct * ((w.gc - w.gcPrev) / dt - w.hubV)) : 0;
        const cs = (w.hubY - w.R) - yc[i] + w.s0 + w.dt0;
        let F = (cs > 0 ? w.k * cs : 40 * w.k * cs) + w.c * (w.hubV - ycV[i]);   // molla (arresto in estensione) + ammortizzatore
        if (cs > w.s0 + p.travel) F += 40 * w.k * (cs - w.s0 - p.travel);          // tampone di fine corsa
        Fs[i] = F; w.cs = cs;
      }
      for (const [iL, iR, arb] of [[0, 1, p.arbF], [2, 3, p.arbR]]) { const f = arb * (W[iL].cs - W[iR].cs); Fs[iL] += f; Fs[iR] -= f; }
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        w.hubV += ((Fg[i] - Fs[i]) / p.mu - 9.81) * hW; w.hubY += w.hubV * hW;
        FsAvg[i] += Fs[i] / NW; FtAvg[i] += Fg[i] / NW; FtPk[i] = Math.max(FtPk[i], Fg[i]);
      }
    }
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      w.fz = FtAvg[i]; w.contact = FtAvg[i] > 0; w.travel = w.cs - w.s0; w.hit = FtPk[i] / w.load;
      if (w.contact) anyContact = true;
      this.hitPeak = Math.max(this.hitPeak, w.hit);
      heaveF += FsAvg[i]; pitchM -= FsAvg[i] * w.d; rollM += FsAvg[i] * w.l;
    }
```

- [ ] **Step 6: Normale di contatto nel ciclo ruote** — nel ciclo `for (const w of W)` delle forze pneumatico, subito dopo la riga `Flong += Fl; Flat += Ft; Mz += w.d * Ft - w.l * Fl;` aggiungi:

```js
      // normale di contatto inclinata (cordoli, dossi, pendenze): spinge indietro chi sale, avanti chi scende
      const nF = -w.fz * clamp(w.gradF, -3, 3), nL = -w.fz * clamp(w.gradL, -3, 3);
      Flong += nF; Flat += nL; Mz += w.d * nL - w.l * nF;
```

- [ ] **Step 7: Dinamica planare e corpo** — sostituisci:

```js
    const slope = env.slope || 0;
    Flong -= p.drag * vz * Math.abs(vz) + (anyContact ? p.m * 9.81 * slope : 0);
```

con:

```js
    Flong -= p.drag * vz * Math.abs(vz);                       // la gravità sulle pendenze arriva dalle normali di contatto
```

e sostituisci le 4 righe del corpo (`const ay = (heaveF - down) / p.m - 9.81;` … `this.roll = clamp(...)`) con:

```js
    const ay = (heaveF - down) / p.ms - 9.81;
    car.verticalSpeed += ay * dt; car.rideY += car.verticalSpeed * dt;
    this.pitchRate += ((pitchM - p.h * Flong) / p.Ip - this.pitchRate * 2) * dt;
    this.rollRate += ((rollM + p.h * Flat) / p.Ir - this.rollRate * 2) * dt;
    const pitch = this.pitch + this.pitchRate * dt, roll = this.roll + this.rollRate * dt;
    this.pitch = clamp(pitch, -0.35, 0.35); this.roll = clamp(roll, -0.35, 0.35);
    if (this.pitch !== pitch) this.pitchRate = 0;              // fermo a fine escursione, niente accumulo
    if (this.roll !== roll) this.rollRate = 0;
```

La riga di sicurezza `if (car.rideY < g0 - 0.25) …` resta com'è.

- [ ] **Step 8: Esegui i test di dinamica**

Run: `PW_PORT=5191 npx playwright test tests/suspension.spec.js tests/physics.spec.js`
Expected: `11 passed` (5 in `suspension.spec.js`: inviluppo + 4 nuovi; 6 in `physics.spec.js`). `scrapeCount` esiste già (vale 0 da `reset`), quindi il controllo `slow.scrapes === 0` del dosso passa anche prima del Task 4. Se falliscono i nuovi test di equilibrio/frequenza/cordolo/dosso, correggi l'implementazione, non le soglie. Se fallisce un test di `physics.spec.js`, la causa è nel nuovo modello: verifica che `w.fz` sia il carico gomma medio e che la deportanza entri solo tramite `pitchM`/`ay`.

- [ ] **Step 9: Checkpoint** — `tests/suspension.spec.js` (5 test) e `tests/physics.spec.js` (6 test) verdi.

---

### Task 4: Fondo scocca che struscia

**Files:**
- Modify: `vehicle-physics.js` (`step`: dopo il blocco sospensioni; forze planari)
- Test: `tests/suspension.spec.js`

**Interfaces:**
- Produces: `dyn.scrape = { x, y, z, speed, pen } | null` (evento più forte dall'ultimo azzeramento; lo azzera chi lo legge), `dyn.scrapeCount` (contatore cumulativo di punti in contatto per passo, per i test). Saltato se `dyn.fast`.

- [ ] **Step 1: Test che fallisce** — aggiungi a `tests/suspension.spec.js`:

```js
test('the F1 scrapes its floor climbing a sidewalk; nothing scrapes on flat ground',()=>{
  const f1=cfg('fuoco'),d=new VehicleDynamics(f1),c=car0(),e=env((x,z)=>z>4?0.15:0);settle(d,c,e);
  expect(d.scrapeCount).toBe(0);
  c.vel.z=5.56;d.synced=false;
  for(let i=0;i<240*2;i++)d.step(c,DT,{throttle:0.2,brake:0,steer:0},e);
  expect(d.scrapeCount).toBeGreaterThan(0);
  expect(d.scrape&&Number.isFinite(d.scrape.pen)&&d.scrape.pen>0).toBe(true);
  expect([c.rideY,d.pitch,...d.wheels.map(w=>w.hubY)].every(Number.isFinite)).toBe(true);
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/suspension.spec.js -g "scrapes"`
Expected: FAIL (`scrapeCount` resta 0).

- [ ] **Step 3: Implementa** — in `step`, subito dopo il ciclo finale del blocco sospensioni (quello che somma `heaveF`), aggiungi:

```js
    // --- fondo scocca: 5 punti alla quota da terra; se toccano il suolo spingono su e strisciano ---
    let scrLong = 0, scrLat = 0, scrMz = 0;
    if (!this.fast) {
      const hw = p.bodyW / 2 - 0.2, hl = p.bodyL / 2 - 0.4, kS = 30 * p.kF, cS = Math.sqrt(kS * p.m / 5);
      const spd = Math.hypot(vz, vx);
      for (const [pd, pl] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, 0]]) {
        const bottom = car.rideY - pd * this.pitch + pl * this.roll + p.clearance;
        const px = car.pos.x + fx * pd + Lx * pl, pz = car.pos.z + fz * pd + Lz * pl;
        const pen = env.height(px, pz) - bottom;
        if (pen <= 0) continue;
        const vUp = car.verticalSpeed - pd * this.pitchRate + pl * this.rollRate;
        const N = Math.max(0, kS * pen - cS * vUp);
        heaveF += N; pitchM -= N * pd; rollM += N * pl;
        if (spd > 0.1) { const Ff = 0.45 * N, fl = -Ff * vz / spd, ft = -Ff * vx / spd; scrLong += fl; scrLat += ft; scrMz += pd * ft - pl * fl; }
        if (!this.scrape || pen > this.scrape.pen) this.scrape = { x: px, y: bottom + pen, z: pz, speed: spd, pen };
        this.scrapeCount++;
      }
    }
```

e, subito prima della riga `Flong -= p.drag * vz * Math.abs(vz);` aggiunta nel Task 3, aggiungi:

```js
    Flong += scrLong; Flat += scrLat; Mz += scrMz;             // attrito del fondo che struscia
```

- [ ] **Step 4: Esegui e verifica**

Run: `PW_PORT=5191 npx playwright test tests/suspension.spec.js tests/physics.spec.js`
Expected: `12 passed` (6 + 6). Il test del dosso verifica anche `slow.scrapes === 0` per la Falcone.

- [ ] **Step 5: Checkpoint** — suite del task verde.

---

### Task 5: Valdora — marciapiedi a 15 cm, dossi, tombini, rattoppi

**Files:**
- Modify: `index.html` (import; `buildCity`: lastre, costanti di quota, elementi, `height`, export `features`)
- Modify: `pedestrians.js` (quota dei pedoni)
- Test: `tests/terrain.spec.js` (nuovo, browser)

**Interfaces:**
- Consumes: `CURB_H`, `cityCurbHeight`, `RoadFeatures`, `speedBump`, `manhole`, `patch` (Task 1).
- Produces: `world.height(x,z) = cityCurbHeight(x,z) + features.heightAt(x,z)`; `world.features` (la `RoadFeatures` della città); mesh `speedBumps`, `manholes`, `roadPatches` nel gruppo del mondo.

- [ ] **Step 1: Test che fallisce** — crea `tests/terrain.spec.js`:

```js
import {test,expect} from '@playwright/test';

const ready=async page=>{await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});};

test('Valdora: 15 cm sidewalks with rounded curbs, speed bumps, manholes and patches',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  const r=await page.evaluate(()=>{const w=window.__dbg.world,f=w.features;
    const bump=f.list.find(x=>x.kind==='bump'),mh=f.list.find(x=>x.kind==='manhole');
    return {road:w.height(48,48),walk:w.height(0,0),edge:w.height(35.2,0),bumps:f.count('bump'),manholes:f.count('manhole'),patches:f.count('patch'),
      bumpTop:w.height(bump.x,bump.z),mh:w.height(mh.x,mh.z),mesh:['speedBumps','manholes','roadPatches'].every(n=>!!w.group.getObjectByName(n))};});
  expect(r.road).toBe(0);expect(r.walk).toBeCloseTo(0.15,5);expect(r.edge).toBe(0);
  expect(r.bumps).toBeGreaterThan(10);expect(r.bumps).toBeLessThanOrEqual(30);
  expect(r.manholes).toBeGreaterThan(200);expect(r.patches).toBeGreaterThan(100);
  expect(r.bumpTop).toBeCloseTo(0.07,3);expect(r.mh).toBeLessThan(-0.01);expect(r.mesh).toBe(true);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js`
Expected: FAIL (`w.features` undefined).

- [ ] **Step 3: Import** — dopo `import { TireSmoke, SmokePass, SMOKE_LAYER } from './tire-smoke.js';` aggiungi:

```js
import { CURB_H, cityCurbHeight, RoadFeatures, speedBump, manhole, patch, kerbHeight, KERB_PITCH, KERB_RISE } from './road-features.js';
```

- [ ] **Step 4: Griglia degli elementi** — in `buildCity`, subito dopo la definizione di `districtOf` (`const districtOf=(i,j)=>{ … };`), aggiungi:

```js
  const features=new RoadFeatures();              // dossi, tombini, rattoppi, giardini: sentiti dalle sospensioni
```

- [ ] **Step 5: Lastre con angoli arrotondati** — sostituisci:

```js
   const slabGeo=new THREE.BoxGeometry(70,0.3,70); slabGeo.translate(0,0.15,0);
```

con:

```js
   // lastra del marciapiede alta CURB_H con angoli raggiati (1.5 m), come il profilo fisico
   const slabShape=new THREE.Shape(), SR=1.5;
   slabShape.moveTo(-half+SR,-half);
   slabShape.lineTo(half-SR,-half); slabShape.absarc(half-SR,-half+SR,SR,-Math.PI/2,0,false);
   slabShape.lineTo(half,half-SR);  slabShape.absarc(half-SR,half-SR,SR,0,Math.PI/2,false);
   slabShape.lineTo(-half+SR,half); slabShape.absarc(-half+SR,half-SR,SR,Math.PI/2,Math.PI,false);
   slabShape.lineTo(-half,-half+SR);slabShape.absarc(-half+SR,-half+SR,SR,Math.PI,Math.PI*1.5,false);
   const slabGeo=new THREE.ExtrudeGeometry(slabShape,{ depth:CURB_H, bevelEnabled:false, curveSegments:6 });
   slabGeo.rotateX(-Math.PI/2);                   // estrusione verso l'alto, base a y=0
   { const uv=slabGeo.attributes.uv; for(let k=0;k<uv.count;k++) uv.setXY(k,uv.getX(k)/(2*half),uv.getY(k)/(2*half)); }  // UV come il vecchio box
```

- [ ] **Step 6: Tutto ciò che poggia sul marciapiede a `CURB_H`** — in `buildCity` applica queste sostituzioni esatte (ognuna compare una volta, salvo dove indicato):

| Cerca | Sostituisci |
|---|---|
| `pond.position.set(px,0.33,pz)` | `pond.position.set(px,CURB_H+0.03,pz)` |
| `rim.position.set(px,0.36,pz)` | `rim.position.set(px,CURB_H+0.06,pz)` |
| `y:0.3+l*2.62` | `y:CURB_H+l*2.62` |
| `baseBox.position.set(cx, baseH/2+0.3, cz)` | `baseBox.position.set(cx, baseH/2+CURB_H, cz)` |
| `addArchitecture(group,cx,cz,bw,bd,h1,baseH+.8,isCore)` | `addArchitecture(group,cx,cz,bw,bd,h1,baseH+CURB_H+.5,isCore)` |
| `lg.position.set(cx, topY+0.3, cz)` | `lg.position.set(cx, topY+CURB_H, cz)` |
| `IM.setPosition(H.x,0.34,H.z)` | `IM.setPosition(H.x,CURB_H+0.04,H.z)` |
| `IM.setPosition(H.x, H.h+0.34, H.z)` | `IM.setPosition(H.x, H.h+CURB_H+0.04, H.z)` |
| `IM.makeScale(29,0.36,29)` | `IM.makeScale(29,CURB_H+0.06,29)` |
| `IM.setPosition(W2.x,0.3,W2.z)` | `IM.setPosition(W2.x,CURB_H,W2.z)` |
| `IM.setPosition(T.x,0.3,T.z)` | `IM.setPosition(T.x,CURB_H,T.z)` |
| `IM.setPosition(C3.x,0.3,C3.z)` | `IM.setPosition(C3.x,CURB_H,C3.z)` |
| `M.setPosition(L.x,0.3,L.z)` | `M.setPosition(L.x,CURB_H,L.z)` |
| `y:0.3, z:T.z` (3 volte, `treeSpots`) | `y:CURB_H, z:T.z` |
| `M.makeTranslation(p.x,0.304,p.z)` | `M.makeTranslation(p.x,CURB_H+0.004,p.z)` |
| `M.makeTranslation(p.x,0.307,p.z)` | `M.makeTranslation(p.x,CURB_H+0.007,p.z)` |
| `M.setPosition(p.x,0.3075,p.z)` | `M.setPosition(p.x,CURB_H+0.0075,p.z)` |
| `y:0.305` (4 volte: panchine, cestini, tavoli dei parchi) | `y:CURB_H+0.005` |
| `M.setPosition(T.x,0.3,T.z)` (chiome/tronchi) | `M.setPosition(T.x,CURB_H,T.z)` |
| `M.setPosition(H.x,0.3,H.z)` (idranti) | `M.setPosition(H.x,CURB_H,H.z)` |
| `benchDefs.map(B=>({ x:B.x, y:0.3, z:B.z, a:B.a }))` | `benchDefs.map(B=>({ x:B.x, y:CURB_H, z:B.z, a:B.a }))` |
| `M.setPosition(D.x,0.3,D.z)` (pali semaforo) | `M.setPosition(D.x,CURB_H,D.z)` |

Nello stesso blocco dei giardini (`yardDefs.forEach((Y,ix)=>{ … })`), aggiungi come prima istruzione del corpo:

```js
      features.add(patch(Y.x,Y.z,29,29,0.06));   // prato del giardino 6 cm sopra il marciapiede
```

Poi cerca quote rimaste legate al vecchio marciapiede:

Run: `awk '/function buildCity/,/^function buildCoast/' index.html | grep -nE "[^0-9.]0?\.3(0|04|05|07|075|3|4|6)?[^0-9]" | grep -v "Math.random\|rnd(\|roughness\|opacity\|metalness\|\*0\.3\|0\.3\*"`
Expected: nessuna riga che posizioni oggetti su un marciapiede a 0.3; eventuali residui (es. vetrine, portali) vanno portati a `CURB_H` con lo stesso criterio.

- [ ] **Step 7: Pedoni** — in `pedestrians.js` aggiungi in cima `import { CURB_H } from './road-features.js';` e sostituisci le due quote `.3` dei pedoni:

```js
      if(this.crowd){this.crowd.add(p.type,p.x,CURB_H,p.z,p.h,p.scale,p.moving?'walk':p.idle,p.animPhase,p.speed);if(p.t>=1){p.segment=(p.segment+1)%p.route.length;p.t=0;}return;}
```

```js
      this.quat.setFromAxisAngle(this.yAxis,p.h);this.root.compose(this.position.set(p.x,CURB_H+bob,p.z),this.quat,this.scale.setScalar(p.scale));
```

- [ ] **Step 8: Dossi, tombini, rattoppi** — in `buildCity`, subito prima di `batchCity(group);` aggiungi:

```js
  /* --- ELEMENTI SENTITI DALLE SOSPENSIONI (road-features.js) --- */
  { // dossi: 6 m prima della linea di stop, nei tratti che costeggiano villette o parchi (max 30)
    const soft=(i,j)=>Math.abs(i)<=n&&Math.abs(j)<=n&&['res','park'].includes(districtOf(i,j));
    const cand=[];
    for(const ix of centers6) for(const jz of centers6) for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const bx=ix+dx*23.4, bz=jz+dz*23.4;
      if(Math.abs(bx)>500||Math.abs(bz)>500) continue;
      const mx=ix+dx*48, mz=jz+dz*48;                    // metà del tratto: isolati ai due lati
      const sides=dx===0?[[mx-48,mz],[mx+48,mz]]:[[mx,mz-48],[mx,mz+48]];
      if(!sides.some(([sx,sz])=>soft(Math.round(sx/pitch),Math.round(sz/pitch)))) continue;
      cand.push([bx,bz,dx!==0?'x':'z']);
    }
    for(let k=cand.length-1;k>0;k--){ const r=Math.floor(Math.random()*(k+1)); [cand[k],cand[r]]=[cand[r],cand[k]]; }
    for(const [bx,bz,axis] of cand.slice(0,30)) features.add(speedBump(bx,bz,axis));
    // tombini (2-3) e un rattoppo per tratto di strada, nelle corsie, lontano dagli incroci
    for(const c of centers6) for(let k=0;k<centers6.length-1;k++){
      const a=centers6[k];
      for(const alongX of [true,false]){
        const at=(t,o)=>alongX?[a+t,c+o]:[c+o,a+t];
        const nM=2+(Math.random()<0.5?1:0);
        for(let m=0;m<nM;m++){ const [x,z]=at(rnd(20,76),(Math.random()<0.5?-1:1)*rnd(1.2,5.5)); features.add(manhole(x,z)); }
        const [x,z]=at(rnd(22,74),rnd(-8,8)), long=rnd(1.2,3.2), wide=rnd(0.8,2.2), dh=rnd(-0.01,0.01);
        features.add(alongX?patch(x,z,long,wide,dh):patch(x,z,wide,long,dh));
      }
    }
    features.buildMeshes(group);
  }
```

- [ ] **Step 9: Quota della città** — nell'oggetto restituito da `buildCity` sostituisci `height:()=>0,` con:

```js
    height:(x,z)=>cityCurbHeight(x,z)+features.heightAt(x,z), features,
```

- [ ] **Step 10: Esegui i test**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js tests/world.spec.js tests/realism.spec.js tests/people.spec.js`
Expected: tutti verdi.

- [ ] **Step 11: Verifica visiva** — con il server del preview (`car-game`), in città: marciapiede alto 15 cm con angoli raggiati; lampioni, alberi, idranti, panchine, pedoni, prati e villette appoggiati (non sospesi né affondati); dossi gialli/neri, tombini e rattoppi in strada. Fotografa un viale e un parco. Se qualcosa galleggia di 15 cm, è una quota a 0.3 sfuggita allo Step 6: correggila.

- [ ] **Step 12: Checkpoint** — test del task verdi.

---

### Task 6: Riviera — cordoli a dente di sega e banchina

**Files:**
- Modify: `index.html` (`buildCoast`: ascisse e cordoli prima di `roadNear`, `heightAt`, mesh dei cordoli, banchina, `surface`, export `kerbOn`/`kerbAt`)
- Test: `tests/terrain.spec.js`

**Interfaces:**
- Consumes: `kerbHeight`, `KERB_PITCH`, `KERB_RISE` (Task 1).
- Produces: `world.kerbOn: boolean[NS]`, `world.kerbAt(x,z) → bool` (punto su un cordolo), mesh `verge` (banchina); `world.height` include i cordoli.

- [ ] **Step 1: Test che fallisce** — aggiungi a `tests/terrain.spec.js`:

```js
test('Riviera: raised saw-tooth kerbs in corners and a verge that matches the physics',async({page})=>{
  await ready(page);
  await page.getByRole('button',{name:/Riviera del Sole/}).click();
  const r=await page.evaluate(()=>{const w=window.__dbg.world,S=w.samples;
    const i=w.kerbOn.findIndex(Boolean),a=S[i],px=-a.dz,pz=a.dx;
    const road=w.height(a.x+px*5,a.z+pz*5), kerb=w.height(a.x+px*7.8,a.z+pz*7.8);
    const verge=w.group.getObjectByName('verge'),p=verge.geometry.attributes.position,n=verge.geometry.attributes.normal;
    let err=0,down=0;for(let k=0;k<p.count;k+=7){err=Math.max(err,Math.abs(p.getY(k)+0.01-w.height(p.getX(k),p.getZ(k))));if(n.getY(k)<0)down++;}
    return {road,kerb,err,down,grip:w.surface(a.x+px*7.6,a.z+pz*7.6).grip,kerbAt:w.kerbAt(a.x+px*7.5,a.z+pz*7.5),straight:w.kerbAt(S[w.kerbOn.findIndex(k=>!k)].x,S[w.kerbOn.findIndex(k=>!k)].z)};});
  expect(r.kerb-r.road).toBeGreaterThan(0.03);expect(r.err).toBeLessThan(0.02);expect(r.down).toBe(0);
  expect(r.grip).toBe(1);expect(r.kerbAt).toBe(true);expect(r.straight).toBe(false);
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js -g Riviera`
Expected: FAIL (`w.kerbOn` undefined).

- [ ] **Step 3: Ascisse e cordoli prima di `roadNear`** — in `buildCoast`, subito prima di `const segmentGrid=new Map(),cellSize=32;` aggiungi:

```js
  // ascissa lungo la strada e cordoli (dove la curva è marcata): servono a heightAt e alla grafica
  const segL=[], cum=[0], turn=[], kerbOn=[];
  for(let i=0;i<NS;i++){
    const a=samples[i], b=samples[(i+1)%NS];
    segL.push(Math.hypot(b.x-a.x,b.z-a.z)); cum.push(cum[i]+segL[i]);
    turn.push(a.dx*b.dz - a.dz*b.dx); kerbOn.push(Math.abs(turn[i])>=0.042);
  }
```

e più avanti **elimina** il vecchio blocco che ricalcolava `turn`:

```js
  /* --- curvatura per cordoli / cartelli: angolo tra direzioni consecutive --- */
  const turn=[];
  for(let i=0;i<NS;i++){
    const a=samples[i], b=samples[(i+1)%NS];
    turn.push(a.dx*b.dz - a.dz*b.dx);
  }
```

(sostituiscilo con il commento `/* --- curvatura: turn[] calcolato insieme alle ascisse, prima di roadNear --- */`).

- [ ] **Step 4: `heightAt` con i cordoli** — sostituisci la funzione `heightAt` con:

```js
  function heightAt(x,z){
    const b=roadBlend(x,z), r=b.r;
    let y=lerp(terrBase(x,z), r.y+0.06, b.s);
    if(r.d>6.95&&r.d<7.9&&kerbOn[r.i]) y+=kerbHeight((r.d-6.95)/0.95, cum[r.i]+r.t*segL[r.i]);   // cordolo a dente di sega
    return y;
  }
```

- [ ] **Step 5: Mesh dei cordoli** — sostituisci l'intero blocco da `/* --- CORDOLI rosso/bianchi dove la curva e' marcata --- */` fino a `group.add(new THREE.Mesh(kGeo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.8 })));` con:

```js
  /* --- CORDOLI rosso/bianchi a dente di sega dove la curva è marcata: stessa quota della fisica --- */
  const kPos=[], kCol=[], kIdx=[];
  for(let i=0;i<NS;i++){
    if(!kerbOn[i]) continue;
    const col=((i>>1)&1)?[0.80,0.10,0.10]:[0.92,0.92,0.92], A0=cum[i], A1=cum[i]+segL[i];
    // righe di vertici: estremi del tratto + inizio e cima di ogni dente
    const rowsRaw=[A0,A1];
    for(let m=Math.ceil(A0/KERB_PITCH); m*KERB_PITCH<A1; m++){ const s=m*KERB_PITCH; rowsRaw.push(s, s+KERB_PITCH*KERB_RISE); }
    const rows=[...new Set(rowsRaw.filter(A=>A>=A0&&A<=A1).map(A=>+A.toFixed(5)))].sort((p,q)=>p-q);
    const a=samples[i], b=samples[(i+1)%NS];
    for(const off of [-1,1]){
      const base=kPos.length/3;
      for(const A of rows){
        const t=(A-A0)/segL[i], x=lerp(a.x,b.x,t), y=lerp(a.y,b.y,t)+0.064, z=lerp(a.z,b.z,t);
        const px=-lerp(a.dz,b.dz,t)*off, pz=lerp(a.dx,b.dx,t)*off;
        kPos.push(x+px*6.95, y+kerbHeight(0,A), z+pz*6.95,   // bordo interno (a filo strada)
                  x+px*7.9,  y+kerbHeight(1,A), z+pz*7.9,    // bordo esterno, sulla cima dei denti
                  x+px*7.9,  y-0.015,           z+pz*7.9);   // piede della faccia esterna
        kCol.push(...col,...col,...col);
      }
      for(let r=0;r<rows.length-1;r++){ const p=base+r*3, q=p+3;
        kIdx.push(p,p+1,q+1, p,q+1,q,  p+1,p+2,q+2, p+1,q+2,q+1); }
    }
  }
  const kGeo=new THREE.BufferGeometry();
  kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kPos,3));
  kGeo.setAttribute('color', new THREE.Float32BufferAttribute(kCol,3));
  kGeo.setIndex(kIdx); kGeo.computeVertexNormals();
  const kerbMesh=new THREE.Mesh(kGeo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.8, side:THREE.DoubleSide }));
  kerbMesh.receiveShadow=true; kerbMesh.name='kerbs'; group.add(kerbMesh);
```

- [ ] **Step 6: Banchina** — subito dopo `terr.receiveShadow=true; group.add(terr);` aggiungi:

```js
  // --- banchina: terreno lungo la strada alla risoluzione della spline, quote = heightAt, fino a
  //     26.4 m dove terreno disegnato e fisico tornano a coincidere (niente auto sospese a bordo strada) ---
  { const OFF=[7.0,7.9,9,11,14,18,22,26.4], per=OFF.length*2, pos=[], idx=[];
    for(let i=0;i<=NS;i++){
      const s=samples[i%NS], px=-s.dz, pz=s.dx;
      for(const side of [-1,1]) for(const o of OFF){ const x=s.x+px*o*side, z=s.z+pz*o*side; pos.push(x, heightAt(x,z)-0.01, z); }
      if(i<NS) for(let sd=0;sd<2;sd++) for(let k=0;k<OFF.length-1;k++){
        const a=i*per+sd*OFF.length+k, b=a+per;
        if(sd===0) idx.push(a,a+1,b, a+1,b+1,b); else idx.push(a,b,a+1, a+1,b,b+1);
      }
    }
    const vg=new THREE.BufferGeometry(); vg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); vg.setIndex(idx); vg.computeVertexNormals();
    if(vg.attributes.normal.getY(0)<0){ const ix=vg.index.array; for(let k=0;k<ix.length;k+=3){ const t=ix[k+1]; ix[k+1]=ix[k+2]; ix[k+2]=t; } vg.computeVertexNormals(); }
    const vp=vg.attributes.position, vn=vg.attributes.normal, vs=new Float32Array(vp.count*3);
    for(let k=0;k<vp.count;k++){ const h=vp.getY(k), ny=vn.getY(k);
      const sand=clamp((1.9-h)/0.8,0,1), rock=Math.max(clamp((h-12)/16,0,1)*0.6, clamp((0.86-ny)/0.14,0,1))*(1-sand);
      vs.set([sand, Math.max(0,1-sand-rock), rock], k*3); }
    vg.setAttribute('aSplat', new THREE.BufferAttribute(vs,3));
    const verge=new THREE.Mesh(vg, terr.material); verge.receiveShadow=true; verge.name='verge'; group.add(verge); }
```

(Se il test `down` segnala normali rivolte in basso su un solo lato, inverti l'ordine degli indici solo per quel lato `sd`.)

- [ ] **Step 7: Aderenza ed export** — nell'oggetto restituito da `buildCoast`:
  - sostituisci `if(d<7.3) return { grip:1.0, roll:1.0, dust:false };       // asfalto + cordoli` con `if(d<7.9) return { grip:1.0, roll:1.0, dust:false };       // asfalto + cordoli interi`;
  - sostituisci `height:heightAt, roadNear, samples,` con:

```js
    height:heightAt, roadNear, samples, kerbOn,
    kerbAt:(x,z)=>{ const r=roadNear(x,z); return r.d>6.95&&r.d<7.9&&kerbOn[r.i]; },
```

- [ ] **Step 8: Esegui i test**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js tests/world.spec.js tests/realism.spec.js tests/police.spec.js`
Expected: tutti verdi.

- [ ] **Step 9: Verifica visiva** — in Riviera: cordoli rialzati con denti visibili da vicino e bordo esterno pulito; banchina erbosa raccordata alla strada, nessuno scalino o buco a 26 m dal centro; nessuna auto "sospesa" a bordo strada. Fotografa una curva.

- [ ] **Step 10: Checkpoint** — test del task verdi.

---

### Task 7: Auto in gioco — sotto-passi, assetto solo in imbardata, ruote che si muovono, piano a terra

**Files:**
- Modify: `index.html` (`Car` costruttore, `Car.update`, `Car.syncMesh`)
- Modify: `enhancements.js` (`detailVehicle`: ombra di contatto su `car.ground`)
- Test: `tests/terrain.spec.js`

**Interfaces:**
- Consumes: `dyn.wheels[i].{hubY, hubRest, gc, omega, R}`, `dyn.hitPeak`, `dyn.scrape`, `dyn.fast`, `env.reprobe` (Task 3-4).
- Produces: `car.scrapes: Array<{x,y,z,speed,pen}>`, `car.hitPeak: number` (li consuma il loop di `animate`, Task 8), `car.ground: THREE.Group` (ombra di contatto e alone), `w.hubYPrev` per l'interpolazione.

- [ ] **Step 1: Test che fallisce** — aggiungi a `tests/terrain.spec.js`:

```js
test('driving onto a sidewalk lifts the body and moves the drawn wheels, the car stays upright',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  await page.evaluate(()=>{window.__dbg.state.policeOn=false;window.__dbg.state.trafficOn=false;});
  await page.locator('#startBtn').click();
  const r=await page.evaluate(()=>{
    const {car,world}=window.__dbg;
    car.reset(40,0,-Math.PI/2);car.update(1/120,world);car.syncMesh(1,world);   // in strada, muso verso l'isolato (0,0)
    const holders=car.wheels.map(w=>w.parent),y0=holders.map(h=>h.position.y),g0=car.group.position.y;
    car.vel.set(-5.5,0,0);car.dyn.synced=false;let moved=0;
    for(let i=0;i<240;i++){car.update(1/120,world);car.syncMesh(1/120,world,1);
      holders.forEach((h,k)=>moved=Math.max(moved,Math.abs(h.position.y-y0[k])));}
    const up=new car.group.up.constructor(0,1,0).applyQuaternion(car.group.quaternion);
    return {g0,g1:car.group.position.y,x:car.pos.x,moved,upright:up.y>0.999999,finite:[car.rideY,car.dyn.pitch,car.dyn.roll].every(Number.isFinite),ground:!!car.ground};
  });
  expect(r.x).toBeLessThan(33);expect(r.g1-r.g0).toBeGreaterThan(0.12);expect(r.moved).toBeGreaterThan(0.03);
  expect(r.upright).toBe(true);expect(r.finite).toBe(true);expect(r.ground).toBe(true);expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js -g sidewalk`
Expected: FAIL (`moved` = 0 o gruppo inclinato).

- [ ] **Step 3: Costruttore `Car`** — dopo `this.impacts=[];` aggiungi `this.scrapes=[]; this.hitPeak=0;`. Nel costruttore, subito prima di `if(!c.build) this.buildWheels();` aggiungi:

```js
    // piano a terra (ombra di contatto, alone): segue le quote delle 4 ruote, non l'assetto della scocca
    this.ground=new THREE.Group(); this.group.add(this.ground);
```

e nella creazione dell'alone sostituisci `this.group.add(glow);` con `this.ground.add(glow);`.

In `enhancements.js`, in `detailVehicle`, sostituisci `patch.rotation.x=-Math.PI/2;patch.position.y=.025;car.group.add(patch);` con:

```js
  patch.rotation.x=-Math.PI/2;patch.position.y=.025;(car.ground||car.group).add(patch);
```

- [ ] **Step 4: `Car.update`** — sostituisci `if(!this.dyn) this.dyn=new VehicleDynamics(c);` con:

```js
    if(!this.dyn){ this.dyn=new VehicleDynamics(c); this.dyn.fast=!!this.input; }   // volanti: inviluppo leggero
```

e sostituisci le tre righe:

```js
    const h1=W.height(this.pos.x+fwd.x*2, this.pos.z+fwd.z*2), h2=W.height(this.pos.x-fwd.x*2, this.pos.z-fwd.z*2);
    const env={ height:W.height, surface:W.surface, gripMul:state.gripMul, slope:(h1-h2)/4 };
    let res=null; for(let k=0;k<2;k++) res=this.dyn.step(this, dt/2, inp, env);
```

con:

```js
    const env={ height:W.height, surface:W.surface, gripMul:state.gripMul, reprobe:true };
    for(const w of this.dyn.wheels) w.hubYPrev=w.hubY;          // per interpolare le ruote disegnate
    // inviluppo delle gomme al primo sotto-passo, estrapolato nel secondo
    let res=null; for(let k=0;k<2;k++){ env.reprobe=k===0; res=this.dyn.step(this, dt/2, inp, env); }
    if(this.dyn.scrape){ this.scrapes.push(this.dyn.scrape); if(this.scrapes.length>8) this.scrapes.shift(); this.dyn.scrape=null; }
    this.hitPeak=Math.max(this.hitPeak, this.dyn.hitPeak); this.dyn.hitPeak=0;
```

- [ ] **Step 5: `Car.syncMesh`** — sostituisci il corpo da `this.group.position.lerpVectors(...)` fino alla riga `else this.wheels.forEach(w=>w.rotation.x+=spin);` (compresa) con:

```js
    this.group.position.lerpVectors(this.previousPos,this.pos,alpha);
    const gy=W.height(this.group.position.x,this.group.position.z);
    if(!this.rideInitialized){this.rideY=gy;this.previousRideY=gy;this.rideInitialized=true;}
    this.group.position.y=Math.max(gy-.25,lerp(this.previousRideY,this.rideY,alpha));
    // assetto: il gruppo gira solo in imbardata; beccheggio e rollio (già riferiti al mondo, pendenze
    // comprese) li dà la fisica alla scocca. Niente più doppia inclinazione in salita.
    const dh=Math.atan2(Math.sin(this.heading-this.previousHeading),Math.cos(this.heading-this.previousHeading));
    this.group.quaternion.setFromAxisAngle(CAR_UP,this.previousHeading+dh*alpha);

    // weight transfer visivo: beccheggio in frenata/accel., rollio in curva
    if(this.dyn){ this.chassis.rotation.x=this.dyn.pitch; this.chassis.rotation.z=this.dyn.roll; }
    else {
      this.chassis.rotation.x=lerp(this.chassis.rotation.x, clamp(-this.longSmooth*0.011,-.09,.09), clamp(dt*6,0,1));
      this.chassis.rotation.z=lerp(this.chassis.rotation.z, clamp(this.latSmooth*0.011,-.10,.10), clamp(dt*6,0,1));
    }

    const spin=this.vz/(this.wheelSpinR||this.cfg.body.wheelR)*dt;
    if(this.dyn){
      const gy0=this.group.position.y;
      this.wheels.forEach(w=>{      // ogni ruota gira alla sua velocità e segue la corsa della sua sospensione
        const holder=w.parent, hp=holder.position, dw=this.dyn.wheels.find(q=>q.front===(hp.z>0)&&Math.sign(q.l)===Math.sign(hp.x||1));
        if(!dw){ w.rotation.x+=spin; return; }
        w.rotation.x+=dw.omega*dt*(dw.R/(this.wheelSpinR||dw.R));
        if(holder.userData.restY===undefined) holder.userData.restY=hp.y;
        if(Number.isFinite(dw.hubY)){
          const hub=Number.isFinite(dw.hubYPrev)?lerp(dw.hubYPrev,dw.hubY,alpha):dw.hubY;
          hp.y=holder.userData.restY+clamp(hub-gy0-dw.hubRest,-0.25,0.25);
        }
      });
      // ombra di contatto e alone: piano per le quote di contatto delle 4 ruote
      const q=this.dyn.wheels;
      if(this.ground&&q.every(w=>Number.isFinite(w.gc))){
        const hF=(q[0].gc+q[1].gc)/2, hR=(q[2].gc+q[3].gc)/2, hL=(q[0].gc+q[2].gc)/2, hRt=(q[1].gc+q[3].gc)/2;
        this.ground.position.y=(hF+hR)/2-gy0;
        this.ground.rotation.set(-Math.atan2(hF-hR,this.cfg.wheelBase),0,Math.atan2(hL-hRt,this.dyn.p.track));
      }
    }
    else this.wheels.forEach(w=>w.rotation.x+=spin);
```

e aggiungi, subito prima di `class Car` (a livello di modulo), la costante:

```js
const CAR_UP=new THREE.Vector3(0,1,0);
```

- [ ] **Step 6: Esegui i test**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js tests/cars.spec.js tests/driving.spec.js tests/police.spec.js tests/realism.spec.js`
Expected: tutti verdi.

- [ ] **Step 7: Verifica visiva** — in città sali su un marciapiede a passo d'uomo e a 30 km/h: prima sale la ruota anteriore, poi la posteriore; la scocca rolla/beccheggia senza compenetrare le ruote; l'ombra di contatto resta a terra. In Riviera in salita l'auto non è più inclinata il doppio del pendio.

- [ ] **Step 8: Checkpoint** — test del task verdi.

---

### Task 8: Effetti — scintille dal fondo, scossone della camera, vibrazione del gamepad, segni solo a terra

**Files:**
- Modify: `index.html` (variabili di stato vicino a `let last=performance.now()`, `animate`, `updateCamera`, `SkidMarks.update`, funzione `rumble` vicino a `pollGamepad`, `__dbg`)
- Test: `tests/terrain.spec.js`

**Interfaces:**
- Consumes: `car.scrapes`, `car.hitPeak` (Task 7), `world.kerbAt` (Task 6), `dyn.wheels[i].{contact, wx, wz}`.
- Produces: `window.__dbg.fx = { get shake(){…}, get sparks(){…} }` (timer dello scossone e scintille vive, per i test).

- [ ] **Step 1: Test che fallisce** — aggiungi a `tests/terrain.spec.js`:

```js
test('the F1 scrapes sparks on a sidewalk and a hard hit shakes the camera',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{window.__dbg.state.policeOn=false;window.__dbg.state.trafficOn=false;});
  await page.getByRole('button',{name:'FUOCO F1-90',exact:true}).click();
  await page.locator('#startBtn').click();
  await page.evaluate(()=>{const {car,world}=window.__dbg;car.reset(40,0,-Math.PI/2);car.update(1/120,world);car.vel.set(-6,0,0);car.dyn.synced=false;});
  let sparks=0,shake=0;
  for(let k=0;k<20;k++){await page.waitForTimeout(60);const f=await page.evaluate(()=>({s:window.__dbg.fx.sparks,t:window.__dbg.fx.shake}));sparks=Math.max(sparks,f.s);shake=Math.max(shake,f.t);}
  expect(sparks).toBeGreaterThan(0);expect(shake).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js -g sparks`
Expected: FAIL (`__dbg.fx` undefined).

- [ ] **Step 3: Stato e vibrazione** — sostituisci `let last=performance.now(), acc=0;` con:

```js
let last=performance.now(), acc=0, camShake=0, camShakeT=0, scrapeCool=0;
```

e subito dopo la funzione `pollGamepad(){…}` aggiungi:

```js
// vibrazione del gamepad (se il browser la supporta), con intervallo minimo tra un effetto e l'altro
let rumbleUntil=0;
function rumble(strong,weak,ms){
  const now=performance.now(); if(now<rumbleUntil) return;
  const g=navigator.getGamepads?.(), p=g&&Array.from(g).find(Boolean), a=p?.vibrationActuator;
  if(!a?.playEffect) return;
  rumbleUntil=now+ms;
  a.playEffect('dual-rumble',{ duration:ms, strongMagnitude:strong, weakMagnitude:weak }).catch(()=>{});
}
```

- [ ] **Step 4: `animate`** — subito dopo il ciclo `while(car.impacts.length){ … }` aggiungi:

```js
    // fondo che struscia (F1 sui cordoli, auto basse sui dossi): scintille e colpo metallico, a ritmo limitato
    scrapeCool=Math.max(0,scrapeCool-dt);
    while(car.scrapes.length){
      const s=car.scrapes.pop();
      if(scrapeCool>0||s.speed<1.5) continue;
      scrapeCool=0.07;
      burstSparks(new THREE.Vector3(s.x,s.y+0.04,s.z), Math.min(14,Math.round(3+s.speed*0.5+s.pen*150)), new THREE.Vector3(car.vel.x,0.4,car.vel.z));
      audio.impact(Math.min(7,1+s.speed*0.25));
    }
    // colpi alle ruote (cordolo preso di netto, dosso): scossone della camera e vibrazione;
    // sui cordoli della Riviera solo un ronzio leggero
    if(car.hitPeak>2.2){ camShake=Math.min(0.03,0.012+0.01*(car.hitPeak-2.2)); camShakeT=0.15; rumble(Math.min(1,0.25*(car.hitPeak-2)),0.3,120); }
    else if(world.kerbAt&&car.dyn&&Math.hypot(car.vel.x,car.vel.z)>5&&car.dyn.wheels.some(w=>w.contact&&world.kerbAt(w.wx,w.wz))) rumble(0.05,0.25,70);
    car.hitPeak=0;
```

- [ ] **Step 5: `updateCamera`** — nel ramo della camera che insegue, subito dopo `camera.position.copy(camPos);` aggiungi:

```js
    if(camShakeT>0){ camShakeT=Math.max(0,camShakeT-dt); camera.position.y+=camShake*Math.sin(camShakeT*95)*(camShakeT/0.15); }
```

- [ ] **Step 6: Segni solo per le ruote a terra** — in `SkidMarks.update`, nel ciclo `for(const s of [-1,1]){`, come prime righe del corpo aggiungi:

```js
      const dw=car.dyn&&car.dyn.wheels[s<0?3:2];                 // ruota staccata (dosso, cordolo): niente segno
      if(dw&&!dw.contact){ this.last[s<0?0:1]=null; continue; }
```

- [ ] **Step 7: Handle di debug** — nell'oggetto `window.__dbg={ … }` aggiungi la proprietà:

```js
    fx:{ get shake(){ return camShakeT; }, get sparks(){ return sparks.items.filter(it=>it.life>0).length; } },
```

- [ ] **Step 8: Esegui i test**

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js tests/smoke.spec.js tests/driving.spec.js`
Expected: tutti verdi.

- [ ] **Step 9: Checkpoint** — test del task verdi.

---

### Task 9: Taratura, prestazioni, verifica finale

**Files:**
- Modify: `vehicles.js` solo se la taratura lo richiede (`phys.unsprung`, `phys.travel`, `phys.tireK` della `fuoco`)
- Test: `tests/terrain.spec.js` (prestazioni), suite completa
- Modify: memoria di progetto (`/Users/matteosicurezza/.claude/projects/-Users-matteosicurezza-Desktop-AI-Car-Game/memory/veloce-driving-game.md`)

- [ ] **Step 1: Test di costo** — aggiungi a `tests/terrain.spec.js`:

```js
test('ten seconds of player physics on the Riviera cost less than 250 ms',async({page})=>{
  await ready(page);
  await page.getByRole('button',{name:/Riviera del Sole/}).click();
  await page.locator('#startBtn').click();
  const ms=await page.evaluate(()=>{const {car,world,keys}=window.__dbg;keys.up=true;const t=performance.now();
    for(let i=0;i<1200;i++)car.update(1/120,world);keys.up=false;return performance.now()-t;});
  expect(ms).toBeLessThan(250);
});
```

Run: `PW_PORT=5191 npx playwright test tests/terrain.spec.js -g "cost less"`
Expected: PASS. Se fallisce, riduci il costo di `height()` della costa (non il numero di campioni del giocatore): per esempio memorizza in `heightAt` l'ultimo `roadNear` per celle di 0.5 m.

- [ ] **Step 2: Taratura F1** — nel browser guida la `FUOCO F1-90` su un marciapiede, su un dosso a 50 km/h e sui cordoli della Riviera a 150 km/h. Criteri: nessun valore non finito, l'auto resta guidabile (non si ribalta, non decolla sui cordoli), le scintille compaiono sui marciapiedi. Se sui cordoli la F1 saltella in modo incontrollato, alza `phys.travel` a 0.04 o abbassa `phys.tireK` a 200000 in `vehicles.js` (voce `fuoco`), poi riesegui `tests/suspension.spec.js` e `tests/physics.spec.js`.

- [ ] **Step 3: Suite completa**

Run: `PW_PORT=5191 npx playwright test`
Expected: tutti i test verdi (38 esistenti + 14 nuovi = 52).

- [ ] **Step 4: Build**

Run: `npx vite build --outDir /private/tmp/claude-501/-Users-matteosicurezza-Desktop-AI-Car-Game/2f72dab7-df5c-4439-ab06-50c6362b9941/scratchpad/build --emptyOutDir`
Expected: `✓ built`.

- [ ] **Step 5: Prova finale nel browser** — preview `car-game`: marciapiede, dosso a 30 e a 80 km/h, tombini, cordoli costieri, F1 che struscia, notte. FPS in guida normale uguali a prima (±2). Fotografa: salita sul marciapiede, salto sul dosso, cordolo in curva.

- [ ] **Step 6: Memoria** — aggiungi alla memoria di progetto una voce "Fase 5B sospensioni sul terreno" con: modello ruota con massa (`unsprung`, `kt`, fine corsa), `probeContact` e normale inclinata (niente più `env.slope`), `road-features.js` (`CURB_H`, `cityCurbHeight`, `kerbHeight`, `RoadFeatures`), `world.features`/`kerbOn`/`kerbAt`, gruppo auto solo in imbardata + `car.ground`, `car.scrapes`/`hitPeak`, `__dbg.fx`, `PW_PORT`.
