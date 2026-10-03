// Modelli glTF delle auto: caricamento dal manifest assets/cars/cars.json,
// preparazione di un "template" (orientamento, vetri, fusione per materiale,
// ruote ri-imperniate al proprio centro) e applicazione a un'istanza di Car.
// File mancante o errore di caricamento: l'auto resta procedurale.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WHEEL_RE = /wheel|tire|tyre|rim|ruota/i, NOT_WHEEL_RE = /steer|spare|arch|well|house|volante/i;
const CALIPER_RE = /brake.?pad|caliper|pinza/i;

let manifestPromise = null;
export function loadManifest() {
  manifestPromise = manifestPromise || fetch(new URL('./assets/cars/cars.json', import.meta.url))
    .then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifestPromise;
}

const templates = {};
export function loadVehicleModel(id) {
  if (!templates[id]) {
    templates[id] = loadManifest().then(m => {
      const entry = m[id];
      if (!entry || !entry.file) return null;
      const url = new URL(`./assets/cars/${entry.file}`, import.meta.url).href;
      return new GLTFLoader().loadAsync(url).then(g => prepareTemplate(g.scene, entry))
        .catch(err => { console.warn(`Modello ${id} non caricato:`, err.message || err); return null; });
    });
  }
  return templates[id];
}

// Vetri con "transmission" costringono three.js a un secondo render della scena:
// qui diventano vetro trasparente classico, molto più economico.
function simplifyMaterial(m) {
  if (m.transmission > 0) {
    m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.32);
    m.roughness = Math.min(m.roughness, 0.08); m.metalness = 0; m.depthWrite = false;
    if (m.color) m.color.multiplyScalar(0.55);
  }
  m.needsUpdate = true;
}

function topMatches(root, test) {
  const out = [];
  const walk = (o, inside) => { const hit = !inside && test(o); if (hit) out.push(o); o.children.forEach(c => walk(c, inside || hit)); };
  walk(root, false);
  return out;
}

// Geometrie di un sottoalbero cotte nello spazio della radice, raggruppate per materiale
function bakeByMaterial(nodes, root, exclude) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map();
  for (const node of nodes) node.traverse(o => {
    if (!o.isMesh || exclude(o)) return;
    const mats = [].concat(o.material), geo = o.geometry;
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const parts = Array.isArray(o.material) && geo.groups.length ? geo.groups.map(gr => ({ mat: mats[gr.materialIndex], range: gr })) : [{ mat: mats[0], range: null }];
    for (const { mat, range } of parts) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (range) { const s = geo.index ? range.start : range.start, c = range.count; g = sliceNonIndexed(g, s, c); }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'uv1', 'color', 'tangent'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(mtx);
      const key = mat.uuid + '|' + Object.keys(g.attributes).sort().join(',');
      if (!groups.has(key)) groups.set(key, { mat, geos: [] });
      groups.get(key).geos.push(g);
    }
  });
  return groups;
}
function sliceNonIndexed(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize, a.normalized));
  return out;
}
function meshesFromGroups(groups) {
  const list = [];
  for (const { mat, geos } of groups.values()) {
    let merged = null;
    try { merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); } catch (e) { merged = null; }
    const all = merged ? [merged] : geos;
    for (const g of all) {
      g.userData.sharedTemplate = true;               // non va eliminata con la singola auto
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; list.push(mesh);
    }
  }
  return list;
}

// Angolo (rotazione attorno a y) che porta la ruota ad avere l'assale lungo x:
// è quello con la minima estensione in x. Ricerca a passi di 0.5° fra ±45°.
export function restSteer(meshes) {
  const pts = [];
  for (const m of meshes) { const p = m.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 3000)); for (let i = 0; i < p.count; i += step) pts.push(p.getX(i), p.getZ(i)); }
  let best = 0, bw = Infinity;
  for (let d = -45; d <= 45; d += 0.5) {
    const a = d * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { const x = pts[i] * ca + pts[i + 1] * sa; if (x < mn) mn = x; if (x > mx) mx = x; }
    if (mx - mn < bw - 1e-6) { bw = mx - mn; best = a; }
  }
  return best;
}

