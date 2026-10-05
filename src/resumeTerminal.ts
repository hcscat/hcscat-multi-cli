import * as vscode from 'vscode';
import { Runtime, SafeError, cliEnvironment, guard, isDirectory, safeMessage } from './runtime';
import { Session } from './codex';
import path from 'node:path';
import { agyResumeArgs, validateAgySession } from './agyRuntime';
import { providerIcon } from './providerAppearance';
import { EditorTerminals } from './editorTerminals';
import { cleanTitle, ProviderKind, providerNames } from './model';
import { newSessionArgs } from './newSession';
export function quotePowerShell(value: string): string {
  if (/[\0\r\n]/.test(value)) throw new SafeError('터미널 인자에 제어 문자가 포함되어 있습니다.');
  // Windows PowerShell also recognizes all four smart single quotes as delimiters.
  return "'" + value.replace(/['\u2018-\u201b]/g, quote => quote + quote) + "'";
}
export function terminalOptions(runtime: Runtime, args: string[], cwd: string, name: string, kind: ProviderKind = 'codex'): vscode.TerminalOptions {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) throw new SafeError('Windows PowerShell 실행 경로를 찾지 못했습니다.');
  // Keep the shell open on CLI exit so startup errors remain visible. No profile is loaded.
  const command = '& ' + [runtime.executable, ...args].map(quotePowerShell).join(' ');
  return {name, iconPath: providerIcon(kind), location: {viewColumn: vscode.ViewColumn.One, preserveFocus: false}, shellPath: path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), shellArgs: ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], cwd, env: {...cliEnvironment(runtime.env), TERM: 'xterm-256color'}, strictEnv: true, isTransient: true};
}
export function resumeArgs(id: string, cwd: string): string[] {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new SafeError('재개할 thread.id가 UUID 형식이 아닙니다. 제목으로 대체 실행하지 않습니다.');
  if (!cwd || /[\0\r\n]/.test(cwd)) throw new SafeError('작업 폴더 경로가 올바르지 않습니다.');
  return ['resume', id, '-C', cwd];
}
export class ResumeTerminals implements vscode.Disposable {
  private terminals = new Map<string, vscode.Terminal>();
  private opening = new Set<string>();
  private disposed = false;
  private sequence = 0;
  private editors = new EditorTerminals();
  private subscription = vscode.window.onDidCloseTerminal(t => { for (const [key, existing] of this.terminals) if (t === existing) this.terminals.delete(key); });
  async open(runtime: Runtime, session?: Session, pickerCwd?: string, newTerminal = false, beforeLaunch: () => void = () => {}): Promise<{terminal: vscode.Terminal; created: boolean} | undefined> {
    return this.openFor('codex', runtime, session, pickerCwd, newTerminal, beforeLaunch);
  }
  async openAgy(runtime: Runtime, session: Session, newTerminal = false, beforeLaunch: () => void = () => {}): Promise<{terminal: vscode.Terminal; created: boolean} | undefined> {
    return this.openFor('agy', runtime, session, undefined, newTerminal, beforeLaunch);
  }
  async openNew(kind: ProviderKind, runtime: Runtime, cwd: string, beforeLaunch: () => void = () => {}): Promise<{terminal: vscode.Terminal; created: boolean} | undefined> {
    if (this.disposed) return;
    guard(process.platform, vscode.env.remoteName, vscode.workspace.isTrusted); beforeLaunch();
    if (!(await isDirectory(cwd))) throw new SafeError('선택한 작업 폴더에 접근할 수 없습니다.');
    if (this.disposed) return;
    const name = `${providerNames[kind]} ${++this.sequence} · 새 세션`;
    const terminal = await this.editors.create(terminalOptions(runtime, newSessionArgs(kind, cwd), cwd, name, kind), beforeLaunch);
    return terminal ? {terminal, created: true} : undefined;
  }
  private async openFor(kind: 'codex' | 'agy', runtime: Runtime, session?: Session, pickerCwd?: string, newTerminal = false, beforeLaunch: () => void = () => {}): Promise<{terminal: vscode.Terminal; created: boolean} | undefined> {
    if (this.disposed) return;
    guard(process.platform, vscode.env.remoteName, vscode.workspace.isTrusted);
    beforeLaunch();
    const key = JSON.stringify([kind, runtime.executable, runtime.home, session?.id ?? 'picker', session ? '' : pickerCwd ?? '']);
    const existing = this.terminals.get(key);
    if (!newTerminal && existing && existing.exitStatus === undefined) {
      existing.show();
      void vscode.window.showInformationMessage(`기존 ${kind === 'agy' ? 'agy' : 'Codex'} 터미널을 열었습니다. CLI가 종료됐다면 새 터미널에서 다시 실행할 수 있습니다. 다른 터미널의 실행 상태는 확인할 수 없습니다.`, '새 터미널 열기').then(choice => {
        if (choice === '새 터미널 열기') return this.openFor(kind, runtime, session, pickerCwd, true, beforeLaunch).catch(error => { void vscode.window.showErrorMessage(safeMessage(error)); });
      });
      return {terminal: existing, created: false};
    }
    if (this.opening.has(key)) return;
    this.opening.add(key);
    try {
      if (kind === 'agy') await validateAgySession(runtime, session!);
      let cwd = session?.cwd ?? pickerCwd ?? '';
      if (!(await isDirectory(cwd))) {
        const folder = await vscode.window.showOpenDialog({canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: session ? '이 폴더에서 Resume' : '이 폴더에서 picker 열기', title: session ? '저장된 작업 폴더가 없습니다. 재개할 폴더를 선택하세요.' : 'CLI picker를 열 작업 폴더를 선택하세요.'});
        if (!folder?.[0] || folder[0].scheme !== 'file') return;
        cwd = folder[0].fsPath;
        if (!(await isDirectory(cwd))) throw new SafeError('선택한 작업 폴더에 접근할 수 없습니다.');
      }
      // Only validated ID/cwd enter a single-quoted PowerShell invocation; never titles.
      if (this.disposed) return;
      guard(process.platform, vscode.env.remoteName, vscode.workspace.isTrusted);
      if (kind === 'agy') await validateAgySession(runtime, session!);
      if (this.disposed) return;
      guard(process.platform, vscode.env.remoteName, vscode.workspace.isTrusted);
      const args = kind === 'agy' ? agyResumeArgs(session!.id) : session ? resumeArgs(session.id, cwd) : ['resume', '--all'];
      const name = `${providerNames[kind]} ${++this.sequence} · ${session ? cleanTitle(session.title).slice(0, 60) : 'Session Picker'}`;
      beforeLaunch();
      const terminal = await this.editors.create(terminalOptions(runtime, args, cwd, name, kind), beforeLaunch);
      if (!terminal) return;
      this.terminals.set(key, terminal); terminal.show();
      return {terminal, created: true};
    } finally { this.opening.delete(key); }
  }
  dispose(): void { this.disposed = true; this.subscription.dispose(); this.editors.dispose(); this.terminals.clear(); this.opening.clear(); }
}
