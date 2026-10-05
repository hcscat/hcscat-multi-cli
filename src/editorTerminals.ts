import * as vscode from 'vscode';
import { SafeError, guard, safeMessage } from './runtime';

interface EditorGroupLayout {groups?: EditorGroupLayout[]; size?: number}
export function editorLayout(count: number): {orientation: number; groups: EditorGroupLayout[]} {
  if (!Number.isInteger(count) || count < 1 || count > 9) throw new SafeError('자동 분할은 최대 9개입니다. 사용하지 않는 Resume 터미널을 닫고 다시 여세요.');
  if (count <= 3) return {orientation: 0, groups: Array.from({length: count}, () => ({}))};
  const columns = count === 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  return {orientation: 0, groups: Array.from({length: columns}, (_, column) => ({groups: Array.from({length: Math.min(rows, count - column * rows)}, () => ({}))}))};
}

// Move owned terminal editors; splitting/copying an editor can start another CLI process.
export class EditorTerminals implements vscode.Disposable {
  private owned: vscode.Terminal[] = [];
  private closingNames = new Set<string>();
  private disposed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private subscription = vscode.window.onDidCloseTerminal(terminal => {
    if (!this.owned.includes(terminal)) return;
    this.closingNames.add(terminal.name);
    this.owned = this.owned.filter(t => t !== terminal);
    void this.enqueue(async () => {
      if (!this.disposed && this.owned.length) await this.arrange(this.owned.length);
    }).catch(error => { if (!this.disposed) void vscode.window.showErrorMessage(safeMessage(error)); });
  });
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job);
    this.queue = result.catch(() => {});
    return result;
  }
  private allowed(): boolean {
    if (this.disposed) return false;
    guard(process.platform, vscode.env.remoteName, vscode.workspace.isTrusted);
    return true;
  }
  private async focus(terminal: vscode.Terminal): Promise<vscode.Tab | undefined> {
    terminal.show(false);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && this.allowed() && this.owned.includes(terminal)) {
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (vscode.window.activeTerminal === terminal && tab?.input instanceof vscode.TabInputTerminal && tab.label === terminal.name) return tab;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  private async arrange(count: number): Promise<boolean> {
    if (!this.allowed()) return false;
    // VS Code can emit onDidCloseTerminal before removing the terminal's editor tab.
    const deadline = Date.now() + 3000;
    while (this.closingNames.size && this.allowed()) {
      const labels = new Set(vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t => t.input instanceof vscode.TabInputTerminal).map(t => t.label));
      for (const name of this.closingNames) if (!labels.has(name)) this.closingNames.delete(name);
      if (!this.closingNames.size) break;
      if (Date.now() >= deadline) throw new SafeError('닫힌 터미널의 편집기 정리를 기다리는 중입니다. 해당 탭이 닫힌 뒤 다시 여세요.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!this.allowed()) return false;
    this.checkOtherEditors();
    await vscode.commands.executeCommand('vscode.setEditorLayout', editorLayout(count));
    const terminals = [...this.owned];
    for (let index = 0; index < terminals.length; index++) {
      const terminal = terminals[index];
      if (!this.allowed()) return false;
      if (!this.owned.includes(terminal)) continue;
      const tab = await this.focus(terminal);
      if (!this.allowed()) return false;
      this.checkOtherEditors();
      if (!this.owned.includes(terminal)) continue;
      if (!tab || vscode.window.activeTerminal !== terminal || vscode.window.tabGroups.activeTabGroup.activeTab !== tab) throw new SafeError('Resume 터미널의 편집기 포커스를 확인하지 못해 이동을 멈췄습니다. 해당 터미널을 선택하고 다시 실행하세요.');
      await vscode.commands.executeCommand('moveActiveEditor', {to: 'position', by: 'group', value: index + 1});
    }
    return this.allowed();
  }
  private checkOtherEditors(): void {
    const names = new Set(this.owned.map(t => t.name));
    if (names.size !== this.owned.length || vscode.window.terminals.some(t => !this.owned.includes(t) && names.has(t.name))) throw new SafeError('동일한 이름의 다른 터미널이 있어 소유권을 확인할 수 없습니다. 터미널 이름을 구분한 뒤 다시 여세요.');
    const seen = new Set<string>();
    for (const group of vscode.window.tabGroups.all) for (const tab of group.tabs) {
      if (!(tab.input instanceof vscode.TabInputTerminal)) continue;
      if (!names.has(tab.label) || seen.has(tab.label)) throw new SafeError('다른 편집기 터미널이 있어 자동 분할을 멈췄습니다. 해당 터미널을 하단 패널로 이동하거나 닫은 뒤 다시 여세요. 창 reload 이전 터미널도 여기에 포함됩니다.');
      seen.add(tab.label);
    }
  }
  async create(options: vscode.TerminalOptions, beforeLaunch: () => void = () => {}): Promise<vscode.Terminal | undefined> {
    return this.enqueue(async () => {
      if (!this.allowed()) return;
      beforeLaunch();
      while (this.allowed()) {
        const count = this.owned.length + 1;
        editorLayout(count); // Check the limit before altering the layout or starting a process.
        if (!(await this.arrange(count)) || !this.allowed()) return;
        beforeLaunch();
        this.checkOtherEditors();
        if (count !== this.owned.length + 1) continue; // A terminal closed during layout/focus.
        const terminal = vscode.window.createTerminal({...options, location: {viewColumn: count as vscode.ViewColumn, preserveFocus: false}});
        this.owned.push(terminal);
        terminal.show(false);
        return terminal;
      }
    });
  }
  dispose(): void { this.disposed = true; this.subscription.dispose(); this.owned = []; this.closingNames.clear(); }
}
