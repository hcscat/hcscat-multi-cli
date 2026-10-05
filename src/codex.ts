import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { Runtime, SafeError, cliEnvironment } from './runtime';
import { Session } from './model';
export type { Session } from './model';
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; cleanup: () => void };
export class CodexClient {
  private child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private closed = false;
  constructor(runtime: Runtime, private timeout = 20000, private maxBytes = 8 * 1024 * 1024, spawnProcess: typeof spawn = spawn) {
    this.child = spawnProcess(runtime.executable, ['app-server', '--listen', 'stdio://'], {cwd: runtime.home, env: cliEnvironment(runtime.env), shell: false, windowsHide: true, stdio: 'pipe'}) as ChildProcessWithoutNullStreams;
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.receive(chunk));
    // Drain but do not persist provider stderr, which can contain private paths or content.
    this.child.stderr.resume();
    this.child.on('error', () => this.stop(new SafeError('App Server를 시작할 수 없습니다. 실행 파일과 권한을 확인하세요.')));
    this.child.on('exit', () => this.stop(new SafeError('App Server가 종료되었습니다. 새로고침으로 다시 연결하세요.')));
    this.child.stdin.on('error', () => this.stop(new SafeError('App Server 연결이 끊겼습니다.')));
  }
  get pid(): number | undefined { return this.child.pid; }
  async initialize(signal?: AbortSignal): Promise<void> {
    await this.request('initialize', {clientInfo: {name: 'multi_cli', title: 'hcscat Multi CLI', version: require('../package.json').version}}, signal);
    this.child.stdin.write(JSON.stringify({method: 'initialized', params: {}}) + '\n');
  }
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.closed) return Promise.reject(new SafeError('App Server 연결이 닫혔습니다.'));
    if (signal?.aborted) return Promise.reject(new SafeError('목록 조회를 취소했습니다.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => this.stop(new SafeError('목록 조회를 취소했습니다.'));
      const timer = setTimeout(() => this.stop(new SafeError('App Server 응답 시간이 초과되었습니다. 새로고침으로 재시도하세요.')), this.timeout);
      this.pending.set(id, {resolve, reject, timer, cleanup: () => signal?.removeEventListener('abort', abort)});
      signal?.addEventListener('abort', abort, {once: true});
      this.child.stdin.write(JSON.stringify({id, method, params}) + '\n');
    });
  }
  private receive(chunk: string): void {
    if (this.closed) return;
    this.buffer += chunk;
    let end: number;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (Buffer.byteLength(line) > this.maxBytes) return this.stop(new SafeError('App Server 응답 크기 제한을 초과했습니다.'));
      if (!line.trim()) continue;
      let message: any;
      try { message = JSON.parse(line); if (!message || typeof message !== 'object') throw new Error(); }
      catch { return this.stop(new SafeError('App Server JSONL 응답 형식이 올바르지 않습니다.')); }
      if (message.method) {
        if (message.id !== undefined) this.child.stdin.write(JSON.stringify({id: message.id, error: {code: -32601, message: 'Discovery client does not handle server requests'}}) + '\n');
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer); pending.cleanup(); this.pending.delete(message.id);
      if (message.error) pending.reject(new SafeError(`App Server 요청 실패 (RPC ${Number.isInteger(message.error.code) ? message.error.code : 'unknown'}). Codex 버전·설정·권한을 확인하세요.`));
      else if (!Object.hasOwn(message, 'result')) pending.reject(new SafeError('App Server 응답에 result가 없습니다.'));
      else pending.resolve(message.result);
    }
    if (Buffer.byteLength(this.buffer) > this.maxBytes) this.stop(new SafeError('App Server 응답 크기 제한을 초과했습니다.'));
  }
  private stop(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.cleanup(); p.reject(error); }
    this.pending.clear(); this.buffer = ''; this.child.stdin.end(); this.child.kill();
  }
  dispose(): void { this.stop(new SafeError('목록 연결을 닫았습니다.')); }
}
interface SessionPage {data: Session[]; nextCursor: string | null; received: number; skipped: number}
export function normalizePage(value: unknown): SessionPage {
  const page = value as any;
  if (!page || !Array.isArray(page.data) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new SafeError('목록 응답 형식이 올바르지 않습니다.');
  const data: Session[] = [];
  for (const t of page.data) {
    if (!t || typeof t.id !== 'string' || !t.id || typeof t.cwd !== 'string' || typeof t.updatedAt !== 'number' || !Number.isFinite(t.updatedAt) || Math.abs(t.updatedAt) > 8640000000000) continue;
    const title = typeof t.name === 'string' && t.name.trim() ? t.name : typeof t.preview === 'string' && t.preview.trim() ? t.preview : '제목 없음';
    data.push({id: t.id, title: title.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200), cwd: t.cwd, updatedAt: t.updatedAt, source: typeof t.source === 'string' ? t.source : 'subAgent/structured', serverStatus: typeof t.status?.type === 'string' ? t.status.type : 'unknown', compatibility: 'unknown'});
  }
  return {data, nextCursor: page.nextCursor, received: page.data.length, skipped: page.data.length - data.length};
}
export class SessionPages {
  sessions: Session[] = [];
  cursor: string | null = null;
  scanned = 0;
  skipped = 0;
  private seen = new Set<string>();
  accept(value: unknown): SessionPage {
    const page = normalizePage(value);
    if (page.nextCursor !== null && (!page.nextCursor || this.seen.has(page.nextCursor))) throw new SafeError('서버가 반복된 페이지 커서를 반환했습니다. 새로고침하세요.');
    // Invalid and duplicate rows still count toward the bounded metadata scan.
    if (this.scanned + page.received > 10000) { this.cursor = null; throw new SafeError('DB 인덱스 10,000개 검색 제한입니다. 현재 작업공간만 필터로 범위를 줄이세요.'); }
    if (page.nextCursor) this.seen.add(page.nextCursor);
    const items = new Map(this.sessions.map(t => [t.id, t]));
    for (const t of page.data) items.set(t.id, t);
    this.sessions = [...items.values()]; this.cursor = page.nextCursor;
    this.scanned += page.received; this.skipped += page.skipped;
    return page;
  }
}
export function listParams(cursor: string | null, cwd?: string[]): object {
  return {cursor, limit: 50, sortKey: 'updated_at', sortDirection: 'desc', archived: false, sourceKinds: ['cli', 'vscode', 'appServer'], modelProviders: [], useStateDbOnly: true, ...(cwd ? {cwd} : {})};
}
