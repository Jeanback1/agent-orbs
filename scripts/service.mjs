// Writes the systemd user unit with this clone's real paths, so the project can live anywhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(),'.config'),'systemd','user'),file=path.join(dir,'agent-orbs.service');
const action=process.argv[2];if(!['install','remove'].includes(action))throw new Error('Usa install o remove');
// systemd splits ExecStart on spaces; quoted arguments keep paths with spaces intact.
const quote=s=>/[\s"\\]/.test(s)?`"${s.replace(/["\\]/g,'\\$&')}"`:s;
const reload=()=>{try{execFileSync('systemctl',['--user','daemon-reload'],{stdio:'ignore'});}catch{}};
if(action==='remove'){
  try{execFileSync('systemctl',['--user','disable','--now','agent-orbs'],{stdio:'ignore'});}catch{}
  fs.rmSync(file,{force:true});reload();console.log(`Servicio retirado: ${file}`);
}else{
  const port=Number(process.env.PORT || 3210);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT debe ser un puerto válido');
  if(!fs.existsSync(path.join(root,'dist')))throw new Error('Primero ejecuta npm run build');
  const unit=`[Unit]
Description=Agent Orbs - observatorio local de sesiones
After=default.target

[Service]
Type=simple
WorkingDirectory=${quote(root)}
ExecStart=${quote(process.execPath)} ${quote(path.join(root,'server','index.mjs'))}
Environment=PORT=${port}
Restart=on-failure
RestartSec=3
UMask=0077

[Install]
WantedBy=default.target
`;
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,unit);reload();
  console.log(`Servicio instalado: ${file}\nInícialo con: systemctl --user start agent-orbs`);
}
