const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const {filterSessions, pathInScope, pathKey, visibleWorkspacePaths} = require('../dist/model');

const disposable = {dispose(){}};
const callbacks = new Map();
let picks = [];
let workspaceChanged;
const vscode = {
  Uri: {file:fsPath=>({fsPath})},
  TreeItem: class {constructor(label, state){this.label=label;this.collapsibleState=state;}},
  TreeItemCollapsibleState: {None:0, Collapsed:1},
  ThemeIcon: class {},
  EventEmitter: class {event=()=>disposable;fire(){}dispose(){}},
  env: {remoteName:undefined},
  workspace: {
    isTrusted:true,
    workspaceFolders:[{uri:{scheme:'file',fsPath:'C:\\synthetic\\project'}}],
    getConfiguration(){return {inspect(){return undefined;},get(){return undefined;}};},
    onDidChangeConfiguration(){return disposable;},
    onDidChangeWorkspaceFolders(fn){workspaceChanged=fn;return disposable;}
  },
  commands: {
    registerCommand(id, fn){callbacks.set(id,fn);return disposable;},
    async executeCommand(){}
  },
  window: {
    createOutputChannel(){return {appendLine(){},show(){},dispose(){}};},
    createTreeView(){return {visible:false,onDidChangeVisibility(fn){this.visibilityChanged=fn;return disposable;},dispose(){}};},
    onDidCloseTerminal(){return disposable;},
    async showQuickPick(value){picks=value;return undefined;},
    async showErrorMessage(){}
  }
};
const originalLoad = Module._load;
Module._load = function(name,...args){return name==='vscode'?vscode:originalLoad.call(this,name,...args);};
const {SessionsView} = require('../dist/sessionsView');
const codex = require('../dist/codex');
const runtime = require('../dist/runtime');
const {activate} = require('../dist/extension');
Module._load = originalLoad;

const session = (id, paths) => ({provider:'claude',storeId:'synthetic',id,title:'Synthetic '+id,cwd:paths[0]||'',workspacePaths:paths,updatedAt:1,source:'synthetic',serverStatus:'unknown',compatibility:'unknown'});

test('workspace descendants use Windows path boundaries across case, separators, URI and multiple roots',()=>{
  const roots=['C:\\synthetic\\project\\','D:\\another\\root'];
  for(const candidate of ['c:\\SYNTHETIC\\project','C:/synthetic/project/child/grandchild','file:///C:/synthetic/project/sub%20folder','D:\\another\\root\\child'])
    assert.equal(pathInScope(candidate,roots,'workspaceTree'),true,candidate);
  for(const candidate of ['C:\\synthetic\\project-other','C:\\synthetic','D:\\another\\root2','E:\\synthetic\\project','/home/synthetic','C:\\synthetic\nexit',''])
    assert.equal(pathInScope(candidate,roots,'workspaceTree'),false,candidate);
  assert.equal(pathInScope('C:\\synthetic\\project\\child',roots,'workspace'),false);
  assert.equal(pathInScope('C:\\synthetic\\project',roots,'workspace'),true);
  assert.equal(pathInScope('C:\\unrelated',undefined,'workspaceTree'),true);
  assert.equal(pathInScope('C:\\synthetic\\project',[],'workspaceTree'),false);
});

test('drive and UNC roots include descendants while other drives and shares stay separate',()=>{
  assert.equal(pathInScope('D:\\synthetic\\child',['d:\\'],'workspaceTree'),true);
  assert.equal(pathInScope('D:\\',['d:\\'],'workspaceTree'),true);
  assert.equal(pathInScope('C:\\synthetic',['D:\\'],'workspaceTree'),false);
  const root='\\\\synthetic-server\\share\\';
  assert.equal(pathInScope('\\\\SYNTHETIC-SERVER\\share\\child',[root],'workspaceTree'),true);
  assert.equal(pathInScope('\\\\synthetic-server\\share',[root],'workspaceTree'),true);
  assert.equal(pathInScope('\\\\synthetic-server\\share-other\\child',[root],'workspaceTree'),false);
  assert.equal(pathInScope('\\\\other-server\\share\\child',[root],'workspaceTree'),false);
});

