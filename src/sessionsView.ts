import * as vscode from 'vscode';
import { SessionPages } from './codex';
import { ProviderKind, Session, SessionScope, pathKey, providerNames, sessionKey, workspacePaths, visibleWorkspacePaths } from './model';
import { agyResumeReason } from './agyRuntime';
import { providerIcon } from './providerAppearance';
export class SessionItem extends vscode.TreeItem {
  constructor(public readonly session: Session, public readonly groupId = '') {
    super(session.title, vscode.TreeItemCollapsibleState.None);
    this.id = JSON.stringify([sessionKey(session), groupId]);
    this.description = session.source;
    this.tooltip = `${session.title}\n${workspacePaths(session).join('\n') || '작업공간 경로 확인 안 됨'}\n수정: ${session.updatedAt ? new Date(session.updatedAt * 1000).toLocaleString() : '확인 안 됨'}\n출처: ${session.source}\n조회 상태: ${session.serverStatus} (전역 실행 상태 아님)\n재개 호환성: 미검증`;
    this.iconPath = providerIcon(session.provider ?? 'codex');
    this.contextValue = (session.provider ?? 'codex') === 'codex' ? 'session' : session.provider === 'agy' && !agyResumeReason(session) ? 'agySession' : 'externalSession';
    this.command = {command: 'multiCli.details', title: '세션 상세', arguments: [this]};
  }
}
export class WorkspaceItem extends vscode.TreeItem {
  constructor(public readonly folder: string, public readonly sessions: Session[], kind: ProviderKind) {
    super(folder || '작업공간 경로 확인 안 됨', vscode.TreeItemCollapsibleState.Collapsed);
    this.id = JSON.stringify([kind, 'workspace', pathKey(folder)]);
    this.contextValue = 'workspace'; this.description = `${sessions.length}개`;
    this.iconPath = new vscode.ThemeIcon(folder ? 'folder' : 'question');
    this.tooltip = folder || '원본 메타데이터에 작업공간 경로가 없어 이 묶음에 표시합니다.';
  }
}
export class SessionsView implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private changed = new vscode.EventEmitter<void>();
  onDidChangeTreeData = this.changed.event;
  pages = new SessionPages(); loading = false; error = ''; loaded = false;
  scope: SessionScope = 'all'; folders?: string[];
  constructor(public readonly kind: ProviderKind = 'codex') {}
  private command(action: string) { return this.kind === 'codex' ? `multiCli.${action}` : `multiCli.${this.kind}.${action}`; }
  update(): void { this.changed.fire(); }
  getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }
  getParent(item: vscode.TreeItem): vscode.TreeItem | undefined {
    return item instanceof SessionItem && item.groupId ? this.getChildren().find(g => g.id === item.groupId) : undefined;
  }
  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element instanceof WorkspaceItem) return element.sessions.map(s => new SessionItem(s, element.id));
    if (element) return [];
    const grouped = new Map<string, {folder: string; sessions: Session[]}>();
    for (const session of this.pages.sessions) {
      const paths = visibleWorkspacePaths(session, this.folders, this.scope);
      if (!paths.length && this.folders && this.scope !== 'all') continue;
      for (const folder of paths.length ? paths : ['']) {
        const key = pathKey(folder); let group = grouped.get(key);
        if (!group) { group = {folder, sessions: []}; grouped.set(key, group); }
        group.sessions.push(session);
      }
    }
    const rows: vscode.TreeItem[] = [...grouped.values()].map(g => new WorkspaceItem(g.folder, g.sessions, this.kind));
    if (this.loading) rows.push(new vscode.TreeItem('목록을 불러오는 중…'));
    else if (this.error) { const item = new vscode.TreeItem(this.error); item.iconPath = new vscode.ThemeIcon('warning'); rows.push(item); }
    else if (!this.loaded) { const item = new vscode.TreeItem('새로고침하여 세션 불러오기'); item.command = {command: this.command('refresh'), title: '새로고침'}; rows.push(item); }
    else if (!rows.length) rows.push(new vscode.TreeItem(this.pages.cursor ? '현재까지 일치하는 기록이 없습니다. 더 보기로 계속 찾으세요.' : '조건에 맞는 저장·실행 기록이 없습니다.'));
    if (!this.loading && this.pages.cursor) { const more = new vscode.TreeItem(this.scope === 'workspaceTree' ? '더 보기 (하위 경로 계속 찾기)' : '더 보기 (50개)'); more.command = {command: this.command('more'), title: '더 보기'}; rows.push(more); }
    return rows;
  }
  async search(): Promise<SessionItem | undefined> {
    const picks = this.pages.sessions.filter(session => this.scope === 'all' || !this.folders || visibleWorkspacePaths(session, this.folders, this.scope).length).map(session => ({label: session.title, description: visibleWorkspacePaths(session, this.folders, this.scope).join(' · ') || '경로 확인 안 됨', detail: session.source, session}));
    const selected = await vscode.window.showQuickPick(picks, {title: `${providerNames[this.kind]} · 불러온 ${picks.length}개 세션 검색`, placeHolder: '제목·작업공간 경로 검색', matchOnDescription: true, matchOnDetail: true});
    return selected ? new SessionItem(selected.session) : undefined;
  }
  dispose(): void { this.changed.dispose(); }
}
