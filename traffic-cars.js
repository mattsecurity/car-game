// Auto civili realistiche per traffico e parcheggi: 5 carrozzerie procedurali
// (berlina, utilitaria, SUV, furgone, taxi) disegnate a istanze. Per ogni tipo una
// InstancedMesh multi-materiale; tutte le ruote in un'unica InstancedMesh.
// Luci: stop legati all'attributo aBrake, frecce ad aTurn (+1 sinistra, -1 destra).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Materiali (indici dei gruppi di geometria)
const PAINT = 0, GLASS = 1, TRIM = 2, LIGHTGREY = 3, HEAD = 4, TAIL = 5, TURN = 6;

// Tipi: misure in metri; la geometria del profilo usa (z lungo l'auto, y in alto)
export const CAR_TYPES = [
  { id: 'sedan', L: 4.65, W: 1.82, clr: 0.15, belt: 0.95, roof: 1.44, hood: 1.35, trunk: 0.95, rake: 0.72, back: 0.55, wR: 0.33, wb: 2.78, track: 1.56, weight: 0.34 },
  { id: 'hatch', L: 3.98, W: 1.74, clr: 0.15, belt: 0.93, roof: 1.47, hood: 1.05, trunk: 0.12, rake: 0.66, back: 0.28, wR: 0.31, wb: 2.52, track: 1.50, weight: 0.3 },
  { id: 'suv', L: 4.62, W: 1.9, clr: 0.24, belt: 1.12, roof: 1.72, hood: 1.2, trunk: 0.18, rake: 0.62, back: 0.3, wR: 0.37, wb: 2.72, track: 1.64, weight: 0.2 },
  { id: 'van', L: 5.05, W: 2.0, clr: 0.2, belt: 1.12, roof: 2.25, hood: 0.5, trunk: 0, rake: 0.55, back: 0, wR: 0.35, wb: 3.1, track: 1.72, weight: 0.1, van: true },
  { id: 'taxi', L: 4.65, W: 1.82, clr: 0.15, belt: 0.95, roof: 1.44, hood: 1.35, trunk: 0.95, rake: 0.72, back: 0.55, wR: 0.33, wb: 2.78, track: 1.56, weight: 0.06, taxi: true },
];
const PALETTE = [0xb9bec4, 0xd9dcdf, 0x2b2f35, 0x121417, 0xeceae4, 0x1f3a5f, 0x6d1f25, 0x44525a, 0x7a7f86, 0x2e4a3a, 0x9a8466, 0x3b4f7a, 0xa7a9ab];

function extrudeProfile(pts, width, bevel = 0.05) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p[0] === 'arc') sh.absarc(p[1], p[2], p[3], p[4], p[5], p[6]);
    else if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]);
  }
  sh.closePath();
  const d = Math.max(width - bevel * 2, 0.05);
  // bevelOffset negativo: lo smusso resta dentro la sagoma (altrimenti la allarga e copre le luci)
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(d / 2, 0, 0);
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const tidy = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; };

// Fondo della carrozzeria da dietro (-z) a davanti (+z) con gli archi dei passaruota
function underbody(t, zBack, zFront, yb) {
  const ra = t.wR + 0.07, cy = t.wR, out = [[zBack, yb]];
  for (const zc of [-t.wb / 2, t.wb / 2]) {
    const dy = cy - yb, dx = Math.sqrt(Math.max(0.01, ra * ra - dy * dy)), th = Math.atan2(-dy, dx);
    out.push([zc - dx, yb], ['arc', zc, cy, ra, Math.PI - th, th, true]);
  }
  out.push([zFront, yb]);
  return out;
}

