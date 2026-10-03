// Texture PBR (Poly Haven, CC0) in assets/textures/<id>/{diff,nor,rough,ao}.jpg.
// Caricate una volta e condivise fra i mondi: il cambio mappa non le elimina.
import * as THREE from 'three';

export const SHARED_TEXTURES = new Set();
const cache = {};
const loader = new THREE.TextureLoader();

function load(id, part, srgb) {
  const key = `${id}/${part}`;
  if (!cache[key]) {
    const t = loader.load(new URL(`./assets/textures/${id}/${part}.jpg`, import.meta.url).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    SHARED_TEXTURES.add(t); cache[key] = t;
  }
  return cache[key];
}

// Mappe con ripetizione propria: cloni leggeri che condividono l'immagine (three.js conta gli
// usi della sorgente, quindi eliminare un clone col mondo non tocca gli altri).
export function pbrMaps(id, repeat = 1, { ao = true } = {}) {
  const out = { map: load(id, 'diff', true), normalMap: load(id, 'nor', false), roughnessMap: load(id, 'rough', false) };
  if (ao) out.aoMap = load(id, 'ao', false);
  for (const k of Object.keys(out)) {
    const t = out[k].clone(); t.repeat.set(repeat, repeat); t.needsUpdate = true;
    out[k] = t;
  }
  return out;
}

// Materiale standard con le mappe PBR; `extra` sovrascrive colore, rugosità, ecc.
export function pbrMaterial(id, repeat, extra = {}) {
  const maps = pbrMaps(id, repeat, { ao: false });
  return new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1, 1), ...extra });
}

// Terreno a tre strati (es. sabbia / prato / roccia) mescolati per vertice.
// La geometria deve avere l'attributo `aSplat` (vec3 di pesi). Coordinate UV in
// metri del mondo (x,z) divise per la dimensione reale di ogni texture.
export function terrainSplatMaterial(layers, extra = {}) {
  const L = layers.map(l => ({ d: load(l.id, 'diff', true), n: load(l.id, 'nor', false), r: load(l.id, 'rough', false), s: 1 / l.size }));
  const mat = new THREE.MeshStandardMaterial({ map: L[0].d, normalMap: L[0].n, roughnessMap: L[0].r, roughness: 1, metalness: 0, ...extra });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tD1: { value: L[1].d }, tD2: { value: L[2].d }, tN1: { value: L[1].n }, tN2: { value: L[2].n },
      tR1: { value: L[1].r }, tR2: { value: L[2].r }, uS: { value: new THREE.Vector3(L[0].s, L[1].s, L[2].s) },
    });
    sh.vertexShader = 'attribute vec3 aSplat; varying vec3 vSplat; varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvSplat = aSplat; vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D tD1, tD2, tN1, tN2, tR1, tR2; uniform vec3 uS; varying vec3 vSplat; varying vec2 vWXZ;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        vec2 su0 = vWXZ * uS.x, su1 = vWXZ * uS.y, su2 = vWXZ * uS.z;
        vec3 sw = vSplat / max(1e-4, vSplat.x + vSplat.y + vSplat.z);
        // seconda scala più larga mescolata sul colore: spezza la ripetizione visibile
        vec4 sc0 = mix(texture2D(map, su0), texture2D(map, su0 * 0.19 + 0.37), 0.35);
        vec4 sc1 = mix(texture2D(tD1, su1), texture2D(tD1, su1 * 0.21 + 0.53), 0.35);
        vec4 sc2 = texture2D(tD2, su2);
        diffuseColor *= sc0 * sw.x + sc1 * sw.y + sc2 * sw.z;`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        float roughnessFactor = roughness * (texture2D(roughnessMap, su0).g * sw.x + texture2D(tR1, su1).g * sw.y + texture2D(tR2, su2).g * sw.z);`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        vec3 mapN = (texture2D(normalMap, su0).xyz * sw.x + texture2D(tN1, su1).xyz * sw.y + texture2D(tN2, su2).xyz * sw.z) * 2.0 - 1.0;
        mapN.xy *= normalScale;
        mat3 tbnS = getTangentFrame(-vViewPosition, normal, su0);
        tbnS[0] *= faceDirection; tbnS[1] *= faceDirection;
        normal = normalize(tbnS * mapN);`);
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v1';
  return mat;
}
