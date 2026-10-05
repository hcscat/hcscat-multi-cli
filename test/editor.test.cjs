const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');

function leaves(layout){return layout.groups?.reduce((sum,group)=>sum+(group.groups?leaves(group):1),0)||0;}
function mockHost(){
  const closed=new Set();const tabsChanged=new Set();const groupsChanged=new Set();
  const created=[];const moved=[];const layouts=[];const notices=[];const controls={onLayout:undefined};let activeCommands=0,maxCommands=0;
  class TabInputTerminal {}
  class TabInputText {constructor(uri){this.uri=uri;}}
  let groups=[{viewColumn:1,tabs:[],activeTab:undefined,isActive:true}];
  const docTab={label:'synthetic-document.txt',input:new TabInputText('synthetic-document'),isActive:true};
  groups[0].tabs.push(docTab);groups[0].activeTab=docTab;docTab.group=groups[0];
  const subscribe=set=>fn=>{set.add(fn);return {dispose(){set.delete(fn);}}};
  const window={terminals:[],activeTerminal:undefined,
    onDidCloseTerminal:subscribe(closed),
    async showInformationMessage(message){notices.push(message);},
    async showWarningMessage(message){notices.push(message);},
    async showErrorMessage(message){notices.push(message);},
    tabGroups:{get all(){return groups;},activeTabGroup:groups[0],onDidChangeTabs:subscribe(tabsChanged),onDidChangeTabGroups:subscribe(groupsChanged)},
    createTerminal(options){
      const t={name:options.name,creationOptions:options,options,showCount:0,disposeCount:0,exitStatus:undefined,processId:Promise.resolve(1000+created.length),
        show(){
          this.showCount++;window.activeTerminal=this;
          let tab=groups.flatMap(g=>g.tabs).find(tab=>tab.terminal===this);
          if(!tab){const column=typeof options.location==='object'?options.location.viewColumn:1;const group=groups[Math.max(0,column-1)]||groups[0];tab={label:this.name,input:new TabInputTerminal(),terminal:this,group,isActive:true};group.tabs.push(tab);}
          for(const group of groups){group.isActive=group===tab.group;for(const current of group.tabs)current.isActive=current===tab;}
          tab.group.activeTab=tab;window.tabGroups.activeTabGroup=tab.group;
        },
        dispose(){
          if(this.disposeCount++)return;
          this.exitStatus={code:0};window.terminals=window.terminals.filter(item=>item!==this);
          if(!controls.deferTabRemoval)for(const group of groups){group.tabs=group.tabs.filter(tab=>tab.terminal!==this);if(group.activeTab?.terminal===this)group.activeTab=group.tabs.at(-1);}
          for(const callback of closed)callback(this);
        }
      };
      created.push(t);window.terminals.push(t);return t;
    }
  };
  const commands={async executeCommand(command,...args){
    activeCommands++;maxCommands=Math.max(maxCommands,activeCommands);
    try{
      await new Promise(resolve=>setImmediate(resolve));
      if(command==='vscode.setEditorLayout'){
        if(controls.onLayout)await controls.onLayout();
        const layout=args[0];layouts.push(layout);const count=leaves(layout);
        const previous=groups;groups=Array.from({length:count},(_,i)=>previous[i]||{viewColumn:i+1,tabs:[],activeTab:undefined,isActive:false});
        for(let i=0;i<groups.length;i++)groups[i].viewColumn=i+1;
        for(const removed of previous.slice(count)){for(const tab of removed.tabs){tab.group=groups[0];groups[0].tabs.push(tab);}}
        if(!groups.includes(window.tabGroups.activeTabGroup))window.tabGroups.activeTabGroup=groups[0];
      }else if(command==='moveActiveEditor'||command==='workbench.action.moveActiveEditor'){
        const target=args[0];assert.deepEqual({to:target.to,by:target.by},{to:'position',by:'group'});
        const tab=window.tabGroups.activeTabGroup.activeTab;assert.ok(tab);
        const column=target.value;const group=groups[column-1];assert.ok(group,'destination editor group exists');
        moved.push({terminal:tab.terminal,tab,column});
        tab.group.tabs=tab.group.tabs.filter(item=>item!==tab);if(tab.group.activeTab===tab)tab.group.activeTab=tab.group.tabs.at(-1);
        group.tabs.push(tab);tab.group=group;group.activeTab=tab;window.tabGroups.activeTabGroup=group;
      }else throw new Error('Unexpected mock command: '+command);
    }finally{activeCommands--;}
  }};
  const vscode={window,commands,TabInputTerminal,TabInputText,TerminalLocation:{Editor:2,Panel:1},ViewColumn:{Active:-1,Beside:-2,One:1},env:{remoteName:undefined},workspace:{isTrusted:true}};
  const original=Module._load;
  Module._load=function(name,...args){return name==='vscode'?vscode:original.call(this,name,...args);};
  let api;try{delete require.cache[require.resolve('../dist/editorTerminals')];api=require('../dist/editorTerminals');}finally{Module._load=original;}
  return {api,vscode,created,moved,layouts,notices,docTab,closed,controls,get maxCommands(){return maxCommands;}};
}
async function eventually(check,message){const deadline=Date.now()+2000;while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(check(),message);}
function terminalGroup(host,terminal){return host.vscode.window.tabGroups.all.find(group=>group.tabs.some(tab=>tab.terminal===terminal));}