// Orientamento automatico (manifest senza rotX/yaw): verticale su y, lunghezza su z,
// muso verso +z (dove stanno i fari / la calandra).
function autoOrient(scene, root) {
  const size = () => { root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()); };
  let s = size();
  if (s.y > Math.max(s.x, s.z) * 1.05) { scene.rotation.x = -Math.PI / 2; s = size(); }        // modello Z-up
  if (s.x > s.z) { scene.rotation.y += Math.PI / 2; s = size(); }
  const box = new THREE.Box3().setFromObject(root, true), c = box.getCenter(new THREE.Vector3());
  let front = 0, n = 0;
  scene.traverse(o => {
    if (!o.isMesh) return;
    const names = (o.name || '') + ' ' + [].concat(o.material).map(m => m.name).join(' ');
    const sign = /head.?light|headlamp|front|grill|faro|anterior/i.test(names) ? 1 : /tail.?light|brake.?light|rear|posterior|exhaust|scarico/i.test(names) ? -1 : 0;
    if (!sign) return;
    const b = new THREE.Box3().setFromObject(o, true); front += sign * Math.sign(b.getCenter(new THREE.Vector3()).z - c.z); n++;
  });
  if (n && front < 0) scene.rotation.y += Math.PI;
  root.updateMatrixWorld(true);
}

export function prepareTemplate(scene, entry) {
  const root = new THREE.Group(); root.add(scene);
  if (entry.rotX === undefined && entry.yaw === undefined) autoOrient(scene, root);
  else scene.rotation.set(THREE.MathUtils.degToRad(entry.rotX || 0), THREE.MathUtils.degToRad(entry.yaw || 0), 0, 'YXZ');
  root.updateMatrixWorld(true);
  scene.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(simplifyMaterial); });

  // riquadri PRECISI (vertici veri): quelli approssimati gonfiano le mesh ruotate,
  // sollevando l'auto e spostando il perno delle ruote
  const box = new THREE.Box3().setFromObject(root, true), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const wheelRe = entry.wheels ? new RegExp(entry.wheels, 'i') : WHEEL_RE;
  const wheelNodes = topMatches(scene, o => wheelRe.test(o.name || '') && !NOT_WHEEL_RE.test(o.name || ''));
  const isCaliper = o => CALIPER_RE.test(o.name || '') || CALIPER_RE.test(o.parent?.name || '');

  // ruote raggruppate per quadrante rispetto al centro dell'auto
  const quads = new Map();
  for (const n of wheelNodes) {
    const b = new THREE.Box3().setFromObject(n, true); if (b.isEmpty()) continue;
    const c = b.getCenter(new THREE.Vector3());
    const key = (c.x < center.x ? 'L' : 'R') + (c.z > center.z ? 'F' : 'B');
    if (!quads.has(key)) quads.set(key, { nodes: [] });
    quads.get(key).nodes.push(n);
  }
  const wheels = [];
  if (quads.size === 4) {
    for (const [key, q] of quads) {
      // parti che girano (cerchio, gomma, disco) cotte in coordinate della radice:
      // il loro riquadro esatto dà asse di rotazione e raggio reali
      const spinMeshes = meshesFromGroups(bakeByMaterial(q.nodes, root, isCaliper));
      const wb = new THREE.Box3();
      spinMeshes.forEach(m => { m.geometry.computeBoundingBox(); wb.union(m.geometry.boundingBox); });
      const c = wb.getCenter(new THREE.Vector3()), sz = wb.getSize(new THREE.Vector3());
      const toCenter = m => { m.geometry.translate(-c.x, -c.y, -c.z); return m; };
      const spin = new THREE.Group(), fixed = new THREE.Group();
      spinMeshes.forEach(m => spin.add(toCenter(m)));
      const calipers = [];
      q.nodes.forEach(n => n.traverse(o => { if (o.isMesh && isCaliper(o)) calipers.push(o); }));
      if (calipers.length) meshesFromGroups(bakeByMaterial(calipers, root, () => false)).forEach(m => fixed.add(toCenter(m)));
      // molti modelli "da vetrina" hanno le ruote anteriori già sterzate: si raddrizzano
      // cercando l'angolo che rende la ruota più stretta lungo l'assale (asse x)
      const yaw = restSteer(spinMeshes);
      if (Math.abs(yaw) > 0.005) [...spin.children, ...fixed.children].forEach(m => m.geometry.rotateY(yaw));
      const ab = new THREE.Box3(); spinMeshes.forEach(m => { m.geometry.computeBoundingBox(); ab.union(m.geometry.boundingBox); });
      const asz = ab.getSize(new THREE.Vector3());
      wheels.push({ key, center: c, front: key[1] === 'F', radius: Math.max(asz.y, asz.z) / 2, width: asz.x, restYaw: yaw, spin, fixed });
    }
  }
  const isWheelPart = o => { for (let p = o; p; p = p.parent) if (wheels.length && wheelNodes.includes(p)) return true; return false; };
  const body = new THREE.Group();
  meshesFromGroups(bakeByMaterial([scene], root, isWheelPart)).forEach(m => body.add(m));
  return { entry, body, wheels, size, center, minY: box.min.y };
}

