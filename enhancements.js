import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Deterministic detail: a location keeps its own architectural identity.
export function seededRandom(seed = 1977) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function buildExteriorEnvironment(renderer, top, horizon, sunColor, sunDirection, night) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { zenith: {value: top}, horizon: {value: horizon}, sunColor: {value: sunColor}, sunDir: {value: sunDirection.clone().normalize()}, strength: {value: night ? .25 : 4} },
    vertexShader: 'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 dir; uniform vec3 zenith,horizon,sunColor,sunDir; uniform float strength;
      void main(){vec3 d=normalize(dir); vec3 c=mix(horizon,zenith,smoothstep(0.,.85,d.y));
      c=mix(vec3(.055,.062,.057),c,smoothstep(-.12,.04,d.y));
      c+=sunColor*strength*pow(max(dot(d,sunDir),0.),600.);gl_FragColor=vec4(c,1.);}`
  }));
  scene.add(dome);
  // Broad silhouettes give automotive paint readable outdoor reflections.
  const mat = new THREE.MeshBasicMaterial({color: night ? 0x080c16 : 0x47515c});
  const geo = new THREE.BoxGeometry(1,1,1); const random=seededRandom(42);
  for(let i=0;i<32;i++) { const a=i/32*Math.PI*2,h=12+random()*65; const b=new THREE.Mesh(geo,mat);b.scale.set(18+random()*22,h,22);b.position.set(Math.sin(a)*180,h/2-8,Math.cos(a)*180);scene.add(b); }
  const gen=new THREE.PMREMGenerator(renderer); const target=gen.fromScene(scene,.06,.1,1200);
  gen.dispose(); dome.geometry.dispose(); dome.material.dispose(); geo.dispose(); mat.dispose();
  return target;
}

export function addArchitecture(group, x, z, width, depth, height, base, isCore) {
  const mat=new THREE.MeshStandardMaterial({color:isCore?0x9babb4:0xc2b6a3,roughness:.72,metalness:isCore?.3:.05});
  const box=(w,h,d,px,py,pz)=> {const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(px,py,pz);m.castShadow=true;m.receiveShadow=true;group.add(m);};
  // Floor slabs, recessed glazing and structural mullions, in real metre scale.
  for(let y=base+3.6;y<base+height;y+=isCore?7.2:3.6) box(width+.28,.18,depth+.28,x,y,z);
  if(isCore) for(let k=-2;k<=2;k++) {
    box(.18,height,.28,x+k*width/5,base+height/2,z+depth/2+.1);
    box(.18,height,.28,x+k*width/5,base+height/2,z-depth/2-.1);
  }
  if(!isCore) for(const side of [-1,1]) for(let y=base+4;y<Math.min(base+height,base+24);y+=3.6) {
    for(let k=-1;k<=1;k++) {
      box(5,.18,1.5,x+k*width/3.5,y,z+side*(depth/2+.6));
      box(5,.65,.07,x+k*width/3.5,y+.4,z+side*(depth/2+1.3));
    }
  }
}

// Merge static architecture per spatial cell and material. Bounds retain frustum culling.
export function batchCity(group) {
  group.updateMatrixWorld(true); const buckets=new Map(), removedGeometries=new Set(); const inv=group.matrixWorld.clone().invert();
  group.traverse(o=>{
    if(!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.children.length || o.material.transparent) return;
    const p=new THREE.Vector3();o.getWorldPosition(p);
    const key=`${o.material.uuid}:${Math.floor(p.x/96)}:${Math.floor(p.z/96)}:${o.castShadow}:${o.receiveShadow}`;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);
  });
  for(const objects of buckets.values()) {
    if(objects.length<2)continue;
    const clones=objects.map(o=>o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld)));
    // Different source primitives may have different attributes. All architecture uses these three.
    for(const g of clones) for(const key of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
    const merged=mergeGeometries(clones,false); clones.forEach(g=>g.dispose());
    if(!merged)continue;
    merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,objects[0].material);
    mesh.castShadow=objects[0].castShadow;mesh.receiveShadow=objects[0].receiveShadow;
    objects.forEach(o=>{removedGeometries.add(o.geometry);o.removeFromParent();});group.add(mesh);
  }
  const live=new Set();group.traverse(o=>{if(o.geometry)live.add(o.geometry);});removedGeometries.forEach(g=>{if(!live.has(g))g.dispose();});
}

export function detailVehicle(car) {
  const cfg=car.cfg,b=cfg.body;
  // A soft contact patch grounds the car even beyond the shadow camera.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,12,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,.6)');g.addColorStop(.65,'rgba(0,0,0,.3)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const patch=new THREE.Mesh(new THREE.PlaneGeometry(b.w*1.5,b.l*1.18),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  patch.rotation.x=-Math.PI/2;patch.position.y=.025;car.group.add(patch);
  if(cfg.id==='fuoco')return;
  const paint=car.chassis.children.find(m=>m.material?.isMeshPhysicalMaterial)?.material;
  const black=new THREE.MeshStandardMaterial({color:0x15191e,roughness:.7});
  const metal=new THREE.MeshStandardMaterial({color:0x9a9d9e,metalness:1,roughness:.25});
  // Pronounced curved fenders, avoiding the former slab-sided silhouette.
  if(cfg.id!=='falcone')for(const side of [-1,1])for(const z of [cfg.aDist,-cfg.bDist]) {
    const radius=b.wheelR+.045;
    const arch=new THREE.Mesh(new THREE.TorusGeometry(radius,.065,8,32,Math.PI),paint||black);
    arch.rotation.y=Math.PI/2;arch.position.set(side*(b.track/2-.025),b.wheelR,z);arch.castShadow=true;car.chassis.add(arch);
  }
  for(const side of [-1,1]) {
    car.addBox(.022,.025,.28,side*(b.w/2+.012),.57,-.12,metal);
    car.addBox(.032,.017,1.38,side*(b.w/2+.015),.30,-.08,black);
  }
  const plate=document.createElement('canvas');plate.width=256;plate.height=64;
  const p=plate.getContext('2d');p.fillStyle='#dce1db';p.fillRect(0,0,256,64);p.fillStyle='#193b75';p.fillRect(0,0,23,64);p.fillRect(233,0,23,64);p.fillStyle='#222b32';p.font='bold 36px monospace';p.textAlign='center';p.fillText('VL 024 GT',128,46);
  const tex=new THREE.CanvasTexture(plate);tex.colorSpace=THREE.SRGBColorSpace;
  const plateMesh=new THREE.Mesh(new THREE.PlaneGeometry(.40,.10),new THREE.MeshStandardMaterial({map:tex,roughness:.4}));
  plateMesh.rotation.y=Math.PI;plateMesh.position.set(0,.36,-b.l/2-.045);car.chassis.add(plateMesh);
}

export function disposeVehicle(car) {
  if(!car)return;car.group.removeFromParent();const geos=new Set(),mats=new Set(),textures=new Set();
  car.group.traverse(o=>{if(o.geometry&&!o.geometry.userData.sharedTemplate)geos.add(o.geometry);if(o.material)for(const m of [].concat(o.material))mats.add(m);});
  mats.forEach(m=>{if(m.map && m.map.image instanceof HTMLCanvasElement && (m.map.image.width===128 || (m.map.image.width===256 && m.map.image.height===64)))textures.add(m.map);m.dispose();});
  geos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
}

// A continuous loft, with actual wheel openings, replaces the extruded rectangular shell.
export function buildGrandTourer(car) {
  const paint=new THREE.MeshPhysicalMaterial({color:0x526c7b,metalness:.72,roughness:.24,clearcoat:1,clearcoatRoughness:.07,envMapIntensity:1.15});
  const black=new THREE.MeshStandardMaterial({color:0x101418,roughness:.52});
  const glass=new THREE.MeshPhysicalMaterial({color:0x23343e,metalness:.25,roughness:.065,clearcoat:1,envMapIntensity:1.3});
  const alloy=new THREE.MeshStandardMaterial({color:0xa6adb0,metalness:.9,roughness:.22});
  const sample=(keys,z)=> {for(let i=1;i<keys.length;i++)if(z<=keys[i][0]){const a=keys[i-1],b=keys[i],t=(z-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}return keys.at(-1)[1];};
  function loft(z0,z1,count,profile,material) {
    const pos=[],uv=[],idx=[];let columns;
    for(let i=0;i<=count;i++){const z=z0+(z1-z0)*i/count,row=profile(z);columns=row.length;for(let j=0;j<columns;j++){pos.push(row[j][0],row[j][1],z);uv.push(j/(columns-1),i/count);}}
    for(let i=0;i<count;i++)for(let j=0;j<columns-1;j++){const a=i*columns+j,b=a+columns;idx.push(a,b,a+1,b,b+1,a+1);}
    // End caps; matching edge topology keeps the hull watertight.
    for(const ring of [0,count])for(let j=1;j<columns-2;j++){const a=ring*columns;if(ring===0)idx.push(a,a+j,a+j+1);else idx.push(a,a+j+1,a+j);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;car.chassis.add(m);return m;
  }
  loft(-2.3,2.3,100,z=>{
    const w=sample([[-2.3,.82],[-2.04,.96],[-1.3,1.01],[-.3,.92],[.6,.94],[1.35,.98],[1.95,.88],[2.3,.73]],z);
    const deck=sample([[-2.3,.62],[-1.9,.75],[-1.1,.73],[0,.64],[.85,.65],[1.65,.56],[2.3,.38]],z);
    let bottom=.23,edge=deck;
    for(const axle of [car.cfg.aDist,-car.cfg.bDist]){const d=Math.abs(z-axle),r=car.cfg.body.wheelR+.055;if(d<r){bottom=Math.max(bottom,car.cfg.body.wheelR+Math.sqrt(r*r-d*d));edge=Math.max(edge,bottom+.055);}}
    return [[-w*.85,bottom],[-w,bottom+.008],[-w,edge-.025],[-w*.94,edge+.015],[-w*.72,deck+.025],[-w*.4,deck+.045],[0,deck+.05],[w*.4,deck+.045],[w*.72,deck+.025],[w*.94,edge+.015],[w,edge-.025],[w,bottom+.008],[w*.85,bottom],[-w*.85,bottom]];
  },paint);
  loft(-1.48,.91,40,z=>{
    const h=sample([[-1.48,.76],[-1.10,.93],[-.73,1.15],[-.35,1.20],[.04,1.18],[.40,.99],[.91,.69]],z);
    const w=sample([[-1.48,.68],[-.8,.72],[0,.66],[.5,.69],[.91,.76]],z);
    return [[-w,.66],[-w,h-.1],[-w*.86,h-.015],[0,h+.012],[w*.86,h-.015],[w,h-.1],[w,.66],[-w,.66]];
  },glass);
  loft(-.78,.06,20,z=>{const h=sample([[-.78,1.14],[-.35,1.213],[.06,1.185]],z);return [[-.60,h-.015],[-.5,h+.01],[0,h+.022],[.5,h+.01],[.60,h-.015]];},paint);
  const tube=(points,r,mat)=>{const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(c,24,r,6,false),mat);m.castShadow=true;car.chassis.add(m);};
  for(const side of [-1,1]){
    tube([[side*.77,.69,.9],[side*.66,.96,.44],[side*.58,1.17,.06]],.025,paint);
    tube([[side*.60,1.15,-.76],[side*.73,.96,-1.05],[side*.76,.73,-1.45]],.034,paint);
    tube([[side*.92,.29,1.0],[side*.94,.27,0],[side*.95,.29,-1.05]],.03,black);
    tube([[side*.96,.71,.57],[side*1.09,.79,.46]],.022,black);
    const mirror=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),paint);mirror.scale.set(.13,.065,.17);mirror.position.set(side*1.1,.80,.43);car.chassis.add(mirror);
    car.addBox(.03,.18,.48,side*.95,.46,-.65,black);
    for(let j=0;j<3;j++)car.addBox(.23,.012,.055,side*.47,.615,1.35+j*.11,black);
    tube([[side*.4,.46,2.235],[side*.66,.45,2.20],[side*.8,.50,2.0]],.021,car.headMat);
    tube([[side*.19,.64,-2.313],[side*.62,.64,-2.30],[side*.81,.62,-2.25]],.018,car.tailMat);
    const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.16,20,true),alloy);exhaust.rotation.x=Math.PI/2;exhaust.position.set(side*.57,.30,-2.31);car.chassis.add(exhaust);
  }
  car.addBox(1.5,.045,.25,0,.22,2.23,black);
  car.addBox(1.52,.14,.05,0,.32,2.30,black);
  for(let k=-8;k<=8;k++)car.addBox(.012,.12,.055,k*.083,.32,2.33,alloy);
  car.addBox(1.66,.06,.24,0,.74,-2.16,paint,-.08);
  car.addBox(1.48,.12,.28,0,.22,-2.18,black);
  for(let k=-3;k<=3;k++)car.addBox(.025,.18,.35,k*.20,.22,-2.18,black);
  // Rear engine cover louvers and a small marque badge.
  for(let k=0;k<7;k++)car.addBox(.94,.012,.035,0,.77,-1.53-k*.064,black);
  car.addBox(.06,.014,.055,0,.48,2.12,alloy);
}
