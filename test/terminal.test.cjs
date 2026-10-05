const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs/promises');
const path=require('node:path');
const created=[];let close;let chosen;let dialogCount=0;
const original=Module._load;
let informationCount=0;let informationResponse;
const workspace={isTrusted:true};
Module._load=function(name,...args){if(name==='vscode')return {Uri:{file:fsPath=>({fsPath})},ViewColumn:{One:1},env:{remoteName:undefined},workspace,window:{onDidCloseTerminal(fn){close=fn;return {dispose(){}}},async showInformationMessage(){informationCount++;return informationResponse},async showOpenDialog(){dialogCount++;return chosen},showErrorMessage(){},createTerminal(options){const t={options,showCount:0,show(){this.showCount++}};created.push(t);return t}}};return original.call(this,name,...args)};
const editors=require('../dist/editorTerminals');
editors.EditorTerminals=class{async create(options,beforeLaunch=()=>{}){beforeLaunch();const t={options,showCount:0,show(){this.showCount++}};created.push(t);return t}dispose(){}};
const {resumeArgs,ResumeTerminals,quotePowerShell,terminalOptions}=require('../dist/resumeTerminal');Module._load=original;
const agy=require('../dist/agyRuntime');
const id='00000000-0000-4000-8000-000000000001';
test('native argument array never interpolates Korean, spaces or shell metacharacters',()=>{
  const cwd="C:\\한글 폴더\\x & $() ` ; %PATH% '";
  assert.deepEqual(resumeArgs(id,cwd),['resume',id,'-C',cwd]);
  for(const bad of ['--last','name','x;exit',id+'\n'])assert.throws(()=>resumeArgs(bad,cwd));
  assert.throws(()=>resumeArgs(id,'x\nexit'));
  assert.equal(quotePowerShell("x'; $(exit) & ` %PATH%"),"'x''; $(exit) & ` %PATH%'");
});