// Geometria di un tipo: un'unica BufferGeometry con gruppi per materiale
export function buildCarGeometry(t) {
  const L2 = t.L / 2, parts = [[], [], [], [], [], [], []];
  const zWs = L2 - t.hood;                          // base del parabrezza
  const zRoofF = zWs - t.rake, zRoofR = -L2 + t.trunk + t.back, zRw = -L2 + t.trunk;
  if (t.van) {
    parts[PAINT].push(extrudeProfile([
      [L2 - 0.05, t.clr + 0.1], [L2 + 0.03, t.clr + 0.55, L2, 0.95], [L2 - 0.3, 1.02],
      [zWs - 0.9, t.belt], [zWs - 0.9, t.roof - 0.05], [-L2 + 0.08, t.roof - 0.05], [-L2, t.roof - 0.2],
      [-L2, t.clr + 0.1], ...underbody(t, -L2 + 0.3, L2 - 0.3, t.clr),
    ], t.W, 0.06));
    parts[GLASS].push(extrudeProfile([[L2 - 0.3, 1.02], [zWs - 0.35, t.roof - 0.1], [zWs - 0.9, t.roof - 0.1], [zWs - 0.9, t.belt]], t.W * 0.97, 0.03));
    parts[PAINT].push(extrudeProfile([[zWs - 0.3, t.roof - 0.12], [zWs - 0.4, t.roof - 0.02], [zWs - 0.95, t.roof - 0.02], [zWs - 0.95, t.roof - 0.12]], t.W * 0.99, 0.02));
  } else {
    const noseY = t.belt - 0.14;
    parts[PAINT].push(extrudeProfile([
      [L2 - 0.06, t.clr + 0.12], [L2 + 0.03, t.clr + 0.42, L2 - 0.04, noseY],
      [L2 - t.hood * 0.45, noseY + 0.12, zWs, t.belt],
      [zRw, t.belt + 0.02],
      [-L2 + 0.05, t.belt + 0.0, -L2, t.belt - 0.2],
      [-L2 + 0.02, t.clr + 0.18], ...underbody(t, -L2 + 0.3, L2 - 0.35, t.clr + 0.02),
    ], t.W, 0.08));
    // abitacolo vetrato (più stretto: fiancate che rientrano verso il tetto)
    parts[GLASS].push(extrudeProfile([
      [zWs + 0.05, t.belt - 0.02], [zWs - t.rake * 0.35, t.roof - 0.05, zRoofF, t.roof - 0.02],
      [zRoofR, t.roof - 0.03], [zRw + 0.05, t.belt + 0.1, zRw - 0.02, t.belt],
    ], t.W * 0.86, 0.06));
    // tetto verniciato e montanti centrali
    parts[PAINT].push(extrudeProfile([[zRoofF + 0.06, t.roof - 0.05], [zRoofF - 0.05, t.roof + 0.03], [zRoofR + 0.08, t.roof + 0.03], [zRoofR - 0.04, t.roof - 0.05]], t.W * 0.86, 0.05));
    const zB = (zRoofF + zRoofR) / 2 + 0.2;
    for (const s of [-1, 1]) parts[TRIM].push(box(0.03, t.roof - t.belt - 0.06, 0.1, s * t.W * 0.435, (t.roof + t.belt) / 2, zB));
  }
  const W2 = t.W / 2;
  // paraurti, calandra, minigonne
  parts[TRIM].push(box(t.W * 0.98, 0.2, 0.14, 0, t.clr + 0.2, L2 - 0.02), box(t.W * 0.98, 0.22, 0.14, 0, t.clr + 0.22, -L2 + 0.02));
  parts[TRIM].push(box(t.W * 0.5, 0.14, 0.06, 0, t.clr + 0.42, L2 + 0.02));
  for (const s of [-1, 1]) parts[TRIM].push(box(0.05, 0.1, t.L * 0.52, s * (W2 + 0.005), t.clr + 0.12, 0));
  // specchietti
  for (const s of [-1, 1]) parts[PAINT].push(box(0.2, 0.1, 0.12, s * (W2 + 0.07), t.belt + 0.06, zWs - 0.15));
  // fari, stop, frecce, targhe
  const hy = t.van ? 0.82 : t.belt - 0.2, ty = t.van ? 1.0 : t.belt - 0.12;
  for (const s of [-1, 1]) {
    parts[HEAD].push(box(0.42, 0.1, 0.06, s * (W2 - 0.3), hy, L2 + 0.0));
    parts[TAIL].push(box(0.36, t.van ? 0.3 : 0.12, 0.06, s * (W2 - 0.24), ty, -L2 - 0.005));
    parts[TURN].push(box(0.1, 0.07, 0.05, s * (W2 - 0.05), hy, L2 - 0.03), box(0.1, t.van ? 0.1 : 0.06, 0.05, s * (W2 - 0.05), ty - 0.1, -L2 - 0.01));
  }
  parts[LIGHTGREY].push(box(0.52, 0.12, 0.02, 0, t.clr + 0.33, L2 + 0.075), box(0.52, 0.12, 0.02, 0, t.clr + 0.4, -L2 - 0.075));
  if (t.van) parts[TRIM].push(box(0.02, t.roof - t.clr - 0.5, 0.02, 0, (t.roof + t.clr) / 2 + 0.1, -L2 - 0.012), box(0.04, 0.2, 0.04, 0.12, 1.15, -L2 - 0.03), box(0.04, 0.2, 0.04, -0.12, 1.15, -L2 - 0.03));   // porte posteriori
  if (t.taxi) {
    parts[HEAD].push(box(0.62, 0.16, 0.26, 0, t.roof + 0.1, -0.35));                       // insegna TAXI
    parts[TRIM].push(box(0.66, 0.03, 0.3, 0, t.roof + 0.02, -0.35));
  }
  const geos = [], groups = [];
  let start = 0;
  parts.forEach((list, mi) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map(tidy), false);
    const count = g.attributes.position.count;
    geos.push(g); groups.push({ start, count, mi }); start += count;
  });
  const merged = mergeGeometries(geos, false);
  merged.clearGroups(); groups.forEach(gr => merged.addGroup(gr.start, gr.count, gr.mi));
  merged.computeBoundingSphere();
  return merged;
}