test('editor layouts use columns through three sessions, then exact two-row and three-row grids',()=>{
  const host=mockHost();const {editorLayout}=host.api;
  for(let count=1;count<=9;count++){
    const layout=editorLayout(count);assert.equal(layout.orientation,0);assert.equal(leaves(layout),count);
    const expected=count<=3?Array(count).fill(1):count===4?[2,2]:count===5?[2,2,1]:count===6?[2,2,2]:count===7?[3,3,1]:count===8?[3,3,2]:[3,3,3];
    assert.deepEqual(layout.groups.map(group=>group.groups?leaves(group):1),expected);
  }
  const {SafeError}=require('../dist/runtime');
  for(const count of [0,-1,10,1.5,NaN,Infinity])assert.throws(()=>editorLayout(count),SafeError);
});

test('editor terminal creation preserves executable arguments and document tabs',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  const options={name:'Synthetic Codex',shellPath:'C:\\synthetic\\powershell.exe',shellArgs:['-NoExit','-EncodedCommand','synthetic'],cwd:'C:\\synthetic',env:{TERM:'xterm-256color'},strictEnv:true};
  try{
    const terminal=await manager.create(options);assert.ok(terminal);
    assert.equal(host.created.length,1);assert.deepEqual(terminal.options,{...options,location:{viewColumn:1,preserveFocus:false}});
    assert.equal(terminalGroup(host,terminal).viewColumn,1);
    assert.ok(host.vscode.window.tabGroups.all.some(group=>group.tabs.includes(host.docTab)),'preexisting document tab retained');
  }finally{manager.dispose();}
});

test('concurrent opens are serialized and each owned process has its own editor group',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  try{
    const terminals=await Promise.all(Array.from({length:4},(_,i)=>manager.create({name:'Synthetic '+(i+1)})));
    assert.ok(terminals.every(Boolean));assert.equal(host.created.length,4);assert.equal(host.maxCommands,1,'editor commands must not race');
    assert.equal(new Set(terminals.map(t=>terminalGroup(host,t).viewColumn)).size,4);
    assert.deepEqual(host.layouts.at(-1),host.api.editorLayout(4));
    assert.deepEqual(await Promise.all(terminals.map(t=>t.processId)),[1000,1001,1002,1003]);
    assert.ok(host.moved.every(move=>terminals.includes(move.terminal)),'only owned terminals are relocated');
  }finally{manager.dispose();}
});

test('closing a managed terminal compacts the surviving grid without touching unrelated terminals',async()=>{
  const host=mockHost();const external=host.vscode.window.createTerminal({name:'Unrelated panel shell',location:1});
  const manager=new host.api.EditorTerminals();
  try{
    const terminals=[];for(let i=0;i<4;i++)terminals.push(await manager.create({name:'Synthetic '+i}));
    terminals[1].dispose();
    await eventually(()=>leaves(host.layouts.at(-1))===3&&terminals.filter(t=>!t.exitStatus).every((t,index)=>terminalGroup(host,t)?.viewColumn===index+1), 'closed terminal reflows surviving editors');
    const survivors=terminals.filter(t=>!t.exitStatus);
    assert.deepEqual(survivors.map(t=>terminalGroup(host,t).viewColumn),[1,2,3]);
    assert.equal(external.showCount,0);assert.equal(external.disposeCount,0);assert.ok(!host.moved.some(move=>move.terminal===external));
    const layoutCount=host.layouts.length;external.dispose();await new Promise(resolve=>setImmediate(resolve));assert.equal(host.layouts.length,layoutCount,'unrelated close cannot reflow owned editors');
  }finally{manager.dispose();}
});

