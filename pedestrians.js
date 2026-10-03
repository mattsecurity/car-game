import * as THREE from 'three';
import {mayCross} from './simulation.js';

export class Citizens {
  constructor(world,{mobile=false,clock=()=>0}={}){
    this.world=world;this.clock=clock;this.drawDistance=mobile?85:150;this.group=new THREE.Group();this.peds=[];
    const random=(a,b)=>a+Math.random()*(b-a),blocks=world.pedBlocks||[];
    for(const b of blocks){
      if(this.peds.length>=(mobile?85:180))break;
      const r=32.5;
      const neighbor=blocks.some(o=>o.x===b.x+96&&o.z===b.z);
      const crossing=neighbor&&Math.random()<.35;
      const pts=crossing?[
        [b.x-r,b.z-r],[b.x+r,b.z-r],[b.x+96-r,b.z-r,0],[b.x+96+r,b.z-r],
        [b.x+96+r,b.z+r],[b.x+96-r,b.z+r],[b.x+r,b.z+r,0],[b.x-r,b.z+r]
      ]:[[b.x-r,b.z-r],[b.x+r,b.z-r],[b.x+r,b.z+r],[b.x-r,b.z+r]];
      for(let n=0;n<(mobile?1:2);n++){
        // Initial positions are on a sidewalk, never mid-crossing.
        const segment=crossing?(n===0?0:3):Math.floor(Math.random()*4);
        this.peds.push({route:pts,segment,t:Math.random()*.8,speed:random(1.28,1.5),scale:random(.92,1.09),phase:random(0,6.28),h:0,x:0,z:0,waiting:false,moving:true,pause:0});
      }
    }
    const N=this.peds.length;this.parts={};
    const sphere=new THREE.SphereGeometry(1,10,8),capsule=new THREE.CapsuleGeometry(1,1,4,8),shoe=new THREE.BoxGeometry(1,1,1);
    for(const name of ['torso','pelvis','head','hair','nose','upperL','upperR','shinL','shinR','shoeL','shoeR','armL','armR','foreL','foreR','handL','handR','neck','eyeL','eyeR','mouth','kneeL','kneeR','elbowL','elbowR']){
      const geo=['shoeL','shoeR'].includes(name)?sphere:['torso','upperL','upperR','shinL','shinR','armL','armR','foreL','foreR'].includes(name)?capsule:sphere;
      const mesh=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88}),N);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=!mobile;this.group.add(mesh);this.parts[name]=mesh;
    }
    const coats=[0x445363,0x9b8270,0x646d60,0x2c323b,0x8c4c42,0xb9b3a7],pants=[0x333d4c,0x4b4943,0x25292e],skin=[0xe6bb94,0xb57d59,0x754c36,0xc89570],hair=[0x27221e,0x574331,0x9c8964,0x847e74];
    this.peds.forEach((p,i)=>{p.colors={};const shirt=coats[i%coats.length],trousers=pants[i%3],face=skin[i%4];for(const [name,m] of Object.entries(this.parts)){const color=new THREE.Color(name==='hair'?hair[i%4]:['head','nose','handL','handR','neck','eyeL','eyeR','mouth','kneeL','kneeR','elbowL','elbowR'].includes(name)?face:name.startsWith('shoe')?0x25282b:['pelvis','upperL','upperR','shinL','shinR','kneeL','kneeR'].includes(name)?trousers:shirt);p.colors[name]=color;m.setColorAt(i,color);}});
    this.matrix=new THREE.Matrix4();this.root=new THREE.Matrix4();this.local=new THREE.Matrix4();this.quat=new THREE.Quaternion();this.rot=new THREE.Quaternion();this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.yAxis=new THREE.Vector3(0,1,0);this.xAxis=new THREE.Vector3(1,0,0);
  }
  // Personaggi realistici (crowd.js): sostituiscono i corpi procedurali, stessa logica di movimento
  useCrowd(crowd){
    this.crowd=crowd;for(const m of Object.values(this.parts))m.visible=false;this.group.add(crowd.group);
    this.peds.forEach((p,i)=>{p.type=i%crowd.types.length;p.animPhase=Math.random()*10;p.idle=Math.random()<.35?'phone':'idle';});
  }
  update(dt,player){
    if(this.crowd)this.crowd.begin(this.clock());
    const put=(name,i,x,y,z,sx,sy,sz,angle=0)=>{this.rot.setFromAxisAngle(this.xAxis,angle);this.local.compose(this.position.set(x,y,z),this.rot,this.scale.set(sx,sy,sz));this.matrix.multiplyMatrices(this.root,this.local);this.parts[name].setMatrixAt(i,this.matrix);};
    let slot=0;
    this.peds.forEach((p)=>{
      const a=p.route[p.segment],b=p.route[(p.segment+1)%p.route.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      const crossing=b[2]!==undefined;
      let blocked=false;
      if(crossing&&p.t<.002){
        blocked=!mayCross(this.clock(),b[2],length/p.speed);
        const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
        if(Math.hypot(player.pos.x-mx,player.pos.z-mz)<18)blocked=true;
      }
      // Waiting takes place at the curb; no panic offsets into the carriageway.
      p.waiting=blocked;p.moving=!blocked;
      if(!blocked)p.t=Math.min(1,p.t+dt*p.speed/length);
      p.x=a[0]+dx*p.t;p.z=a[1]+dz*p.t;
      if(Math.hypot(p.x-player.pos.x,p.z-player.pos.z)>this.drawDistance){if(p.t>=1){p.segment=(p.segment+1)%p.route.length;p.t=0;}return;}
      const i=slot++;
      for(const [name,mesh] of Object.entries(this.parts))mesh.setColorAt(i,p.colors[name]);
      const heading=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(heading-p.h),Math.cos(heading-p.h));p.h+=delta*(dt?1-Math.exp(-dt*9):1);
      if(this.crowd){this.crowd.add(p.type,p.x,.3,p.z,p.h,p.scale,p.moving?'walk':p.idle,p.animPhase,p.speed);if(p.t>=1){p.segment=(p.segment+1)%p.route.length;p.t=0;}return;}
      if(p.moving)p.phase+=dt*p.speed*5.4;
      const swing=(p.moving?1:0)*Math.sin(p.phase)*.34;
      const bob=p.moving?Math.cos(p.phase*2)*.015:0;
      this.quat.setFromAxisAngle(this.yAxis,p.h);this.root.compose(this.position.set(p.x,.3+bob,p.z),this.quat,this.scale.setScalar(p.scale));
      put('torso',i,0,1.19,0,.19,.16,.115);put('pelvis',i,0,.93,0,.17,.115,.11);
      put('neck',i,0,1.48,0,.048,.06,.05);put('head',i,0,1.62,0,.108,.14,.104);put('eyeL',i,-.036,1.645,.093,.011,.007,.008);put('eyeR',i,.036,1.645,.093,.011,.007,.008);put('mouth',i,0,1.577,.097,.024,.004,.006);put('hair',i,0,1.70,-.008,.112,.071,.108);put('nose',i,0,1.61,.103,.026,.03,.032);
      for(const side of [-1,1]){
        const suffix=side<0?'L':'R',hip=swing*side,knee=Math.max(0,-Math.sin(p.phase+(side<0?0:Math.PI)))*.52;
        const kneeY=.90-.40*Math.cos(hip),kneeZ=-.40*Math.sin(hip),shinAngle=hip+knee;
        put('upper'+suffix,i,side*.095,.90-.20*Math.cos(hip),-.20*Math.sin(hip),.072,.135,.072,hip);
        put('knee'+suffix,i,side*.095,kneeY,kneeZ,.065,.065,.065);
        put('shin'+suffix,i,side*.095,kneeY-.20*Math.cos(shinAngle),kneeZ-.20*Math.sin(shinAngle),.053,.132,.06,shinAngle);
        put('shoe'+suffix,i,side*.095,Math.max(.055,kneeY-.40*Math.cos(shinAngle)),kneeZ-.40*Math.sin(shinAngle)+.05,.075,.055,.14);
        const arm=-hip*.7,elbowY=1.39-.27*Math.cos(arm),elbowZ=-.27*Math.sin(arm),fore=arm-.15;
        put('arm'+suffix,i,side*.235,1.39-.135*Math.cos(arm),-.135*Math.sin(arm),.054,.095,.058,arm);
        put('elbow'+suffix,i,side*.235,elbowY,elbowZ,.049,.05,.05);
        put('fore'+suffix,i,side*.235,elbowY-.115*Math.cos(fore),elbowZ-.115*Math.sin(fore),.045,.082,.048,fore);
        put('hand'+suffix,i,side*.235,elbowY-.265*Math.cos(fore),elbowZ-.265*Math.sin(fore),.047,.066,.035,fore);
      }
      if(p.t>=1){p.segment=(p.segment+1)%p.route.length;p.t=0;}
    });
    if(this.crowd){this.crowd.commit();return;}
    for(const m of Object.values(this.parts)){m.count=slot;m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;}
  }
  dispose(){if(this.crowd)this.crowd.dispose();this.group.removeFromParent();const geometry=new Set();for(const m of Object.values(this.parts)){geometry.add(m.geometry);m.material.dispose();}geometry.forEach(g=>g.dispose());}
}
