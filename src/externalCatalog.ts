import { Worker } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CatalogResult } from './agyCatalog';
import { Session, cleanTitle, localPath, sessionKey, storeKey, workspacePaths } from './model';
import { SafeError, cliEnvironment } from './runtime';
export interface CatalogSettings {root?: string; executable?: string}
export function catalogWorker(kind: 'agy' | 'claude', root: string, signal?: AbortSignal): Promise<CatalogResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new SafeError('목록 조회를 취소했습니다.'));
    const worker = new Worker(path.join(__dirname, 'catalogWorker.mjs'), {workerData: {kind, root}, env: {...cliEnvironment(), ...(kind === 'claude' ? {CLAUDE_CONFIG_DIR: root} : {})}});
    let done = false;
    const finish = (error?: Error, result?: CatalogResult) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); void worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new SafeError('목록 조회를 취소했습니다.'));
    const timer = setTimeout(() => finish(new SafeError('로컬 목록 조회 시간이 초과되었습니다.')), 20000);
    signal?.addEventListener('abort', abort, {once: true});
    worker.on('message', value => value?.ok ? finish(undefined, value.result) : finish(new SafeError('로컬 저장 기록을 읽지 못했습니다. 폴더·버전·접근 권한을 확인하세요.')));
    worker.on('error', () => finish(new SafeError('로컬 목록 조회를 시작하지 못했습니다.')));
    worker.on('exit', () => { if (!done) finish(new SafeError('로컬 목록 조회가 중단되었습니다.')); });
  });
}
export async function claudeExecutable(setting = ''): Promise<string | undefined> {
  const candidates = setting ? [setting] : [...(process.env.PATH ?? '').split(path.delimiter).map(p => path.join(p.replace(/^"(.*)"$/, '$1'), 'claude.exe')), path.join(os.homedir(), '.local', 'bin', 'claude.exe')];
  for (const file of candidates) {
    if (!path.win32.isAbsolute(file) || !/\.exe$/i.test(file) || /[\0\r\n]/.test(file)) continue;
    try { if ((await stat(file)).isFile()) return file; } catch {}
  }
  if (setting) throw new SafeError('Claude 실행 경로는 존재하는 절대 claude.exe 파일이어야 합니다.');
}
export function normalizeClaudeLive(value: unknown, root: string): {sessions: Session[]; skipped: number} {
  if (!Array.isArray(value)) throw new SafeError('Claude 실행 기록 응답 형식이 올바르지 않습니다.');
  const rows = value.slice(0, 10000), sessions: Session[] = [], storeId = storeKey(root);
  for (const r of rows) {
    if (!r || typeof r.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(r.sessionId)) continue;
    sessions.push({provider: 'claude', storeId, id: r.sessionId, title: cleanTitle(r.name), cwd: localPath(r.cwd), updatedAt: Number.isFinite(r.startedAt) ? r.startedAt / 1000 : 0, source: r.kind === 'background' ? '백그라운드 실행 기록' : 'CLI 실행 기록', serverStatus: typeof r.status === 'string' ? r.status.slice(0, 100) : 'unknown', compatibility: 'unknown'});
  }
  return {sessions, skipped: rows.length - sessions.length};
}
export function mergeClaude(saved: Session[], live: Session[]): Session[] {
  const merged = new Map(saved.map(s => [sessionKey(s), s]));
  for (const s of live) {
    const old = merged.get(sessionKey(s));
    merged.set(sessionKey(s), old ? {...old, source: `${old.source} · ${s.source}`, serverStatus: s.serverStatus, cwd: old.cwd || s.cwd, workspacePaths: [...workspacePaths(old), ...workspacePaths(s)]} : s);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10000);
}
export async function readExternalCatalog(kind: 'agy' | 'claude', settings: CatalogSettings, signal?: AbortSignal): Promise<CatalogResult> {
  const root = settings.root || (kind === 'claude' ? process.env.CLAUDE_CONFIG_DIR : undefined) || path.join(os.homedir(), kind === 'claude' ? '.claude' : '.gemini');
  if (!path.win32.isAbsolute(root) || /[\0\r\n]/.test(root)) throw new SafeError('세션 저장소는 절대 로컬 폴더여야 합니다.');
  let exists = false; try { exists = (await stat(root)).isDirectory(); } catch {}
  if (!exists) {
    if (settings.root) throw new SafeError('지정한 세션 저장소 폴더가 없습니다. 폴더를 자동 생성하지 않습니다.');
    return {sessions: [], notice: '기본 로컬 저장소 없음'};
  }
  if (kind === 'agy') return catalogWorker(kind, root, signal);
  const results = await Promise.allSettled([
    catalogWorker(kind, root, signal),
    (async () => {
      const executable = await claudeExecutable(settings.executable);
      if (!executable) throw new SafeError('Claude CLI가 없어 실행 기록 조회를 생략했습니다.');
      const {stdout} = await promisify(execFile)(executable, ['agents', '--json', '--all'], {shell: false, windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024, env: {...cliEnvironment(), CLAUDE_CONFIG_DIR: root}, signal});
      return normalizeClaudeLive(JSON.parse(stdout), root);
    })()
  ]);
  if (signal?.aborted) throw new SafeError('목록 조회를 취소했습니다.');
  const saved = results[0], live = results[1];
  if (saved.status === 'rejected' && live.status === 'rejected') throw new SafeError('Claude 저장·실행 기록을 읽지 못했습니다. 설정 폴더와 CLI 설치 상태를 확인하세요.');
  const skipped = live.status === 'fulfilled' ? live.value.skipped : 0;
  return {sessions: mergeClaude(saved.status === 'fulfilled' ? saved.value.sessions : [], live.status === 'fulfilled' ? live.value.sessions : []), notice: `${saved.status === 'fulfilled' ? saved.value.notice : '저장 기록 조회 실패'} · ${live.status === 'fulfilled' ? 'CLI 실행 기록' : 'CLI 실행 기록 조회 불가'}${skipped ? ` · 형식 불일치 ${skipped}건 제외 (CLI 응답 형식 확인 필요)` : ''} · 실행 상태는 조회 시점 기준`};
}
