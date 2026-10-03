import {test,expect} from '@playwright/test';
import {signalState,mayCross} from '../simulation.js';

test('signals have exclusive greens, clearance and safe pedestrian entry windows',()=>{
  for(let t=0;t<132;t+=.125)expect(signalState(t,0).phase==='green'&&signalState(t,1).phase==='green').toBe(false);
  for(const t of [31,32,64,65]){expect(signalState(t,0).phase).toBe('red');expect(signalState(t,1).phase).toBe('red');}
  expect(mayCross(0,0,22)).toBe(false);expect(mayCross(33,0,22)).toBe(true);expect(mayCross(45,0,22)).toBe(false);
});

test('coast immediately previews, initializes above ground and can be driven',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  await page.getByRole('button',{name:/Riviera del Sole/}).click();
  expect(await page.evaluate(()=>window.__dbg.world.id)).toBe('coast');
  await expect(page.locator('#menu')).toBeVisible();await page.screenshot({path:'test-results/riviera-garage.png'});
  await page.locator('#startBtn').click();
  const checks=await page.evaluate(()=>{
    const {world,three,traffic}=window.__dbg;
    return {terrain:world.samples.every(s=>Math.abs(world.height(s.x,s.z)-s.y-.06)<.08),cameraClearance:three.camera.position.y-world.height(three.camera.position.x,three.camera.position.z),traffic:traffic.cars.every(c=>Number.isFinite(c.pos.x)&&Math.hypot(c.pos.x,c.pos.z)>100),start:window.__dbg.car.pos.toArray()};
  });
  expect(checks.terrain).toBe(true);expect(checks.cameraClearance).toBeGreaterThan(.2);expect(checks.traffic).toBe(true);
  await page.keyboard.down('w');await page.waitForTimeout(2000);await page.keyboard.up('w');
  const motion=await page.evaluate(()=>({pos:window.__dbg.car.pos.toArray(),v:window.__dbg.car.vel.length(),y:window.__dbg.car.group.position.y,terrain:window.__dbg.world.height(window.__dbg.car.pos.x,window.__dbg.car.pos.z)}));
  expect(Math.hypot(motion.pos[0]-checks.start[0],motion.pos[2]-checks.start[2])).toBeGreaterThan(2);expect(motion.y).toBeGreaterThan(motion.terrain-.2);expect(Number.isFinite(motion.v)).toBe(true);
  await page.screenshot({path:'test-results/riviera-driving.png'});expect(errors).toEqual([]);
});

test('traffic stops before red and resumes on green; pedestrians wait at the curb',async({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  const result=await page.evaluate(()=>{
    const {world,traffic,sim,peds}=window.__dbg;
    const player={pos:{x:9999,z:9999},vel:{x:0,z:0},impacts:[]};
    const c=traffic.cars[0];traffic.cars=[c];c.ci=1;c.cj=0;c.dir=0;traffic.setLeg(c);c.t=.6;c.speed=10;c.heading=0;c.pos.lerpVectors(c.from,c.to,c.t);
    sim.set(33);for(let i=0;i<600;i++)traffic.update(1/60,player);
    const stop=(1-c.t)*c.legLen,stopped=c.speed,red=world.tlMats[0].r.emissiveIntensity;
    sim.set(0);for(let i=0;i<120;i++)traffic.update(1/60,player);const released=c.speed;
    const p=peds.peds.find(p=>p.route.some(b=>b[2]===0));
    p.segment=p.route.findIndex((a,i)=>p.route[(i+1)%p.route.length][2]===0);p.t=0;sim.set(0);peds.update(1,player);const waits=p.waiting&&p.t===0;
    sim.set(33);peds.update(1,player);const crosses=p.t>0&&!p.waiting;
    return {stop,stopped,released,red,waits,crosses,parts:Object.keys(peds.parts).length};
  });
  expect(result.stop).toBeGreaterThanOrEqual(19.59);expect(result.stop).toBeLessThan(20);expect(result.stopped).toBeLessThan(.05);expect(result.released).toBeGreaterThan(2);expect(result.red).toBeGreaterThan(1);expect(result.waits).toBe(true);expect(result.crosses).toBe(true);expect(result.parts).toBeGreaterThan(12);
});

test('steering without throttle does not add energy, gravity acts when airborne',async({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  const result=await page.evaluate(()=>{
    const {car,state,keys}=window.__dbg,road={id:'city',height:()=>0,surface:()=>({grip:1,roll:1,dust:false}),colliders:[],bound:1000};
    car.reset(0,0,0);car.vel.set(0,0,25);keys.left=true;state.gripMul=1;let max=0;
    for(let i=0;i<1200;i++){car.update(1/120,road);max=Math.max(max,car.vel.length());}keys.left=false;
    car.reset(0,0,0);car.rideInitialized=true;car.rideY=4;car.verticalSpeed=0;
    car.update(1/120,road);return {max,falling:car.verticalSpeed<0,airborne:!car.contact};
  });expect(result.max).toBeLessThanOrEqual(25.01);expect(result.falling).toBe(true);expect(result.airborne).toBe(true);
});
