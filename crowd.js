// Folla realistica: personaggi con pelle (convertiti da tools/bake-people.mjs) disegnati a
// istanze. La deformazione avviene nello shader leggendo le matrici delle ossa da una
// texture (una riga per fotogramma): centinaia di pedoni con pochi disegni.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const CLIP_ORDER = ['walk', 'idle', 'phone'];

export async function loadPerson(base, name) {
  try {
    const meta = await fetch(new URL(`${name}.json`, base)).then(r => (r.ok ? r.json() : null));
    const bin = await fetch(new URL(`${name}.anim.bin`, base)).then(r => (r.ok ? r.arrayBuffer() : null));
    if (!meta || !bin) return null;
    const anim = new THREE.DataTexture(new Uint16Array(bin), meta.texture.width, meta.texture.height, THREE.RGBAFormat, THREE.HalfFloatType);
    anim.minFilter = anim.magFilter = THREE.NearestFilter; anim.generateMipmaps = false; anim.needsUpdate = true;
    const gltf = await new GLTFLoader().loadAsync(new URL(`${name}.glb`, base).href);
    const meshes = []; gltf.scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    return {
      name, meta, anim,
      meshes: meshes.map((m, i) => ({ geo: m.geometry, mat: m.material, pre: new THREE.Matrix4().fromArray(meta.meshes[i].pre), post: new THREE.Matrix4().fromArray(meta.meshes[i].post) })),
    };
  } catch (e) { console.warn(`Persona ${name} non caricata:`, e.message || e); return null; }
}

// base: URL della cartella (default assets/people/ accanto a questo modulo)
export async function loadCrowdTypes(base = new URL('./assets/people/', import.meta.url)) {
  const list = await fetch(new URL('crowd.json', base)).then(r => (r.ok ? r.json() : { people: [] })).catch(() => ({ people: [] }));
  const types = await Promise.all((list.people || []).map(n => loadPerson(base, n)));
  return types.filter(Boolean);
}

const SKIN_HEAD = /* glsl */`
attribute vec4 skinIndex; attribute vec4 skinWeight; attribute vec3 aAnim;
uniform highp sampler2D uAnim; uniform float uTime; uniform vec4 uClips[3]; uniform mat4 uPre, uPost;
mat4 boneAt(float b, float row) {
  int x = int(b) * 4, y = int(row);
  return mat4(texelFetch(uAnim, ivec2(x, y), 0), texelFetch(uAnim, ivec2(x + 1, y), 0), texelFetch(uAnim, ivec2(x + 2, y), 0), texelFetch(uAnim, ivec2(x + 3, y), 0));
}
mat4 crowdSkin() {
  vec4 c = uClips[int(aAnim.x + 0.5)];
  float row = c.x + mod(floor((uTime * aAnim.z + aAnim.y) * c.z), c.y);
  mat4 s = boneAt(skinIndex.x, row) * skinWeight.x + boneAt(skinIndex.y, row) * skinWeight.y
         + boneAt(skinIndex.z, row) * skinWeight.z + boneAt(skinIndex.w, row) * skinWeight.w;
  return uPost * s * uPre;
}
`;

function patch(material, uniforms, depth) {
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    let v = SKIN_HEAD + sh.vertexShader;
    if (depth) v = v.replace('#include <begin_vertex>', 'mat4 skinM = crowdSkin(); vec3 transformed = (skinM * vec4(position, 1.0)).xyz;');
    else v = v.replace('#include <beginnormal_vertex>', 'mat4 skinM = crowdSkin(); vec3 objectNormal = normalize(mat3(skinM) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = normalize(mat3(skinM) * tangent.xyz);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = (skinM * vec4(position, 1.0)).xyz;');
    sh.vertexShader = v;
  };
  material.customProgramCacheKey = () => 'crowd-' + (depth ? 'd' : 'c') + '-' + material.uuid;
}

export class Crowd {
  constructor(types, capacity, { castShadow = true } = {}) {
    this.types = types; this.group = new THREE.Group(); this.group.name = 'crowd';
    this.time = { value: 0 };
    this.counts = types.map(() => 0);
    this.perType = types.map(t => {
      const clips = CLIP_ORDER.map(n => t.meta.clips[n] || t.meta.clips.walk);
      const clipVec = clips.map(c => new THREE.Vector4(c.start, c.frames, c.fps, 0));
      const idleFallback = !t.meta.clips.idle;          // senza clip di attesa si usa la camminata ferma
      const aAnim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3); aAnim.setUsage(THREE.DynamicDrawUsage);
      const meshes = t.meshes.map(part => {
        const geo = part.geo.clone(); geo.setAttribute('aAnim', aAnim);
        const uniforms = { uAnim: { value: t.anim }, uTime: this.time, uClips: { value: clipVec }, uPre: { value: part.pre }, uPost: { value: part.post } };
        const mats = [].concat(part.mat).map(m => { const c = m.clone(); patch(c, uniforms, false); return c; });
        const mesh = new THREE.InstancedMesh(geo, mats.length > 1 ? mats : mats[0], capacity);
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patch(depth, uniforms, true);
        mesh.customDepthMaterial = depth;
        mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(mesh); return mesh;
      });
      return { meshes, aAnim, idleFallback, walkSpeed: t.meta.walkSpeed || 1.35 };
    });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._y = new THREE.Vector3(0, 1, 0);
  }
  begin(time) { this.time.value = time; this.counts.fill(0); }
  // clip: 'walk' | 'idle' | 'phone'; speed: m/s per la camminata (adegua la cadenza)
  add(type, x, y, z, heading, scale, clip, phase, speed = 1.35) {
    const T = this.perType[type], i = this.counts[type]++;
    if (i >= T.aAnim.count) { this.counts[type]--; return; }
    this._q.setFromAxisAngle(this._y, heading); this._m.compose(this._p.set(x, y, z), this._q, this._s.setScalar(scale));
    for (const m of T.meshes) m.setMatrixAt(i, this._m);
    let ci = Math.max(0, CLIP_ORDER.indexOf(clip)), rate = 1;
    if (clip === 'walk') rate = speed / T.walkSpeed / scale;
    else if (T.idleFallback) { ci = 0; rate = 0; }
    T.aAnim.setXYZ(i, ci, phase, rate);
  }
  commit() {
    this.perType.forEach((T, k) => { for (const m of T.meshes) { m.count = this.counts[k]; m.instanceMatrix.needsUpdate = true; } T.aAnim.needsUpdate = true; });
  }
  dispose() {
    this.group.removeFromParent();
    this.perType.forEach(T => T.meshes.forEach(m => { m.geometry.dispose(); [].concat(m.material).forEach(x => x.dispose()); m.customDepthMaterial.dispose(); }));
  }
}
