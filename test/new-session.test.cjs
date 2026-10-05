const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {promisify}=require('node:util');

test('new-session argument contracts contain only Codex cwd and reject malformed folders for every provider',()=>{
  const {newSessionArgs}=require('../dist/newSession');
  const cwd="D:\\synthetic 한글 폴더\\x & $() ` ; '";
  assert.deepEqual(newSessionArgs('codex',cwd),['-C',cwd]);
  assert.deepEqual(newSessionArgs('agy',cwd),[]);assert.deepEqual(newSessionArgs('claude',cwd),[]);
  for(const kind of ['codex','agy','claude'])for(const invalid of ['', 'relative', 'D:\\synthetic\nexit', 'D:\\synthetic\0'])assert.throws(()=>newSessionArgs(kind,invalid));
});

test('new runtime resolution permits only native startup probes and passes explicit provider configuration through',async()=>{
  const runtime=require('../dist/runtime'),agy=require('../dist/agyRuntime'),catalog=require('../dist/externalCatalog');
  const saved={codex:runtime.resolveRuntime,agy:agy.resolveAgyRuntime,directory:runtime.isDirectory,claude:catalog.claudeExecutable};
  const calls=[];const home='C:\\synthetic-config';const executable='C:\\synthetic\\claude.exe';
  const probe=()=>{throw new Error('callback probe must not be used')};
  let response={stdout:'2.1.286 (Claude Code)\n',stderr:''};
  probe[promisify.custom]=async(file,args,options)=>{calls.push({file,args,options});return response};
  runtime.resolveRuntime=async(...args)=>{calls.push({kind:'codex',args});return {executable:'C:\\synthetic\\codex.exe'}};
  agy.resolveAgyRuntime=async(...args)=>{calls.push({kind:'agy',args});return {executable:'C:\\synthetic\\agy.exe'}};
  runtime.isDirectory=async value=>value===home;
  catalog.claudeExecutable=async value=>{assert.equal(value,executable);return executable};
  const original=Module._load;const modulePath=require.resolve('../dist/newSession');delete require.cache[modulePath];
  Module._load=function(name,...args){return name==='node:child_process'?{execFile:probe}:original.call(this,name,...args)};
  let api;try{api=require(modulePath)}finally{Module._load=original}
  try{
    await api.resolveNewRuntime('codex','C:\\synthetic\\codex.exe',home);await api.resolveNewRuntime('agy','C:\\synthetic\\agy.exe',home);
    assert.deepEqual(calls.slice(0,2),[{kind:'codex',args:['C:\\synthetic\\codex.exe',home,true]},{kind:'agy',args:['C:\\synthetic\\agy.exe',home,true]}]);
    const result=await api.resolveNewRuntime('claude',executable,home);assert.equal(result.home,home);assert.equal(result.env.CLAUDE_CONFIG_DIR,home);
    const checked=calls.at(-1);assert.equal(checked.file,executable);assert.deepEqual(checked.args,['--version']);assert.equal(checked.options.shell,false);assert.equal(checked.options.windowsHide,true);assert.equal(checked.options.cwd,home);assert.equal(checked.options.env.CLAUDE_CONFIG_DIR,home);
    const count=calls.length;await assert.rejects(()=>api.resolveNewRuntime('claude',executable,'C:\\missing-synthetic-config'),/자동 생성하지/);assert.equal(calls.length,count);
    response={stdout:'unknown version',stderr:''};await assert.rejects(()=>api.resolveNewRuntime('claude',executable,home),/버전 응답/);
  }finally{runtime.resolveRuntime=saved.codex;agy.resolveAgyRuntime=saved.agy;runtime.isDirectory=saved.directory;catalog.claudeExecutable=saved.claude;delete require.cache[modulePath];}
});
