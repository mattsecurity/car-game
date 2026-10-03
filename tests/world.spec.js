import {test,expect} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const pngSize=f=>{const b=readFileSync(f);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};};

test('impostor atlases match their metadata',()=>{
  for(const name of ['street','park','island1','island2']){
    const base=fileURLToPath(new URL(`../assets/trees/${name}`,import.meta.url));
    const meta=JSON.parse(readFileSync(base+'.json'));
    expect(meta.views).toBe(12);expect(meta.license).toBe('CC0');
    for(const kind of ['color','normal']){
      expect(existsSync(`${base}-${kind}.png`)).toBe(true);
      const s=pngSize(`${base}-${kind}.png`);
      expect(s.w).toBe(meta.vw*meta.cols);expect(s.h).toBe(meta.vh*meta.rows);expect(s.w).toBeLessThanOrEqual(4096);
    }
    expect(meta.height).toBeGreaterThan(2);expect(meta.width).toBeGreaterThan(1);
  }
});

async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  return errors;
}

test('Valdora has photogrammetry tree forests, PBR sidewalks, lawns and Italian houses',async({page})=>{
  const errors=await boot(page);
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.__dbg.world.forests&&window.__dbg.world.forests.length===3,null,{timeout:30000});
  const r=await page.evaluate(()=>{
    const w=window.__dbg.world, mats=[];
    w.group.traverse(o=>{if(o.isMesh)mats.push(o.material);});
    const pave=mats.find(m=>m.map&&m.map.source?.data?.src?.includes('pavement_02'));
    const lawn=mats.find(m=>m.map&&m.map.source?.data?.src?.includes('leafy_grass'));
    return {forests:w.forests.map(f=>[f.mesh.name,f.mesh.count]),old:w.oldTrees.every(m=>!m.visible),
      pave:!!(pave&&pave.normalMap&&pave.roughnessMap),lawn:!!lawn,house:mats.some(m=>m.map&&m.map.image instanceof HTMLCanvasElement&&m.map.image.width===512&&m.map.image.height===256&&m.normalMap)};
  });
  const names=Object.fromEntries(r.forests);
  expect(names['forest-street']).toBeGreaterThan(100);expect(names['forest-park']).toBeGreaterThan(0);expect(names['forest-island1']).toBeGreaterThan(0);
  expect(r.old).toBe(true);expect(r.pave).toBe(true);expect(r.lawn).toBe(true);expect(r.house).toBe(true);
  await page.waitForTimeout(500);await page.screenshot({path:'test-results/valdora-trees.png'});
  expect(errors).toEqual([]);
});

test('the Riviera has olive forests and a textured sand/grass/rock terrain',async({page})=>{
  const errors=await boot(page);
  await page.getByRole('button',{name:/Riviera del Sole/}).click();await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.__dbg.world.id==='coast'&&window.__dbg.world.forests&&window.__dbg.world.forests.length===2,null,{timeout:30000});
  const r=await page.evaluate(()=>{
    const w=window.__dbg.world;let terrain=null;
    w.group.traverse(o=>{if(o.isMesh&&o.geometry.attributes.aSplat)terrain=o;});
    const sp=terrain.geometry.attributes.aSplat;let sand=0,grass=0,rock=0;
    for(let i=0;i<sp.count;i++){const a=sp.getX(i),b=sp.getY(i),c=sp.getZ(i);if(a>.5)sand++;else if(c>.5)rock++;else if(b>.5)grass++;}
    return {forests:w.forests.map(f=>f.mesh.count),key:terrain.material.customProgramCacheKey(),sand,grass,rock,old:w.oldTrees.every(m=>!m.visible)};
  });
  expect(r.forests.reduce((a,b)=>a+b,0)).toBeGreaterThan(200);expect(r.key).toBe('terrain-splat-v1');
  expect(r.sand).toBeGreaterThan(0);expect(r.grass).toBeGreaterThan(0);expect(r.rock).toBeGreaterThan(0);expect(r.old).toBe(true);
  await page.screenshot({path:'test-results/riviera-olives.png'});
  expect(errors).toEqual([]);
});

