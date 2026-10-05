import path from 'node:path';
import { createHash } from 'node:crypto';
export type ProviderKind = 'codex' | 'agy' | 'claude';
export type SessionScope = 'workspaceTree' | 'workspace' | 'all';
export const scopeNames: Record<SessionScope, string> = {workspaceTree: '현재 작업공간 + 하위 폴더', workspace: '현재 작업공간만', all: '전체 로컬'};
export const providerNames: Record<ProviderKind, string> = {codex: 'Codex', agy: 'Antigravity (agy)', claude: 'Claude Code'};
export interface Session {
  id: string; title: string; cwd: string; updatedAt: number; source: string; serverStatus: string; compatibility: 'unknown';
  provider?: ProviderKind; storeId?: string; workspacePaths?: string[]; agyOrigin?: 'cli' | 'app' | 'ide';
}
export function cleanTitle(value: unknown): string { return typeof value === 'string' && value.trim() ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200) : '제목 없음'; }
export function localPath(value: unknown): string {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value)) return '';
  try {
    if (value.startsWith('file:')) {
      const url = new URL(value);
      if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return '';
      value = decodeURIComponent(url.pathname).replace(/^\/([a-z]:)/i, '$1');
    }
    const normalized = path.win32.normalize(value as string);
    if (!/^[a-z]:\\/i.test(normalized) && !/^\\\\[^\\]+\\[^\\]+/.test(normalized)) return '';
    return normalized === path.win32.parse(normalized).root ? normalized : normalized.replace(/[\\/]+$/, '');
  } catch { return ''; }
}
export function pathKey(value: string): string { return localPath(value).toLowerCase(); }
export function sessionKey(session: Session): string { return JSON.stringify([session.provider ?? 'codex', session.storeId ?? '', session.id]); }
export function storeKey(value: string): string { return createHash('sha256').update(pathKey(value)).digest('hex').slice(0, 16); }
export function workspacePaths(session: Session): string[] {
  const paths = (session.workspacePaths?.length ? session.workspacePaths : [session.cwd]).map(localPath).filter(Boolean);
  return [...new Map(paths.map(p => [pathKey(p), p])).values()];
}
export function pathInScope(value: string, folders?: string[], scope: SessionScope = 'workspace'): boolean {
  if (scope === 'all' || !folders) return true;
  const key = pathKey(value);
  return Boolean(key) && folders.some(folder => {
    const root = pathKey(folder);
    return Boolean(root) && (key === root || (scope === 'workspaceTree' && key.startsWith(root.endsWith('\\') ? root : root + '\\')));
  });
}
export function visibleWorkspacePaths(session: Session, folders?: string[], scope: SessionScope = 'workspace'): string[] {
  return workspacePaths(session).filter(p => pathInScope(p, folders, scope));
}
export function filterSessions(sessions: Session[], folders?: string[], scope: SessionScope = 'workspace'): Session[] {
  if (!folders || scope === 'all') return sessions;
  return sessions.filter(s => visibleWorkspacePaths(s, folders, scope).length > 0);
}
