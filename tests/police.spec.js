import {test,expect} from '@playwright/test';
import {Wanted} from '../police.js';

test('wanted: speed gives one star, evasion clears, standing still near a cop busts',()=>{
  const w=new Wanted();
  for(let i=0;i<300;i++)w.crime('speed',1/60);expect(w.level).toBe(1);
  w.crime('red');expect(w.level).toBe(2);
  let r;for(let i=0;i<Math.round(60*13.9);i++)r=w.update(1/60,{seen:false,playerSpeed:0,copNear:99});expect(w.level).toBe(2);
  for(let i=0;i<18;i++)w.update(1/60,{seen:false,playerSpeed:0,copNear:99});expect(w.level).toBe(0);
  w.crime('ram');r=undefined;for(let i=0;i<186&&r!=='busted';i++)r=w.update(1/60,{seen:true,playerSpeed:0,copNear:4});expect(r).toBe('busted');
});

async function start(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  await page.locator('#startBtn').click();
  return errors;
}

// Stato di partenza comune: una sola volante, giocatore fermo alla partenza di Valdora.
const SETUP=`const P=window.__dbg.police, car=window.__dbg.car, W=window.__dbg.world;
  while(P.units.length>1)P.removeUnit(P.units[P.units.length-1]);
  car.reset(W.start.x,W.start.z,W.start.h);P.wanted.reset();P.spawnT=1e9;P.roadblockT=1e9;
  const u=P.units[0];
  // il giocatore resta senza input ma con la propria fisica (attrito, collisioni)
  const run=(sec,fn)=>{for(let i=0;i<Math.round(sec*60);i++){for(let k=0;k<2;k++){car.update(1/120,W);P.step(1/120);}P.frame(1/60);if(fn&&fn())return true;}return false;};`;

test('speeding in front of a patrol car starts a pursuit',async({page})=>{
  const errors=await start(page);
  const r=await page.evaluate(`(()=>{${SETUP}
    u.car.reset(W.start.x,W.start.z+30,Math.PI);u.state='patrol';u.initPatrol();
    car.vel.set(0,0,30);
    const hit=run(3,()=>P.wanted.level>=1&&u.state==='pursuit');
    return {hit,level:P.wanted.level,state:u.state,siren:u.siren};})()`);
  expect(r.hit).toBe(true);expect(r.level).toBeGreaterThanOrEqual(1);expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/police-pursuit.png'});
});

test('a pursuing car reaches a stopped player and arrests them',async({page})=>{
  const errors=await start(page);
  const r=await page.evaluate(`(()=>{${SETUP}
    u.car.reset(W.start.x,W.start.z+80,Math.PI);u.state='pursuit';
    P.wanted.heat=2;P.wanted.level=2;P.lastSeen={x:car.pos.x,z:car.pos.z};
    let busted=false,t=0;P.d.onBusted=()=>{busted=true;};
    run(40,()=>{t+=1/60;return busted;});
    return {busted,t,finite:Number.isFinite(u.car.pos.x)};})()`);
  expect(r.busted).toBe(true);expect(r.finite).toBe(true);expect(errors).toEqual([]);
});

test('staying out of sight clears the wanted level',async({page})=>{
  const errors=await start(page);
  const r=await page.evaluate(`(()=>{${SETUP}
    P.removeUnit(u);P.wanted.heat=2;P.wanted.level=2;P.lastSeen={x:car.pos.x,z:car.pos.z};
    const early=run(13.8,()=>P.wanted.level===0);
    const cleared=run(0.5,()=>P.wanted.level===0);
    return {early,cleared,level:P.wanted.level};})()`);
  expect(r.early).toBe(false);expect(r.cleared).toBe(true);expect(errors).toEqual([]);
});

test('six police cars stay finite and out of buildings for a minute at five stars',async({page})=>{
  const errors=await start(page);
  const r=await page.evaluate(`(()=>{${SETUP}
    P.spawnT=0;P.wanted.heat=5.5;P.wanted.level=5;P.lastSeen={x:car.pos.x,z:car.pos.z};P.alertAll();
    let max=0,bad=0;
    run(60,()=>{max=Math.max(max,P.units.length);
      for(const v of P.units){const c=v.car;if(!Number.isFinite(c.pos.x)||!Number.isFinite(c.pos.z)||!Number.isFinite(c.vel.x))bad++;
        for(const b of W.colliders)if(c.pos.x>b.minx+.3&&c.pos.x<b.maxx-.3&&c.pos.z>b.minz+.3&&c.pos.z<b.maxz-.3)bad++;}
      P.wanted.bustT=0;return false;});
    return {max,bad,units:P.units.length};})()`);
  expect(r.max).toBeGreaterThanOrEqual(5);expect(r.bad).toBe(0);expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/police-five-stars.png'});
});

