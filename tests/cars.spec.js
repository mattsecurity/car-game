import {test,expect} from '@playwright/test';
import {readFileSync,statSync} from 'node:fs';
import {targetFreq,pickGrain,GRAIN} from '../granular-engine.js';

const banks=['falcone','brutus','fuoco'].map(id=>JSON.parse(readFileSync(new URL(`../assets/engines/${id}.json`,import.meta.url))));

test('engine grain banks are sorted, dense and inside their recordings',()=>{
  for(const b of banks){
    expect(b.grains.length).toBeGreaterThanOrEqual(40);
    const wav=statSync(new URL(`../assets/engines/${b.id}.wav`,import.meta.url)).size;
    expect(Math.abs((wav-44)/2/b.sr-b.duration)).toBeLessThan(0.01);
    for(let i=0;i<b.grains.length;i++){
      const [t,f]=b.grains[i];
      expect(t).toBeGreaterThan(0);expect(t).toBeLessThan(b.duration);
      if(i)expect(f).toBeGreaterThanOrEqual(b.grains[i-1][1]);
    }
    expect(b.fMax/b.fMin).toBeGreaterThan(1.1);
    expect(b.license).toMatch(/CC BY/);
  }
});

test('target pitch rises with rpm and grain rates stay bounded',()=>{
  for(const b of banks){
    let prev=0;
    for(let r=0;r<=1;r+=0.05){
      const f=targetFreq(b,r);expect(f).toBeGreaterThan(prev);prev=f;
      const g=pickGrain(b,f,()=>0.5);
      expect(g.rate).toBeGreaterThanOrEqual(GRAIN.minRate);expect(g.rate).toBeLessThanOrEqual(GRAIN.maxRate);
      // il tono riprodotto coincide con l'obiettivo, salvo i limiti di velocità
      if(g.rate>GRAIN.minRate&&g.rate<GRAIN.maxRate){const grain=b.grains.find(x=>x[0]===g.t);expect(Math.abs(grain[1]*g.rate/f-1)).toBeLessThan(0.02);}
    }
  }
});

async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  return errors;
}

test('Falcone gets the real glTF model with four turning wheels at the physical length',async({page})=>{
  const errors=await boot(page);
  await page.waitForFunction(()=>!!window.__dbg.car.model,null,{timeout:30000});
  const r=await page.evaluate(()=>{
    const c=window.__dbg.car, THREE=c.group.position.constructor;
    c.group.updateMatrixWorld(true);
    let min=Infinity,max=-Infinity;
    c.model.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
      for(const z of [b.min.z,b.max.z]){const p=new THREE(0,0,z).applyMatrix4(o.matrixWorld).sub(c.group.position);
        const lz=p.x*Math.sin(c.heading)+p.z*Math.cos(c.heading);min=Math.min(min,lz);max=Math.max(max,lz);}});
    // ruote anteriori raddrizzate (il modello le ha sterzate di 30°): stessa larghezza delle posteriori
    const widths=c.wheels.map(w=>{let mn=Infinity,mx=-Infinity;w.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();mn=Math.min(mn,o.geometry.boundingBox.min.x);mx=Math.max(mx,o.geometry.boundingBox.max.x);});return mx-mn;});
    c.steer=c.cfg.maxSteer;c.syncMesh(1,window.__dbg.world);const maxAngle=Math.max(...c.frontPivots.map(p=>Math.abs(p.rotation.y)));c.steer=0;
    const before=c.wheels.map(w=>w.rotation.x);c.vz=10;c.syncMesh(0.1,window.__dbg.world);
    return {len:max-min,cfgLen:c.cfg.body.l,wheels:c.wheels.length,front:c.frontPivots.length,modelWheels:c.modelWheels,
      spun:c.wheels.every((w,i)=>w.rotation.x!==before[i]),widths,maxAngle,hiddenProcedural:c.chassis.children.filter(o=>o.isMesh).every(o=>!o.visible)};
  });
  expect(r.modelWheels).toBe(true);expect(r.wheels).toBe(4);expect(r.front).toBe(2);expect(r.spun).toBe(true);
  expect(Math.abs(r.len/r.cfgLen-1)).toBeLessThan(0.05);
  expect(Math.max(...r.widths)/Math.min(...r.widths)).toBeLessThan(1.1);expect(r.maxAngle).toBeLessThanOrEqual(0.661);expect(r.hiddenProcedural).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/falcone-model.png'});
});

test('a vehicle without a model file stays procedural and swapping keeps working',async({page})=>{
  const errors=await boot(page);
  await page.locator('#startBtn').click();
  await page.keyboard.press('3');await page.waitForTimeout(1500);
  const r=await page.evaluate(()=>({id:window.__dbg.car.cfg.id,model:!!window.__dbg.car.model,visible:window.__dbg.car.chassis.children.some(o=>o.isMesh&&o.visible)}));
  expect(r.id).toBe('volt');expect(r.model).toBe(false);expect(r.visible).toBe(true);
  await page.keyboard.press('1');await page.waitForFunction(()=>window.__dbg.car.cfg.id==='falcone'&&!!window.__dbg.car.model,null,{timeout:30000});
  expect(errors).toEqual([]);
});

test('recorded engine plays through grains after a user gesture',async({page})=>{
  const errors=await boot(page);
  await page.locator('#startBtn').click();
  await page.keyboard.down('w');
  await page.waitForFunction(()=>window.__dbg.audio.gran&&window.__dbg.audio.gran.scheduled>10,null,{timeout:20000});
  await page.waitForTimeout(800);
  const r=await page.evaluate(()=>({bank:window.__dbg.audio.gran.bank.id,scheduled:window.__dbg.audio.gran.scheduled,synth:window.__dbg.audio.g1.gain.value}));
  await page.keyboard.up('w');
  expect(r.bank).toBe('falcone');expect(r.scheduled).toBeGreaterThan(20);expect(r.synth).toBeLessThan(0.01);expect(errors).toEqual([]);
});
