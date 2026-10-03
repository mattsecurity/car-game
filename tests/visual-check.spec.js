import {test,expect} from '@playwright/test';
test('pedestrian close-up renders without runtime errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
 await page.evaluate(()=>{
   const d=window.__dbg,p=d.peds.peds.reduce((a,b)=>Math.hypot(a.x-d.car.pos.x,a.z-d.car.pos.z)<Math.hypot(b.x-d.car.pos.x,b.z-d.car.pos.z)?a:b);
   d.state.running=false;d.state.paused=false;document.body.classList.remove('in-menu');document.body.classList.add('photo');document.getElementById('menu').classList.add('hidden');
   d.three.camera.position.set(p.x+2.6,1.6,p.z+3);d.three.camera.lookAt(p.x,1.1,p.z);d.three.camera.fov=42;d.three.camera.updateProjectionMatrix();
 });
 await page.screenshot({path:'test-results/citizen-detail.png'});expect(errors).toEqual([]);
});