test('scoped sessions hide unknown paths and project only matching paths without changing original cwd',()=>{
  const roots=['C:\\synthetic\\project'];
  const multiple=session('multiple',['D:\\unrelated','C:\\synthetic\\project\\child','file:///c:/SYNTHETIC/project/child']);
  const unknown=session('unknown',[]);
  const sibling=session('sibling',['C:\\synthetic\\project-other']);
  const exact=session('exact',['C:\\synthetic\\project']);
  const all=[multiple,unknown,sibling,exact];
  assert.deepEqual(filterSessions(all,roots,'workspaceTree'),[multiple,exact]);
  assert.deepEqual(filterSessions(all,roots,'workspace'),[exact]);
  assert.deepEqual(filterSessions(all,undefined,'all'),all);
  assert.deepEqual(filterSessions(all,[],'workspaceTree'),[]);
  assert.deepEqual(visibleWorkspacePaths(multiple,roots,'workspaceTree').map(pathKey),[pathKey('C:\\synthetic\\project\\child')]);
  assert.deepEqual(visibleWorkspacePaths(unknown,roots,'workspaceTree'),[]);
  assert.equal(multiple.cwd,'D:\\unrelated');
  assert.equal(multiple.workspacePaths.length,3);
});

test('scoped tree and search do not leak unrelated groups from a multi-workspace session',async()=>{
  const view=new SessionsView('claude');
  view.loaded=true;view.scope='workspaceTree';view.folders=['C:\\synthetic\\project'];
  const multiple=session('multiple',['D:\\unrelated','C:\\synthetic\\project\\child']);
  view.pages.sessions=[multiple,session('unknown',[]),session('sibling',['C:\\synthetic\\project-other'])];
  try {
    const groups=view.getChildren();
    assert.equal(groups.length,1);assert.equal(groups[0].label,'C:\\synthetic\\project\\child');
    const child=view.getChildren(groups[0])[0];
    assert.equal(child.session,multiple);assert.equal(child.session.cwd,'D:\\unrelated');
    assert.equal(view.getParent(child).id,groups[0].id);
    await view.search();assert.equal(picks.length,1);assert.equal(picks[0].description,groups[0].label);
    view.scope='all';assert.equal(view.getChildren().filter(row=>row.contextValue==='workspace').length,4);
  } finally {view.dispose();}
});

const row=(id,cwd)=>({id,cwd,updatedAt:1,name:'Synthetic '+id,source:'vscode',status:{type:'notLoaded'}});
async function withExtension(handler, run, folders=[{uri:{scheme:'file',fsPath:'C:\\synthetic\\project'}}]) {
  const originalClient=codex.CodexClient,originalRuntime=runtime.resolveRuntime;
  const oldFolders=vscode.workspace.workspaceFolders;
  const clients=[],requests=[];
  callbacks.clear();vscode.workspace.workspaceFolders=folders;
  runtime.resolveRuntime=async()=>({executable:'C:\\synthetic\\codex.exe',home:'C:\\synthetic\\home',env:{},version:'0.159.2'});
  codex.CodexClient=class {
    constructor(){this.index=clients.length;clients.push(this);}
    async initialize(){}
    request(method,params,signal){requests.push({method,params,signal,client:this});return handler({method,params,signal,client:this,requests});}
    dispose(){this.disposed=true;}
  };
  const context={subscriptions:[],workspaceState:{get(){return undefined;},async update(){}}};
  let api;
  try {api=activate(context);await run(api,requests,clients);}
  finally {
    for(const item of context.subscriptions)item.dispose();
    codex.CodexClient=originalClient;runtime.resolveRuntime=originalRuntime;vscode.workspace.workspaceFolders=oldFolders;
  }
}