test('the ninth editor is the maximum and a closed slot can be reused',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  try{
    const terminals=[];for(let i=0;i<9;i++)terminals.push(await manager.create({name:'Synthetic '+i}));
    const layoutCount=host.layouts.length,moveCount=host.moved.length;
    await assert.rejects(()=>manager.create({name:'Too many synthetic editors'}),/최대 9개/);assert.equal(host.created.length,9);
    assert.equal(host.layouts.length,layoutCount);assert.equal(host.moved.length,moveCount);
    terminals[4].dispose();
    const replacement=await manager.create({name:'Synthetic replacement'});assert.ok(replacement);assert.equal(host.created.length,10);
    assert.equal(leaves(host.layouts.at(-1)),9);assert.equal(new Set(host.vscode.window.terminals.map(t=>terminalGroup(host,t)?.viewColumn)).size,9);
  }finally{manager.dispose();}
});

test('disposing the manager removes listeners without closing terminals or resetting the layout',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  const terminal=await manager.create({name:'Synthetic retained process'});const before=host.layouts.length;
  manager.dispose();assert.equal(host.closed.size,0);assert.equal(terminal.disposeCount,0);
  terminal.dispose();await new Promise(resolve=>setImmediate(resolve));assert.equal(host.layouts.length,before);
  assert.equal(await manager.create({name:'Synthetic after disposal'}),undefined);assert.equal(host.created.length,1);
});

test('disposal while the layout command is pending cannot start or move a terminal',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();let release,entered;
  const started=new Promise(resolve=>entered=resolve);const gate=new Promise(resolve=>release=resolve);
  host.controls.onLayout=async()=>{entered();await gate;};
  const opening=manager.create({name:'Synthetic canceled during layout'});
  await started;manager.dispose();release();
  assert.equal(await opening,undefined);assert.equal(host.created.length,0);assert.equal(host.moved.length,0);
});

test('trust loss while the layout command is pending cannot start or move a terminal',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();let release,entered;
  const started=new Promise(resolve=>entered=resolve);const gate=new Promise(resolve=>release=resolve);
  host.controls.onLayout=async()=>{entered();await gate;};
  try{
    const opening=manager.create({name:'Synthetic trust revoked during layout'});
    const rejected=assert.rejects(opening,/Workspace Trust/);
    await started;host.vscode.workspace.isTrusted=false;release();await rejected;
    assert.equal(host.created.length,0);assert.equal(host.moved.length,0);
  }finally{host.vscode.workspace.isTrusted=true;release?.();manager.dispose();}
});

test('unsafe terminal focus stops relocation before moving another editor or launching a process',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();const originalNow=Date.now;
  try{
    const terminal=await manager.create({name:'Synthetic owned'});
    const external=host.vscode.window.createTerminal({name:'Unrelated shell',location:1});
    terminal.show=()=>{host.vscode.window.activeTerminal=external;const group=host.docTab.group;group.activeTab=host.docTab;host.vscode.window.tabGroups.activeTabGroup=group;};
    const before=host.created.length,moveCount=host.moved.length;let clock=0;
    Date.now=()=>clock+=4000; // Expire the focus deadline without delaying the test by three seconds.
    await assert.rejects(()=>manager.create({name:'Synthetic focus guard'}),/포커스/);
    assert.equal(host.created.length,before);assert.equal(host.moved.length,moveCount);
    assert.equal(external.showCount,0);assert.equal(external.disposeCount,0);
    assert.ok(host.vscode.window.tabGroups.all.some(group=>group.tabs.includes(host.docTab)));
  }finally{Date.now=originalNow;manager.dispose();}
});

