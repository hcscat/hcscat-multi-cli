import path from 'node:path';
import os from 'node:os';
import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Runtime, SafeError, cliEnvironment, isDirectory } from './runtime';
import { Session, pathKey, storeKey } from './model';

export const agyDefaultRoot = () => path.join(os.homedir(), '.gemini');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function agyResumeReason(session: Session): string | undefined {
  if (session.provider !== 'agy' || session.agyOrigin !== 'cli') return '앱/IDE 기록은 CLI에서 가져오기 확인이 필요합니다. 이번 직접 Resume는 CLI 저장 대화를 지원합니다.';
  if (!uuid.test(session.id)) return 'agy 재개 ID가 UUID 형식이 아닙니다.';
}
export function agyResumeArgs(id: string): string[] {
  if (!uuid.test(id)) throw new SafeError('agy 재개 ID가 UUID 형식이 아닙니다.');
  return ['--conversation', id];
}
export async function agyExecutable(setting = '', searchPath = process.env.PATH ?? ''): Promise<string> {
  const candidates = setting ? [setting] : [...searchPath.split(path.delimiter).filter(Boolean).map(p => path.join(p.replace(/^"(.*)"$/, '$1'), 'agy.exe')), ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')] : [])];
  for (const file of candidates) {
    if (!path.win32.isAbsolute(file) || !/\.exe$/i.test(file) || /[\0\r\n]/.test(file)) continue;
    try { if ((await stat(file)).isFile()) return file; } catch {}
  }
  throw new SafeError(setting ? 'agy 실행 경로는 존재하는 절대 native agy.exe 파일이어야 합니다.' : 'native agy.exe를 찾지 못했습니다. 설치 상태나 antigravityExecutablePath 설정을 확인하세요.');
}
export async function resolveAgyRuntime(executableSetting = '', rootSetting = '', allowInitialize = false): Promise<Runtime> {
  const home = rootSetting || agyDefaultRoot();
  if (pathKey(home) !== pathKey(agyDefaultRoot()) || process.env.ANTIGRAVITY_APP_DATA_DIR) throw new SafeError('사용자 지정 Antigravity 저장소는 목록 조회만 지원합니다. CLI 저장소 변경 계약이 확인되지 않아 다른 저장소로 Resume하지 않습니다.');
  const exists = await isDirectory(home);
  if (!exists && !(allowInitialize && !rootSetting)) throw new SafeError('Antigravity 기본 저장소가 없습니다. 자동 생성하지 않습니다.');
  const executable = await agyExecutable(executableSetting);
  const env = cliEnvironment();
  try {
    const run = promisify(execFile);
    const options = {env, cwd: exists ? home : os.homedir(), shell: false, windowsHide: true, timeout: 10000, maxBuffer: 65536};
    const versionResult = await run(executable, ['--version'], options);
    const version = (versionResult.stdout + versionResult.stderr).trim();
    const helpResult = await run(executable, ['--help'], options);
    const help = helpResult.stdout + helpResult.stderr;
    if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version) || !/--conversation\b/.test(help)) throw new Error();
    return {executable, home, env, version};
  } catch { throw new SafeError('agy 버전 또는 --conversation 지원을 확인하지 못했습니다. 설치 상태를 확인하세요.'); }
}
export async function validateAgySession(runtime: Runtime, session: Session): Promise<void> {
  const reason = agyResumeReason(session);
  if (reason) throw new SafeError(reason);
  if (pathKey(runtime.home) !== pathKey(agyDefaultRoot()) || runtime.env.ANTIGRAVITY_APP_DATA_DIR || session.storeId !== storeKey(path.join(runtime.home, 'antigravity-cli'))) throw new SafeError('목록과 agy CLI의 저장소가 일치하지 않습니다. 기본 저장소 목록을 새로고침하세요.');
  // The CLI can ignore a missing ID; a stale summary/cache must not become a new conversation.
  const file = path.join(runtime.home, 'antigravity-cli', 'conversations', session.id + '.db');
  let exists = false;
  try { const info = await stat(file); exists = info.isFile() && info.size > 0; } catch {}
  if (!exists) throw new SafeError('agy 원본 대화 파일을 찾지 못했습니다. 오래된 캐시일 수 있어 실행하지 않았습니다. 목록을 새로고침하세요.');
}