test('default subtree listing skips a wholly unrelated first Codex page and keeps global cursor semantics',async()=>{
  await withExtension(async({params})=>params.cursor===null?
    {data:[row('outside','C:\\synthetic\\project-other')],nextCursor:'next-page'}:
    {data:[row('inside','C:\\synthetic\\project\\child')],nextCursor:null},
  async(api,requests)=>{
    await api.refresh();assert.equal(api.provider.error,'');assert.equal(api.provider.loaded,true);
    assert.equal(api.provider.scope,'workspaceTree');assert.deepEqual(api.provider.pages.sessions.map(s=>s.id),['inside']);
    assert.equal(requests.length,2);assert.ok(requests.every(r=>!Object.hasOwn(r.params,'cwd')));
    assert.equal(requests[1].params.cursor,'next-page');assert.equal(api.provider.pages.cursor,null);
  });
});

test('subtree scanning yields after 20 unrelated pages and more continues to an older matching session',async()=>{
  await withExtension(async({params})=>{
    const index=params.cursor===null?0:Number(params.cursor.replace('page-',''));
    return index<20?{data:[row('outside-'+index,'D:\\unrelated')],nextCursor:'page-'+(index+1)}:
      {data:[row('older-match','C:\\synthetic\\project\\child')],nextCursor:null};
  },async(api,requests)=>{
    await api.refresh();assert.equal(api.provider.error,'');assert.equal(requests.length,20);
    assert.equal(api.provider.pages.sessions.length,0);assert.equal(api.provider.pages.cursor,'page-20');
    assert.ok(api.provider.getChildren().some(row=>row.command?.command==='multiCli.more'));
    await callbacks.get('multiCli.more')();assert.equal(requests.length,21);
    assert.deepEqual(api.provider.pages.sessions.map(s=>s.id),['older-match']);assert.equal(api.provider.pages.cursor,null);
  });
});

test('subtree listing stops after 50 new matches and all-local mode uses one server page',async()=>{
  await withExtension(async()=>({data:Array.from({length:50},(_,i)=>row('match-'+i,'C:\\synthetic\\project\\child')),nextCursor:'more'}),async(api,requests)=>{
    await api.refresh();assert.equal(requests.length,1);assert.equal(api.provider.pages.sessions.length,50);
    await api.setScope('codex','all');assert.equal(requests.length,2);assert.equal(api.provider.scope,'all');
  });
});

test('scope changes abort old listing and ignore its late result',async()=>{
  let releaseOld,startedOld;
  const started=new Promise(resolve=>{startedOld=resolve;});
  await withExtension(({client})=>{
    if(client.index===0){startedOld();return new Promise(resolve=>{releaseOld=resolve;});}
    return Promise.resolve({data:[row('current-all','D:\\unrelated')],nextCursor:null});
  },async(api,requests,clients)=>{
    const pending=api.refresh();await started;
    await api.setScope('codex','all');assert.equal(requests[0].signal.aborted,true);assert.equal(clients[0].disposed,true);
    releaseOld({data:[row('stale','C:\\synthetic\\project\\old')],nextCursor:null});await pending;
    assert.equal(api.provider.scope,'all');assert.deepEqual(api.provider.pages.sessions.map(s=>s.id),['current-all']);
    assert.equal(api.provider.error,'');
  });
});

test('no local workspace falls back to all-local instead of an empty subtree',async()=>{
  await withExtension(async()=>({data:[row('all-local','D:\\unrelated')],nextCursor:null}),async(api,requests)=>{
    await api.refresh();assert.equal(api.provider.error,'');assert.equal(api.provider.scope,'all');
    assert.deepEqual(api.provider.pages.sessions.map(s=>s.id),['all-local']);assert.equal(requests.length,1);
  },[{uri:{scheme:'vscode-remote',fsPath:'/synthetic/remote'}}]);
});

const settled=()=>new Promise(resolve=>setImmediate(resolve));
async function loaded(view) {
  const deadline=Date.now()+2000;
  while(view.loading&&Date.now()<deadline)await settled();
  assert.equal(view.loading,false);assert.equal(view.loaded,true);assert.equal(view.error,'');
}

