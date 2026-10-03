// Acqua realistica senza passaggi di rendering extra: materiale fisico (IOR 1.333,
// riflessi Fresnel dell'ambiente, scintillio del sole) + onde procedurali nello shader.
// Con una mappa di profondità: colore turchese sul basso fondale, blu al largo,
// trasparenza sulla spiaggia e schiuma a riva.
import * as THREE from 'three';

// Mappa di profondità (metri, codificati 0..40 m in 8 bit) da una funzione del fondale.
export function makeDepthTexture(bottomAt, waterY, bounds, size = 192) {
  const [minx, minz, maxx, maxz] = bounds, data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = minx + (i + 0.5) / size * (maxx - minx), z = minz + (j + 0.5) / size * (maxz - minz);
    const d = Math.max(0, Math.min(40, waterY - bottomAt(x, z)));
    const k = (j * size + i) * 4; data[k] = Math.round(d / 40 * 255); data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

const WAVES = /* glsl */`
uniform float uTime, uScale;
float swell(vec2 p, float t) {
  return uScale * (0.20 * sin(dot(p, vec2(0.061, 0.034)) + t * 0.62)
       + 0.12 * sin(dot(p, vec2(-0.043, 0.071)) + t * 0.81)
       + 0.07 * sin(dot(p, vec2(0.11, -0.05)) + t * 1.13));
}
// normale da 8 treni d'onda (pendenza sommata), attenuati con la distanza contro l'aliasing
vec3 waveNormal(vec2 p, float t, float dist) {
  vec2 d = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i), ang = fi * 2.39996 + 0.35;
    vec2 dir = vec2(cos(ang), sin(ang));
    float wl = 19.0 * pow(0.66, fi), k = 6.2831853 / wl, c = sqrt(9.81 / k);
    float steep = 0.13 * pow(0.9, fi) * clamp(1.0 - dist / (wl * 90.0), 0.0, 1.0);
    d += dir * steep * cos(dot(dir, p) * k + t * c * k + fi * 1.7);
  }
  return normalize(vec3(-d.x * uScale, 1.0, -d.y * uScale));
}
`;

export function makeWaterMaterial({ time = { value: 0 }, depthTex = null, bounds = [-1, -1, 1, 1], shallow = 0x2bb3b4, deep = 0x0a3a5a, foam = true, scale = 1, opacityShallow = true } = {}) {
  const uniforms = {
    uTime: time, uScale: { value: scale },
    uDepth: { value: depthTex }, uHasDepth: { value: depthTex ? 1 : 0 },
    uBounds: { value: new THREE.Vector4(...bounds) },
    uShallow: { value: new THREE.Color(shallow) }, uDeep: { value: new THREE.Color(deep) }, uFoam: { value: foam ? 1 : 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, ior: 1.333, specularIntensity: 1, envMapIntensity: 1.1, transparent: opacityShallow });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = WAVES + 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      vec3 transformed = vec3(position);
      vec4 wp0 = modelMatrix * vec4(position, 1.0);
      transformed.y += swell(wp0.xz, uTime);
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = WAVES + /* glsl */`
      uniform sampler2D uDepth; uniform float uHasDepth, uFoam; uniform vec4 uBounds; uniform vec3 uShallow, uDeep;
      varying vec3 vWPos;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    ` + sh.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`
        vec2 duv = (vWPos.xz - uBounds.xy) / (uBounds.zw - uBounds.xy);
        float inside = step(0.0, duv.x) * step(0.0, duv.y) * step(duv.x, 1.0) * step(duv.y, 1.0);
        float wDepth = mix(40.0, texture2D(uDepth, clamp(duv, 0.0, 1.0)).r * 40.0, uHasDepth * inside);
        vec3 water = mix(uShallow, uDeep, smoothstep(0.3, 11.0, wDepth));
        // schiuma: fasce che avanzano verso riva + rumore
        float shore = 1.0 - smoothstep(0.02, 0.7, wDepth);
        float bands = 0.55 + 0.45 * sin(wDepth * 7.0 - uTime * 1.7 + vnoise(vWPos.xz * 0.35) * 4.0);
        float foamAmt = uFoam * clamp(shore * bands * (0.35 + 0.65 * vnoise(vWPos.xz * 1.7 + uTime * 0.4)), 0.0, 0.85);
        diffuseColor.rgb *= mix(water, vec3(0.93, 0.95, 0.96), foamAmt);
        diffuseColor.a *= mix(0.55 + 0.45 * smoothstep(0.0, 1.6, wDepth), 1.0, foamAmt);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, foamAmt);')
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
        vec3 nW = waveNormal(vWPos.xz, uTime, length(vWPos - cameraPosition));
        nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), foamAmt * 0.7));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'water-v1-' + (depthTex ? 'd' : 'n');
  mat.userData.uniforms = uniforms;
  return mat;
}
