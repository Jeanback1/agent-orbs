import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'hook.mjs');
const state=process.env.AGENT_ORBS_STATE_DIR || path.join(os.homedir(),'.agent-orbs');
const action=process.argv[2];if(!['install','remove'].includes(action))throw new Error('Usa install o remove');
const events=['SessionStart','SessionEnd','PreToolUse','PostToolUse','PostToolUseFailure','PermissionRequest','Stop','SubagentStart','SubagentStop','UserPromptSubmit'];
const quote=s=>`'${s.replaceAll("'", "'\\''")}'`;
for(const provider of ['claude','codex']){
 const dir=provider==='claude'?(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(),'.claude')):(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'));
 const file=path.join(dir,provider==='claude'?'settings.json':'hooks.json');
 if(action==='remove'&&!fs.existsSync(file))continue;
 const original=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
 const config=original?JSON.parse(original):{};
 if(!config || typeof config!=='object' || Array.isArray(config) || (config.hooks && (typeof config.hooks!=='object' || Array.isArray(config.hooks))))throw new Error(`Formato no válido: ${file}`);
 const hooks=config.hooks || {},command=`${quote(process.execPath)} ${quote(script)} ${provider}`;
 for(const [event,groups] of Object.entries(hooks)){
  if(!Array.isArray(groups))throw new Error(`Evento inválido en ${file}`);
  hooks[event]=groups.map(group=>({...group,hooks:group.hooks?.filter(h=>h.command!==command)})).filter(group=>group.hooks?.length);
  if(!hooks[event].length)delete hooks[event];
 }
 if(action==='install')for(const event of [...events.filter(e=>provider==='claude'||e!=='PostToolUseFailure'),...(provider==='claude'?['Notification']:[])]){
   (hooks[event] ||= []).push({...provider==='claude'?{matcher:''}:{},hooks:[{type:'command',command,timeout:event==='SessionEnd'?1:2}]});
 }
 if(Object.keys(hooks).length)config.hooks=hooks;else delete config.hooks;
 fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.mkdirSync(path.join(state,'backups'),{recursive:true,mode:0o700});
 const backup=path.join(state,'backups',`${provider}-${Date.now()}.json`);
 if(original!==null)fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
 const temp=file+'.agent-orbs-tmp';
 fs.writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{mode:original===null?0o600:fs.statSync(file).mode&0o777});
 if((fs.existsSync(file)?fs.readFileSync(file,'utf8'):null)!==original){fs.unlinkSync(temp);throw new Error(`El archivo cambió durante la operación: ${file}. Reintenta.`);}
 fs.renameSync(temp,file);console.log(`${action==='install'?'Instalados':'Retirados'} hooks de ${provider}; configuración preservada.`);
}
