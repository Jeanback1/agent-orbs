import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const base=process.env.AGENT_ORBS_URL || 'http://127.0.0.1:3210';
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 assert.equal(await page.locator('.control-panel, .topbar, .statusbar, .orb-label').count(),0);
 const clock=await page.locator('.clock').boundingBox();assert.ok(clock.x<50&&clock.y>900);
 await page.getByRole('button',{name:'Abrir panel'}).click();await page.getByRole('button',{name:'Explorar demo'}).click();
 for(const count of [1,2,3,4,8,20]){
  if(count===3){await page.locator('.demo-controls').getByRole('button',{name:'2',exact:true}).click();await page.getByRole('button',{name:'Añadir sesión de demo'}).click();}
  else await page.locator('.demo-controls').getByRole('button',{name:String(count),exact:true}).click();
  await page.waitForTimeout(150);assert.equal(await page.locator('.orb-hit').count(),count);
  const boxes=await page.locator('.orb-hit').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2};}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(Math.hypot(boxes[i].x-boxes[j].x,boxes[i].y-boxes[j].y)>boxes[i].r+boxes[j].r,`Orbes solapados: ${count}`);
 }
 await page.locator('.demo-controls').getByRole('button',{name:'2',exact:true}).click();await page.waitForTimeout(150);
 await page.locator('.control-panel').getByRole('button',{name:'Cerrar panel'}).click();
 await page.locator('.orb-hit').first().click();assert.equal(await page.getByRole('complementary',{name:'Detalles de la sesión'}).count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('complementary').count(),0);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'test-results/mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(150);await page.screenshot({path:'test-results/demo-two.png'});
 await page.getByRole('button',{name:'Abrir panel'}).click();
 await page.locator('.demo-controls').getByRole('button',{name:'1',exact:true}).click();
 await page.getByRole('button',{name:'Quitar sesión de demo'}).click();await page.waitForTimeout(150);assert.equal(await page.locator('.orb-hit').count(),0);
 await page.locator('.control-panel').getByRole('button',{name:'Cerrar panel'}).click();
 assert.match((await page.locator('body').innerText()).replace('···','').trim(),/^\d{2}:\d{2}$/);
 await page.getByRole('button',{name:'Abrir panel'}).click();await page.getByRole('button',{name:'Salir de demo'}).click();assert.equal(await page.locator('.demo-controls').count(),0);
 await page.close();
 // Exercise actual fallback instead of merely inspecting its CSS.
 const fallback=await browser.newPage({reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});
 await fallback.goto(base);await fallback.getByRole('button',{name:'Abrir panel'}).click();await fallback.getByRole('button',{name:'Explorar demo'}).click();await fallback.waitForTimeout(150);
 assert.equal(await fallback.locator('.fallback-sphere').count(),2);await fallback.close();
 const health=await fetch(`${base}/api/health`);assert.equal(health.status,200);
 assert.equal((await fetch(`${base}/api/sessions`,{headers:{Origin:'https://untrusted.example'}})).status,403);
 assert.equal((await fetch(`${base}/api/hooks/codex`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:'unauthorized',hook_event_name:'SessionStart'})})).status,401);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: minimal view/clock, 0–20 sessions, panel/detail/keyboard, mobile, WebGL fallback and local API guards.');
}finally{await browser.close();}