test('a captured launch check cancels queued work before layout and is checked again after a pending layout',async()=>{
  for(const phase of ['queued','layout']){
    const host=mockHost();const manager=new host.api.EditorTerminals();let release,entered;let valid=true;
    const started=new Promise(resolve=>entered=resolve);const gate=new Promise(resolve=>release=resolve);
    host.controls.onLayout=async()=>{entered();await gate;};
    const check=()=>{if(!valid)throw new (require('../dist/runtime').SafeError)('Synthetic execution settings changed')};
    try{
      const first=manager.create({name:'Synthetic pending'},phase==='layout'?check:undefined);
      const rejected=phase==='layout'?assert.rejects(first,/settings changed/):undefined;
      await started;
      const queued=phase==='queued'?assert.rejects(manager.create({name:'Synthetic queued'},check),/settings changed/):undefined;
      valid=false;release();
      if(phase==='queued')assert.ok(await first);else await rejected;
      await queued;
      assert.equal(host.layouts.length,1);assert.equal(host.created.length,phase==='queued'?1:0);assert.equal(host.moved.length,0);
    }finally{release?.();manager.dispose();}
  }
});

test('an unrelated editor terminal prevents layout merging before it can move or start another process',async()=>{
  const host=mockHost();await host.vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:0,groups:[{},{}]});
  const external=host.vscode.window.createTerminal({name:'Synthetic unrelated editor',location:{viewColumn:2}});external.show();
  const manager=new host.api.EditorTerminals();const layouts=host.layouts.length,created=host.created.length;
  try{
    await assert.rejects(()=>manager.create({name:'Synthetic requested'}),/다른 편집기 터미널|동일한 이름/);
    assert.equal(host.layouts.length,layouts);assert.equal(host.created.length,created);assert.equal(host.moved.length,0);
    assert.equal(terminalGroup(host,external).viewColumn,2);assert.equal(external.disposeCount,0);
  }finally{manager.dispose();}
});

test('a second editor with an owned terminal name is conservatively rejected rather than treated as owned',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  try{
    const owned=await manager.create({name:'Synthetic shared name'});
    const external=host.vscode.window.createTerminal({name:owned.name,location:{viewColumn:1}});external.show();
    const layouts=host.layouts.length,created=host.created.length,moved=host.moved.length;
    await assert.rejects(()=>manager.create({name:'Synthetic requested'}),/동일한 이름/);
    assert.equal(host.layouts.length,layouts);assert.equal(host.created.length,created);assert.equal(host.moved.length,moved);
    assert.equal(owned.disposeCount,0);assert.equal(external.disposeCount,0);
  }finally{manager.dispose();}
});

test('an owned panel terminal cannot make a same-name foreign editor pass the ownership check',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  try{
    const owned=await manager.create({name:'Synthetic shared name'});
    // Moving the owned editor to Panel removes its TabInputTerminal while retaining the Terminal.
    for(const group of host.vscode.window.tabGroups.all)group.tabs=group.tabs.filter(tab=>tab.terminal!==owned);
    await host.vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:0,groups:[{},{}]});
    const foreign=host.vscode.window.createTerminal({name:owned.name,location:{viewColumn:2}});foreign.show();
    owned.show=()=>{host.vscode.window.activeTerminal=owned;};
    const layouts=host.layouts.length,moved=host.moved.length,created=host.created.length;
    await assert.rejects(()=>manager.create({name:'Synthetic requested'}),/동일한 이름/);
    assert.equal(host.layouts.length,layouts);assert.equal(host.moved.length,moved);assert.equal(host.created.length,created);
    assert.equal(terminalGroup(host,foreign).viewColumn,2);
  }finally{manager.dispose();}
});

test('close reflow waits for VS Code to remove the closing editor tab before classifying remaining tabs',async()=>{
  const host=mockHost();const manager=new host.api.EditorTerminals();
  try{
    const terminals=[];for(let i=0;i<4;i++)terminals.push(await manager.create({name:'Synthetic delayed close '+i}));
    const layouts=host.layouts.length;host.controls.deferTabRemoval=true;terminals[1].dispose();
    await new Promise(resolve=>setTimeout(resolve,30));assert.equal(host.layouts.length,layouts);
    for(const group of host.vscode.window.tabGroups.all)group.tabs=group.tabs.filter(tab=>tab.terminal!==terminals[1]);
    await eventually(()=>leaves(host.layouts.at(-1))===3,'remaining grid reflows after closed tab disappears');
    assert.equal(host.notices.length,0);
  }finally{manager.dispose();}
});
