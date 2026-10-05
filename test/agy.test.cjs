const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const childProcess=require('node:child_process');
const {promisify}=require('node:util');
const {DatabaseSync}=require('node:sqlite');

let syntheticHome='C:\\synthetic\\agy-test-home';
let help='Usage: agy --conversation <id>';
let version='1.2.14';
let helpOnStderr=false;
const probes=[];
function mockExecFile(){throw new Error('Tests must not execute a native CLI.');}
mockExecFile[promisify.custom]=async(executable,args,options)=>{
 probes.push({executable,args:[...args],options});
 assert.deepEqual(args.length,1);
 assert.ok(['--version','--help'].includes(args[0]),'Only read-only CLI probes are permitted.');
 return {stdout:args[0]==='--version'?version:helpOnStderr?'':help,stderr:args[0]==='--help'&&helpOnStderr?help:''};
};
const originalLoad=Module._load;
let agy;
try {
 Module._load=function(name,...args){
  if(name==='node:os')return {...os,homedir:()=>syntheticHome};
  if(name==='node:child_process')return {...childProcess,execFile:mockExecFile};
  return originalLoad.call(this,name,...args);
 };
 agy=require('../dist/agyRuntime');
}finally{Module._load=originalLoad;}
const {summarySession,readAgyCatalog}=require('../dist/agyCatalog');
const {storeKey}=require('../dist/model');
const id='00000000-0000-4000-8000-000000000041';
const baseSession={provider:'agy',agyOrigin:'cli',id,title:'Synthetic history',cwd:'C:\\synthetic\\project',source:'CLI 요약',compatibility:'unknown'};

async function fixture(run){
 const local=path.resolve('.local');await fs.mkdir(local,{recursive:true});
 const home=await fs.mkdtemp(path.join(local,'agy-runtime-synthetic-'));
 const previousHome=syntheticHome;
 const previousDataDir=process.env.ANTIGRAVITY_APP_DATA_DIR;
 const previousLocal=process.env.LOCALAPPDATA;
 syntheticHome=home;delete process.env.ANTIGRAVITY_APP_DATA_DIR;process.env.LOCALAPPDATA=path.join(home,'local-app-data');
 help='Usage: agy --conversation <id>';version='1.2.14';helpOnStderr=false;probes.length=0;
 try {
  const root=agy.agyDefaultRoot();const cli=path.join(root,'antigravity-cli');
  await fs.mkdir(path.join(cli,'conversations'),{recursive:true});
  const executable=path.join(home,'bin','agy.exe');await fs.mkdir(path.dirname(executable));await fs.writeFile(executable,'Synthetic executable; never run.');
  await run({home,root,cli,executable,session:{...baseSession,storeId:storeKey(cli)},runtime:{executable,home:root,env:{},version}});
 }finally{
  syntheticHome=previousHome;
  if(previousDataDir===undefined)delete process.env.ANTIGRAVITY_APP_DATA_DIR;else process.env.ANTIGRAVITY_APP_DATA_DIR=previousDataDir;
  if(previousLocal===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=previousLocal;
  assert.ok(path.resolve(home).startsWith(local+path.sep),'Cleanup must stay inside the synthetic workspace directory.');
  await fs.rm(home,{recursive:true,force:true});
 }
}

test('agy direct resume uses only a UUID argument and requires structured CLI origin',()=>{
 assert.deepEqual(agy.agyResumeArgs(id),['--conversation',id]);
 for(const invalid of ['--continue','--conversation','name',id+'\n',id+';exit','../history'])assert.throws(()=>agy.agyResumeArgs(invalid),/UUID/);
 assert.equal(agy.agyResumeReason(baseSession),undefined);
 for(const session of [{...baseSession,agyOrigin:'app'},{...baseSession,agyOrigin:'ide'},{...baseSession,agyOrigin:undefined},{...baseSession,provider:'claude'}])assert.match(agy.agyResumeReason(session),/CLI 저장 대화/);
 assert.match(agy.agyResumeReason({...baseSession,id:'not-a-uuid'}),/UUID/);
});

test('agy catalog preserves structured store origin independently of a display label',async()=>{
 await fixture(async({root,cli})=>{
  const row={conversation_id:id,title:'Synthetic title',workspace_uris:'[]',last_modified_time:'2026-10-02T00:00:00Z'};
  for(const [folder,expected] of [['antigravity-cli','cli'],['antigravity','app'],['antigravity-ide','ide']]){
   const session=summarySession(row,path.join(root,folder),'CLI 요약');
   assert.equal(session.agyOrigin,expected);
   assert.equal(session.storeId,storeKey(path.join(root,folder)));
  }
  await fs.mkdir(path.join(cli,'cache'));
  await fs.writeFile(path.join(cli,'cache','last_conversations.json'),JSON.stringify({'C:\\synthetic\\project':id}));
  const result=await readAgyCatalog(root);
  assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].agyOrigin,'cli');
  assert.equal(result.sessions[0].source,'CLI 최근 캐시');
 });
});

