import {test} from 'node:test';
import assert from 'node:assert/strict';
import {neuralGeometry} from '../src/particles.mjs';
test('shared neural geometry has finite coordinates, bounded sphere and visible nodes at every LOD',()=>{
 const {points,lines,nodeCount}=neuralGeometry();assert.equal(points.length,120000);assert.equal(nodeCount,12);assert.ok(lines.length>0);assert.ok([...points,...lines].every(Number.isFinite));
 for(let i=0;i<nodeCount;i++)assert.equal(points[i*10+9],2);
 for(let i=0;i<points.length;i+=10)assert.ok(Math.abs(Math.hypot(...points.subarray(i,i+3))-1)<.00001);
 assert.deepEqual(neuralGeometry().points,points);
});
