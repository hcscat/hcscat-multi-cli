import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { Session, cleanTitle, localPath, pathKey, sessionKey, storeKey, workspacePaths } from './model';
export interface CatalogResult {sessions: Session[]; notice: string; warning?: string}
const maxSessions = 10000;
export function summaryPaths(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 32768) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(localPath).filter(Boolean) : []; } catch { return []; }
}
export function summarySession(row: any, folder: string, origin: string): Session | undefined {
  if (!row || typeof row.conversation_id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(row.conversation_id)) return;
  const paths = summaryPaths(row.workspace_uris);
  const date = typeof row.last_modified_time === 'string' ? Date.parse(row.last_modified_time.replace(' ', 'T')) : NaN;
  const agyOrigin = path.basename(folder) === 'antigravity-cli' ? 'cli' : path.basename(folder) === 'antigravity' ? 'app' : 'ide';
  return {provider: 'agy', agyOrigin, storeId: storeKey(folder), id: row.conversation_id, title: cleanTitle(row.title), cwd: paths[0] ?? '', workspacePaths: paths, updatedAt: Number.isFinite(date) ? date / 1000 : 0, source: origin, serverStatus: typeof row.status === 'string' ? row.status : 'unknown', compatibility: 'unknown'};
}
export async function readAgyCatalog(root: string): Promise<CatalogResult> {
  const sessions = new Map<string, Session>(); const notices: string[] = [];
  let storageSeen = false;
  for (const [name, origin] of [['antigravity-cli', 'CLI 요약'], ['antigravity', '앱 요약'], ['antigravity-ide', 'IDE 요약']]) {
    const folder = path.join(root, name); const file = path.join(folder, 'conversation_summaries.db');
    try { if (!(await stat(file)).isFile()) continue; } catch { continue; }
    storageSeen = true;
    let db: import('node:sqlite').DatabaseSync | undefined;
    try {
      const {DatabaseSync} = require('node:sqlite') as typeof import('node:sqlite');
      db = new DatabaseSync(file, {readOnly: true});
      db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1500;');
      const cols = new Set(db.prepare('PRAGMA table_info(conversation_summaries)').all().map(r => String(r.name)));
      if (!['conversation_id', 'title', 'last_modified_time', 'workspace_uris'].every(c => cols.has(c))) throw new Error();
      const status = cols.has('status') ? 'substr(status,1,100)' : "'unknown'";
      const rows = db.prepare(`SELECT conversation_id,substr(title,1,240) AS title,last_modified_time,substr(workspace_uris,1,32769) AS workspace_uris,${status} AS status FROM conversation_summaries ORDER BY last_modified_time DESC LIMIT 10001`).all();
      if (rows.length > maxSessions) notices.push(`${origin}: 10,000개 제한`);
      for (const row of rows.slice(0, maxSessions)) { const s = summarySession(row, folder, origin); if (s) sessions.set(sessionKey(s), s); }
    } catch { notices.push(`${origin} 조회 실패 또는 미지원 형식`); }
    finally { db?.close(); }
  }
  const cliFolder = path.join(root, 'antigravity-cli');
  const cache = path.join(cliFolder, 'cache', 'last_conversations.json');
  try {
    const info = await stat(cache);
    if (info.size > 2 * 1024 * 1024) throw new Error();
    const data = JSON.parse(await readFile(cache, 'utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    storageSeen = true;
    for (const [cwd, id] of Object.entries(data).slice(0, maxSessions)) {
      const folder = localPath(cwd);
      if (!folder || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) continue;
      const seed: Session = {provider: 'agy', agyOrigin: 'cli', storeId: storeKey(cliFolder), id, title: '최근 세션', cwd: folder, workspacePaths: [folder], updatedAt: 0, source: 'CLI 최근 캐시', serverStatus: 'unknown', compatibility: 'unknown'};
      const key = sessionKey(seed); const old = sessions.get(key);
      if (old) { const paths = [...workspacePaths(old), folder]; old.workspacePaths = [...new Map(paths.map(p => [pathKey(p), p])).values()]; old.cwd = old.workspacePaths[0]; }
      else sessions.set(key, seed);
    }
  } catch (error: any) { if (error?.code !== 'ENOENT') notices.push('최근 세션 캐시 조회 실패'); }
  if (sessions.size > maxSessions) notices.push('전체 로컬 목록 10,000개 제한');
  const rows = [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxSessions);
  const unknown = rows.filter(s => !workspacePaths(s).length).length;
  return {sessions: rows, notice: `${storageSeen ? '로컬 요약·최근 캐시' : '로컬 저장소 없음'} · 전체 기록 보장 안 됨${unknown ? ` · 경로 미확인 ${unknown}개` : ''}`, ...(notices.length ? {warning: notices.join(' / ')} : {})};
}
