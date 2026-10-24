export type Provider = 'claude' | 'codex' | 'grok';
export type Status = 'working' | 'responding' | 'waiting' | 'attention' | 'unknown';
export interface Session {
  id: string; provider: Provider; sessionId?: string; title: string; cwd: string;
  status: Status; activity: string; startedAt: number; updatedAt: number; pid: number; provisional: boolean;
  /** Agent this one was launched from: drawn as a moon inside its orb. */
  parentPid?: number;
}
export const statusLabels: Record<Status,string> = {working:'Trabajando',responding:'Respuesta final',waiting:'En espera',attention:'Te necesita',unknown:'Detectada'};
export const providerLabels: Record<Provider,string> = {claude:'Claude Code',codex:'Codex',grok:'Grok'};
export const visualKey = (s: Session) => `${s.provider}:${s.pid}:${s.startedAt}`;
