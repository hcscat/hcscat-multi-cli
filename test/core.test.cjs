const {test} = require('node:test');
const assert = require('node:assert/strict');
const {PassThrough} = require('node:stream');
const {EventEmitter} = require('node:events');
const {CodexClient, SessionPages, normalizePage, listParams} = require('../dist/codex');
const {guard, nativeExecutable, findNativeExecutable, resolveRuntime, safeMessage, cliEnvironment} = require('../dist/runtime');
const fs = require('node:fs/promises');
const path = require('node:path');
const runtime = {executable:'C:\\synthetic\\codex.exe', home:'C:\\synthetic', env:{CODEX_HOME:'C:\\synthetic'}};
function fake(timeout=500, max=8192) {
  const child = Object.assign(new EventEmitter(), {stdin:new PassThrough(), stdout:new PassThrough(), stderr:new PassThrough(), killed:false, kill(){this.killed=true;return true;}});
  const sent=[]; child.stdin.on('data', c=>sent.push(JSON.parse(c.toString())));
  const client = new CodexClient(runtime,timeout,max,(exe,args,options)=>{assert.equal(exe,runtime.executable);assert.equal(options.shell,false);return child;});
  return {client, child, sent};
}
test('handshake orders initialized after response; split UTF-8 JSONL and notifications',async()=>{
  const {client,child,sent}=fake();
  try {
    const init=client.initialize();assert.equal(sent.length,1);
    const line=Buffer.from('{"method":"notice","params":{}}\n{"id":1,"result":{"label":"한글"}}\n');
    for(const byte of line) child.stdout.write(Buffer.from([byte]));
    await init;assert.equal(sent[1].method,'initialized');
    const a=client.request('a',{}),b=client.request('b',{});
    child.stdout.write('{"id":3,"result":2}\n{"id":2,"result":1}\n');
    assert.deepEqual(await Promise.all([a,b]),[1,2]);
  } finally {client.dispose();assert.equal(child.killed,true);}
});
test('timeout kills owned process and rejects all pending requests',async()=>{
  const {client,child}=fake(20);
  await assert.rejects(client.request('thread/list',{}),/초과/);assert.equal(child.killed,true);
});
test('abort and process exit reject pending requests',async()=>{
  for(const type of ['abort','exit']) {
    const {client,child}=fake();const controller=new AbortController();
    const result=client.request('thread/list',{},controller.signal);
    if(type==='abort')controller.abort();else child.emit('exit',1);
    await assert.rejects(result);assert.equal(child.killed,true);
  }
});
test('malformed and oversized JSONL fail without echoing sensitive data',async()=>{
  for(const content of ['PRIVATE invalid\n','x'.repeat(100)]) {
    const {client,child}=fake(500,50);const result=client.request('test',{});child.stdout.write(content);
    await assert.rejects(result,e=>!e.message.includes('PRIVATE'));assert.equal(child.killed,true);
  }
});
test('RPC errors redact raw provider message; server requests rejected',async()=>{
  const {client,child,sent}=fake();
  const result=client.request('thread/list',{});
  child.stdout.write('{"id":99,"method":"approval/request","params":{}}\n{"id":1,"error":{"code":-32602,"message":"PRIVATE"}}\n');
  await assert.rejects(result,e=>e.message.includes('-32602')&&!e.message.includes('PRIVATE'));
  assert.equal(sent[1].error.code,-32601);client.dispose();
});
const session=(id='synthetic')=>({id,cwd:'C:\\synthetic\\한글 폴더',updatedAt:1,name:null,preview:'hello\nworld',source:'vscode',status:{type:'notLoaded'}});
test('normalization preserves valid rows and reports invalid records without accepting a malformed page',()=>{
  const row=normalizePage({data:[session()],nextCursor:null}).data[0];
  assert.equal(row.id,'synthetic');assert.equal(row.title,'hello world');assert.equal(row.compatibility,'unknown');
  assert.deepEqual(normalizePage({data:[],nextCursor:null}).data,[]);
  const page=normalizePage({data:[session('first'),{id:2},null,session('last')],nextCursor:'next'});
  assert.deepEqual(page.data.map(s=>s.id),['first','last']);assert.equal(page.skipped,2);assert.equal(page.received,4);assert.equal(page.nextCursor,'next');
  assert.throws(()=>normalizePage({data:{},nextCursor:null}));
  assert.throws(()=>normalizePage({data:[],nextCursor:7}));
  assert.throws(()=>normalizePage(null));
});

test('date validation uses seconds and retains the exact JavaScript Date boundary',()=>{
  const page=normalizePage({data:[{...session('valid'),updatedAt:8640000000000},{...session('invalid'),updatedAt:8640000000001}],nextCursor:null});
  assert.deepEqual(page.data.map(s=>s.id),['valid']);assert.equal(page.skipped,1);
  assert.equal(Number.isNaN(new Date(page.data[0].updatedAt*1000).getTime()),false);
});

