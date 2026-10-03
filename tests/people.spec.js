import {test,expect} from '@playwright/test';
import {readFileSync,statSync,mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {bakePeople} from '../tools/bake-people.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const src=root+'test-results/people-src', out=root+'test-results/people-fixture';

test('the people baker turns a skinned glTF into a mesh, a bone texture and clip metadata',async()=>{
  test.setTimeout(120000);
  mkdirSync(src,{recursive:true});copyFileSync(root+'tests/fixtures/CesiumMan.glb',src+'/cesiumman.glb');
  const done=await bakePeople(src,out);
  expect(done).toEqual(['cesiumman']);
  const meta=JSON.parse(readFileSync(out+'/cesiumman.json'));
  expect(meta.bones).toBe(19);expect(meta.clips.walk.frames).toBe(60);
  expect(meta.texture.width).toBe(19*4);expect(meta.texture.height).toBe(60);
  expect(statSync(out+'/cesiumman.anim.bin').size).toBe(meta.texture.width*meta.texture.height*4*2);
  expect(meta.meshes.length).toBe(1);expect(meta.height).toBeGreaterThan(1);
});

test('pedestrians switch to skinned instanced people without shader errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/i.test(m.text()))errors.push(m.text());});
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  await page.locator('#startBtn').click();
  const r=await page.evaluate(async()=>{
    const C=await import('/crowd.js');
    const types=await C.loadCrowdTypes(new URL('/test-results/people-fixture/',location.href));
    const {peds,car}=window.__dbg;
    peds.useCrowd(new C.Crowd(types,peds.peds.length+2));
    for(let i=0;i<30;i++)peds.update(1/30,car);
    // una persona davanti alla camera, poi un fotogramma reale
    const cr=peds.crowd;cr.begin(1);cr.add(0,car.pos.x+3,0.3,car.pos.z+4,0,1,'walk',0,1.4);cr.add(0,car.pos.x-3,0.3,car.pos.z+4,0,1,'idle',0,1);cr.commit();
    const {renderer,scene,camera,composer}=window.__dbg.three;(composer||renderer).render(scene,camera);
    const procedural=Object.values(peds.parts).every(m=>!m.visible);
    return {types:types.length,count:cr.perType[0].meshes[0].count,procedural,programs:renderer.info.programs.length};
  });
  expect(r.types).toBe(1);expect(r.count).toBe(2);expect(r.procedural).toBe(true);
  await page.waitForTimeout(300);await page.screenshot({path:'test-results/people-fixture.png'});
  expect(errors).toEqual([]);
});
