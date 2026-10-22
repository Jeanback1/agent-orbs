import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
test('hook installation is idempotent and removal preserves every foreign setting and hook',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbs-hooks-'));
 const claude=path.join(root,'claude'),codex=path.join(root,'codex');fs.mkdirSync(claude);fs.mkdirSync(codex);
 const original={customSetting:'retained',hooks:{SessionStart:[{matcher:'',hooks:[{type:'command',command:'node /original/pixel-hook.js'}]}]}};
 for(const file of [path.join(claude,'settings.json'),path.join(codex,'hooks.json')])fs.writeFileSync(file,JSON.stringify(original));
 const env={...process.env,CLAUDE_CONFIG_DIR:claude,CODEX_HOME:codex,AGENT_ORBS_STATE_DIR:path.join(root,'state')};
 try{
  for(const action of ['install','install'])execFileSync(process.execPath,['scripts/hooks.mjs',action],{env,stdio:'pipe'});
  const data=JSON.parse(fs.readFileSync(path.join(codex,'hooks.json')));assert.equal(data.hooks.SessionStart.length,2);
  execFileSync(process.execPath,['scripts/hooks.mjs','remove'],{env,stdio:'pipe'});
  for(const file of [path.join(claude,'settings.json'),path.join(codex,'hooks.json')])assert.deepEqual(JSON.parse(fs.readFileSync(file)),original);
 }finally{fs.rmSync(root,{recursive:true});}
});
