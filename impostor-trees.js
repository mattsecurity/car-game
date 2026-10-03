// Alberi fotogrammetrici come impostori: ogni albero è un pannello verticale che
// guarda la camera e mostra la "foto" (tra 12 viste cotte offline) più vicina
// all'angolo di osservazione, illuminata con le sue normali. Una draw call per specie.
import * as THREE from 'three';
import { SHARED_TEXTURES } from './pbr-textures.js';

const species = {};
export function loadSpecies(name, { anisotropy = 4 } = {}) {
  if (!species[name]) {
    species[name] = (async () => {
      const meta = await fetch(new URL(`./assets/trees/${name}.json`, import.meta.url)).then(r => (r.ok ? r.json() : null));
      if (!meta) return null;
      const loader = new THREE.TextureLoader();
      const [color, normal] = await Promise.all([
        loader.loadAsync(new URL(`./assets/trees/${name}-color.png`, import.meta.url).href),
        loader.loadAsync(new URL(`./assets/trees/${name}-normal.png`, import.meta.url).href),
      ]);
      color.colorSpace = THREE.SRGBColorSpace; normal.colorSpace = THREE.NoColorSpace;
      for (const t of [color, normal]) { t.anisotropy = anisotropy; t.generateMipmaps = true; SHARED_TEXTURES.add(t); }
      return { meta, color, normal };
    })().catch(err => { console.warn(`Alberi ${name} non caricati:`, err.message || err); return null; });
  }
  return species[name];
}

// Codice GLSL comune: pannello orientato verso la camera (attorno a y) e scelta delle viste.
const VERT_HEAD = /* glsl */`
attribute float aYaw; attribute float aTint;
uniform float uViews, uCols, uRows, uTime, uWind;
varying vec2 vUvA; varying vec2 vUvB; varying float vBlend; varying float vTint;
varying vec3 vVRight; varying vec3 vVUp; varying vec3 vVFwd;
vec2 cellUv(float f, vec2 local) {
  float col = mod(f, uCols), row = floor(f / uCols);
  return vec2((col + local.x) / uCols, (uRows - row - 1.0 + local.y) / uRows);
}
`;
const VERT_BODY = /* glsl */`
vec3 iPos = instanceMatrix[3].xyz;
float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
vec3 wBase = (modelMatrix * vec4(iPos, 1.0)).xyz;
vec3 toC = cameraPosition - wBase; toC.y = 0.0;
float lc = length(toC); toC = lc > 1e-4 ? toC / lc : vec3(0.0, 0.0, 1.0);
vec3 bRight = vec3(toC.z, 0.0, -toC.x);
float hy = position.y;
// vento: la chioma oscilla, il piede resta fermo
float sway = sin(uTime * 1.3 + wBase.x * 0.37 + wBase.z * 0.21) * 0.6 + sin(uTime * 2.7 + wBase.z * 0.5) * 0.25;
vec3 transformed = wBase + bRight * (position.x * sx + sway * uWind * hy * hy * sy * 0.012) + vec3(0.0, hy * sy, 0.0);
float ang = atan(toC.x, toC.z) - aYaw;
float fv = mod(ang / 6.28318530718 * uViews + uViews * 16.0, uViews);
float f0 = floor(fv), f1 = mod(f0 + 1.0, uViews);
vBlend = fv - f0;
vec2 local = vec2(position.x + 0.5, position.y);
vUvA = cellUv(f0, local); vUvB = cellUv(f1, local);
vTint = aTint;
vVRight = normalize((viewMatrix * vec4(bRight, 0.0)).xyz);
vVUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vVFwd = normalize((viewMatrix * vec4(toC, 0.0)).xyz);
`;
const FRAG_HEAD = /* glsl */`
varying vec2 vUvA; varying vec2 vUvB; varying float vBlend; varying float vTint;
varying vec3 vVRight; varying vec3 vVUp; varying vec3 vVFwd;
`;
const FRAG_MAP = /* glsl */`
vec4 texA = texture2D(map, vUvA), texB = texture2D(map, vUvB);
vec4 texelColor = mix(texA, texB, vBlend);
texelColor.a = max(texA.a, texB.a) > 0.5 ? mix(texA.a, texB.a, vBlend) * 0.5 + 0.5 : 0.0;
diffuseColor *= texelColor;
diffuseColor.rgb *= vTint;
`;

function patchVertex(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = VERT_HEAD + shader.vertexShader
    .replace('#include <begin_vertex>', VERT_BODY)
    .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;')
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <map_fragment>', FRAG_MAP);
}

export class ImpostorForest {
  // items: [{ x, y, z, h }] — h = altezza desiderata in metri
  constructor(sp, items, { castShadow = true, wind = 1 } = {}) {
    const { meta, color, normal } = sp;
    this.uniforms = {
      uViews: { value: meta.views }, uCols: { value: meta.cols }, uRows: { value: meta.rows },
      uTime: { value: 0 }, uWind: { value: wind },
    };
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
    const n = items.length, yaw = new Float32Array(n), tint = new Float32Array(n);
    const mat = new THREE.MeshStandardMaterial({ map: color, normalMap: normal, alphaTest: 0.5, roughness: 0.92, metalness: 0, envMapIntensity: 0.6 });
    mat.onBeforeCompile = shader => {
      patchVertex(shader, this.uniforms);
      // normale: quella cotta nell'atlante, espressa nel riferimento del pannello
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */`
        vec3 nA = texture2D(normalMap, vUvA).xyz, nB = texture2D(normalMap, vUvB).xyz;
        vec3 nb = normalize(mix(nA, nB, vBlend) * 2.0 - 1.0);
        normal = normalize(nb.x * vVRight + nb.y * vVUp + nb.z * vVFwd);`);
    };
    mat.customProgramCacheKey = () => 'impostor-v1';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: color, alphaTest: 0.5 });
    depth.onBeforeCompile = shader => patchVertex(shader, this.uniforms);
    depth.customProgramCacheKey = () => 'impostor-depth-v1';

    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.customDepthMaterial = depth;
    const M = new THREE.Matrix4(), S = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Quaternion();
    items.forEach((it, i) => {
      const k = it.h / meta.height;
      M.compose(P.set(it.x, it.y, it.z), Q, S.set(meta.width * k, meta.height * k, 1));
      mesh.setMatrixAt(i, M);
      yaw[i] = it.yaw ?? Math.random() * Math.PI * 2;
      tint[i] = it.tint ?? 0.88 + Math.random() * 0.2;
    });
    geo.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaw, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
    mesh.castShadow = castShadow; mesh.receiveShadow = false;
    mesh.frustumCulled = false;                       // il pannello si sposta nel vertex shader
    mesh.name = `forest-${meta.name}`;
    mesh.userData.forest = this;
  }
  update(time) { this.uniforms.uTime.value = time; }
}

// Crea tutte le foreste di un mondo: groups = { specie: [items] }. Restituisce le foreste create.
export async function plantForests(parent, groups, opts = {}) {
  const out = [];
  await Promise.all(Object.entries(groups).map(async ([name, items]) => {
    if (!items.length) return;
    const sp = await loadSpecies(name, opts);
    if (!sp || !parent.parent) return;                 // specie assente o mondo già smontato
    const f = new ImpostorForest(sp, items, opts);
    parent.add(f.mesh); out.push(f);
  }));
  return out;
}
