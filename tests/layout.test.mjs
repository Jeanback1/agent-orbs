import {test} from 'node:test';
import assert from 'node:assert/strict';
import {constellation,spring} from '../src/layout.mjs';
test('one centered, two symmetric, deterministic multi-ring constellations',()=>{
 assert.deepEqual(constellation(0,1440,850),[]);
 const one=constellation(1,1440,850);assert.equal(one[0].x,720);
 const two=constellation(2,1440,850);assert.equal(two[0].y,two[1].y);assert.ok(Math.abs(two[0].x+two[1].x-1440)<.01);
 for(const n of [3,4,8,20])assert.deepEqual(constellation(n,1440,850),constellation(n,1440,850));
});
test('normal desktop constellations stay inside viewport, including labels',()=>{
 for(const n of [1,2,3,4,8,20]){
  const anchors=constellation(n,1440,837);
  for(const a of anchors){assert.ok(a.x-a.radius>0);assert.ok(a.x+a.radius<1440);assert.ok(a.y-a.radius>0);assert.ok(a.y+a.radius+65<837);}
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)assert.ok(Math.hypot(anchors[i].x-anchors[j].x,anchors[i].y-anchors[j].y)>anchors[i].radius*2.1);
 }
});
test('spring is smooth, converges without overshoot and remains stable after suspension',()=>{
 let value=0,velocity=0;
 for(let i=0;i<180;i++){const next=spring(value,velocity,100,1/60);assert.ok(next.value>=value);assert.ok(next.value<=100.000001);value=next.value;velocity=next.velocity;}
 assert.ok(Math.abs(value-100)<.001);assert.ok(Number.isFinite(spring(value,velocity,200,30).value));
});