test('Windows PowerShell preserves smart-quote executable paths and arguments without executing injected text', {skip:process.platform!=='win32'}, async()=>{
  const {execFile}=require('node:child_process'),{promisify}=require('node:util');
  const local=path.resolve('.local');await fs.mkdir(local,{recursive:true});
  const dir=await fs.mkdtemp(path.join(local,'powershell-smart-‘’‚‛-'));
  try{
    const native=path.join(dir,'native ’ probe.exe'),recorder=path.join(dir,'record.cjs'),result=path.join(dir,'result.json');
    await fs.copyFile(process.execPath,native);
    await fs.writeFile(recorder,"require('node:fs').writeFileSync(process.env.MULTI_CLI_ARGV_OUTPUT,JSON.stringify({argv:process.argv.slice(2),home:process.env.CODEX_HOME,nodeOptions:process.env.NODE_OPTIONS,ipc:process.env.VSCODE_IPC_HOOK_CLI,hostKeys:Object.keys(process.env).filter(k=>/^(ELECTRON_|VSCODE_NLS_CONFIG$)/i.test(k))}));");
    const runtime={executable:native,home:dir,env:{...process.env,CODEX_HOME:dir,MULTI_CLI_ARGV_OUTPUT:result,ELECTRON_RUN_AS_NODE:'1',VSCODE_NLS_CONFIG:'synthetic-host-data',VSCODE_IPC_HOOK_CLI:'synthetic-cli-hook',NODE_OPTIONS:'--max-old-space-size=512'}};
    for(const quote of ["'",'‘','’','‚','‛'])for(const cwd of [`C:\\synthetic\\John${quote}s Project`,`C:\\synthetic\\x${quote}; Write-Output MULTI_CLI_INJECTED; ${quote}tail`]){
      await fs.rm(result,{force:true});
      const args=resumeArgs(id,cwd),options=terminalOptions(runtime,[recorder,...args],dir,'Synthetic verification');
      const output=await promisify(execFile)(options.shellPath,options.shellArgs.filter(arg=>arg!=='-NoExit'),{env:options.env,cwd:dir,windowsHide:true,shell:false,timeout:10000,maxBuffer:4096});
      assert.equal(output.stdout.trim(),'');assert.equal(output.stderr.trim(),'');
      const captured=JSON.parse(await fs.readFile(result,'utf8'));
      assert.deepEqual(captured.argv,args);assert.equal(captured.home,dir);assert.deepEqual(captured.hostKeys,[]);
      assert.equal(captured.nodeOptions,'--max-old-space-size=512');assert.equal(captured.ipc,'synthetic-cli-hook');
    }
  }finally{
    assert.equal(path.dirname(path.resolve(dir)),local);
    await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
test('terminal reuses duplicate session, same home/executable/env; missing cwd cancels',async()=>{
  await fs.mkdir(path.join(process.cwd(),'.local'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(process.cwd(),'.local','한글 공백 & '));
  const manager=new ResumeTerminals();const runtime={executable:'C:\\synthetic\\codex.exe',home:dir,env:{CODEX_HOME:dir}};
  try {
    runtime.env.TERM='dumb';
    const session={id,cwd:dir,title:'$(malicious)'};
    const [opened]=await Promise.all([manager.open(runtime,session),manager.open(runtime,session)]);const first=opened.terminal;
    assert.equal(opened.created,true);
    assert.equal(created.length,1);assert.equal(Buffer.from(first.options.shellArgs.at(-1),'base64').toString('utf16le'),'& '+[runtime.executable,...resumeArgs(id,dir)].map(quotePowerShell).join(' '));assert.ok(first.options.shellPath.endsWith('powershell.exe'));assert.equal(first.options.strictEnv,true);assert.equal(first.options.env.CODEX_HOME,dir);
    assert.equal(first.options.env.TERM,'xterm-256color');
    const reused=await manager.open(runtime,session);assert.equal(first.showCount,2);assert.equal(reused.created,false);assert.equal(informationCount,1);
    first.exitStatus={code:0};await manager.open(runtime,session);assert.equal(created.length,2);
    close(created[1]);await manager.open(runtime,session);assert.equal(created.length,3);
    assert.equal(await manager.open(runtime,{id:id.replace(/1$/,'2'),cwd:'Z:\\missing-synthetic'}),undefined);assert.equal(dialogCount,1);
  } finally {manager.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
test('explicit new terminal keeps existing shell and picker without workspace asks for a folder',async()=>{
  const start=created.length;const manager=new ResumeTerminals();
  const runtime={executable:'C:\\synthetic\\codex.exe',home:process.cwd(),env:{CODEX_HOME:process.cwd()}};
  try {
    const session={id,cwd:process.cwd()};
    const old=await manager.open(runtime,session);const fresh=await manager.open(runtime,session,undefined,true);
    assert.notEqual(old.terminal,fresh.terminal);assert.equal(created.length,start+2);assert.equal(fresh.created,true);
    assert.equal(await manager.open(runtime),undefined); // Never use storage directory as picker cwd.
  }finally{manager.dispose();}
});
test('new-terminal notification is explicit; a stale notification cannot launch after disposal or trust loss',async()=>{
  const runtime={executable:'C:\\synthetic\\codex.exe',home:process.cwd(),env:{CODEX_HOME:process.cwd()}};
  const session={id,cwd:process.cwd()};const manager=new ResumeTerminals();
  try {
    await manager.open(runtime,session);const before=created.length;
    informationResponse='새 터미널 열기';await manager.open(runtime,session);
    const deadline=Date.now()+1000;
    while(created.length===before&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(created.length,before+1);
    let finish;informationResponse=new Promise(resolve=>finish=resolve);
    await manager.open(runtime,session);manager.dispose();finish('새 터미널 열기');
    await new Promise(resolve=>setImmediate(resolve));assert.equal(created.length,before+1);
    const other=new ResumeTerminals();workspace.isTrusted=false;
    await assert.rejects(()=>other.open(runtime,session),/Workspace Trust/);other.dispose();
  } finally {manager.dispose();informationResponse=undefined;workspace.isTrusted=true;}
});
test('agy uses an explicit ID without a new prompt, rechecks history, and keeps terminals separate from Codex',async()=>{
  const validate=agy.validateAgySession;let checks=0;
  agy.validateAgySession=async()=>{checks++};
  const manager=new ResumeTerminals();const runtime={executable:'C:\\synthetic\\agy.exe',home:process.cwd(),env:{SYNTHETIC:'1',TERM:'dumb'}};
  const session={provider:'agy',agyOrigin:'cli',id,cwd:process.cwd(),title:'$(exit)'};
  try{
    const opened=await manager.openAgy(runtime,session);
    assert.equal(Buffer.from(opened.terminal.options.shellArgs.at(-1),'base64').toString('utf16le'),'& '+[runtime.executable,'--conversation',id].map(quotePowerShell).join(' '));
    assert.equal(opened.terminal.options.cwd,process.cwd());assert.equal(opened.terminal.options.env.TERM,'xterm-256color');assert.equal(checks,2);
    const reused=await manager.openAgy(runtime,session);assert.equal(reused.created,false);assert.equal(reused.terminal,opened.terminal);
    const codex=await manager.open(runtime,session);assert.notEqual(codex.terminal,opened.terminal);
    agy.validateAgySession=async()=>{throw new (require('../dist/runtime').SafeError)('Synthetic stale history')};
    const before=created.length;await assert.rejects(manager.openAgy(runtime,session,true),/stale history/);assert.equal(created.length,before);
  }finally{manager.dispose();agy.validateAgySession=validate;}
});
test('new sessions use the selected folder, provider environment and icon; repeated clicks start separate shells without resume or prompt',async()=>{
  const manager=new ResumeTerminals();const before=created.length;
  try{
    for(const kind of ['codex','agy','claude']){
      const variable=kind==='codex'?'CODEX_HOME':kind==='claude'?'CLAUDE_CONFIG_DIR':'SYNTHETIC_AGY_HOME';
      const runtime={executable:`C:\\synthetic\\${kind}.exe`,home:'C:\\synthetic\\config',env:{[variable]:'C:\\synthetic\\config',TERM:'dumb'}};
      const opened=await manager.openNew(kind,runtime,process.cwd());
      const options=opened.terminal.options;
      const args=kind==='codex'?['-C',process.cwd()]:[];
      assert.equal(Buffer.from(options.shellArgs.at(-1),'base64').toString('utf16le'),'& '+[runtime.executable,...args].map(quotePowerShell).join(' '));
      assert.equal(options.cwd,process.cwd());assert.equal(options.env[variable],runtime.home);assert.equal(options.env.TERM,'xterm-256color');assert.equal(options.strictEnv,true);
      assert.ok(options.iconPath.light.fsPath.endsWith(`${kind}-light.svg`));assert.ok(options.iconPath.dark.fsPath.endsWith(`${kind}-dark.svg`));
      const fresh=await manager.openNew(kind,runtime,process.cwd());assert.notEqual(fresh.terminal,opened.terminal);assert.notEqual(fresh.terminal.options.name,options.name);
    }
    assert.equal(created.length,before+6);
  }finally{manager.dispose();}
});
test('a stale new-terminal notification checks the original launch permission before starting another shell',async()=>{
  const manager=new ResumeTerminals();const runtime={executable:'C:\\synthetic\\codex.exe',home:process.cwd(),env:{CODEX_HOME:process.cwd()}};
  let allowed=true,finish;const check=()=>{if(!allowed)throw new (require('../dist/runtime').SafeError)('Synthetic execution settings changed')};
  try{
    await manager.open(runtime,{id,cwd:process.cwd()},undefined,false,check);const before=created.length;
    informationResponse=new Promise(resolve=>finish=resolve);await manager.open(runtime,{id,cwd:process.cwd()},undefined,false,check);
    allowed=false;finish('새 터미널 열기');await new Promise(resolve=>setImmediate(resolve));assert.equal(created.length,before);
  }finally{manager.dispose();informationResponse=undefined;}
});
