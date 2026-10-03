// Fumo delle gomme, polvere e spruzzi d'acqua come sbuffi "volumetrici" finti.
// Ogni sbuffo è un pannello rivolto alla camera con una texture a cavolfiore
// (densità + normali cotte a runtime da una pila di sfere morbide), illuminato
// dalle luci della scena come una nuvola: lato al sole chiaro, lato in ombra
// azzurrato dal cielo, bordi sottili che brillano in controluce, ombre ricevute.
// Tutti gli sbuffi in una sola draw call, ordinati dal più lontano; si
// dissolvono morbidi dove toccano l'asfalto e vicino alla camera.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const SMOKE_LAYER = 1;

const CELL = 256, GRID = 2, VARIANTS = GRID * GRID;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// rumore a valori su reticolo 64×64 periodico, somma di ottave (fBm) in [0,1]
function makeFbm(rand) {
  const N = 64, L = new Float32Array(N * N);
  for (let i = 0; i < L.length; i++) L[i] = rand();
  const at = (x, y) => L[(y & (N - 1)) * N + (x & (N - 1))];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) => { let s = 0, amp = 0.5, n = 0; for (let o = 0; o < 5; o++) { s += noise(x, y) * amp; n += amp; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; amp *= 0.5; } return s / n; };
}

// Una variante di sbuffo. Densità = profilo gaussiano deformato da fBm (contorno
// irregolare che sfuma in filamenti) × lobi morbidi × turbolenza interna (zone più
// dense e più rade). Quota per le normali = somma di calotte lisce (volute a
// cavolfiore) + la densità stessa: rilievo dolce, niente contorni a stampo.
// Scrive RGB = normale, A = densità.
function bakeVariant(out, ox, oy, W, rand) {
  const S = CELL, C = new Float32Array(S * S), A = new Float32Array(S * S), H = new Float32Array(S * S);
  const px = 2 / S, n = 26 + Math.floor(rand() * 12);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 0.55;
    const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr * 0.9;
    const r = (0.16 + rand() * 0.22) * (1.25 - rr);
    const x0 = Math.max(0, Math.floor(((cx - r) / 2 + 0.5) * S)), x1 = Math.min(S - 1, Math.ceil(((cx + r) / 2 + 0.5) * S));
    const y0 = Math.max(0, Math.floor(((cy - r) / 2 + 0.5) * S)), y1 = Math.min(S - 1, Math.ceil(((cy + r) / 2 + 0.5) * S));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5) * px - 1, v = (y + 0.5) * px - 1;
      const d2 = ((u - cx) ** 2 + (v - cy) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const q = 1 - d2;
      C[y * S + x] += q * q;                                              // derivata nulla sul bordo: niente spigoli
    }
  }
  const fbm = makeFbm(rand), o1 = rand() * 40, o2 = rand() * 40, o3 = rand() * 40;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, u = (x + 0.5) * px - 1, v = (y + 0.5) * px - 1;
    const wx = u + (fbm(u * 1.7 + o1, v * 1.7) - 0.5) * 0.6, wy = v + (fbm(u * 1.7, v * 1.7 + o2) - 0.5) * 0.6;
    const base = Math.exp(-((wx * wx + wy * wy) / 0.3));
    const lobes = 1 - Math.exp(-1.8 * C[k]);
    const turb = fbm(u * 3.6 + o3, v * 3.6 + o3);
    const d = base * (0.3 + 0.7 * lobes) * (0.45 + 1.0 * turb) * smooth(0.96, 0.62, Math.hypot(u, v));
    A[k] = Math.pow(clamp(d * 1.35, 0, 1), 1.15);
    H[k] = 0.12 * C[k] + 0.3 * A[k] + 0.025 * turb;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, a = A[k];
    const xl = Math.max(0, x - 1), xr = Math.min(S - 1, x + 1), yd = Math.max(0, y - 1), yu = Math.min(S - 1, y + 1);
    let nx = -(H[y * S + xr] - H[y * S + xl]) / ((xr - xl) * px), ny = -(H[yu * S + x] - H[yd * S + x]) / ((yu - yd) * px), nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const o = ((oy + y) * W + ox + x) * 4;
    out[o] = Math.round((nx / l * 0.5 + 0.5) * 255); out[o + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    out[o + 2] = Math.round((nz / l * 0.5 + 0.5) * 255); out[o + 3] = Math.round(a * 255);
  }
}

