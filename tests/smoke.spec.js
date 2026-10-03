import {test,expect} from '@playwright/test';

test('tyre smoke billows from sliding wheels, lingers, grows and stays above the road',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  const r=await page.evaluate(()=>{
    const {car,world,smoke,three}=window.__dbg,cam=three.camera,dt=1/60;if(!car.dyn)car.update(1/120,world);
    const W=car.dyn.wheels,load=car.dyn.p.m*9.81/4;
    const slide=v=>W.forEach((w,i)=>{w.slide=i>=2?v:0;w.fz=load;w.omega=i>=2?v/w.R:0;});
    const run=(n)=>{for(let i=0;i<n;i++){smoke.emitFromCar(car,world,dt);smoke.update(dt,cam);}};
    smoke.clear();car.contact=true;
    slide(1.5);run(60);const grip=smoke.count;                       // rotolamento normale: niente fumo
    slide(14);run(90);const burning=smoke.count;                     // burnout 1.5 s
    const P=smoke.aPS.array,C=smoke.aCA.array;
    cam.position.set(car.pos.x+8,car.pos.y+3,car.pos.z+8);cam.lookAt(car.pos.x,car.pos.y+1,car.pos.z);cam.updateMatrixWorld();
    smoke.update(0,cam);
    const f=cam.getWorldDirection(new cam.position.constructor());let sorted=true,prev=Infinity;
    for(let j=0;j<smoke.count;j++){const d=(P[j*4]-cam.position.x)*f.x+(P[j*4+1]-cam.position.y)*f.y+(P[j*4+2]-cam.position.z)*f.z;if(d>prev+1e-4)sorted=false;prev=d;}
    if(three.composer)three.composer.render();else three.renderer.render(three.scene,cam);   // compila lo shader
    slide(0);run(180);                                                // 3 s dopo lo stop
    let maxSize=0,minAbove=Infinity,maxAlpha=0;
    for(let j=0;j<smoke.count;j++){maxSize=Math.max(maxSize,P[j*4+3]);maxAlpha=Math.max(maxAlpha,C[j*4+3]);
      minAbove=Math.min(minAbove,P[j*4+1]-world.height(P[j*4],P[j*4+2]));}
    const lingering=smoke.count;run(420);
    const meshes=[];three.scene.traverse(o=>{if(o.name==='tire-smoke')meshes.push(o);});
    return {grip,burning,sorted,lingering,maxSize,minAbove,maxAlpha,gone:smoke.count,meshes:meshes.length,
      program:three.renderer.info.programs.some(p=>p.cacheKey.includes('tire-smoke'))};
  });
  expect(r.grip).toBe(0);
  expect(r.burning).toBeGreaterThan(60);                              // due ruote × ~30 sbuffi/s
  expect(r.sorted).toBe(true);
  expect(r.lingering).toBeGreaterThan(40);                            // il fumo resta nell'aria per secondi
  expect(r.maxSize).toBeGreaterThan(3);                               // e si gonfia fino a diversi metri
  expect(r.minAbove).toBeGreaterThan(0);
  expect(r.maxAlpha).toBeLessThan(0.9);
  expect(r.gone).toBe(0);
  expect(r.meshes).toBe(1);
  expect(r.program).toBe(true);
  expect(errors).toEqual([]);
});

test('dust off-road and spray in the rain, not white tyre smoke',async({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  const r=await page.evaluate(()=>{
    const {car,world,smoke,three}=window.__dbg,dt=1/60;if(!car.dyn)car.update(1/120,world);const W=car.dyn.wheels,load=car.dyn.p.m*9.81/4;
    W.forEach(w=>{w.slide=0;w.fz=load;w.omega=20/w.R;});car.contact=true;car.vel.set(Math.sin(car.heading)*20,0,Math.cos(car.heading)*20);
    const colors=()=>{const C=smoke.aCA.array,out=[];for(let j=0;j<smoke.count;j++)out.push([C[j*4],C[j*4+1],C[j*4+2]]);return out;};
    const dirt={...world,surface:()=>({grip:.6,roll:8,dust:true})};
    smoke.clear();for(let i=0;i<60;i++){smoke.emitFromCar(car,dirt,dt);smoke.update(dt,three.camera);}
    const dust=colors();
    smoke.clear();for(let i=0;i<60;i++){smoke.emitFromCar(car,world,dt,{rain:true});smoke.update(dt,three.camera);}
    const spray=smoke.count;car.vel.set(0,0,0);smoke.clear();return {dust,spray};
  });
  expect(r.dust.length).toBeGreaterThan(10);
  expect(r.dust.every(([red,g,b])=>red>b*1.2)).toBe(true);           // marrone, non bianco
  expect(r.spray).toBeGreaterThan(10);
});

test('drifting in game leaves a visible smoke cloud',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  await page.evaluate(()=>{window.__dbg.state.policeOn=false;});
  await page.locator('#startBtn').click();
  await page.keyboard.down('w');await page.waitForTimeout(2600);
  await page.keyboard.down('Space');await page.keyboard.down('a');await page.waitForTimeout(1200);
  const live=await page.evaluate(()=>window.__dbg.smoke.count);
  await page.keyboard.up('a');await page.keyboard.up('Space');await page.keyboard.up('w');
  await page.waitForTimeout(400);
  await page.screenshot({path:'test-results/smoke-drift.png'});
  expect(live).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
