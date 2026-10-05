const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const callbacks=new Map(),logs=[],errors=[],newCalls=[],probes=[];let openResult,folderResult,folderWait,probeWait,newWait,configurationChanged;
const disposable={dispose(){}};
const vscode={TreeItem:class{},env:{remoteName:undefined},workspace:{isTrusted:true,workspaceFolders:[{uri:{scheme:'file',fsPath:'C:\\synthetic'}}],getConfiguration(){return {inspect(){return undefined}}},onDidChangeConfiguration(fn){configurationChanged=fn;return disposable},onDidChangeWorkspaceFolders(){return disposable}},commands:{registerCommand(id,fn){callbacks.set(id,fn);return disposable},async executeCommand(){}},window:{createOutputChannel(){return {appendLine(line){logs.push(line)},show(){},dispose(){}}},createTreeView(){return {message:'',onDidChangeVisibility(){return disposable},dispose(){}}},onDidCloseTerminal(){return disposable},async showOpenDialog(){return folderWait?await folderWait:folderResult},showErrorMessage(message){errors.push(message)}},EventEmitter:class{event=()=>{};fire(){}dispose(){}}};
const original=Module._load;Module._load=function(name,...args){return name==='vscode'?vscode:original.call(this,name,...args)};
const runtime=require('../dist/runtime'),terminals=require('../dist/resumeTerminal');
runtime.resolveRuntime=async()=>({executable:'C:\\synthetic\\codex.exe',home:'C:\\synthetic'});
runtime.isDirectory=async value=>value==='D:\\synthetic-chosen-folder';
require('../dist/newSession').resolveNewRuntime=async(kind,executable,root)=>{probes.push({kind,executable,root});if(probeWait)await probeWait;return {executable:`C:\\synthetic\\${kind}.exe`,home:'C:\\synthetic-config',env:{SYNTHETIC:'1'}}};
terminals.ResumeTerminals=class {async open(){return openResult}async openNew(kind,selected,cwd,beforeLaunch){if(newWait)await newWait;beforeLaunch();newCalls.push({kind,selected,cwd});return {terminal:{},created:true}}dispose(){}};
const {activate}=require('../dist/extension');Module._load=original;
test('picker cancellation emits no execution log; reuse and fresh launch are distinguished',async()=>{
  const context={subscriptions:[]};activate(context);
  try {
    await callbacks.get('multiCli.picker')();assert.equal(logs.length,0);
    openResult={terminal:{},created:false};await callbacks.get('multiCli.picker')();assert.match(logs.at(-1),/기존/);assert.match(logs.at(-1),/새 실행은 요청하지/);
    openResult={terminal:{},created:true};await callbacks.get('multiCli.picker')();assert.match(logs.at(-1),/CLI picker 실행 요청/);
  }finally{for(const item of context.subscriptions)item.dispose();}
});
test('all three new-session commands launch in a chosen folder outside the workspace without loading saved sessions',async()=>{
  const context={subscriptions:[]};activate(context);const before=newCalls.length,probeCount=probes.length;
  folderResult=[{scheme:'file',fsPath:'D:\\synthetic-chosen-folder'}];
  try{
    for(const [id,kind] of [['multiCli.new','codex'],['multiCli.agy.new','agy'],['multiCli.claude.new','claude']]){
      await callbacks.get(id)();assert.equal(newCalls.at(-1).kind,kind);assert.equal(newCalls.at(-1).cwd,folderResult[0].fsPath);assert.equal(probes.at(-1).kind,kind);
      assert.equal(newCalls.at(-1).selected.executable,`C:\\synthetic\\${kind}.exe`);assert.match(logs.at(-1),/실행을 요청/);assert.match(logs.at(-1),/첫 입력 후/);
    }
    assert.equal(newCalls.length,before+3);assert.equal(probes.length,probeCount+3);
  }finally{folderResult=undefined;for(const item of context.subscriptions)item.dispose();}
});
test('canceling folder selection performs no runtime probe or launch, and non-file folders are rejected before probing',async()=>{
  const context={subscriptions:[]};activate(context);const launches=newCalls.length,probeCount=probes.length,logCount=logs.length;
  try{
    folderResult=undefined;await callbacks.get('multiCli.new')();assert.equal(logs.length,logCount);
    folderResult=[{scheme:'vscode-remote',fsPath:'D:\\synthetic-chosen-folder'}];await callbacks.get('multiCli.claude.new')();assert.match(errors.at(-1),/로컬 폴더/);
    assert.equal(probes.length,probeCount);assert.equal(newCalls.length,launches);
  }finally{folderResult=undefined;for(const item of context.subscriptions)item.dispose();}
});
test('settings changes during folder selection, runtime probing or terminal queue cancel the captured new-session request',async()=>{
  for(const phase of ['folder','probe','terminal']){
    const context={subscriptions:[]};activate(context);const launches=newCalls.length,probeCount=probes.length;let release;
    const wait=new Promise(resolve=>release=resolve);folderResult=[{scheme:'file',fsPath:'D:\\synthetic-chosen-folder'}];
    if(phase==='folder')folderWait=wait;else if(phase==='probe')probeWait=wait;else newWait=wait;
    try{
      const opening=callbacks.get('multiCli.new')();await new Promise(resolve=>setImmediate(resolve));
      configurationChanged({affectsConfiguration:value=>value==='multiCli'});release(folderResult);await opening;
      assert.equal(newCalls.length,launches);assert.equal(probes.length,probeCount+(phase==='folder'?0:1));assert.match(errors.at(-1),/설정이 변경/);
    }finally{release?.();folderWait=undefined;probeWait=undefined;newWait=undefined;folderResult=undefined;for(const item of context.subscriptions)item.dispose();}
  }
});
