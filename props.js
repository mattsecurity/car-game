// Arredo urbano da modelli glTF (Poly Haven, CC0): geometrie fuse per materiale e
// disegnate a istanze. items: [{ x, y, z, a (rotazione y), s (scala) }]
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = {};
export function loadProp(id, { upright = false } = {}) {
  if (!cache[id]) {
    cache[id] = new GLTFLoader().loadAsync(new URL(`./assets/props/${id}.glb`, import.meta.url).href).then(g => {
      const scene = g.scene;
      if (upright) scene.traverse(o => { if (o.parent === scene) o.quaternion.identity(); });   // modello rovesciato nel file
      scene.updateMatrixWorld(true);
      const byMat = new Map();
      scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        const m = o.material; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(geo);
      });
      const box = new THREE.Box3();
      const parts = [...byMat].map(([mat, geos]) => { const geo = mergeGeometries(geos, false); geo.computeBoundingBox(); box.union(geo.boundingBox); return { geo, mat }; });
      const c = box.getCenter(new THREE.Vector3());
      for (const p of parts) { p.geo.translate(-c.x, -box.min.y, -c.z); p.geo.userData.sharedTemplate = true; p.mat.userData.sharedTemplate = true; }
      return { parts, size: box.getSize(new THREE.Vector3()) };
    }).catch(err => { console.warn(`Arredo ${id} non caricato:`, err.message || err); return null; });
  }
  return cache[id];
}

export async function placeProps(parent, id, items, { castShadow = true, yaw = 0, upright = false } = {}) {
  if (!items.length) return null;
  const t = await loadProp(id, { upright });
  if (!t || !parent.parent) return null;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  return t.parts.map(({ geo, mat }) => {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { Q.setFromAxisAngle(Y, (it.a || 0) + yaw); M.compose(P.set(it.x, it.y || 0, it.z), Q, S.setScalar(it.s || 1)); mesh.setMatrixAt(i, M); });
    mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.name = `prop-${id}`;
    parent.add(mesh); return mesh;
  });
}
