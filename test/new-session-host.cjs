// Opt-in only: verifies native empty interactive startup, never sends model input.
exports.run = async () => {
  const enabled = process.env.MULTI_CLI_TEST_NEW_SESSIONS === '1';
  delete process.env.MULTI_CLI_TEST_NEW_SESSIONS;
  if (!enabled) return;

  const vscode = require('vscode');
  const assert = require('node:assert/strict');
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { ResumeTerminals, quotePowerShell } = require('../dist/resumeTerminal');
  const { resolveNewRuntime, newSessionArgs } = require('../dist/newSession');
  const { editorLayout } = require('../dist/editorTerminals');
  const { pathKey } = require('../dist/model');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const eventually = async (check, message, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = await check();
      if (result) return result;
      await pause(50);
    }
    assert.fail(message);
  };
  const terminalTab = name => {
    for (const group of vscode.window.tabGroups.all) {
      const tab = group.tabs.find(tab => tab.input instanceof vscode.TabInputTerminal && tab.label === name);
      if (tab) return { group, tab };
    }
  };
  const shape = layout => ({
    orientation: layout.orientation ?? 0,
    groups: layout.groups.map(group => group.groups ? { groups: group.groups.map(child => child.groups ? shape(child) : {}) } : {})
  });
  const hasStartupScreen = (kind, screen) => {
    if (!screen.trim() || /TERM is set to "dumb"|is not recognized as|cannot be loaded|failed to resume|ignoring --conversation|\bpanic\b|\bfatal\b/i.test(screen)) return false;
    if (/^\s*PS [^\r\n]*>\s*$/.test(screen.trimEnd().split(/\r?\n/).at(-1) ?? '')) return false;
    const banner = {
      codex: /\bCodex\b/i,
      agy: /Antigravity|\bagy\b/i,
      claude: /Claude Code|Welcome to Claude|Anthropic/i
    }[kind];
    // Startup gates may precede the normal composer. No gate is accepted or dismissed.
    const gate = /(?:do you trust|trust (?:the |this )?(?:files|folder|directory)|safety check|sign in|log ?in|authenticate|authentication|choose (?:a |your )?(?:theme|login)|select (?:a |your )?(?:theme|login)|let['’]s get started)/i;
    return banner.test(screen) || gate.test(screen);
  };
  const captureStartup = async (terminal, kind) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      terminal.show(false);
      await eventually(() => {
        const current = terminalTab(terminal.name);
        return vscode.window.activeTerminal === terminal && current && vscode.window.tabGroups.activeTabGroup.activeTab === current.tab;
      }, 'test-owned new terminal must be active before copying its screen', 3000);
      // A failed/empty copy must never reuse the user's previous clipboard as evidence.
      await vscode.env.clipboard.writeText('');
      await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      const screen = await vscode.env.clipboard.readText();
      if (hasStartupScreen(kind, screen)) return true;
      await pause(1000);
    }
    return false;
  };
  const processAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

  assert.ok(!vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputTerminal)), 'new-session host test requires prior test editor terminals to be fully closed');
  const initialLayout = await vscode.commands.executeCommand('vscode.getEditorLayout');
  const previousClipboard = await vscode.env.clipboard.readText();
  const tempRoot = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(tempRoot, 'multi-cli-new-host-'));
  const manager = new ResumeTerminals();
  const terminals = [];
  const processIds = [];
  const visible = {};
  try {
    for (const kind of ['codex', 'agy', 'claude']) {
      const cwd = path.join(directory, kind);
      await fs.mkdir(cwd);
      const runtime = await resolveNewRuntime(kind);
      const opened = await manager.openNew(kind, runtime, cwd);
      assert.ok(opened && opened.created, 'native new-session request must create a fresh terminal');
      const terminal = opened.terminal;
      terminals.push(terminal);
      const options = terminal.creationOptions;
      assert.ok(pathKey(options.cwd) === pathKey(cwd), 'native new terminal must use the selected synthetic folder');
      assert.ok(options.location && typeof options.location === 'object' && 'viewColumn' in options.location, 'native new terminal must open in the document editor');
      assert.ok(options.iconPath?.light?.fsPath?.endsWith(kind + '-light.svg') && options.iconPath?.dark?.fsPath?.endsWith(kind + '-dark.svg'), 'native new terminal must display its provider SVG in both themes');
      const expectedArgs = kind === 'codex' ? ['-C', cwd] : [];
      assert.ok(JSON.stringify(newSessionArgs(kind, cwd)) === JSON.stringify(expectedArgs), 'fresh native startup must have only the provider default arguments');
      const encoded = options.shellArgs?.at(-1);
      assert.ok(typeof encoded === 'string', 'native startup must use an encoded PowerShell invocation');
      const command = Buffer.from(encoded, 'base64').toString('utf16le');
      const expectedCommand = '& ' + [runtime.executable, ...expectedArgs].map(quotePowerShell).join(' ');
      assert.ok(command === expectedCommand, 'fresh startup must not add a prompt, resume ID, or permission override');
      const pid = await Promise.race([terminal.processId, pause(10000).then(() => undefined)]);
      assert.ok(pid && processAlive(pid), 'native new terminal process must start');
      processIds.push(pid);
      visible[kind] = await captureStartup(terminal, kind);
      assert.ok(visible[kind], 'native provider must render its startup banner or explicit initial login/folder trust gate');
      assert.ok(terminal.exitStatus === undefined, 'native new terminal must remain open');
      const count = terminals.length;
      await eventually(async () => {
        const layout = await vscode.commands.executeCommand('vscode.getEditorLayout');
        return JSON.stringify(shape(layout)) === JSON.stringify(shape(editorLayout(count))) && terminals.every(t => terminalTab(t.name)) && new Set(terminals.map(t => terminalTab(t.name).group.viewColumn)).size === count;
      }, 'new sessions must remain visible in distinct editor columns');
      for (let index = 0; index < terminals.length; index++) {
        const current = terminalTab(terminals[index].name);
        assert.ok(current.group.activeTab === current.tab, 'each native new terminal must be visible in its own editor group');
        assert.ok(await terminals[index].processId === processIds[index] && processAlive(processIds[index]), 'adding another provider must retain each original terminal process');
      }
    }
    console.log(JSON.stringify({ newSessionHost: { startupScreens: visible, selectedFolders: true, defaultArguments: true, providerIcons: true, threeEditorColumns: true, originalTerminalProcessesRetained: true, modelPromptSent: false, persistedSessionIdVerified: false } }));
  } finally {
    // Only terminals from this manager belong to this test; user/provider daemons are untouched.
    manager.dispose();
    for (const terminal of terminals) if (vscode.window.terminals.includes(terminal)) terminal.dispose();
    try {
      await eventually(() => terminals.every(t => !vscode.window.terminals.includes(t) && !terminalTab(t.name)), 'test-owned native terminal objects and editor tabs must disappear before cleanup');
      await eventually(() => processIds.every(pid => !processAlive(pid)), 'test-owned terminal processes must exit after disposing their terminals');
      await vscode.commands.executeCommand('vscode.setEditorLayout', initialLayout);
      const resolved = await fs.realpath(directory);
      assert.ok(pathKey(path.dirname(resolved)) === pathKey(tempRoot) && path.basename(resolved).startsWith('multi-cli-new-host-') && pathKey(resolved) === pathKey(directory), 'recursive cleanup target must be the exact generated immediate temporary folder');
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } finally {
      await vscode.env.clipboard.writeText(previousClipboard);
    }
  }
};