test('traffic uses instanced realistic cars that drive on the right with working lights',async({page})=>{
  const errors=await boot(page);
  await page.locator('#startBtn').click();
  const r=await page.evaluate(()=>{
    const {traffic,world,sim}=window.__dbg, F=traffic.fleet, S=world.streets;
    let meshes=0,instances=0;traffic.group.traverse(o=>{if(o.isMesh){meshes++;if(o.isInstancedMesh&&o!==F.wheels)instances+=o.count;}});
    // guida a destra: offset laterale rispetto alla mezzeria dalla parte destra del guidatore
    let right=0,wrong=0;
    for(const c of traffic.cars){const fx=Math.sin(c.heading),fz=Math.cos(c.heading),alongZ=Math.abs(fz)>Math.abs(fx);
      const v=alongZ?c.pos.x:c.pos.z, center=S.reduce((b,s)=>Math.abs(s-v)<Math.abs(b-v)?s:b), off=v-center;
      if(Math.abs(off)<1)continue; if((alongZ?off*-fz:off*fx)>0)right++;else wrong++;}
    // auto ferma al rosso: stop accesi; auto in svolta: frecce
    const c=traffic.cars[0];traffic.cars=[c];c.ci=1;c.cj=0;c.dir=0;traffic.setLeg(c);c.t=.6;c.speed=10;c.heading=0;c.pos.lerpVectors(c.from,c.to,c.t);
    sim.set(33);for(let i=0;i<600;i++)traffic.update(1/60,{pos:{x:9999,z:9999},vel:{x:0,z:0},impacts:[]});
    const m=F.meshes[F.typeOf[0]],slot=F.slot[0],brake=m.geometry.attributes.aBrake.array[slot];
    c.next=(c.dir+1)%4;c.t=0.8;traffic.syncFleet(1/60);const turn=m.geometry.attributes.aTurn.array[slot];
    let parked=0;world.group.traverse(o=>{if(o.isInstancedMesh&&o.geometry.attributes.aBrake)parked+=o.count;});
    return {meshes,instances,right,wrong,brake,turn,parked};
  });
  expect(r.instances).toBe(26);expect(r.meshes).toBeLessThanOrEqual(6);
  expect(r.wrong).toBe(0);expect(r.right).toBeGreaterThan(15);
  expect(r.brake).toBe(1);expect(r.turn).toBe(1);expect(r.parked).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('the Riviera sea is a depth-aware water surface and the coast road stays above it',async({page})=>{
  const errors=await boot(page);
  await page.getByRole('button',{name:/Riviera del Sole/}).click();await page.locator('#startBtn').click();
  const r=await page.evaluate(()=>{
    const w=window.__dbg.world;let water=0,depth=false;
    w.group.traverse(o=>{if(o.isMesh&&o.material.customProgramCacheKey&&String(o.material.customProgramCacheKey()).startsWith('water-v1')){water++;if(o.material.userData.uniforms.uHasDepth.value)depth=true;}});
    const minRoad=Math.min(...w.samples.map(s=>w.height(s.x,s.z)));
    return {water,depth,minRoad};
  });
  expect(r.water).toBeGreaterThanOrEqual(2);expect(r.depth).toBe(true);expect(r.minRoad).toBeGreaterThan(-1.6+0.9);
  expect(errors).toEqual([]);
});

test('parks have paths, a real pond and Poly Haven furniture; GTAO is active on desktop',async({page})=>{
  const errors=await boot(page);
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>{let n=0;window.__dbg.world.group.traverse(o=>{if(o.name&&o.name.startsWith('prop-'))n++;});return n>=4;},null,{timeout:30000});
  const r=await page.evaluate(()=>{
    const w=window.__dbg.world, props={};let pond=0;
    w.group.traverse(o=>{if(o.name&&o.name.startsWith('prop-'))props[o.name]=(props[o.name]||0)+o.count;
      if(o.isMesh&&o.material.customProgramCacheKey&&String(o.material.customProgramCacheKey()).startsWith('water-v1'))pond++;});
    const passes=window.__dbg.three.composer.passes.map(p=>p.constructor.name);
    return {props,pond,passes};
  });
  expect(r.props['prop-painted_wooden_bench']).toBeGreaterThan(20);expect(r.props['prop-wooden_picnic_table']).toBeGreaterThan(0);expect(r.props['prop-metal_trash_can']).toBeGreaterThan(0);
  expect(r.pond).toBe(3);expect(r.passes).toContain('GTAOPass');
  await page.waitForTimeout(500);await page.screenshot({path:'test-results/valdora-park-ao.png'});
  expect(errors).toEqual([]);
});
