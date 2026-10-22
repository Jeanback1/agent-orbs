import {processKey, processOwnsSession} from './processes.mjs';
export class SessionStore {
  sessions = new Map(); processes = []; missing = new Map();
  constructor({owns = processOwnsSession, now = () => Date.now()} = {}) { this.owns = owns; this.now = now; }
  reconcile(processes, candidates = []) {
    this.processes = processes;
    const live = new Set(processes.map(processKey));
    for (const proc of processes) {
      const key = processKey(proc); this.missing.delete(key);
      let session = [...this.sessions.values()].find(s => s.processKey === key);
      const candidate = candidates.find(s => s.provider === proc.provider && this.owns(proc, s.sessionId));
      if (!session) {
        const id = candidate ? `${proc.provider}:${candidate.sessionId}` : `process:${key}`;
        session = this.sessions.get(id);
        if (session?.processKey && session.processKey !== key && live.has(session.processKey)) continue;
        session = {...session, id, provider: proc.provider, sessionId: candidate?.sessionId ?? session?.sessionId,
          title: candidate?.title || session?.title || 'Sesión detectada', cwd: proc.cwd,
          status: session?.status || 'unknown', activity: session?.activity || '',
          startedAt: session?.startedAt || this.now(), updatedAt: this.now(), processKey: key,
          pid: proc.pid, provisional: !candidate && !session?.sessionId};
        this.sessions.set(id, session);
      }
      if (candidate) this.bindCandidate(session, candidate);
      const metadata=candidates.find(c=>c.provider===session.provider && c.sessionId===session.sessionId);
      if(metadata?.title)session.title=metadata.title;
    }
    for (const [id, s] of this.sessions) {
      if (s.processKey && !live.has(s.processKey)) {
        const misses = (this.missing.get(s.processKey) || 0) + 1;
        this.missing.set(s.processKey, misses);
        if (misses >= 2) { this.sessions.delete(id); this.missing.delete(s.processKey); }
      } else if (!s.processKey) this.sessions.delete(id);
    }
  }
  bindCandidate(session, candidate) {
    const id = `${candidate.provider}:${candidate.sessionId}`;
    if (id !== session.id) this.sessions.delete(session.id);
    Object.assign(session, {id, sessionId: candidate.sessionId, title: candidate.title || session.title, provisional: false});
    this.sessions.set(id, session);
  }
  apply(provider, event) {
    if (!['claude','codex'].includes(provider) || typeof event.session_id !== 'string' || !event.session_id) return false;
    const id = `${provider}:${event.session_id}`;
    let session = this.sessions.get(id);
    const ctx = event.terminal;
    let proc = ctx && this.processes.find(p => p.provider === provider && p.pid === ctx.pid && p.startTime === ctx.startTime);
    proc ||= this.processes.find(p => p.provider === provider && this.owns(p, event.session_id));
    if (!session && proc) {
      session = [...this.sessions.values()].find(s => s.processKey === processKey(proc));
      // Subagent hooks must never replace the identity of their parent terminal.
      if (session && !session.provisional && session.sessionId !== event.session_id && event.hook_event_name !== 'SessionStart') return false;
      if (session) this.bindCandidate(session, {provider, sessionId:event.session_id, title:event.title});
    }
    if (!session) return false;
    if (event.hook_event_name === 'SessionEnd') { this.sessions.delete(id); return true; }
    session.updatedAt = this.now();
    const previousStatus=session.status;
    if (typeof event.title==='string' && event.title) session.title = event.title.slice(0,160);
    const name = event.hook_event_name;
    if(name==='FinalResponse'){
      if(event.historical){session.status='waiting';session.activity='';session.responseUntil=0;}
      else{session.status='responding';session.activity='Respuesta final';session.responseUntil=this.now()+2200;}
    } else if (name === 'PermissionRequest' || (name === 'Notification' && ['permission_prompt','elicitation_dialog'].includes(event.notification_type))) {
      session.status = 'attention'; session.activity = 'Requiere tu intervención';session.responseUntil=0;
    } else if (['Stop','Interrupt'].includes(name) || (name === 'Notification' && event.notification_type === 'idle_prompt')) {
      if(previousStatus==='responding' && !event.historical && session.responseUntil>this.now()){session.activity='Respuesta final';}
      else{session.status = 'waiting'; session.activity = '';session.responseUntil=0;}
    } else if (['PreToolUse','PostToolUse','PostToolUseFailure','UserPromptSubmit','SubagentStart'].includes(name)) {
      session.responseUntil=0;session.status = 'working'; session.activity = event.tool_name || (name === 'SubagentStart' ? 'Subagente en ejecución' : 'Procesando');
    } else if (name === 'SessionStart') { session.status = 'waiting'; session.activity = '';session.responseUntil=0; }
    return true;
  }
  advance(){
    for(const session of this.sessions.values())if(session.status==='responding' && session.responseUntil<=this.now()){session.status='waiting';session.activity='';session.responseUntil=0;}
  }
  snapshot() { return [...this.sessions.values()].map(({processKey: _, ...s}) => ({...s})).sort((a,b) => a.startedAt-b.startedAt || a.id.localeCompare(b.id)); }
}