// Applica il template alla Car: nasconde carrozzeria e ruote procedurali.
export function applyVehicleModel(car, tpl, { envTex } = {}) {
  const b = car.cfg.body, s = b.l / tpl.size.z;
  const model = new THREE.Group(); model.name = 'vehicleModel'; model.scale.setScalar(s);
  model.position.set(-tpl.center.x * s, -tpl.minY * s, -tpl.center.z * s);
  const matMap = new Map(), cloneMat = m => { if (!matMap.has(m)) matMap.set(m, m.clone()); return matMap.get(m); };
  const body = tpl.body.clone(); body.traverse(o => { if (o.isMesh) o.material = cloneMat(o.material); });
  model.add(body);

  car.chassis.children.forEach(c => { if (!c.isLight && c.type !== 'Object3D') c.visible = false; });
  car.chassis.add(model);
  if (car.wheels) car.wheels.forEach(w => { if (w.parent) w.parent.visible = false; });

  if (tpl.wheels.length === 4) {
    car.wheels = []; car.frontPivots = [];
    for (const w of tpl.wheels) {
      const holder = new THREE.Group(); holder.scale.setScalar(s);
      holder.position.set((w.center.x - tpl.center.x) * s, (w.center.y - tpl.minY) * s, (w.center.z - tpl.center.z) * s);
      const spin = w.spin.clone(), fixed = w.fixed.clone();
      [spin, fixed].forEach(g => g.traverse(o => { if (o.isMesh) o.material = cloneMat(o.material); }));
      holder.add(spin, fixed); car.group.add(holder);
      car.wheels.push(spin); if (w.front) car.frontPivots.push(holder);
    }
    car.wheelSpinR = tpl.wheels[0].radius * s;
    const zf = tpl.wheels.filter(w => w.front).map(w => w.center.z), zr = tpl.wheels.filter(w => !w.front).map(w => w.center.z);
    car.wheelBaseVis = (zf.reduce((a, c) => a + c, 0) / zf.length - zr.reduce((a, c) => a + c, 0) / zr.length) * s;
    car.modelWheels = true;
  } else car.modelWheels = false;

  // luci: gli stop del modello seguono la frenata, i fari l'ambiente
  for (const m of matMap.values()) {
    const n = m.name || '';
    if (/brake.?light|tail.?light|stop/i.test(n)) car.tailMat = m;
    else if (/head.?light|faro/i.test(n)) car.headMat = m;
    else if (m.isMeshStandardMaterial) {
      if (envTex) m.envMap = envTex;
      m.userData.baseEnv = m.envMapIntensity || 1;
      car.envMats.push(m);
    }
    if (tpl.entry.tint && tpl.entry.paint && new RegExp(tpl.entry.paint, 'i').test(n)) m.color.setHex(b.color);
  }
  car.model = model;
  return model;
}