test('invalid and duplicate records count toward the scan limit, and cursor failures preserve prior state',()=>{
  const pages=new SessionPages();pages.accept({data:[session('a'),null],nextCursor:'one'});
  assert.throws(()=>pages.accept({data:[null],nextCursor:'one'}));
  assert.equal(pages.scanned,2);assert.equal(pages.skipped,1);assert.equal(pages.cursor,'one');
  pages.accept({data:[...Array(9997).fill(null),session('a')],nextCursor:'two'});
  assert.equal(pages.scanned,10000);assert.equal(pages.sessions.length,1);
  assert.throws(()=>pages.accept({data:[session('b')],nextCursor:'three'}),/10,000/);
  assert.equal(pages.cursor,null);assert.equal(pages.sessions.length,1);assert.equal(pages.scanned,10000);
});
test('pagination deduplicates IDs and rejects cyclic cursor atomically',()=>{
  const pages=new SessionPages();pages.accept({data:[session('a')],nextCursor:'one'});pages.accept({data:[session('a'),session('b')],nextCursor:'two'});
  assert.equal(pages.sessions.length,2);assert.throws(()=>pages.accept({data:[session('c')],nextCursor:'one'}));assert.equal(pages.sessions.length,2);
  pages.accept({data:[],nextCursor:null});assert.equal(pages.cursor,null);
  assert.deepEqual(listParams(null).sourceKinds,['cli','vscode','appServer']);assert.equal(listParams(null).useStateDbOnly,true);
});
test('platform, remote and trust guards',()=>{
  guard('win32',undefined,true);
  for(const args of [['linux',undefined,true],['win32','ssh-remote',true],['win32','wsl',true],['win32','dev-container',true],['win32',undefined,false]]) assert.throws(()=>guard(...args));
  assert.ok(!safeMessage(new Error('PRIVATE')).includes('PRIVATE'));
});

test('CLI environments remove host internals case-insensitively and preserve user configuration without mutation',()=>{
  const source={ELECTRON_RUN_AS_NODE:'1',electron_no_attach_console:'1',VSCODE_NLS_CONFIG:'synthetic',vscode_ipc_hook:'synthetic',VSCODE_NODE_OPTIONS:'synthetic',
    VSCODE_IPC_HOOK_CLI:'synthetic-cli-hook',VSCODE_PORTABLE:'C:\\synthetic\\portable',VSCODE_ENV_APPEND:'{}',VSCODE_SHELL_LOGIN:'1',
    NODE_OPTIONS:'--max-old-space-size=512',PATH:'C:\\synthetic\\bin',USERPROFILE:'C:\\Users\\synthetic',CODEX_HOME:'C:\\synthetic\\codex',CLAUDE_CONFIG_DIR:'C:\\synthetic\\claude',CUSTOM_PROVIDER_SETTING:'synthetic',MISSING:undefined};
  const cleaned=cliEnvironment(source);
  for(const name of ['ELECTRON_RUN_AS_NODE','electron_no_attach_console','VSCODE_NLS_CONFIG','vscode_ipc_hook','VSCODE_NODE_OPTIONS','MISSING'])assert.equal(Object.hasOwn(cleaned,name),false);
  for(const name of ['VSCODE_IPC_HOOK_CLI','VSCODE_PORTABLE','VSCODE_ENV_APPEND','VSCODE_SHELL_LOGIN','NODE_OPTIONS','PATH','USERPROFILE','CODEX_HOME','CLAUDE_CONFIG_DIR','CUSTOM_PROVIDER_SETTING'])assert.equal(cleaned[name],source[name]);
  assert.equal(source.ELECTRON_RUN_AS_NODE,'1');assert.deepEqual(cliEnvironment(cleaned),cleaned);
  let seen;
  const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill(){return true}});
  const client=new CodexClient({...runtime,env:source},500,8192,(_exe,_args,options)=>{seen=options.env;return child;});
  try{assert.deepEqual(seen,cleaned);}finally{client.dispose();}
});
test('native resolution accepts exe, resolves npm cmd/ps1, rejects custom wrappers',async()=>{
  await fs.mkdir(path.join(process.cwd(),'.local'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(process.cwd(),'.local','resolver-'));
  try {
    const root=path.join(dir,'node_modules','@openai','codex');const triple=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
    const exe=path.join(root,'vendor',triple,'bin','codex.exe');await fs.mkdir(path.dirname(exe),{recursive:true});await fs.writeFile(exe,'synthetic');await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'@openai/codex'}));
    assert.equal(await nativeExecutable(exe),exe);
    for(const ext of ['cmd','ps1']) {const shim=path.join(dir,'codex.'+ext);await fs.writeFile(shim,'node_modules/@openai/codex/bin/codex.js');assert.equal(await nativeExecutable(shim),exe);}
    const custom=path.join(dir,'custom.cmd');await fs.writeFile(custom,'echo unsafe');await assert.rejects(nativeExecutable(custom),/shim/);
    await assert.rejects(nativeExecutable('relative.cmd'),/절대/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('automatic PATH discovery skips unsupported candidates; explicit settings never fall back',async()=>{
  await fs.mkdir(path.join(process.cwd(),'.local'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(process.cwd(),'.local','path-discovery-'));
  try {
    const bad=path.join(dir,'bad'),good=path.join(dir,'good');await fs.mkdir(bad);await fs.mkdir(good);
    await fs.mkdir(path.join(bad,'codex.exe')); // Existing directory is not an executable file.
    const shim=path.join(bad,'codex.cmd');await fs.writeFile(shim,'echo synthetic unsupported shim');
    const exe=path.join(good,'codex.exe');await fs.writeFile(exe,'synthetic native placeholder; never executed');
    assert.equal(await findNativeExecutable([bad,good].join(path.delimiter)),exe);
    await assert.rejects(resolveRuntime(shim),/shim/);
    await assert.rejects(findNativeExecutable(bad),/지원 가능한/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
