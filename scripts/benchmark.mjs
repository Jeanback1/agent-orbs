import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:3210');await page.getByRole('button',{name:'Abrir panel'}).click();await page.getByRole('button',{name:'Explorar demo'}).click();
 const gpu=await page.locator('canvas').evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),dpr:devicePixelRatio};});
 const results=[];
 for(const count of [2,20]){
  await page.locator('.demo-controls').getByRole('button',{name:String(count),exact:true}).click();
  await page.locator('.control-panel').getByRole('button',{name:'Cerrar panel'}).click();await page.waitForTimeout(1000);
  const timing=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last=0;function next(t){if(last)samples.push(t-last);last=t;if(samples.length<180)requestAnimationFrame(next);else{const sorted=[...samples].sort((a,b)=>a-b),avg=samples.reduce((a,b)=>a+b,0)/samples.length;resolve({fps:1000/avg,frameMs:avg,p95:sorted[Math.floor(sorted.length*.95)],over33ms:samples.filter(v=>v>33.4).length});}}requestAnimationFrame(next);}));
  results.push({count,...timing});await page.getByRole('button',{name:'Abrir panel'}).click();
 }
 const report={gpu,results};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
