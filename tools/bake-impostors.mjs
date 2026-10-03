// "Fotografa" alberi glTF ad alta densità in atlanti di impostori (colore + normali).
//   node tools/bake-impostors.mjs <cartella-alberi> [id ...]
// La cartella contiene sottocartelle Poly Haven (<id>/<id>_1k.gltf + bin + textures/).
// Output: assets/trees/<nome>-color.png, <nome>-normal.png, <nome>.json
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readdirSync, existsSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPECIES = [
  { name: 'street', src: 'tree_small_02', views: 12, vh: 512 },
  { name: 'park', src: 'jacaranda_tree', views: 12, vh: 512 },
  { name: 'island1', src: 'island_tree_01', views: 12, vh: 512 },
  { name: 'island2', src: 'island_tree_02', views: 12, vh: 512 },
];

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.html': 'text/html' };

const BAKER = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
function dilate(ctx, w, h, passes) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let p = 0; p < passes; p++) {
    const src = new Uint8ClampedArray(d), filled = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (src[i + 3] > 0) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = (Y * w + X) * 4; if (src[j + 3] > 0 || filled[Y * w + X]) { r += src[j]; g += src[j + 1]; b += src[j + 2]; n++; }
      }
      if (n) { d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; d[i + 3] = 1; filled[y * w + x] = 1; }
    }
  }
  // l'alfa "1" usato come marcatore di riempimento torna a 0
  for (let i = 3; i < d.length; i += 4) if (d[i] === 1) d[i] = 0;
  ctx.putImageData(img, 0, 0);
}
window.bake = async (url, views, vh) => {
  console.log('carico', url); const g = await new GLTFLoader().loadAsync(url), obj = g.scene; console.log('caricato');
  obj.updateMatrixWorld(true);
  // estensione esatta: altezza e raggio massimo attorno all'asse del tronco
  let minY = Infinity, maxY = -Infinity, sx = 0, sz = 0, n = 0;
  const v = new THREE.Vector3(), pts = [];
  obj.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 7) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); } });
  // asse del tronco: media xz dei punti più bassi
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] < minY + (maxY - minY) * 0.08) { sx += pts[i]; sz += pts[i + 2]; n++; }
  const cx = sx / n, cz = sz / n; let r = 0;
  for (let i = 0; i < pts.length; i += 3) r = Math.max(r, Math.hypot(pts[i] - cx, pts[i + 2] - cz));
  r *= 1.02; const H = (maxY - minY) * 1.02;
  // lato massimo della vista = vh; atlante a griglia 4 colonne (≤ 4096 px anche su mobile)
  const aspect = (2 * r) / H, vw0 = aspect >= 1 ? vh : vh * aspect, vh0 = aspect >= 1 ? vh / aspect : vh;
  const vw = Math.max(64, Math.round(vw0 / 8) * 8); vh = Math.max(64, Math.round(vh0 / 8) * 8);
  const cols = 4, rows = Math.ceil(views / cols);
  console.log('misure', r, H, vw); const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(vw, vh); renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(); scene.add(obj);
  const cam = new THREE.OrthographicCamera(-r, r, H, 0, 0.1, 4 * r + 100);
  const colorMats = new Map(), normalMats = new Map();
  obj.traverse(o => { if (!o.isMesh) return; const m = o.material;
    colorMats.set(o, new THREE.MeshBasicMaterial({ map: m.map, color: m.color, side: THREE.DoubleSide }));
    normalMats.set(o, new THREE.MeshNormalMaterial({ normalMap: m.normalMap, side: THREE.DoubleSide })); });
  const atlas = k => { const c = document.createElement('canvas'); c.width = vw * cols; c.height = vh * rows; return c; };
  const colC = atlas(), norC = atlas(), colX = colC.getContext('2d'), norX = norC.getContext('2d');
  for (let i = 0; i < views; i++) {
    const a = i / views * Math.PI * 2, D = 2 * r + 20;
    cam.position.set(cx + Math.sin(a) * D, minY, cz + Math.cos(a) * D); cam.lookAt(cx, minY, cz); cam.updateMatrixWorld();
    obj.traverse(o => { if (o.isMesh) o.material = colorMats.get(o); }); renderer.render(scene, cam);
    colX.drawImage(renderer.domElement, (i % cols) * vw, Math.floor(i / cols) * vh);
    obj.traverse(o => { if (o.isMesh) o.material = normalMats.get(o); }); renderer.render(scene, cam);
    norX.drawImage(renderer.domElement, (i % cols) * vw, Math.floor(i / cols) * vh);
  }
  dilate(colX, colC.width, colC.height, 6); dilate(norX, norC.width, norC.height, 6);
  return { color: colC.toDataURL('image/png'), normal: norC.toDataURL('image/png'), width: 2 * r, height: H, views, vw, vh, cols, rows };
};
window.ready = true;
</script></body></html>`;

export async function bakeAll(treeDir, only) {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pagina:', e.message));
  page.on('console', m => console.log('  [baker]', m.text()));
  page.on('crash', () => console.error('CRASH della pagina'));
  // server HTTP temporaneo: i .bin degli alberi (100-200 MB) sono troppo grandi per route.fulfill
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/baker.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(BAKER); }
    const file = p.startsWith('/three/') ? join(ROOT, 'node_modules', p) : join(treeDir, p.replace(/^\/tree\//, ''));
    if (!existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/baker.html`);
  await page.waitForFunction(() => window.ready);
  const outDir = join(ROOT, 'assets', 'trees'); mkdirSync(outDir, { recursive: true });
  for (const s of SPECIES) {
    if (only.length && !only.includes(s.name)) continue;
    const gltf = readdirSync(join(treeDir, s.src)).find(f => f.endsWith('.gltf'));
    const t0 = Date.now();
    const r = await page.evaluate(([u, v, h]) => window.bake(u, v, h), [`${base}/tree/${s.src}/${gltf}`, s.views, s.vh]);
    writeFileSync(join(outDir, `${s.name}-color.png`), Buffer.from(r.color.split(',')[1], 'base64'));
    writeFileSync(join(outDir, `${s.name}-normal.png`), Buffer.from(r.normal.split(',')[1], 'base64'));
    writeFileSync(join(outDir, `${s.name}.json`), JSON.stringify({ name: s.name, source: s.src, width: +r.width.toFixed(3), height: +r.height.toFixed(3), views: r.views, vw: r.vw, vh: r.vh, cols: r.cols, rows: r.rows,
      credit: `${s.src} — Poly Haven`, license: 'CC0', url: `https://polyhaven.com/a/${s.src}` }));
    console.log(`${s.name} (${s.src}): ${r.width.toFixed(1)}×${r.height.toFixed(1)} m, vista ${r.vw}×${r.vh}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close(); server.close();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dir, ...only] = process.argv.slice(2);
  if (!dir) { console.error('uso: node tools/bake-impostors.mjs <cartella-alberi> [nomi...]'); process.exit(1); }
  await bakeAll(dir, only);
}
