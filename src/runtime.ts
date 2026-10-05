import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export class SafeError extends Error {}
export const fail = (message: string): never => { throw new SafeError(message); };
export function safeMessage(error: unknown): string { return error instanceof SafeError ? error.message : '로컬 작업이 실패했습니다. 실행 파일과 폴더 접근 권한을 확인하세요. 원본 오류는 개인정보 보호를 위해 기록하지 않습니다.'; }
export interface Runtime { executable: string; home: string; env: NodeJS.ProcessEnv; version: string }
export function cliEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Match the Windows terminal's host-variable boundary while preserving user CLI settings.
  // NODE_OPTIONS belongs to the user; code's CLI IPC hook and portable settings remain usable.
  const preserved = new Set(['VSCODE_IPC_HOOK_CLI', 'VSCODE_PORTABLE', 'VSCODE_SHELL_LOGIN', 'VSCODE_ENV_REPLACE', 'VSCODE_ENV_APPEND', 'VSCODE_ENV_PREPEND']);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => {
    const name = key.toUpperCase();
    return value !== undefined && !name.startsWith('ELECTRON_') && (!name.startsWith('VSCODE_') || preserved.has(name));
  }));
}
export function guard(platform: string, remote: string | undefined, trusted: boolean): void {
  if (platform !== 'win32' || remote) fail('Windows 로컬 VS Code 창에서만 지원합니다. Remote-SSH/WSL/컨테이너 창에서는 실행할 수 없습니다.');
  if (!trusted) fail('Workspace Trust가 필요합니다. 작업공간을 신뢰한 후 실행하세요.');
}
export async function isDirectory(value: string): Promise<boolean> { try { return path.win32.isAbsolute(value) && (await stat(value)).isDirectory(); } catch { return false; } }
export async function nativeExecutable(candidate: string): Promise<string> {
  if (!path.win32.isAbsolute(candidate) || /[\0\r\n]/.test(candidate)) return fail('Codex 실행 파일은 절대 경로여야 합니다.');
  try { if (!(await stat(candidate)).isFile()) return fail('Codex 실행 파일 경로가 파일이 아닙니다.'); } catch { return fail('Codex 실행 파일을 찾을 수 없습니다. 설정의 executablePath를 확인하세요.'); }
  if (/\.exe$/i.test(candidate)) return candidate;
  if (!/\.(cmd|ps1)$/i.test(candidate)) return fail('codex.exe 또는 공식 npm codex.cmd/codex.ps1 경로를 지정하세요.');
  // Never execute a shim through a shell or guess the meaning of a custom wrapper.
  const root = path.join(path.dirname(candidate), 'node_modules', '@openai', 'codex');
  let official = false;
  try {
    const shim = await readFile(candidate, 'utf8');
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    official = /^codex\.(cmd|ps1)$/i.test(path.basename(candidate)) && manifest.name === '@openai/codex' && /node_modules[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js/.test(shim);
  } catch {}
  if (!official) return fail('사용자 정의 shim은 해석하지 않습니다. 실제 codex.exe 경로를 지정하세요.');
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const candidates = [path.join(root, 'node_modules', '@openai', `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe'), path.join(root, 'vendor', triple, 'bin', 'codex.exe')];
  for (const value of candidates) { try { if ((await stat(value)).isFile()) return value; } catch {} }
  return fail('npm 패키지에서 native codex.exe를 찾지 못했습니다. 실제 exe 경로를 설정하세요.');
}
export async function findNativeExecutable(searchPath = process.env.PATH ?? ''): Promise<string> {
  for (const entry of searchPath.split(path.delimiter)) {
    const dir = entry.replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(dir)) continue;
    for (const name of ['codex.exe', 'codex.cmd', 'codex.ps1']) {
      try { return await nativeExecutable(path.join(dir, name)); } catch {}
    }
  }
  return fail('PATH에서 지원 가능한 Codex 실행 파일을 찾지 못했습니다. 공식 설치 상태를 확인하거나 executablePath를 설정하세요.');
}
export async function resolveRuntime(executableSetting = '', homeSetting = '', allowInitialize = false): Promise<Runtime> {
  // Explicit settings must fail on errors; only automatic PATH discovery skips unsupported shims.
  const executable = executableSetting ? await nativeExecutable(executableSetting) : await findNativeExecutable();
  const home = homeSetting || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const exists = await isDirectory(home);
  if (!exists && !(allowInitialize && !homeSetting && !process.env.CODEX_HOME)) return fail('CODEX_HOME이 존재하는 절대 폴더가 아닙니다. 폴더를 자동 생성하지 않습니다.');
  const env = { ...cliEnvironment(), CODEX_HOME: home };
  let version: string;
  try { version = (await promisify(execFile)(executable, ['--version'], {env, cwd: exists ? home : os.homedir(), shell: false, timeout: 10000, windowsHide: true, maxBuffer: 4096})).stdout.trim(); }
  catch { return fail('Codex 버전 확인 실패: 실행 권한과 설치 상태를 확인하세요.'); }
  if (!/^codex-cli \d+\.\d+\.\d+/.test(version)) return fail('Codex CLI 버전 응답을 확인할 수 없습니다.');
  const parts = version.match(/(\d+)\.(\d+)\.(\d+)/)!.slice(1).map(Number);
  if (parts[0] === 0 && (parts[1] < 153 || (parts[1] === 153 && parts[2] < 4))) return fail('이 확장은 Codex CLI 0.153.4 이상이 필요합니다. 자동 업데이트는 하지 않습니다.');
  return {executable, home, env, version};
}
