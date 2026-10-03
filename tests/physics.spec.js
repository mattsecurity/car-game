import {test,expect} from '@playwright/test';
import {VehicleDynamics,tireForces} from '../vehicle-physics.js';
import {VEHICLES} from '../vehicles.js';

const DT=1/240, flat={height:()=>0,surface:()=>({grip:1,roll:1}),gripMul:1,slope:0};
const car0=()=>({pos:{x:0,z:0},vel:{x:0,z:0},heading:0,yawRate:0,rideY:0,verticalSpeed:0});
const speed=c=>Math.hypot(c.vel.x,c.vel.z);
const cfg=id=>VEHICLES.find(v=>v.id===id);
function settle(d,c){for(let i=0;i<480;i++)d.step(c,DT,{throttle:0,brake:0,steer:0},flat);}

test('tyre: grip saturates near the peak slip and never exceeds mu·Fz',()=>{
  let peak=0;for(let k=0;k<=1;k+=0.005){const f=tireForces(k,0,4000,1.2,0.11,0.13);peak=Math.max(peak,f.fx);expect(f.fx).toBeLessThanOrEqual(4800+1e-6);}
  expect(peak).toBeGreaterThan(4800*0.98);
  const locked=tireForces(-1,0,4000,1.2,0.11,0.13).fx;expect(-locked).toBeGreaterThan(4800*0.8);expect(-locked).toBeLessThan(4800*0.95);
  // slittamento combinato: frenando forte resta meno aderenza laterale
  expect(Math.abs(tireForces(-0.11,0.13,4000,1.2,0.11,0.13).fy)).toBeLessThan(Math.abs(tireForces(0,0.13,4000,1.2,0.11,0.13).fy));
});

test('0-100 km/h and top speeds are realistic for every car',()=>{
  const range={falcone:[3,5],brutus:[4.5,7.5],volt:[4,7],fuoco:[2.4,4]};
  for(const v of VEHICLES){
    const d=new VehicleDynamics(v),c=car0();settle(d,c);let t=0,t100=null,vmax=0;
    for(let i=0;i<240*60;i++){d.step(c,DT,{throttle:1,brake:0,steer:0},flat);t+=DT;const s=speed(c);vmax=Math.max(vmax,s);if(!t100&&s>=27.78)t100=t;}
    expect(t100,v.id).toBeGreaterThan(range[v.id][0]);expect(t100,v.id).toBeLessThan(range[v.id][1]);
    expect(vmax,v.id).toBeGreaterThan(v.topSpeed*0.9);expect(vmax,v.id).toBeLessThan(v.topSpeed*1.08);
  }
});

test('braking from 100 km/h is close to v²/(2μg) and pitches the nose down',()=>{
  for(const v of VEHICLES.filter(x=>!x.df)){
    const d=new VehicleDynamics(v),c=car0();settle(d,c);c.vel.z=27.78;d.synced=false;
    let pitch=0,frontLoad=0,n=0;
    while(speed(c)>0.3&&n<240*20){d.step(c,DT,{throttle:0,brake:1,steer:0},flat);n++;if(n===120){pitch=d.pitch;frontLoad=d.wheels[0].fz+d.wheels[1].fz;}}
    const mu=Math.min(v.muF,v.muR),ideal=27.78**2/(2*mu*9.81);
    expect(c.pos.z,v.id).toBeGreaterThan(ideal*0.8);expect(c.pos.z,v.id).toBeLessThan(ideal*1.35);
    expect(pitch,v.id).toBeGreaterThan(0.005);                                // muso giù
    expect(frontLoad,v.id).toBeGreaterThan(v.mass*9.81*v.bDist/v.wheelBase);  // carico trasferito all'anteriore
  }
});

test('steady cornering reaches about mu·g and the body rolls to the outside',()=>{
  for(const id of ['falcone','brutus']){
    const v=cfg(id),d=new VehicleDynamics(v),c=car0();settle(d,c);c.vel.z=22;d.synced=false;let amax=0,roll=0;
    for(let i=0;i<240*8;i++){const s=speed(c);d.step(c,DT,{throttle:Math.max(0,Math.min(1,(22-s)*0.5)),brake:0,steer:Math.min(0.2,i/(240*6)*0.2)},flat);
      if(Math.abs(d.aLat)>amax){amax=Math.abs(d.aLat);roll=d.roll;}}
    const mu=Math.min(v.muF,v.muR);
    expect(amax/9.81,id).toBeGreaterThan(mu*0.8);expect(amax/9.81,id).toBeLessThan(Math.max(v.muF,v.muR)*1.15);
    expect(roll,id).toBeGreaterThan(0.004);   // curva a sinistra: il lato sinistro si alza (rollio verso l'esterno)
  }
});

test('without assists the wheels lock under full braking; with ABS they keep rolling',()=>{
  const v=cfg('falcone');
  const run=assists=>{const d=new VehicleDynamics(v),c=car0();d.assists=assists;settle(d,c);c.vel.z=25;d.synced=false;
    let minK=0;for(let i=0;i<240;i++){d.step(c,DT,{throttle:0,brake:1,steer:0,assists},flat);minK=Math.min(minK,...d.wheels.map(w=>w.kappa));}return minK;};
  expect(run(false)).toBeLessThan(-0.6);expect(run(true)).toBeGreaterThan(-0.45);
});

test('a minute of random driving stays finite on bumpy ground',()=>{
  const bumpy={...flat,height:(x,z)=>0.08*Math.sin(x*0.7)*Math.cos(z*0.5)};
  for(const v of VEHICLES){
    const d=new VehicleDynamics(v),c=car0();let seed=7;const rnd=()=>((seed=seed*16807%2147483647)/2147483647);
    let inp={throttle:0,brake:0,steer:0,handbrake:false};
    for(let i=0;i<240*60;i++){if(i%120===0)inp={throttle:rnd(),brake:rnd()<0.2?rnd():0,steer:(rnd()-0.5)*0.8,handbrake:rnd()<0.1};d.step(c,DT,inp,bumpy);}
    expect([c.pos.x,c.pos.z,c.vel.x,c.vel.z,c.heading,c.rideY,d.pitch,d.roll,...d.wheels.map(w=>w.omega)].every(Number.isFinite),v.id).toBe(true);
  }
});
