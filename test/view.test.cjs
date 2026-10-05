const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='vscode')return {Uri:{file:fsPath=>({fsPath})},TreeItem:class{constructor(label,state){this.label=label;this.collapsibleState=state}},TreeItemCollapsibleState:{None:0,Collapsed:1},ThemeIcon:class{},EventEmitter:class{event=()=>{};fire(){}dispose(){}}};return original.call(this,name,...args)};
const {SessionsView}=require('../dist/sessionsView');Module._load=original;
test('TreeView distinguishes initial, loading, empty, failure and more; selection is details only',()=>{
  const view=new SessionsView();assert.equal(view.getChildren()[0].command.command,'multiCli.refresh');
  view.loading=true;assert.match(view.getChildren()[0].label,/불러오는/);
  view.loading=false;view.loaded=true;assert.match(view.getChildren()[0].label,/없습니다/);
  view.error='synthetic failure';assert.equal(view.getChildren()[0].label,'synthetic failure');
  view.error='';view.pages.accept({data:[{id:'synthetic',cwd:'C:\\synthetic',updatedAt:1,source:'vscode',status:{type:'notLoaded'}}],nextCursor:'opaque'});
  const rows=view.getChildren();assert.equal(rows[0].contextValue,'workspace');assert.equal(rows[0].label,'C:\\synthetic');assert.equal(rows[1].command.command,'multiCli.more');
  const child=view.getChildren(rows[0])[0];assert.equal(child.command.command,'multiCli.details');assert.match(child.tooltip,/미검증/);assert.equal(child.description,'vscode');view.dispose();
});
test('two-depth groups combine Windows path variants, keep unknown paths visible, and separate provider commands',()=>{
  const view=new SessionsView('agy');assert.equal(view.getChildren()[0].command.command,'multiCli.agy.refresh');view.loaded=true;
  const make=(id,paths)=>({provider:'agy',storeId:'synthetic',id,title:'Synthetic title',cwd:paths[0]||'',workspacePaths:paths,source:'CLI 요약',updatedAt:1,serverStatus:'unknown',compatibility:'unknown'});
  view.pages.sessions=[make('a',['C:\\synthetic\\project\\']),make('b',['file:///c:/SYNTHETIC/project']),make('c',[]),make('d',['C:\\synthetic\\project','C:\\synthetic\\other'])];
  const groups=view.getChildren();assert.equal(groups.length,3);assert.equal(groups[0].description,'3개');assert.equal(view.getChildren(groups[0]).length,3);
  assert.match(groups[1].label,/확인 안 됨/);assert.equal(view.getChildren(groups[1])[0].contextValue,'externalSession');
  const all=groups.flatMap(g=>view.getChildren(g));assert.equal(new Set(all.map(i=>i.id)).size,all.length);
  assert.ok(all.every(i=>i.description==='CLI 요약'));assert.equal(view.getChildren(all[0]).length,0);view.dispose();
});
