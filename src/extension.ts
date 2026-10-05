import * as vscode from 'vscode';
import { CodexClient, SessionPages, listParams } from './codex';
import { Runtime, SafeError, guard, isDirectory, resolveRuntime, safeMessage } from './runtime';
import { ResumeTerminals } from './resumeTerminal';
import { SessionsView, SessionItem } from './sessionsView';
import { ProviderKind, SessionScope, filterSessions, providerNames, scopeNames, storeKey } from './model';
import { readExternalCatalog } from './externalCatalog';
import { agyDefaultRoot, agyResumeReason, resolveAgyRuntime } from './agyRuntime';
import { resolveNewRuntime } from './newSession';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('hcscat Multi CLI');
  const terminals = new ResumeTerminals();
  const kinds: ProviderKind[] = ['codex', 'agy', 'claude'];
  const providers = Object.fromEntries(kinds.map(kind => [kind, new SessionsView(kind)])) as Record<ProviderKind, SessionsView>;
  const trees = Object.fromEntries(kinds.map(kind => [kind, vscode.window.createTreeView(kind === 'codex' ? 'multiCli.sessions' : `multiCli.${kind}Sessions`, {treeDataProvider: providers[kind], showCollapseAll: true})])) as Record<ProviderKind, vscode.TreeView<vscode.TreeItem>>;
  const states = Object.fromEntries(kinds.map(kind => [kind, {generation: 0, scope: 'workspaceTree', notice: '', rawPages: new SessionPages()}])) as Record<ProviderKind, {generation: number; scope: SessionScope; notice: string; rawPages: SessionPages; controller?: AbortController; client?: CodexClient}>;
  let listingRuntime: Runtime | undefined;
  let agyListingRoot: string | undefined;
  let executionEpoch = 0;
  const launchCheck = () => {
    const captured = executionEpoch;
    return () => { allowed(); if (captured !== executionEpoch) throw new SafeError('실행 대기 중 설정이 변경되거나 확장이 종료되어 실행을 취소했습니다. 다시 여세요.'); };
  };
  const allowed = () => guard(process.platform, vscode.env.remoteName, vscode.workspace.isTrusted);
  const setting = (key: string) => vscode.workspace.getConfiguration('multiCli').inspect<string>(key)?.globalValue ?? '';
  const runtime = () => resolveRuntime(setting('executablePath'), setting('codexHome'));
  const folders = () => vscode.workspace.workspaceFolders?.filter(f => f.uri.scheme === 'file').map(f => f.uri.fsPath);
  const message = (kind: ProviderKind) => {
    const scoped = states[kind].scope !== 'all' && Boolean(folders()?.length);
    trees[kind].message = `${scoped ? scopeNames[states[kind].scope] : states[kind].scope === 'all' ? scopeNames.all : '전체 로컬 (열린 폴더 없음)'} · ${states[kind].notice || (kind === 'codex' ? 'DB 인덱스만 조회 (누락 가능)' : '로컬 저장·실행 기록')}${scoped && kind === 'agy' ? ' · 경로 미확인은 전체 로컬에서 확인' : ''}`;
  };
  const commandId = (kind: ProviderKind, action: string) => kind === 'codex' ? `multiCli.${action}` : `multiCli.${kind}.${action}`;
  const cancel = (kind: ProviderKind) => {
    const state = states[kind]; state.generation++; state.controller?.abort(); state.client?.dispose(); state.client = undefined; state.controller = undefined; providers[kind].loading = false;
    void vscode.commands.executeCommand('setContext', `multiCli.${kind}.loading`, false);
  };
  const clearList = (kind: ProviderKind) => {
    const provider = providers[kind], state = states[kind];
    provider.pages = new SessionPages(); provider.loaded = false; provider.error = '';
    state.rawPages = new SessionPages(); state.notice = '';
    if (kind === 'codex') listingRuntime = undefined;
    if (kind === 'agy') agyListingRoot = undefined;
  };
  async function load(kind: ProviderKind, reset: boolean): Promise<void> {
    allowed(); const provider = providers[kind], state = states[kind];
    if (!reset && (kind !== 'codex' || provider.loading || !provider.pages.cursor)) return;
    cancel(kind); const current = state.generation;
    if (reset) clearList(kind);
    provider.error = ''; provider.loading = true; provider.update();
    void vscode.commands.executeCommand('setContext', `multiCli.${kind}.loading`, true);
    const abort = new AbortController(); state.controller = abort;
    let connection: CodexClient | undefined;
    try {
      const localFolders = folders();
      const scope = state.scope !== 'all' && localFolders?.length ? state.scope : 'all';
      const dirs = scope === 'all' ? undefined : localFolders;
      provider.scope = scope; provider.folders = dirs;
      if (kind === 'codex') {
        const selected = listingRuntime ?? await runtime();
        if (current !== state.generation) return;
        listingRuntime = selected; connection = new CodexClient(selected); state.client = connection;
        await connection.initialize(abort.signal);
        const selectedStore = storeKey(selected.home);
        const before = provider.pages.sessions.length;
        let batches = 0;
        do {
          // App Server cwd is exact-only. Descendants require paging the metadata index.
          const result = await connection.request('thread/list', listParams(state.rawPages.cursor, scope === 'workspace' ? dirs : undefined), abort.signal);
          if (current !== state.generation) return;
          const page = state.rawPages.accept(result);
          for (const session of page.data) { session.provider = 'codex'; session.storeId = selectedStore; }
          provider.pages.sessions = filterSessions(state.rawPages.sessions, dirs, scope);
          provider.pages.cursor = state.rawPages.cursor;
          provider.loaded = true; batches++;
        } while (scope === 'workspaceTree' && state.rawPages.cursor && provider.pages.sessions.length - before < 50 && batches < 20);
      } else {
        const result = await readExternalCatalog(kind, kind === 'claude' ? {root: setting('claudeConfigDir'), executable: setting('claudeExecutablePath')} : {root: setting('antigravityDataRoot')}, abort.signal);
        if (current !== state.generation) return;
        provider.pages.sessions = filterSessions(result.sessions, dirs, scope); state.notice = result.notice; provider.error = result.warning ?? '';
        if (kind === 'agy') agyListingRoot = setting('antigravityDataRoot') || agyDefaultRoot();
      }
      provider.loaded = true; message(kind);
      output.appendLine(`${providerNames[kind]}: 목록 ${provider.pages.sessions.length}개, 더 보기 ${Boolean(provider.pages.cursor)}. 자동 재개 없음.`);
    } catch (error) { if (current === state.generation) { provider.error = safeMessage(error); output.appendLine(`${providerNames[kind]}: ${provider.error}`); } }
    finally {
      connection?.dispose();
      if (current === state.generation) {
        if (kind === 'codex') {
          provider.pages.cursor = state.rawPages.cursor;
          state.notice = `DB 인덱스만 조회 (누락 가능)${provider.scope === 'workspaceTree' ? ` · 메타데이터 ${state.rawPages.scanned}개 확인${provider.pages.cursor ? ' · 더 보기로 계속 검색' : ''}` : ''}${state.rawPages.skipped ? ` · 형식 불일치 ${state.rawPages.skipped}건 제외 (CLI 응답 형식 확인 필요)` : ''}`;
        }
        state.client = undefined; state.controller = undefined; provider.loading = false;
        void vscode.commands.executeCommand('setContext', `multiCli.${kind}.loading`, false); message(kind); provider.update();
      }
    }
  }
  function validItem(item: SessionItem): boolean { return providers[item.session.provider ?? 'codex'].pages.sessions.includes(item.session); }
  async function details(item?: SessionItem, kind: ProviderKind = 'codex'): Promise<void> {
    allowed(); if (!item) item = await providers[kind].search();
    if (!item || !validItem(item)) return;
    const session = item.session; kind = session.provider ?? 'codex';
    const canResume = kind === 'codex' || (kind === 'agy' && !agyResumeReason(session));
    const choices = [...(canResume ? [{label: 'Resume', description: '통합 터미널에서 이 세션 재개'}] : []), {label: '세션 ID 복사', description: '원본 앱/CLI에서 사용할 ID'}, {label: '닫기', description: canResume ? '' : kind === 'agy' ? agyResumeReason(session) : '현재 Claude는 목록 조회만 지원합니다.'}];
    const choice = await vscode.window.showQuickPick(choices, {title: `${providerNames[kind]} · ${session.title}`, placeHolder: `${session.cwd || '작업공간 경로 확인 안 됨'} · ${session.source} · ${session.id}`});
    if (choice?.label === 'Resume') await resume(item);
    else if (choice?.label === '세션 ID 복사') await vscode.env.clipboard.writeText(session.id);
  }
  async function resume(item?: SessionItem, kind: ProviderKind = 'codex'): Promise<void> {
    allowed(); if (!item) item = await providers[kind].search();
    if (!item || !validItem(item)) return;
    kind = item.session.provider ?? 'codex';
    if (kind === 'claude') throw new SafeError('현재 Claude는 목록 조회만 지원합니다.');
    if (kind === 'agy') { const reason = agyResumeReason(item.session); if (reason) throw new SafeError(reason); }
    if (kind === 'codex' && !listingRuntime || kind === 'agy' && !agyListingRoot) throw new SafeError('설정이 변경되었습니다. 먼저 목록을 새로고침하세요.');
    const generation = states[kind].generation;
    const selected = kind === 'agy' ? await resolveAgyRuntime(setting('antigravityExecutablePath'), agyListingRoot) : listingRuntime!;
    if (generation !== states[kind].generation || !validItem(item)) return;
    const check = launchCheck();
    const beforeLaunch = () => { check(); if (!validItem(item!)) throw new SafeError('목록이 변경되어 실행을 취소했습니다. 세션을 다시 선택하세요.'); };
    const result = kind === 'agy' ? await terminals.openAgy(selected, item.session, false, beforeLaunch) : await terminals.open(selected, item.session, undefined, false, beforeLaunch);
    if (result) output.appendLine(result.created ? '통합 터미널에 Resume 실행을 요청했습니다. 성공·히스토리는 터미널에서 확인하세요.' : '기존 Resume 터미널을 열었습니다. 새 실행은 요청하지 않았습니다.');
  }
  async function setScope(kind: ProviderKind, scope: SessionScope): Promise<void> {
    allowed();
    if (!kinds.includes(kind) || !Object.hasOwn(scopeNames, scope)) throw new SafeError('목록 범위가 올바르지 않습니다.');
    states[kind].scope = scope; message(kind); await load(kind, true);
  }
  async function newSession(kind: ProviderKind): Promise<void> {
    allowed(); const check = launchCheck();
    const folder = await vscode.window.showOpenDialog({canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: '이 폴더에서 새 세션 열기', title: `${providerNames[kind]} 새 세션의 작업 폴더를 선택하세요.`});
    if (!folder?.[0]) return;
    check();
    if (folder[0].scheme !== 'file' || !(await isDirectory(folder[0].fsPath))) throw new SafeError('새 세션은 접근 가능한 로컬 폴더에서만 열 수 있습니다.');
    check();
    const selected = await resolveNewRuntime(kind, setting(kind === 'codex' ? 'executablePath' : kind === 'agy' ? 'antigravityExecutablePath' : 'claudeExecutablePath'), setting(kind === 'codex' ? 'codexHome' : kind === 'agy' ? 'antigravityDataRoot' : 'claudeConfigDir'));
    check();
    const result = await terminals.openNew(kind, selected, folder[0].fsPath, check);
    if (result) output.appendLine(`${providerNames[kind]}: 선택한 폴더에서 새 CLI 실행을 요청했습니다. 새 대화의 저장·ID 생성은 CLI에서 첫 입력 후 확인하세요. 목록은 새로고침으로 갱신합니다.`);
  }
  async function selectScope(kind: ProviderKind): Promise<void> {
    allowed();
    const choices = (['workspaceTree', 'workspace', 'all'] as SessionScope[]).map(scope => ({label: scopeNames[scope], description: states[kind].scope === scope ? '현재 선택' : '', scope}));
    const selected = await vscode.window.showQuickPick(choices, {title: `${providerNames[kind]} 목록 범위`, placeHolder: '작업공간과 하위 폴더 / 현재 폴더만 / 전체 로컬'});
    if (selected) await setScope(kind, selected.scope);
  }
  function command(id: string, fn: (...args: any[]) => unknown) {
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => { try { return await fn(...args); } catch (error) { const text = safeMessage(error); output.appendLine(text); void vscode.window.showErrorMessage(text); } }));
  }
  for (const kind of kinds) {
    message(kind);
    command(commandId(kind, 'refresh'), () => load(kind, true));
    command(commandId(kind, 'search'), () => details(undefined, kind));
    command(commandId(kind, 'cancel'), () => { cancel(kind); providers[kind].error = '목록 조회를 취소했습니다.'; providers[kind].update(); });
    command(commandId(kind, 'filter'), () => selectScope(kind));
    command(commandId(kind, 'new'), () => newSession(kind));
    context.subscriptions.push(providers[kind], trees[kind], {dispose: () => cancel(kind)}, trees[kind].onDidChangeVisibility(e => { if (e.visible && !providers[kind].loaded && !providers[kind].loading) void load(kind, true).catch(error => {providers[kind].error = safeMessage(error); providers[kind].update();}); }));
  }
  command('multiCli.more', () => load('codex', false));
  command('multiCli.details', details); command('multiCli.resume', resume);
  command('multiCli.agy.resume', (item?: SessionItem) => resume(item, 'agy'));
  command('multiCli.picker', async () => {
    allowed(); const check = launchCheck(); const selected = await runtime(); check();
    const result = await terminals.open(selected, undefined, vscode.workspace.workspaceFolders?.find(f => f.uri.scheme === 'file')?.uri.fsPath, false, check);
    if (result) output.appendLine(result.created ? 'CLI picker 실행 요청. 기본 picker는 interactive 출처이며 확장의 DB 목록과 범위가 다를 수 있습니다.' : '기존 CLI picker 터미널을 열었습니다. 새 실행은 요청하지 않았습니다.');
  });
  command('multiCli.diagnostics', () => { for (const kind of kinds) output.appendLine(`${providerNames[kind]}: ${states[kind].notice || '미조회'}. 외부 전역 실행 상태와 전체 기록은 보장하지 않습니다.`); output.show(); });
  context.subscriptions.push(output, terminals, vscode.workspace.onDidChangeConfiguration(e => {
    if (!e.affectsConfiguration('multiCli')) return; executionEpoch++; listingRuntime = undefined; agyListingRoot = undefined;
    for (const kind of kinds) { cancel(kind); clearList(kind); providers[kind].error = '설정이 변경되었습니다. 새로고침하세요.'; message(kind); providers[kind].update(); }
  }), {dispose: () => { executionEpoch++; }}, vscode.workspace.onDidChangeWorkspaceFolders(() => {
    for (const kind of kinds) {
      if (states[kind].scope === 'all') continue;
      // Invalidate hidden views too, so stale items and in-flight results cannot be reused.
      cancel(kind); clearList(kind); message(kind); providers[kind].update();
      if (trees[kind].visible) void load(kind, true).catch(error => { providers[kind].error = safeMessage(error); providers[kind].update(); });
    }
  }));
  return {provider: providers.codex, providers, trees, refresh: (kind: ProviderKind = 'codex') => load(kind, true), setScope};
}