function wheelGeometry() {
  // pneumatico raggio 1, larghezza 1 (scalato per istanza) + cerchio a 5 razze
  const tire = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false); tire.rotateZ(Math.PI / 2);
  const rimParts = [new THREE.CylinderGeometry(0.66, 0.66, 1.02, 20)];
  rimParts[0].rotateZ(Math.PI / 2);
  for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(1.06, 1.1, 0.16); sp.rotateX(k * Math.PI / 5); rimParts.push(sp); }
  const rim = mergeGeometries(rimParts.map(tidy), false), tg = tidy(tire);
  const g = mergeGeometries([tg, rim], false);
  g.clearGroups(); g.addGroup(0, tg.attributes.position.count, 0); g.addGroup(tg.attributes.position.count, rim.attributes.position.count, 1);
  return g;
}

// Materiali condivisi fra traffico e parcheggi (uniform uTime/uNight comuni)
export function makeCarMaterials(envTex) {
  const shared = { uTime: { value: 0 }, uNight: { value: 0 } };
  const noTint = m => { m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', ''); }; m.customProgramCacheKey = () => 'car-notint-' + m.name; return m; };
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMap: envTex, envMapIntensity: 0.9 });
  const glass = noTint(new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x1b242c, metalness: 0.1, roughness: 0.06, clearcoat: 1, envMap: envTex, envMapIntensity: 1.1 }));
  const trim = noTint(new THREE.MeshStandardMaterial({ name: 'trim', color: 0x121417, roughness: 0.62 }));
  const grey = noTint(new THREE.MeshStandardMaterial({ name: 'grey', color: 0xd8dadb, roughness: 0.4, metalness: 0.2 }));
  const head = noTint(new THREE.MeshStandardMaterial({ name: 'head', color: 0xf2f2ea, emissive: 0xfff4d8, emissiveIntensity: 0.3, roughness: 0.2 }));
  const tail = new THREE.MeshStandardMaterial({ name: 'tail', color: 0x3a0404, emissive: 0xd00000, emissiveIntensity: 1, roughness: 0.3 });
  tail.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = 'attribute float aBrake; varying float vBrake;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBrake = aBrake;');
    sh.fragmentShader = 'uniform float uNight; varying float vBrake;\n' + sh.fragmentShader.replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.22 + uNight * 0.8 + vBrake * 1.5;');
  };
  tail.customProgramCacheKey = () => 'car-tail';
  const turn = new THREE.MeshStandardMaterial({ name: 'turn', color: 0x5a3a08, emissive: 0xff9a1a, emissiveIntensity: 1, roughness: 0.3 });
  turn.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = 'attribute float aTurn; varying float vOn;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOn = aTurn * position.x > 0.0 ? 1.0 : 0.0;');
    sh.fragmentShader = 'uniform float uTime; varying float vOn;\n' + sh.fragmentShader.replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.04 + vOn * step(0.5, fract(uTime * 1.5)) * 3.0;');
  };
  turn.customProgramCacheKey = () => 'car-turn';
  const tire = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xa9aeb3, roughness: 0.3, metalness: 0.85, envMap: envTex });
  return { list: [paint, glass, trim, grey, head, tail, turn], wheel: [tire, rim], shared, head, tail };
}

