import {test,expect} from '@playwright/test';

test('garage, all vehicles, driving, weather, pause, photo and coast',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  await expect(page.locator('#carCards .card')).toHaveCount(4);
  await page.screenshot({path:'test-results/garage.png'});
  for(const name of ['BRUTUS 502','VOLT PIXIE EV','FUOCO F1-90','FALCONE GT-S']){
    await page.getByRole('button',{name,exact:true}).click();
    expect(await page.evaluate(()=>window.__dbg.car.cfg.name)).toBe(name);
  }
  await page.locator('#startBtn').click();
  const start=await page.evaluate(()=>window.__dbg.car.pos.z);
  await page.keyboard.down('w');await page.waitForTimeout(2200);await page.keyboard.up('w');
  expect(await page.evaluate(()=>window.__dbg.car.pos.z)).toBeGreaterThan(start+1);
  expect(await page.evaluate(()=>window.__dbg.audio.ctx.state)).toBe('running');
  await page.keyboard.down('s');await page.waitForTimeout(700);await page.keyboard.up('s');
  await page.locator('#settingsBtn').click();
  for(const time of ['day','night','sunset'])await page.locator(`[data-t="${time}"]`).click();
  for(const weather of ['rain','fog','sun']){
    await page.locator(`[data-w="${weather}"]`).click();
    expect(await page.evaluate(()=>window.__dbg.state.weather)).toBe(weather);
  }
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveClass(/photo/);
  const frozen=await page.evaluate(()=>window.__dbg.car.pos.toArray());await page.waitForTimeout(250);
  expect(await page.evaluate(()=>window.__dbg.car.pos.toArray())).toEqual(frozen);
  await page.keyboard.press('p');await page.keyboard.press('t');
  await page.screenshot({path:'test-results/driving.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#menu')).toBeVisible();
  await page.getByRole('button',{name:/Riviera del Sole/}).click();await page.locator('#startBtn').click();
  expect(await page.evaluate(()=>window.__dbg.world.id)).toBe('coast');
  await page.waitForTimeout(500);await page.screenshot({path:'test-results/coast.png'});
  await page.keyboard.press('Escape');await page.getByRole('button',{name:/Valdora/}).click();await page.locator('#startBtn').click();
  expect(await page.evaluate(()=>window.__dbg.world.id)).toBe('city');
  const report=await page.evaluate(()=>({render:window.__dbg.three.renderer.info.render,memory:window.__dbg.three.renderer.info.memory,audio:window.__dbg.audio.ready,position:window.__dbg.car.pos.toArray()}));
  console.log(JSON.stringify(report));expect(errors).toEqual([]);
});

test('wet braking needs more distance and lateral simulation remains finite',async({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  const result=await page.evaluate(()=>{
    const {car,state,keys}=window.__dbg;const road={id:'city',height:()=>0,surface:()=>({grip:1,roll:1,dust:false}),colliders:[],bound:1000};
    function brake(grip){car.reset(0,0,0);car.vel.set(0,0,25);state.gripMul=grip;keys.down=true;for(let i=0;i<1200&&car.vel.length()>.5;i++)car.update(1/120,road);keys.down=false;return car.pos.z;}
    const dry=brake(1),wet=brake(.6);car.reset(0,0,0);keys.up=true;keys.left=true;
    for(let i=0;i<2400;i++)car.update(1/120,road);keys.up=false;keys.left=false;
    return {dry,wet,finite:[...car.pos.toArray(),...car.vel.toArray(),car.heading].every(Number.isFinite)};
  });
  console.log('Braking metres:',result);expect(result.dry).toBeGreaterThan(10);expect(result.wet).toBeGreaterThan(result.dry*1.25);expect(result.finite).toBe(true);
});

test('mobile garage and touch controls fit the viewport',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.goto('/?touch=1');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  for(const selector of ['#startBtn','#carCards','#mapCards','#quality']){
    const b=await page.locator(selector).boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(845);expect(b.y+b.height).toBeLessThanOrEqual(391);
  }
  await page.screenshot({path:'test-results/mobile-garage.png'});
  await page.locator('#startBtn').click();await expect(page.locator('#touchUI')).toBeVisible();
});

test('body collision stops the nose, recovery releases keys, controller accelerates',async({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  const collision=await page.evaluate(()=>{
    const {car,state,keys}=window.__dbg;const road={id:'city',height:()=>0,surface:()=>({grip:1,roll:1,dust:false}),colliders:[{minx:-10,maxx:10,minz:8,maxz:10}],bound:1000};
    car.reset(0,0,0);car.vel.set(0,0,20);state.gripMul=1;
    for(let i=0;i<100;i++)car.update(1/120,road);
    return {z:car.pos.z,halfLength:car.cfg.body.l*.49,impacts:car.impacts.length};
  });
  expect(collision.z+collision.halfLength).toBeLessThanOrEqual(8.01);expect(collision.impacts).toBeGreaterThan(0);
  await page.locator('#startBtn').click();await page.keyboard.down('w');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(()=>window.__dbg.keys.up)).toBe(false);await page.keyboard.up('w');
  await page.keyboard.press('t');
  await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{axes:[.22],buttons:Array.from({length:8},(_,i)=>({value:i===7?.7:0,pressed:i===7}))}]}));
  await page.waitForTimeout(900);expect(await page.evaluate(()=>window.__dbg.car.vel.length())).toBeGreaterThan(.5);
});
