const vscode=require('vscode');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {EditorTerminals,editorLayout}=require('../dist/editorTerminals');

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check,message,timeout=10000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await check();if(value)return value;await pause(50);}assert.fail(message);}
// VS Code flattens a column containing only one leaf (5- and 7-terminal layouts).
function shape(layout){const groupShape=group=>!group.groups?{}:group.groups.length===1?groupShape(group.groups[0]):{groups:group.groups.map(groupShape)};return {orientation:layout.orientation??0,groups:layout.groups.map(groupShape)};}
function terminalTab(name){for(const group of vscode.window.tabGroups.all){const tab=group.tabs.find(tab=>tab.input instanceof vscode.TabInputTerminal&&tab.label===name);if(tab)return {group,tab};}}

exports.run=async()=>{
  const initialLayout=await vscode.commands.executeCommand('vscode.getEditorLayout');
  const manager=new EditorTerminals();const terminals=[];const originalPids=[];
  const suffix=randomUUID().slice(0,8);const directory=path.join(__dirname,'..','.local','editor-layout-host');await fs.mkdir(directory,{recursive:true});
  const documentFile=path.join(directory,'synthetic-layout-document-'+suffix+'.txt');
  await fs.writeFile(documentFile,'Synthetic editor layout verification.\n');
  const document=await vscode.workspace.openTextDocument(documentFile);await vscode.window.showTextDocument(document,{viewColumn:1,preview:false});
  const documentUri=document.uri.toString();
  const node=process.env.MULTI_CLI_NODE_EXE||'C:\\Program Files\\nodejs\\node.exe';
  try{
    for(let count=1;count<=9;count++){
      const terminal=await manager.create({name:'Multi CLI layout synthetic '+count+' '+suffix,shellPath:node,shellArgs:['-e','setInterval(()=>{},1000)'],cwd:directory,isTransient:true});
      assert.ok(terminal,'synthetic terminal must open');terminals.push(terminal);
      const pid=await Promise.race([terminal.processId,pause(10000).then(()=>undefined)]);assert.ok(pid,'synthetic process must start');originalPids.push(pid);
      await eventually(()=>terminalTab(terminal.name),'terminal must appear as a document-area tab');
      const actual=await eventually(async()=>{const result=await vscode.commands.executeCommand('vscode.getEditorLayout');return JSON.stringify(shape(result))===JSON.stringify(shape(editorLayout(count)))&&result;},'editor must use requested '+count+'-session layout');
      assert.deepEqual(shape(actual),shape(editorLayout(count)));
      await eventually(()=>terminals.every(t=>terminalTab(t.name))&&new Set(terminals.map(t=>terminalTab(t.name).group.viewColumn)).size===count,'each session must have a distinct editor group');
      for(let index=0;index<terminals.length;index++){
        assert.equal(await terminals[index].processId,originalPids[index],'rearrangement must retain the original terminal process');
        assert.equal(terminals[index].exitStatus,undefined,'rearrangement must leave the process alive');process.kill(originalPids[index],0);
        const current=terminalTab(terminals[index].name);assert.equal(current.group.activeTab,current.tab,'each terminal must be visible in its own group');
      }
      assert.ok(vscode.window.tabGroups.all.some(group=>group.tabs.some(tab=>tab.input instanceof vscode.TabInputText&&tab.input.uri.toString()===documentUri)),'document tab must survive terminal rearrangement');
    }
    terminals[1].dispose();
    await eventually(()=>!vscode.window.terminals.includes(terminals[1]),'explicitly closed synthetic terminal must exit');
    await eventually(async()=>{const result=await vscode.commands.executeCommand('vscode.getEditorLayout');const live=terminals.filter(t=>t!==terminals[1]);return JSON.stringify(shape(result))===JSON.stringify(shape(editorLayout(8)))&&live.every(t=>terminalTab(t.name))&&new Set(live.map(t=>terminalTab(t.name).group.viewColumn)).size===8;},'closing a session must reflow the remaining eight terminals');
    for(let index=0;index<terminals.length;index++)if(index!==1){assert.equal(await terminals[index].processId,originalPids[index]);process.kill(originalPids[index],0);}
    const beforeLimit=vscode.window.terminals.length;
    const replacement=await manager.create({name:'Multi CLI layout replacement '+suffix,shellPath:node,shellArgs:['-e','setInterval(()=>{},1000)'],cwd:directory,isTransient:true});
    terminals.push(replacement);
    await eventually(()=>terminalTab(replacement.name),'replacement terminal must occupy the ninth editor group');
    await assert.rejects(manager.create({name:'Multi CLI layout over limit '+suffix,shellPath:node,shellArgs:['-e','setInterval(()=>{},1000)'],cwd:directory,isTransient:true}),/9/);
    assert.equal(vscode.window.terminals.length,beforeLimit+1,'tenth request must not start a terminal');
    assert.ok(vscode.window.tabGroups.all.some(group=>group.tabs.some(tab=>tab.input instanceof vscode.TabInputText&&tab.input.uri.toString()===documentUri)),'document tab must survive close/reopen and the capacity limit');
    console.log('EDITOR HOST PASS: 1 through 9 terminal editors, original process IDs/document preserved, 9-to-8-to-9 reflow, tenth request blocked without process creation.');
  }finally{
    manager.dispose();for(const terminal of terminals)if(vscode.window.terminals.includes(terminal))terminal.dispose();
    await eventually(()=>terminals.every(t=>!vscode.window.terminals.includes(t)),'only test-owned terminal cleanup must complete');
    const syntheticTabs=vscode.window.tabGroups.all.flatMap(group=>group.tabs).filter(tab=>tab.input instanceof vscode.TabInputText&&tab.input.uri.toString()===documentUri);
    if(syntheticTabs.length)await vscode.window.tabGroups.close(syntheticTabs,true);
    await vscode.commands.executeCommand('vscode.setEditorLayout',initialLayout);await fs.rm(documentFile,{force:true});
  }
};
