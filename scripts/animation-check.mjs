import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:3210');await page.getByRole('button',{name:'Abrir panel'}).click();await page.getByRole('button',{name:'Explorar demo'}).click();
 const results=[];
 for(const [status,label] of [['waiting','En espera'],['working','Trabajando'],['responding','Respuesta final']]){
  await page.getByRole('button',{name:`Demo: ${label}`,exact:true}).click();await page.locator('.control-panel').getByRole('button',{name:'Cerrar panel'}).click();await page.waitForTimeout(1000);
  assert.equal(await page.locator(`.orb-anchor.${status}`).count(),2);
  const brightness=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
   const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),pixels=new Uint8Array(canvas.width*canvas.height*4);
   gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let total=0;for(let i=0;i<pixels.length;i+=4)total+=pixels[i]+pixels[i+1]+pixels[i+2];resolve(total/(pixels.length/4));
  })));
  await page.screenshot({path:`test-results/neural-${status}.png`});results.push({status,brightness});
  await page.getByRole('button',{name:'Abrir panel'}).click();
 }
 assert.ok(results[1].brightness>results[0].brightness*1.05,'Working must be visibly brighter than idle');
 assert.ok(results[2].brightness>results[1].brightness*1.05,'Final response must be visibly brighter than working');
 assert.equal(await page.locator('.scene.fallback').count(),0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({brightness:results,webgl:true,errors},null,2));
}finally{await browser.close();}
