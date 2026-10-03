// Converte personaggi animati (Mixamo FBX o glTF) per la folla del gioco:
//   node tools/bake-people.mjs <cartella-sorgenti> [--out assets/people] [--only nome]
// La cartella contiene i personaggi (*.fbx / *.glb) e le animazioni walk/idle/phone(.fbx|.glb).
// Output per personaggio: <nome>.glb (mesh + pelle, texture ≤1024 px), <nome>.anim.bin
// (matrici delle ossa per fotogramma, half float RGBA) e <nome>.json (clip e matrici di legame).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIPS = ['walk', 'idle', 'phone'];
const MIME = { '.js': 'text/javascript', '.fbx': 'application/octet-stream', '.glb': 'model/gltf-binary', '.html': 'text/html' };

const BAKER = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const load = async url => url.endsWith('.fbx') ? { scene: await new FBXLoader().loadAsync(url), clips: null } : await new GLTFLoader().loadAsync(url).then(g => ({ scene: g.scene, clips: g.animations }));
const clipsOf = r => r.clips || r.scene.animations || [];
function shrink(tex) {
  const img = tex && tex.image; if (!img || !img.width || (img.width <= 1024 && img.height <= 1024)) return tex;
  const k = 1024 / Math.max(img.width, img.height), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = tex.colorSpace; t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; return t;
}
function toHalf(f32) { const u = new Uint16Array(f32.length); for (let i = 0; i < f32.length; i++) u[i] = THREE.DataUtils.toHalfFloat(f32[i]); return u; }
function b64(buf) { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }

window.bakePerson = async (charUrl, animUrls, sampleFps) => {
  const src = await load(charUrl), root = src.scene;
  // unità: i FBX Mixamo sono in centimetri
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root, true);
  if (box.max.y - box.min.y > 10) { root.scale.multiplyScalar(0.01); root.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(root, true); }
  const skinned = []; root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) throw new Error('nessuna mesh con pelle');
  // un solo scheletro: le mesh con ordine diverso delle ossa vengono rimappate su quello principale
  const master = skinned[0].skeleton;
  for (const m of skinned.slice(1)) {
    if (m.skeleton === master) continue;
    const map = m.skeleton.bones.map(b => Math.max(0, master.bones.indexOf(b)));
    const si = m.geometry.attributes.skinIndex; for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) si.setComponent(i, k, map[si.getComponent(i, k)]);
    m.bind(master, m.matrixWorld);
  }
  for (const m of skinned) for (const mat of [].concat(m.material)) for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'specularMap']) if (mat[key]) mat[key] = shrink(mat[key]);
  // esportazione solo delle mesh con pelle e delle ossa
  root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) o.visible = false; });
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, animations: [] });
  // si ricarica il glb esportato: le pose vengono registrate nello stesso spazio che userà il gioco
  const re = await new GLTFLoader().parseAsync(glb.slice(0), ''), scene = re.scene;
  scene.updateMatrixWorld(true);
  const meshes = []; scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const skel = meshes[0].skeleton, nb = skel.bones.length;
  // clip: dai file di animazione o, per i glb con animazioni proprie, dalla prima clip
  const clips = {};
  for (const [name, url] of Object.entries(animUrls)) { if (!url) continue; const r = await load(url); const c = clipsOf(r)[0]; if (c) clips[name] = c; }
  if (!Object.keys(clips).length && clipsOf(src).length) clips.walk = clipsOf(src)[0];
  const meta = { bones: nb, clips: {}, meshes: [], height: +(box.max.y - box.min.y).toFixed(3) };
  const rows = [];
  const mixer = new THREE.AnimationMixer(scene);
  for (const [name, clip] of Object.entries(clips)) {
    const fps = name === 'walk' ? 30 : sampleFps, frames = Math.max(2, Math.min(240, Math.round(clip.duration * fps)));
    mixer.stopAllAction(); const action = mixer.clipAction(clip); action.reset().play();
    meta.clips[name] = { start: rows.length, frames, fps, duration: +clip.duration.toFixed(3) };
    for (let f = 0; f < frames; f++) {
      mixer.setTime(f / fps); scene.updateMatrixWorld(true);
      const row = new Float32Array(nb * 16), m = new THREE.Matrix4();
      skel.bones.forEach((b, i) => { m.multiplyMatrices(b.matrixWorld, skel.boneInverses[i]); row.set(m.elements, i * 16); });
      rows.push(row);
    }
  }
  for (const m of meshes) {
    const post = new THREE.Matrix4().multiplyMatrices(m.matrixWorld, m.bindMatrixInverse);
    meta.meshes.push({ name: m.name, pre: m.bindMatrix.elements.map(v => +v.toFixed(6)), post: post.elements.map(v => +v.toFixed(6)) });
  }
  const all = new Float32Array(rows.length * nb * 16); rows.forEach((r, i) => all.set(r, i * nb * 16));
  meta.texture = { width: nb * 4, height: rows.length, type: 'half' };
  return { glb: b64(glb), anim: b64(toHalf(all).buffer), meta };
};
window.ready = true;
</script></body></html>`;

export async function bakePeople(srcDir, outDir, only = null) {
  const files = readdirSync(srcDir), find = n => files.find(f => basename(f, extname(f)).toLowerCase() === n && /\.(fbx|glb)$/i.test(f));
  const anims = Object.fromEntries(CLIPS.map(c => [c, find(c)]));
  const chars = files.filter(f => /\.(fbx|glb)$/i.test(f) && !CLIPS.includes(basename(f, extname(f)).toLowerCase()))
    .filter(f => !only || basename(f, extname(f)).toLowerCase() === only);
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/baker.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(BAKER); }
    const file = p.startsWith('/three/') ? join(ROOT, 'node_modules', p) : join(srcDir, p.replace(/^\/src\//, ''));
    if (!existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' }); createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=metal'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pagina:', e.message));
  await page.goto(`${base}/baker.html`); await page.waitForFunction(() => window.ready);
  mkdirSync(outDir, { recursive: true });
  const done = [];
  for (const f of chars) {
    const name = basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const urls = Object.fromEntries(Object.entries(anims).map(([k, v]) => [k, v ? `${base}/src/${v}` : null]));
    const r = await page.evaluate(([c, a]) => window.bakePerson(c, a, 15), [`${base}/src/${f}`, urls]);
    writeFileSync(join(outDir, `${name}.glb`), Buffer.from(r.glb, 'base64'));
    writeFileSync(join(outDir, `${name}.anim.bin`), Buffer.from(r.anim, 'base64'));
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ name, source: f, ...r.meta }));
    console.log(`${name}: ${r.meta.bones} ossa, altezza ${r.meta.height} m, clip ${Object.entries(r.meta.clips).map(([k, v]) => `${k}(${v.frames})`).join(' ')}, mesh ${r.meta.meshes.length}`);
    done.push(name);
  }
  writeFileSync(join(outDir, 'crowd.json'), JSON.stringify({ people: done }));
  await browser.close(); server.close();
  return done;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), src = args[0];
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'assets', 'people');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  if (!src) { console.error('uso: node tools/bake-people.mjs <cartella-sorgenti> [--out dir] [--only nome]'); process.exit(1); }
  await bakePeople(src, out, only);
}