export function makePuffAtlas(seed = 7) {
  const W = CELL * GRID, data = new Uint8Array(W * W * 4), rand = mulberry(seed);
  for (let i = 0; i < VARIANTS; i++) bakeVariant(data, (i % GRID) * CELL, Math.floor(i / GRID) * CELL, W, rand);
  const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

const VERT_HEAD = /* glsl */`
attribute vec4 iPS; attribute vec4 iCA; attribute vec3 iRCG;
varying vec2 vPuffUv; varying vec2 vRot; varying vec4 vPuff; varying vec2 vGround; varying vec3 vPuffW;
`;
const VERT_BODY = /* glsl */`
vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
float cr = cos(iRCG.x), sr = sin(iRCG.x);
vec2 q = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
vec3 transformed = iPS.xyz + (camR * q.x + camU * q.y) * iPS.w;
vPuffUv = (uv + vec2(mod(iRCG.y, 2.0), floor(iRCG.y * 0.5))) * 0.5;
vRot = vec2(cr, sr);
vPuff = iCA;
vGround = vec2(transformed.y - iRCG.z, iPS.w);
vPuffW = transformed;
`;
const FRAG_HEAD = /* glsl */`
uniform float uScatter, uLift;
uniform mat4 uOcc; uniform vec3 uOccHalf; uniform vec3 uTailPos; uniform vec3 uTailCol;
uniform sampler2D uDepth; uniform vec2 uScreen; uniform float uSoft, uNear, uFar;
varying vec2 vPuffUv; varying vec2 vRot; varying vec4 vPuff; varying vec2 vGround; varying vec3 vPuffW;
`;

function puffMaterial(atlas, uniforms) {
  const mat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader
      .replace('#include <begin_vertex>', VERT_BODY)
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        vec4 puffTex = texture2D(map, vPuffUv);
        diffuseColor.rgb *= vPuff.rgb;
        float puffA = puffTex.a * vPuff.a;
        puffA *= smoothstep(0.6, 3.6, vViewPosition.z);                // niente muro bianco sull'obiettivo
        if (uSoft > 0.5) {
          // particelle morbide (e test di profondità manuale): lo sbuffo svanisce dove si
          // avvicina ad asfalto, auto, muri e sparisce dietro di loro
          float sceneD = texture2D(uDepth, gl_FragCoord.xy / uScreen).x;
          float sceneZ = uNear * uFar / ((uFar - uNear) * sceneD - uFar);
          puffA *= smoothstep(0.0, 0.3 + 0.15 * vGround.y, -sceneZ - vViewPosition.z);
        } else {
          // senza profondità (mobile, qualità prestazioni): appoggio morbido sull'asfalto e
          // distanza con segno dal box della scocca, niente spigoli netti su strada e carrozzeria
          puffA *= smoothstep(0.0, 0.15 + 0.12 * vGround.y, vGround.x);
          vec3 occQ = abs((uOcc * vec4(vPuffW, 1.0)).xyz) - uOccHalf;
          float occD = length(max(occQ, 0.0)) + min(max(occQ.x, max(occQ.y, occQ.z)), 0.0);
          puffA *= smoothstep(-0.05, 0.5, occD);
        }
        if (puffA < 0.006) discard;                                     // prima dell'illuminazione: meno costo di riempimento
        diffuseColor.a *= puffA;`)
      .replace('#include <normal_fragment_begin>', /* glsl */`
        float faceDirection = 1.0;
        vec3 tn = puffTex.xyz * 2.0 - 1.0;
        // normale cotta ruotata con lo sbuffo; +z verso la camera ammorbidisce il terminatore (luce diffusa nel fumo)
        vec3 normal = normalize(vec3(tn.x * vRot.x - tn.y * vRot.y, tn.x * vRot.y + tn.y * vRot.x, tn.z + 0.45));
        #if NUM_DIR_LIGHTS > 0
          // traslucenza: la luce attraversa il fumo, anche il lato opposto al sole resta chiaro
          normal = normalize(normal + directionalLights[0].direction * 0.65);
        #endif
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <opaque_fragment>', /* glsl */`
        #if NUM_DIR_LIGHTS > 0
          // diffusione in avanti: guardando verso il sole i bordi sottili si accendono
          float fwd = pow(max(dot(normalize(vViewPosition), -directionalLights[0].direction), 0.0), 5.0);
          outgoingLight += diffuseColor.rgb * directionalLights[0].color * fwd * uScatter * (1.25 - puffTex.a);
        #endif
        #if NUM_HEMI_LIGHTS > 0
          // diffusione multipla dentro la nuvola: anche all'ombra il fumo resta chiaro
          outgoingLight += diffuseColor.rgb * hemisphereLights[0].skyColor * 0.12;
        #endif
        outgoingLight += diffuseColor.rgb * uLift;
        // fanali posteriori che si accendono nel fumo (freno, notte)
        vec3 tailD = vPuffW - uTailPos;
        outgoingLight += diffuseColor.rgb * uTailCol / (1.0 + dot(tailD, tailD) * 2.2);
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'tire-smoke-v8';
  return mat;
}

// tipi di sbuffo: vita [s], dimensione iniziale/finale [m], densità, galleggiamento [m/s²], resistenza dell'aria [1/s]
const KINDS = {
  tyre:  { col: new THREE.Color(0xf0f1f2), life: [3.2, 5.8], s0: [0.6, 1.1], s1: [3.0, 6.6], tau: 0.85, a0: [0.55, 0.9], buoy: 0.26, drag: 1.5, kick: 0.22, up: [0.2, 1.3] },
  dust:  { col: new THREE.Color(0xa08667), life: [2.2, 4.0], s0: [0.7, 1.1],  s1: [4.0, 7.5], tau: 0.8, a0: [0.35, 0.7], buoy: -0.05, drag: 2.1, kick: 0.3, up: [0.5, 1.5] },
  spray: { col: new THREE.Color(0xd3d9df), life: [0.8, 1.5], s0: [0.35, 0.5], s1: [2.0, 3.0], tau: 0.45, a0: [0.12, 0.3], buoy: -0.25, drag: 2.8, kick: 0.1, up: [0.8, 1.8] },
};
// per ruota: sbuffi al secondo a intensità piena
const RATE = { tyre: 26, dust: 12, spray: 10 };
const STRIDE = 22;                         // x y z vx vy vz age life s0 s1 tau rot rotV a0 r g b cell ground buoy drag seed

export class TireSmoke {
  constructor(scene, { max = 520, rateScale = 1, layer = 0 } = {}) {
    this.max = max; this.rateScale = rateScale; this.n = 0; this.time = 0;
    this.P = new Float32Array(max * STRIDE);
    this.wind = new THREE.Vector3(0.8, 0, 0.45);
    this.uniforms = { uScatter: { value: 0.3 }, uLift: { value: 0 },
      uOcc: { value: new THREE.Matrix4() }, uOccHalf: { value: new THREE.Vector3(-1, -1, -1) },     // box vuoto: nessun effetto
      uTailPos: { value: new THREE.Vector3() }, uTailCol: { value: new THREE.Color(0, 0, 0) },
      uDepth: { value: null }, uScreen: { value: new THREE.Vector2(1, 1) }, uSoft: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 1000 } };
    this.focusCar = null; this.tailGlow = 0;                   // auto del giocatore: box soft e fanali
    this.atlas = makePuffAtlas();
    const plane = new THREE.PlaneGeometry(1, 1), geo = this.geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, plane.attributes[k]);
    this.aPS = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRCG = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPS', this.aPS); geo.setAttribute('iCA', this.aCA); geo.setAttribute('iRCG', this.aRCG);
    geo.instanceCount = 0;
    this.order = new Uint16Array(max); this.depth = new Float32Array(max);
    const mesh = this.mesh = new THREE.Mesh(geo, puffMaterial(this.atlas, this.uniforms));
    mesh.name = 'tire-smoke'; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.renderOrder = 2; mesh.visible = false;               // dopo vetri e acqua
    mesh.layers.set(layer);                                   // layer ≠ 0: disegnato da SmokePass
    scene.add(mesh);
    this.wheelState = new WeakMap();
    this._f = new THREE.Vector3(); this._t = new THREE.Matrix4();
  }

  get count() { return this.n; }
  clear() { this.n = 0; this.geo.instanceCount = 0; this.mesh.visible = false; this.wheelState = new WeakMap(); }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mesh.material.dispose(); this.atlas.dispose(); }

  // uno sbuffo; intensity 0..1 scala densità e dimensione, age anticipa la nascita (emissione tra due frame)
  spawn(kind, x, y, z, vx, vy, vz, intensity = 1, ground = y, age = 0) {
    const K = KINDS[kind], P = this.P, r = Math.random, I = clamp(intensity, 0, 1);
    let i = this.n;
    if (i >= this.max) {                                        // pieno: ricicla lo sbuffo più vecchio
      let best = 0, bv = -1;
      for (let j = 0; j < this.n; j++) { const v = P[j * STRIDE + 6] / P[j * STRIDE + 7]; if (v > bv) { bv = v; best = j; } }
      i = best;
    } else this.n++;
    const lerp = (a, t) => a[0] + (a[1] - a[0]) * t;
    const o = i * STRIDE, tint = 0.94 + r() * 0.1;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = vx; P[o + 4] = vy; P[o + 5] = vz;
    P[o + 6] = age; P[o + 7] = lerp(K.life, I * 0.7 + r() * 0.3);
    P[o + 8] = lerp(K.s0, I * 0.6 + r() * 0.4); P[o + 9] = lerp(K.s1, I * 0.65 + r() * 0.35); P[o + 10] = K.tau * (0.8 + r() * 0.4);
    P[o + 11] = r() * Math.PI * 2; P[o + 12] = (r() - 0.5) * 0.8;
    P[o + 13] = lerp(K.a0, I * 0.75 + r() * 0.25);
    P[o + 14] = K.col.r * tint; P[o + 15] = K.col.g * tint; P[o + 16] = K.col.b * tint;
    P[o + 17] = Math.floor(r() * VARIANTS); P[o + 18] = ground; P[o + 19] = K.buoy * (0.4 + r() * 1.3); P[o + 20] = K.drag * (0.8 + r() * 0.4); P[o + 21] = r() * 100;
    return i;
  }

  // Emissione dalle 4 ruote di una Car con dinamica: fumo dove il battistrada striscia
  // sull'asfalto (derapata, burnout, bloccaggio), polvere su sterrato/sabbia, spruzzi sul bagnato.
  emitFromCar(car, world, dt, { rain = false } = {}) {
    const dyn = car.dyn; if (!dyn || !dyn.wheels) return;
    let st = this.wheelState.get(car);
    if (!st) { st = dyn.wheels.map(() => ({ acc: 0, x: NaN, z: NaN })); this.wheelState.set(car, st); }
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), Lx = fz, Lz = -fx;
    const speed = Math.hypot(car.vel.x, car.vel.z), vLong = car.vel.x * fx + car.vel.z * fz;
    const wLoad = dyn.p.m * 9.81 / 4, r = Math.random;
    dyn.wheels.forEach((w, i) => {
      const s = st[i];
      // il fumo esce dietro al battistrada rispetto al verso di rotazione
      const back = -0.28 * Math.sign(w.omega || vLong || 1);
      const x = car.pos.x + Lx * w.l + fx * (w.d + back), z = car.pos.z + Lz * w.l + fz * (w.d + back);
      const load = car.contact === false ? 0 : clamp(w.fz / wLoad, 0, 1.4);
      const surf = world.surface(x, z), slide = w.slide || 0;
      const kinds = [];
      if (surf.dust) kinds.push(['dust', clamp(clamp((speed - 4) / 22, 0, 1) * 0.7 + clamp((slide - 2) / 8, 0, 1), 0, 1) * Math.min(1, load + 0.2)]);
      else {
        const I = clamp((slide - 3) / 8, 0, 1) * Math.min(1, load);
        if (I > 0) kinds.push(['tyre', rain ? I * 0.35 : I]);
        if (rain) kinds.push(['spray', clamp((speed - 9) / 28, 0, 1) * (w.front ? 0.6 : 1)]);
      }
      const px = Number.isFinite(s.x) ? s.x : x, pz = Number.isFinite(s.z) ? s.z : z;
      s.x = x; s.z = z;
      for (const [kind, I] of kinds) {
        if (I <= 0.01) continue;
        const K = KINDS[kind];
        s.acc += RATE[kind] * this.rateScale * (0.35 + 0.65 * I) * dt;
        const n = Math.floor(s.acc); s.acc -= n;
        // spinta del battistrada: indietro quanto la ruota gira più veloce della strada
        const spinKick = clamp(w.omega * w.R - vLong, -12, 12) * K.kick;
        for (let k = 0; k < n; k++) {
          const t = (k + r()) / n, ex = px + (x - px) * t, ez = pz + (z - pz) * t, gy = world.height(ex, ez);
          const up = K.up[0] + (K.up[1] - K.up[0]) * r();
          this.spawn(kind, ex + (r() - 0.5) * 0.3, gy + 0.22 + r() * 0.12, ez + (r() - 0.5) * 0.3,
            car.vel.x * 0.32 - fx * spinKick + (r() - 0.5) * 1.4, up, car.vel.z * 0.32 - fz * spinKick + (r() - 0.5) * 1.4,
            I, gy, dt * (1 - t));
        }
      }
      if (!kinds.length) s.acc = 0;
    });
  }

  // box della scocca (spazio locale dell'auto, origine a terra) e posizione dei fanali posteriori
  _syncFocus() {
    const c = this.focusCar, U = this.uniforms;
    if (!c || !c.group || !c.cfg) { U.uOccHalf.value.set(-1, -1, -1); U.uTailCol.value.setRGB(0, 0, 0); return; }
    const b = c.cfg.body, h = (b.clearance || 0.25) + b.h + (b.cab ? b.cab[1] : 0.1);
    c.group.updateMatrixWorld();
    U.uOcc.value.copy(c.group.matrixWorld).invert().premultiply(this._t.makeTranslation(0, -h / 2, 0));
    U.uOccHalf.value.set(b.w / 2 - 0.14, h / 2, b.l / 2 - 0.05);  // ruote ai bordi del box: il fumo sul fianco della gomma resta
    U.uTailPos.value.set(0, (b.clearance || 0.25) + b.h * 0.7, -b.l / 2 - 0.4).applyMatrix4(c.group.matrixWorld);
    const k = this.tailGlow * (c.braking ? 2.6 : 1);
    U.uTailCol.value.setRGB(0.9 * k, 0.03 * k, 0.02 * k);
  }

  update(dt, camera) {
    this.time += dt;
    this._syncFocus();
    const P = this.P, T = this.time, wx = this.wind.x, wy = this.wind.y, wz = this.wind.z;
    for (let i = 0; i < this.n; i++) {
      const o = i * STRIDE;
      const age = (P[o + 6] += dt);
      if (age >= P[o + 7]) {                                    // morto: sposta qui l'ultimo
        const last = (--this.n) * STRIDE;
        if (last !== o) P.copyWithin(o, last, last + STRIDE);
        i--; continue;
      }
      // l'aria frena lo sbuffo verso il vento; il calore lo solleva; vortici lenti lo deformano
      const k = Math.exp(-P[o + 20] * dt), sd = P[o + 21];
      P[o + 3] = wx + (P[o + 3] - wx) * k; P[o + 5] = wz + (P[o + 5] - wz) * k;
      P[o + 4] = wy + (P[o + 4] - wy) * k + P[o + 19] * dt * Math.exp(-age * 0.35);
      P[o + 3] += (Math.sin(P[o + 2] * 0.31 + T * 0.7 + sd) * 0.55 + Math.sin(P[o + 1] * 0.9 + T * 1.3 + sd) * 0.3) * dt;
      P[o + 5] += (Math.cos(P[o] * 0.29 - T * 0.6 + sd) * 0.55 + Math.cos(P[o + 1] * 0.8 - T * 1.1 + sd) * 0.3) * dt;
      P[o + 4] += Math.sin(P[o] * 0.23 + P[o + 2] * 0.27 + T * 0.5 + sd) * 0.12 * dt;
      P[o] += P[o + 3] * dt; P[o + 1] += P[o + 4] * dt; P[o + 2] += P[o + 5] * dt;
      const size = P[o + 8] + (P[o + 9] - P[o + 8]) * (1 - Math.exp(-age / P[o + 10])) + age * 0.1;
      const floor = P[o + 18] + (0.2 + (P[o + 21] % 1) * 0.2) * size;   // la nuvola poggia sull'asfalto, non ci affonda
      if (P[o + 1] < floor) { P[o + 1] = floor; if (P[o + 4] < 0) P[o + 4] = 0; }
      P[o + 11] += P[o + 12] * dt * Math.exp(-age * 0.4);
    }
    const n = this.n;
    this.geo.instanceCount = n; this.mesh.visible = n > 0;
    if (!n) return;
    // ordinamento dal più lontano (fusione alfa corretta tra sbuffi)
    const f = camera.getWorldDirection(this._f), cp = camera.position, ord = this.order.subarray(0, n), dep = this.depth;
    for (let i = 0; i < n; i++) { const o = i * STRIDE; ord[i] = i; dep[i] = (P[o] - cp.x) * f.x + (P[o + 1] - cp.y) * f.y + (P[o + 2] - cp.z) * f.z; }
    ord.sort((a, b) => dep[b] - dep[a]);
    const PS = this.aPS.array, CA = this.aCA.array, RCG = this.aRCG.array;
    for (let j = 0; j < n; j++) {
      const o = ord[j] * STRIDE, age = P[o + 6], life = P[o + 7];
      const size = P[o + 8] + (P[o + 9] - P[o + 8]) * (1 - Math.exp(-age / P[o + 10])) + age * 0.1;
      // entra in fretta, si dirada mentre si espande, svanisce lento
      const alpha = P[o + 13] * smooth(0, 0.14, age) * (1 - smooth(0.3, 1, age / life)) * Math.pow(P[o + 8] / size, 0.3);
      PS[j * 4] = P[o]; PS[j * 4 + 1] = P[o + 1]; PS[j * 4 + 2] = P[o + 2]; PS[j * 4 + 3] = size;
      CA[j * 4] = P[o + 14]; CA[j * 4 + 1] = P[o + 15]; CA[j * 4 + 2] = P[o + 16]; CA[j * 4 + 3] = alpha;
      RCG[j * 3] = P[o + 11]; RCG[j * 3 + 1] = P[o + 17]; RCG[j * 3 + 2] = P[o + 18];
    }
    for (const a of [this.aPS, this.aCA, this.aRCG]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}

// Pass del compositore (desktop): il fumo viene disegnato a metà risoluzione in un buffer
// a parte (¼ dei frammenti: sbuffi grandi e sovrapposti costano soprattutto riempimento),
// con test di profondità e sfumatura morbida letti dalla depth del RenderPass, poi composto
// (alfa premoltiplicato) sopra l'immagine già completa di AO: l'occlusione ambientale non
// "stampa" più le sagome attraverso la nuvola.
export class SmokePass extends Pass {
  constructor(smoke, scene, camera, { depth = () => null, scale = 0.5 } = {}) {
    super();
    this.smoke = smoke; this.scene = scene; this.camera = camera; this.depth = depth; this.scale = scale;
    this.needsSwap = false; this._scan = 0; this._clear = new THREE.Color();
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tSmoke: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tSmoke; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSmoke, vUv); }',
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) { this.rt.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale))); }
  dispose() { this.rt.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
  render(renderer, writeBuffer, readBuffer) {
    if (!this.smoke.mesh.visible) return;
    const { scene, camera } = this, U = this.smoke.uniforms, mat = this.smoke.mesh.material, d = this.depth();
    U.uSoft.value = d ? 1 : 0; U.uDepth.value = d; U.uNear.value = camera.near; U.uFar.value = camera.far;
    U.uScreen.value.set(this.rt.width, this.rt.height);
    mat.depthTest = !d;                                   // con la depth texture il test lo fa lo shader
    // le luci filtrano per layer come le mesh: sole, cielo e lampeggianti (nascono dopo) anche sul layer
    // del fumo; i fari no — puntano avanti, il fumo resta dietro, e costano per ogni frammento
    if (this._scan-- <= 0) { scene.traverse(o => { if (o.isLight && !o.isSpotLight) o.layers.enable(SMOKE_LAYER); }); this._scan = 30; }
    const autoClear = renderer.autoClear, autoShadow = renderer.shadowMap.autoUpdate, mask = camera.layers.mask;
    const bg = scene.background, autoMatrix = scene.matrixWorldAutoUpdate, clearA = renderer.getClearAlpha();
    renderer.getClearColor(this._clear);
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;          // ombre già calcolate in questo frame
    scene.background = null; scene.matrixWorldAutoUpdate = false; camera.layers.set(SMOKE_LAYER);
    if (d) {
      renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
      renderer.render(scene, camera);
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      this.quad.render(renderer);
    } else {                                              // senza depth: piena risoluzione, test sul buffer condiviso
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      renderer.render(scene, camera);
    }
    camera.layers.mask = mask; scene.background = bg; scene.matrixWorldAutoUpdate = autoMatrix;
    renderer.setClearColor(this._clear, clearA); renderer.shadowMap.autoUpdate = autoShadow; renderer.autoClear = autoClear;
  }
}