const TMP = { m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), c: new THREE.Color() };

// Flotta: n auto con tipo assegnato; set(i, x,y,z, heading, pitch, roll, spin, steer, brake, turn)
export class CarFleet {
  constructor(n, mats, { castShadow = true, rng = Math.random, types = null } = {}) {
    this.group = new THREE.Group(); this.mats = mats; this.n = n;
    // tipo e colore per ogni auto (pesi realistici: tante berline e utilitarie)
    const total = CAR_TYPES.reduce((s, t) => s + t.weight, 0);
    this.typeOf = new Int32Array(n); this.slot = new Int32Array(n);
    const counts = CAR_TYPES.map(() => 0);
    for (let i = 0; i < n; i++) {
      let r = rng() * total, k = 0; while (k < CAR_TYPES.length - 1 && r > CAR_TYPES[k].weight) { r -= CAR_TYPES[k].weight; k++; }
      if (types) k = types[i];
      this.typeOf[i] = k; this.slot[i] = counts[k]++;
    }
    this.meshes = CAR_TYPES.map((t, k) => {
      if (!counts[k]) return null;
      const geo = buildCarGeometry(t);
      geo.setAttribute('aBrake', new THREE.InstancedBufferAttribute(new Float32Array(counts[k]), 1));
      geo.setAttribute('aTurn', new THREE.InstancedBufferAttribute(new Float32Array(counts[k]), 1));
      const mesh = new THREE.InstancedMesh(geo, mats.list, counts[k]);
      mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh); return mesh;
    });
    for (let i = 0; i < n; i++) {
      const t = CAR_TYPES[this.typeOf[i]], mesh = this.meshes[this.typeOf[i]];
      mesh.setColorAt(this.slot[i], TMP.c.setHex(t.taxi ? 0xf2f2ee : PALETTE[Math.floor(rng() * PALETTE.length)]));
    }
    this.meshes.forEach(m => m && m.instanceColor && (m.instanceColor.needsUpdate = true));
    this.wheels = new THREE.InstancedMesh(wheelGeometry(), mats.wheel, n * 4);
    this.wheels.castShadow = false; this.wheels.receiveShadow = true; this.wheels.frustumCulled = false;
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.wheels);
  }
  type(i) { return CAR_TYPES[this.typeOf[i]]; }
  set(i, x, y, z, heading, pitch = 0, roll = 0, spin = 0, steer = 0, brake = 0, turn = 0) {
    const t = CAR_TYPES[this.typeOf[i]], mesh = this.meshes[this.typeOf[i]], s = this.slot[i];
    TMP.e.set(pitch, heading, roll, 'YXZ'); TMP.q.setFromEuler(TMP.e);
    TMP.m.compose(TMP.p.set(x, y, z), TMP.q, TMP.s.set(1, 1, 1));
    mesh.setMatrixAt(s, TMP.m);
    mesh.geometry.attributes.aBrake.array[s] = brake; mesh.geometry.attributes.aTurn.array[s] = turn;
    const fz = t.wb / 2, xs = t.track / 2;
    [[xs, fz, true], [-xs, fz, true], [xs, -fz, false], [-xs, -fz, false]].forEach(([wx, wz, front], k) => {
      TMP.e.set(spin, front ? steer : 0, 0, 'YXZ'); TMP.q.setFromEuler(TMP.e);
      TMP.w.compose(TMP.p.set(wx, t.wR, wz), TMP.q, TMP.s.set(0.22, t.wR, t.wR));
      TMP.w.premultiply(TMP.m);
      this.wheels.setMatrixAt(i * 4 + k, TMP.w);
    });
  }
  commit() {
    for (const m of this.meshes) if (m) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aBrake.needsUpdate = true; m.geometry.attributes.aTurn.needsUpdate = true; }
    this.wheels.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.group.removeFromParent();
    for (const m of this.meshes) if (m) m.geometry.dispose();
    this.wheels.geometry.dispose();
  }
}