test('on the Riviera a pursuing car catches up along the coast road',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  await page.getByRole('button',{name:/Riviera del Sole/}).click();await page.locator('#startBtn').click();
  const r=await page.evaluate(()=>{
    const P=window.__dbg.police, car=window.__dbg.car, W=window.__dbg.world, S=W.samples, N=S.length;
    while(P.units.length>1)P.removeUnit(P.units[P.units.length-1]);
    P.spawnT=1e9;P.wanted.heat=2;P.wanted.level=2;
    // giocatore scriptato lungo la spline a 18 m/s (velocità sostenibile anche nei tornanti), volante 45 m dietro
    let idx=40,frac=0;const seg=i=>Math.hypot(S[(i+1)%N].x-S[i].x,S[(i+1)%N].z-S[i].z);
    // velocità del giocatore limitata dalla curvatura locale (0.9 g laterali), massimo 18 m/s
    const vAt=i=>{const a=S[(i-6+N)%N],b=S[(i+6)%N];const th=Math.abs(Math.atan2(Math.sin(Math.atan2(b.dx,b.dz)-Math.atan2(a.dx,a.dz)),Math.cos(Math.atan2(b.dx,b.dz)-Math.atan2(a.dx,a.dz))));const len=Math.hypot(b.x-a.x,b.z-a.z);return Math.min(18,Math.sqrt(0.9*9.81*len/Math.max(th,1e-3)));};
    let pv=18;const place=()=>{const a=S[idx%N];car.pos.set(a.x+a.dz*3.5,0,a.z-a.dx*3.5);car.heading=Math.atan2(a.dx,a.dz);car.vel.set(a.dx*pv,0,a.dz*pv);};
    place();let back=idx,dist=0;while(dist<45){back=(back-1+N)%N;dist+=seg(back);}
    const b=S[back],u=P.units[0];u.car.reset(b.x+b.dz*3.5,b.z-b.dx*3.5,Math.atan2(b.dx,b.dz));u.state='pursuit';u.idx=back;
    P.lastSeen={x:car.pos.x,z:car.pos.z};
    let minGap=1e9,off=0;
    for(let i=0;i<60*30;i++){
      pv=vAt(idx%N);frac+=pv/60;while(frac>seg(idx%N)){frac-=seg(idx%N);idx++;}place();
      P.step(1/120);P.step(1/120);P.frame(1/60);P.wanted.bustT=0;const T=window.__dbg.traffic;if(T)T.update(1/60,car);
      const d=Math.hypot(u.pos.x-car.pos.x,u.pos.z-car.pos.z);if(i>60*12)minGap=Math.min(minGap,d);
      const k=P.nearestSample(u.pos.x,u.pos.z,u.idx),s=S[k];if(Math.hypot(u.pos.x-s.x,u.pos.z-s.z)>12)off++;
    }
    return {minGap,off,finite:Number.isFinite(u.pos.x)&&Number.isFinite(u.car.vel.x),level:P.wanted.level};
  });
  expect(r.finite).toBe(true);// gli urti col traffico possono mandarla sull'erba: conta che rientri e raggiunga il giocatore
  expect(r.minGap).toBeLessThan(40);expect(r.off).toBeLessThan(60*9);expect(errors).toEqual([]);
});

test('in Valdora a pursuing car catches a moving player without entering buildings',async({page})=>{
  const errors=await start(page);
  const r=await page.evaluate(`(()=>{${SETUP}
    u.car.reset(W.start.x,W.start.z-45,0);u.state='pursuit';
    P.wanted.heat=2;P.wanted.level=2;P.lastSeen={x:car.pos.x,z:car.pos.z};
    let minGap=1e9,bad=0,z=W.start.z;
    for(let i=0;i<60*25;i++){
      z+=18/60;car.pos.set(W.start.x,0,z);car.heading=0;car.vel.set(0,0,18);
      for(let k=0;k<2;k++)P.step(1/120);P.frame(1/60);P.wanted.bustT=0;const T=window.__dbg.traffic;if(T)T.update(1/60,car);
      const c=u.car;if(i>60*8)minGap=Math.min(minGap,Math.hypot(c.pos.x-car.pos.x,c.pos.z-car.pos.z));
      for(const b of W.colliders)if(c.pos.x>b.minx+.3&&c.pos.x<b.maxx-.3&&c.pos.z>b.minz+.3&&c.pos.z<b.maxz-.3)bad++;
    }
    return {minGap,bad,finite:Number.isFinite(u.pos.x)};})()`);
  expect(r.finite).toBe(true);expect(r.minGap).toBeLessThan(25);expect(r.bad).toBe(0);expect(errors).toEqual([]);
});
