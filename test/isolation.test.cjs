const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const disposable={dispose(){}};const callbacks=new Map();
const vscode={TreeItem:class{},env:{remoteName:undefined},workspace:{isTrusted:true,workspaceFolders:[],getConfiguration(){return{inspect(){}}},onDidChangeConfiguration(){return disposable},onDidChangeWorkspaceFolders(){return disposable}},commands:{registerCommand(id,fn){callbacks.set(id,fn);return disposable},async executeCommand(){}},window:{createOutputChannel(){return{appendLine(){},dispose(){}}},createTreeView(){return{onDidChangeVisibility(){return disposable},dispose(){}}},onDidCloseTerminal(){return disposable}},EventEmitter:class{event=()=>{};fire(){}dispose(){}}};
const original=Module._load;Module._load=function(name,...args){return name==='vscode'?vscode:original.call(this,name,...args)};
const external=require('../dist/externalCatalog');
external.readExternalCatalog=async kind=>{if(kind==='agy')throw new Error('synthetic private provider failure');return{sessions:[],notice:'Synthetic empty saved records'}};
const {activate}=require('../dist/extension');Module._load=original;
test('one provider failure or cancellation leaves the other AI lists intact',async()=>{
 const context={subscriptions:[]};const api=activate(context);
 try{
  const existing={id:'synthetic',cwd:'C:\\synthetic'};api.providers.codex.pages.sessions=[existing];api.providers.codex.loaded=true;
  await api.refresh('agy');assert.ok(api.providers.agy.error);assert.ok(!api.providers.agy.error.includes('private provider failure'));assert.deepEqual(api.providers.codex.pages.sessions,[existing]);
  await api.refresh('claude');assert.equal(api.providers.claude.loaded,true);assert.equal(api.providers.claude.error,'');
  await callbacks.get('multiCli.agy.cancel')();assert.equal(api.providers.claude.loaded,true);assert.deepEqual(api.providers.codex.pages.sessions,[existing]);
 }finally{for(const d of context.subscriptions)d.dispose();}
});
