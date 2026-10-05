const vscode=require('vscode');
const assert=require('node:assert/strict');
const {CodexClient,listParams,normalizePage}=require('../dist/codex');
const {resolveRuntime}=require('../dist/runtime');
exports.run=async()=>{
  const authorizedId=process.env.MULTI_CLI_TEST_SESSION_ID;
  const expectedHistory=process.env.MULTI_CLI_TEST_HISTORY_MARKER;
  const agyId=process.env.MULTI_CLI_TEST_AGY_SESSION_ID;
  const agyMarker=process.env.MULTI_CLI_TEST_AGY_HISTORY_MARKER;
  const testNewSessions=process.env.MULTI_CLI_TEST_NEW_SESSIONS;
  // Keep validation evidence out of provider child-process environments.
  delete process.env.MULTI_CLI_TEST_SESSION_ID;
  delete process.env.MULTI_CLI_TEST_HISTORY_MARKER;
  delete process.env.MULTI_CLI_TEST_AGY_SESSION_ID;
  delete process.env.MULTI_CLI_TEST_AGY_HISTORY_MARKER;
  delete process.env.MULTI_CLI_TEST_NEW_SESSIONS;
  const {validateHistoryScreen}=require('../scripts/history-check.cjs');
  const {validateAgyHistoryScreen}=require('../scripts/agy-history-check.cjs');
  // Validate the evidence requirement before launching any user session.
  if(authorizedId) validateHistoryScreen('',expectedHistory);
  if(agyId) validateAgyHistoryScreen('',agyMarker);
  const extension=vscode.extensions.getExtension('multi-cli-local.multi-cli');assert.ok(extension);
  const api=await extension.activate();
  await vscode.commands.executeCommand('workbench.view.extension.multiCli');
  await api.refresh();
  assert.equal(api.provider.error,'');assert.equal(api.provider.loaded,true);
  assert.equal(api.provider.scope,'workspaceTree');
  const {pathInScope}=require('../dist/model');
  const workspacePaths=vscode.workspace.workspaceFolders.filter(f=>f.uri.scheme==='file').map(f=>f.uri.fsPath);
  assert.ok(api.provider.pages.sessions.every(s=>pathInScope(s.cwd,workspacePaths,'workspaceTree')));
  const rows=api.provider.getChildren();assert.ok(rows.length>0);
  if(api.provider.pages.sessions.length) {const group=rows[0];assert.equal(group.contextValue,'workspace');const row=api.provider.getChildren(group)[0];assert.equal(row.contextValue,'session');assert.equal(row.command.command,'multiCli.details');assert.ok(row.tooltip.includes('미검증'));assert.notEqual(row.description,row.session.cwd);assert.ok(row.iconPath.dark.fsPath.endsWith('codex-dark.svg'));}
  const codexGroup=rows.find(r=>r.contextValue==='workspace');
  if(codexGroup)await api.trees.codex.reveal(api.provider.getChildren(codexGroup)[0],{expand:true,select:false});
  await Promise.all(['agy','claude'].map(async kind=>{
    await api.refresh(kind);const view=api.providers[kind];assert.equal(view.loaded,true);assert.equal(view.error,'');
    const groups=view.getChildren().filter(r=>r.contextValue==='workspace');
    assert.ok(groups.every(g=>pathInScope(g.folder,workspacePaths,'workspaceTree')));
    assert.ok(groups.every(g=>view.getChildren(g).every(r=>['externalSession','agySession'].includes(r.contextValue)&&r.description!==r.session.cwd)));
    if(groups.length)await api.trees[kind].reveal(view.getChildren(groups[0])[0],{expand:true,select:false});
    console.log(JSON.stringify({provider:kind,sessions:view.pages.sessions.length,workspaceGroups:groups.length}));
    await api.setScope(kind,'all');assert.equal(view.scope,'all');assert.equal(view.error,'');
    console.log(JSON.stringify({provider:kind,scope:'all',sessions:view.pages.sessions.length,workspaceGroups:view.getChildren().filter(r=>r.contextValue==='workspace').length}));
  }));
  const runtime=await resolveRuntime();
  await require('./editor-host.cjs').run();
  if (testNewSessions === '1') process.env.MULTI_CLI_TEST_NEW_SESSIONS='1';
  await require('./new-session-host.cjs').run();
  for(let i=0;i<3;i++) {
    const client=new CodexClient(runtime);await client.initialize();const pid=client.pid;
    normalizePage(await client.request('thread/list',listParams(null)));client.dispose();
    const deadline=Date.now()+3000;let alive=true;
    while(alive&&Date.now()<deadline){await new Promise(r=>setTimeout(r,50));try{process.kill(pid,0)}catch{alive=false}}
    assert.equal(alive,false,'owned App Server must exit');
  }
  // Real VS Code Terminal API, synthetic executable arguments: verifies native argv and env
  // without resuming any user conversation. Output is checked via a local synthetic file.
  const fs=require('node:fs/promises'),path=require('node:path');
  const {ResumeTerminals}=require('../dist/resumeTerminal');
  const dir=path.join(__dirname,'..','.local',"터미널 한글 & 공백 ' ‘ ’ ‚ ‛ $() ; %PATH%");await fs.mkdir(dir,{recursive:true});
  const result=path.join(dir,'argv.json');await fs.rm(result,{force:true});
  const recorder=path.join(dir,'recorder.cjs');
  await fs.writeFile(recorder,"require('node:fs').writeFileSync(process.env.MULTI_CLI_ARGV_OUTPUT,JSON.stringify({argv:process.argv.slice(2),home:process.env.CODEX_HOME,cwd:process.cwd(),hostKeys:Object.keys(process.env).filter(k=>/^(ELECTRON_|VSCODE_NLS_CONFIG$)/i.test(k)),nodeOptions:process.env.NODE_OPTIONS}));");
  // Use a node native process with the exact same TerminalOptions API as production.
  const id='00000000-0000-4000-8000-000000000001';
  const {resumeArgs,terminalOptions}=require('../dist/resumeTerminal');
  const args=resumeArgs(id,dir);
  const terminal=vscode.window.createTerminal(terminalOptions({executable:process.env.MULTI_CLI_NODE_EXE||'C:\\Program Files\\nodejs\\node.exe',env:{...process.env,CODEX_HOME:dir,MULTI_CLI_ARGV_OUTPUT:result,ELECTRON_RUN_AS_NODE:'1',VSCODE_NLS_CONFIG:'synthetic-host-data',NODE_OPTIONS:'--max-old-space-size=512'}},[recorder,...args],dir,'Multi CLI synthetic verification'));
  terminal.show();
  try {
    let value;const deadline=Date.now()+10000;
    while(Date.now()<deadline){try{value=JSON.parse(await fs.readFile(result,'utf8'));break}catch{await new Promise(r=>setTimeout(r,100))}}
    assert.ok(value,'native integrated terminal must execute');assert.deepEqual(value.argv,args);assert.equal(value.home,dir);assert.equal(value.cwd.toLowerCase(),dir.toLowerCase());
    assert.deepEqual(value.hostKeys,[]);assert.equal(value.nodeOptions,'--max-old-space-size=512');
  }finally{terminal.dispose();}
  const emptyHome=path.join(__dirname,'..','.local','empty-codex-home');await fs.mkdir(emptyHome,{recursive:true});
  const emptyClient=new CodexClient({...runtime,home:emptyHome,env:{...runtime.env,CODEX_HOME:emptyHome}});
  try {await emptyClient.initialize();assert.equal(normalizePage(await emptyClient.request('thread/list',listParams(null))).data.length,0);}finally{emptyClient.dispose();}
  const pickerBefore=new Set(vscode.window.terminals);
  await api.setScope('codex','all');
  await vscode.commands.executeCommand('multiCli.picker');
  const picker=vscode.window.terminals.find(t=>!pickerBefore.has(t));assert.ok(picker);
  const pickerClipboard=await vscode.env.clipboard.readText();
  try {
    await new Promise(r=>setTimeout(r,8000));picker.show();
    await vscode.commands.executeCommand('workbench.action.terminal.selectAll');await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
    const pickerScreen=await vscode.env.clipboard.readText();
    const matches=api.provider.pages.sessions.filter(s=>pickerScreen.replace(/\s/g,'').includes(s.title.replace(/\s/g,'').slice(0,15))).length;
    console.log(JSON.stringify({cliPicker:{visible: /session|resume/i.test(pickerScreen),matchingLoadedTitles:matches,chars:pickerScreen.length,gates:['trust','folder','directory','continue','error','loading','yes','no'].filter(w=>pickerScreen.toLowerCase().includes(w))}}));
    assert.ok(/session|resume|trust/i.test(pickerScreen),'CLI picker or its explicit trust gate must render');
  }finally{await vscode.env.clipboard.writeText(pickerClipboard);picker.dispose();}
  let pairedCodex,pairedCodexPid;
  if(authorizedId) {
    const target=api.provider.getChildren().flatMap(g=>api.provider.getChildren(g)).find(row=>row.session?.id===authorizedId);
    assert.ok(target,'authorized test session must be in loaded list');
    const before=new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('multiCli.resume',target);
    const opened=vscode.window.terminals.find(t=>!before.has(t));assert.ok(opened);
    assert.ok(opened.creationOptions.location);assert.ok(opened.creationOptions.iconPath.dark.fsPath.endsWith('codex-dark.svg'));
    const clipboard=await vscode.env.clipboard.readText();
    let verified=false;
    try {
      await new Promise(r=>setTimeout(r,6000));
      opened.show();
      await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      const screen=await vscode.env.clipboard.readText();
      assert.equal(opened.exitStatus,undefined,'resume terminal must remain alive');
      // Test-only, explicit terminal selection; general Terminal API cannot read stdout.
      // Do not print or persist captured user history.
      const hasCodex=/Codex|codex/.test(screen);
      const hasHistory=validateHistoryScreen(screen,expectedHistory);
      const gates=['update','upgrade','trust','login','sign in','press','continue','error','resume','OpenAI','available','skip','later'].filter(word=>screen.toLowerCase().includes(word.toLowerCase()));
      console.log(JSON.stringify({authorizedResume:{alive:true,selectedTerminalChars:screen.length,codexVisible:hasCodex,expectedHistoryMatched:hasHistory,gates}}));
      assert.ok(hasCodex,'Codex terminal must render');
      assert.ok(!screen.includes('TERM is set to "dumb"'),'terminal must advertise xterm capability');
      assert.ok(!screen.includes('Failed to resume session'),'Codex reported resume failure; terminal creation is not resume success');
      assert.ok(hasHistory,'history has not been verified');
      await vscode.commands.executeCommand('multiCli.resume',target);
      assert.equal(vscode.window.terminals.filter(t=>!before.has(t)).length,1,'duplicate resume reuses terminal');
      verified=true;
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
      if(verified&&agyId){pairedCodex=opened;pairedCodexPid=await opened.processId;}else opened.dispose();
    }
  }
  if(agyId) {
    try {
    const view=api.providers.agy;
    const target=view.getChildren().flatMap(g=>view.getChildren(g)).find(row=>row.session?.id===agyId&&row.session.agyOrigin==='cli');
    assert.ok(target,'authorized agy test session must be in the CLI list');
    assert.equal(target.contextValue,'agySession');assert.ok(target.session.cwd,'authorized agy test needs a known working directory');
    await api.trees.agy.reveal(target,{expand:true,select:false});
    const before=new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('multiCli.agy.resume',target);
    const opened=vscode.window.terminals.find(t=>!before.has(t));assert.ok(opened,'agy Resume must create a terminal');
    assert.ok(opened.creationOptions.location);assert.ok(opened.creationOptions.iconPath.dark.fsPath.endsWith('agy-dark.svg'));
    const clipboard=await vscode.env.clipboard.readText();
    try {
      let screen='',matched=false;const deadline=Date.now()+25000;
      while(Date.now()<deadline){
        await new Promise(r=>setTimeout(r,3000));opened.show();
        await vscode.commands.executeCommand('workbench.action.terminal.selectAll');await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
        screen=await vscode.env.clipboard.readText();matched=validateAgyHistoryScreen(screen,agyMarker);if(matched)break;
      }
      console.log(JSON.stringify({authorizedAgyResume:{terminalAlive:opened.exitStatus===undefined,selectedTerminalChars:screen.length,agyVisible:/Antigravity|\bagy\b/i.test(screen),expectedHistoryMatched:matched,missingIdWarning:/not found|ignoring --conversation/i.test(screen),gates:['trust','login','sign in','error','permission','update'].filter(word=>screen.toLowerCase().includes(word))}}));
      assert.ok(matched,'agy history has not been verified');
      await vscode.commands.executeCommand('multiCli.agy.resume',target);
      assert.equal(vscode.window.terminals.filter(t=>!before.has(t)).length,1,'duplicate agy Resume reuses one terminal');
      if(pairedCodex){
        const terminalGroup=t=>vscode.window.tabGroups.all.find(g=>g.tabs.some(tab=>tab.input instanceof vscode.TabInputTerminal&&tab.label===t.name));
        assert.ok(terminalGroup(pairedCodex));assert.ok(terminalGroup(opened));assert.notEqual(terminalGroup(pairedCodex).viewColumn,terminalGroup(opened).viewColumn);
        assert.equal(await pairedCodex.processId,pairedCodexPid);assert.equal(pairedCodex.exitStatus,undefined);
        const layout=await vscode.commands.executeCommand('vscode.getEditorLayout');assert.equal(layout.orientation,0);assert.equal(layout.groups.length,2);assert.ok(layout.groups.every(g=>!g.groups));
        console.log('PAIRED RESUME PASS: authorized Codex and agy are visible in separate editor groups; original Codex terminal process retained.');
      }
    }finally{await vscode.env.clipboard.writeText(clipboard);opened.dispose();}
    }finally{pairedCodex?.dispose();}
  }
  console.log('HOST PASS: real listing, TreeView items, 3 owned-process cleanup cycles, native integrated terminal argv/environment.');
};
