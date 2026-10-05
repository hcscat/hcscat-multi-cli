import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Runtime, SafeError, cliEnvironment, isDirectory, resolveRuntime } from './runtime';
import { claudeExecutable } from './externalCatalog';
import { resolveAgyRuntime } from './agyRuntime';
import { ProviderKind } from './model';

export function newSessionArgs(kind: ProviderKind, cwd: string): string[] {
  if (!path.win32.isAbsolute(cwd) || /[\0\r\n]/.test(cwd)) throw new SafeError('새 세션의 작업 폴더는 유효한 절대 경로여야 합니다.');
  return kind === 'codex' ? ['-C', cwd] : [];
}

export async function resolveNewRuntime(kind: ProviderKind, executable = '', root = ''): Promise<Runtime> {
  if (kind === 'codex') return resolveRuntime(executable, root, true);
  if (kind === 'agy') return resolveAgyRuntime(executable, root, true);
  const home = root || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  if (!path.win32.isAbsolute(home) || /[\0\r\n]/.test(home)) throw new SafeError('Claude 설정 폴더는 절대 로컬 경로여야 합니다.');
  const exists = await isDirectory(home);
  if (!exists && (root || process.env.CLAUDE_CONFIG_DIR)) throw new SafeError('지정한 Claude 설정 폴더가 없습니다. 자동 생성하지 않습니다.');
  const native = await claudeExecutable(executable);
  if (!native) throw new SafeError('native claude.exe를 찾지 못했습니다. 설치 상태나 claudeExecutablePath 설정을 확인하세요.');
  const env = {...cliEnvironment(), CLAUDE_CONFIG_DIR: home};
  try {
    const result = await promisify(execFile)(native, ['--version'], {env, cwd: exists ? home : os.homedir(), shell: false, windowsHide: true, timeout: 10000, maxBuffer: 4096});
    const version = (result.stdout + result.stderr).trim();
    if (!/^\d+\.\d+\.\d+\s+\(Claude Code\)$/.test(version)) throw new Error();
    return {executable: native, home, env, version};
  } catch { throw new SafeError('Claude Code 버전 응답을 확인하지 못했습니다. 설치 상태를 확인하세요.'); }
}
