import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    const kept = candidates.filter(p => !candidates.some(child => child.ppid === p.pid && child.provider === p.provider));
    const byPid = new Map(all.map(p => [p.pid, p])), keptPids = new Set(kept.map(p => p.pid));
    let boot = 0; try { boot = Number(fs.readFileSync('/proc/stat', 'utf8').match(/^btime (\d+)/m)[1]) * 1000; } catch {}
    return kept.map(p=>{
      let sessionFiles=[];
      try{sessionFiles=fs.readdirSync(`/proc/${p.pid}/fd`).flatMap(fd=>{try{const name=path.basename(fs.readlinkSync(`/proc/${p.pid}/fd/${fd}`));return name.endsWith('.jsonl')?[name]:[];}catch{return [];}});}catch{}
      // Clock ticks are 100 Hz on Linux; startedMs lets daemon-backed sessions be matched by start time.
      const parentPid=agentAncestor(p,byPid,keptPids);
      return {...p,sessionFiles,claudeSession:p.provider==='claude'?claudeSessionOf(p):undefined,parentPid,parentThread:parentPid?undefined:codexParentThread(p,byPid),startedMs:boot?boot+Number(p.startTime)*10:undefined};
    });
  } catch { return []; }
}
// Agents launched from another agent's process tree are its subagents.
export function agentAncestor(proc, byPid, agentPids) {
  let pid = proc.ppid;
  for (let i = 0; i < 32 && pid > 1; i++) {
    if (agentPids.has(pid)) return pid;
    const parent = byPid.get(pid); if (!parent) return undefined;
    pid = parent.ppid;
  }
  return undefined;
}
// Commands run by a daemon-backed Codex TUI descend from the shared daemon, not the TUI;
// the thread they belong to is only visible in the environment Codex gives them.
export function codexParentThread(proc, byPid, root = '/proc') {
  let parent = byPid.get(proc.ppid);
  for (let i = 0; i < 32 && parent; i++) {
    if (path.basename(parent.argv[0] || '') === 'codex' && parent.argv.includes('app-server')) {
      try { return fs.readFileSync(path.join(root, String(proc.pid), 'environ'), 'utf8').split('\0').find(v => v.startsWith('CODEX_THREAD_ID='))?.slice(16) || undefined; } catch { return undefined; }
    }
    parent = byPid.get(parent.ppid);
  }
  return undefined;
}
// Claude keeps its transcript closed between writes, but records the live session of each
// process in sessions/<pid>.json; procStart guards against a recycled pid.
export function claudeSessionOf(proc, dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'sessions')) {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dir, `${proc.pid}.json`), 'utf8'));
    return info.procStart === proc.startTime && typeof info.sessionId === 'string' ? info.sessionId : undefined;
  } catch { return undefined; }
}
export function processOwnsSession(proc, id) {
  if (proc.argv.includes(id) || proc.claudeSession === id) return true;
  if(proc.sessionFiles)return proc.sessionFiles.some(name=>name.endsWith(`${id}.jsonl`));
  try {
    return fs.readdirSync(`/proc/${proc.pid}/fd`).some(fd => {
      try { return fs.readlinkSync(`/proc/${proc.pid}/fd/${fd}`).endsWith(`${id}.jsonl`); } catch { return false; }
    });
  } catch { return false; }
}
export const processKey = p => `${p.provider}:${p.pid}:${p.startTime}`;
