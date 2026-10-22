import fs from 'node:fs';
import path from 'node:path';
// Adapted from Pixel Agents' MIT-licensed Linux process inspection.
export function readProcess(pid, root = '/proc') {
  try {
    const dir = path.join(root, String(pid));
    if (process.getuid && fs.statSync(dir).uid !== process.getuid()) return null;
    const stat = fs.readFileSync(path.join(dir, 'stat'), 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    return {pid: Number(pid), ppid: Number(fields[1]), startTime: fields[19],
      argv: fs.readFileSync(path.join(dir, 'cmdline'), 'utf8').split('\0').filter(Boolean),
      cwd: fs.readlinkSync(path.join(dir, 'cwd'))};
  } catch { return null; }
}
export function providerOf(proc) {
  if (proc.argv.includes('app-server') || proc.argv.includes('daemon') || proc.argv.includes('exec')) return null;
  const name = path.basename(proc.argv[0] || '');
  if(name==='claude' && (proc.argv.includes('-p') || proc.argv.includes('--print')))return null;
  if (name === 'claude' || name === 'codex') return name;
  if (name === 'node' && /(?:^|\/)@anthropic-ai\/claude-code\/cli\.js$/.test(proc.argv[1] || '')) return 'claude';
  if (name === 'node' && /(?:^|\/)@openai\/codex\/bin\/codex\.js$/.test(proc.argv[1] || '')) return 'codex';
  return null;
}
export function listProcesses() {
  try {
    const all = fs.readdirSync('/proc').filter(x => /^\d+$/.test(x)).map(x => readProcess(x)).filter(Boolean);
    const candidates = all.filter(p => providerOf(p)).map(p => ({...p, provider: providerOf(p)}));
    return candidates.filter(p => !candidates.some(child => child.ppid === p.pid && child.provider === p.provider)).map(p=>{
      let sessionFiles=[];
      try{sessionFiles=fs.readdirSync(`/proc/${p.pid}/fd`).flatMap(fd=>{try{const name=path.basename(fs.readlinkSync(`/proc/${p.pid}/fd/${fd}`));return name.endsWith('.jsonl')?[name]:[];}catch{return [];}});}catch{}
      return {...p,sessionFiles};
    });
  } catch { return []; }
}
export function processOwnsSession(proc, id) {
  if (proc.argv.includes(id)) return true;
  if(proc.sessionFiles)return proc.sessionFiles.some(name=>name.endsWith(`${id}.jsonl`));
  try {
    return fs.readdirSync(`/proc/${proc.pid}/fd`).some(fd => {
      try { return fs.readlinkSync(`/proc/${proc.pid}/fd/${fd}`).endsWith(`${id}.jsonl`); } catch { return false; }
    });
  } catch { return false; }
}
export const processKey = p => `${p.provider}:${p.pid}:${p.startTime}`;