test('workspace changes load only visible scoped views and invalidate hidden views until they become visible',async()=>{
  const external=require('../dist/externalCatalog'),originalExternal=external.readExternalCatalog,calls=[];
  external.readExternalCatalog=async kind=>{calls.push(kind);return {sessions:[],notice:'Synthetic empty list'}};
  try{
    await withExtension(async()=>({data:[row('current',vscode.workspace.workspaceFolders[0].uri.fsPath)],nextCursor:null}),async(api,requests)=>{
      workspaceChanged();await settled();assert.equal(requests.length,0);assert.deepEqual(calls,[]);
      api.trees.codex.visible=true;workspaceChanged();await loaded(api.provider);
      assert.equal(requests.length,1);assert.deepEqual(calls,[]);
      await api.refresh('agy');await api.setScope('claude','all');assert.deepEqual(calls,['agy','claude']);
      api.trees.codex.visible=false;
      vscode.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:'D:\\synthetic\\new-project'}}];
      workspaceChanged();await settled();
      assert.equal(api.provider.loaded,false);assert.deepEqual(api.provider.pages.sessions,[]);
      assert.equal(api.providers.agy.loaded,false);assert.equal(api.providers.claude.loaded,true);
      assert.equal(requests.length,1);assert.deepEqual(calls,['agy','claude']);
      for(const kind of ['codex','agy']){api.trees[kind].visible=true;api.trees[kind].visibilityChanged({visible:true});await loaded(api.providers[kind]);}
      assert.equal(requests.length,2);assert.deepEqual(calls,['agy','claude','agy']);
      assert.equal(api.provider.pages.sessions[0].cwd,'D:\\synthetic\\new-project');
    });
  }finally{external.readExternalCatalog=originalExternal;}
});

test('workspace invalidation aborts a hidden in-flight load and ignores its late response',async()=>{
  let release,started;
  const ready=new Promise(resolve=>started=resolve);
  await withExtension(({client})=>client.index===0?(started(),new Promise(resolve=>release=resolve)):Promise.resolve({data:[row('new','D:\\synthetic\\new-project')],nextCursor:null}),async(api,requests,clients)=>{
    const old=api.refresh();await ready;
    vscode.workspace.workspaceFolders=[{uri:{scheme:'file',fsPath:'D:\\synthetic\\new-project'}}];workspaceChanged();
    assert.equal(requests[0].signal.aborted,true);assert.equal(clients[0].disposed,true);
    release({data:[row('old','C:\\synthetic\\project')],nextCursor:'stale'});await old;
    assert.equal(api.provider.loaded,false);assert.deepEqual(api.provider.pages.sessions,[]);assert.equal(api.provider.pages.cursor,null);
    api.trees.codex.visible=true;api.trees.codex.visibilityChanged({visible:true});await loaded(api.provider);
    assert.deepEqual(api.provider.pages.sessions.map(s=>s.id),['new']);
  });
});

test('malformed records do not block later subtree pages and the omitted count resets on refresh',async()=>{
  let validOnly=false;
  await withExtension(async({params})=>validOnly?{data:[row('fresh','C:\\synthetic\\project')],nextCursor:null}:params.cursor===null?
    {data:[null,{id:42}],nextCursor:'next'}:
    {data:[row('inside','C:\\synthetic\\project\\child'),{id:'bad',cwd:'C:\\synthetic',updatedAt:Infinity}],nextCursor:null},async(api,requests)=>{
      await api.refresh();assert.equal(api.provider.error,'');assert.equal(api.provider.loaded,true);
      assert.deepEqual(api.provider.pages.sessions.map(s=>s.id),['inside']);assert.equal(requests.length,2);
      assert.match(api.trees.codex.message,/형식 불일치 3건 제외/);assert.match(api.trees.codex.message,/메타데이터 4개/);
      validOnly=true;await api.refresh();assert.doesNotMatch(api.trees.codex.message,/형식 불일치/);
    });
});