test('agy native executable discovery rejects explicit shims and skips absent PATH candidates',async()=>{
 await fixture(async({home,executable})=>{
  assert.equal(await agy.agyExecutable(executable),executable);
  assert.equal(await agy.agyExecutable('',path.join(home,'missing')+path.delimiter+'"'+path.dirname(executable)+'"'),executable);
  for(const extension of ['cmd','ps1']){
   const shim=path.join(home,'agy.'+extension);await fs.writeFile(shim,'Synthetic shim; never run.');
   await assert.rejects(agy.agyExecutable(shim),/native agy\.exe/);
  }
  const directory=path.join(home,'directory','agy.exe');await fs.mkdir(directory,{recursive:true});
  for(const invalid of [directory,executable+'\n','agy.exe',path.join(home,'absent.exe')])await assert.rejects(agy.agyExecutable(invalid),/native agy\.exe/);
  assert.equal(probes.length,0);
 });
});

test('agy runtime probes only version/help and refuses unsupported roots and missing resume support',async()=>{
 await fixture(async({home,root,executable})=>{
  const runtime=await agy.resolveAgyRuntime(executable);
  assert.equal(runtime.executable,executable);assert.equal(runtime.home,root);assert.equal(runtime.version,'1.2.14');
  assert.deepEqual(probes.map(p=>p.args),[['--version'],['--help']]);
  for(const probe of probes){assert.equal(probe.options.shell,false);assert.equal(probe.options.cwd,root);assert.equal(probe.options.windowsHide,true);assert.equal(probe.options.env.ANTIGRAVITY_APP_DATA_DIR,undefined);}
  probes.length=0;
  const custom=path.join(home,'custom-root');await assert.rejects(agy.resolveAgyRuntime(executable,custom),/목록 조회만/);
  await assert.rejects(fs.stat(custom));assert.equal(probes.length,0);
  process.env.ANTIGRAVITY_APP_DATA_DIR=path.join(root,'antigravity-cli');
  await assert.rejects(agy.resolveAgyRuntime(executable),/목록 조회만/);assert.equal(probes.length,0);
  delete process.env.ANTIGRAVITY_APP_DATA_DIR;
  help='Usage: agy --continue';await assert.rejects(agy.resolveAgyRuntime(executable),/--conversation 지원/);
  help='Usage: agy --conversation <id>';version='';await assert.rejects(agy.resolveAgyRuntime(executable),/버전/);
  version='1.2.14';helpOnStderr=true;
  assert.equal((await agy.resolveAgyRuntime(executable)).version,'1.2.14','Installed agy prints --help to stderr with exit 0.');
 });
});

test('agy resume blocks mismatched stores and stale summaries before opening a terminal',async()=>{
 await fixture(async({home,cli,session,runtime})=>{
  await assert.rejects(agy.validateAgySession(runtime,session),/원본 대화 파일/);
  const file=path.join(cli,'conversations',id+'.db');await fs.writeFile(file,'');
  await assert.rejects(agy.validateAgySession(runtime,session),/원본 대화 파일/);
  await fs.rm(file);await fs.mkdir(file);
  await assert.rejects(agy.validateAgySession(runtime,session),/원본 대화 파일/);
  await fs.rmdir(file);
  const db=new DatabaseSync(file);db.exec('CREATE TABLE synthetic(value INTEGER)');db.close();
  const before=await fs.readFile(file);await agy.validateAgySession(runtime,session);assert.deepEqual(await fs.readFile(file),before);
  await assert.rejects(agy.validateAgySession(runtime,{...session,storeId:storeKey(path.join(home,'other-store'))}),/저장소가 일치/);
  await assert.rejects(agy.validateAgySession({...runtime,home:path.join(home,'custom-root')},session),/저장소가 일치/);
  await assert.rejects(agy.validateAgySession({...runtime,env:{ANTIGRAVITY_APP_DATA_DIR:cli}},session),/저장소가 일치/);
  await assert.rejects(agy.validateAgySession(runtime,{...session,agyOrigin:'app'}),/CLI 저장 대화/);
  assert.equal(probes.length,0,'Resume validation must not invoke a CLI or send a prompt.');
 });
});
