const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {readAgyCatalog}=require('../dist/agyCatalog');const {catalogWorker,normalizeClaudeLive,mergeClaude,readExternalCatalog}=require('../dist/externalCatalog');
const {localPath,pathKey,storeKey,filterSessions}=require('../dist/model');
const {DatabaseSync}=require('node:sqlite');
async function temp(){await fs.mkdir('.local',{recursive:true});return fs.mkdtemp(path.resolve('.local','catalog-synthetic-'));}
test('local paths and exact workspace filters do not mix siblings or Unix paths',()=>{
 assert.equal(localPath('file:///d%3A/synthetic/%ED%95%9C%EA%B8%80'),'d:\\synthetic\\한글');assert.equal(localPath('/home/synthetic'),'');assert.equal(localPath('D:\\'),'D:\\');
 const a={cwd:'C:\\synthetic\\project'},b={cwd:'C:\\synthetic\\project-other'};assert.deepEqual(filterSessions([a,b],['c:\\SYNTHETIC\\project\\']),[a]);assert.equal(pathKey('C:\\synthetic\nexit'),'');
});
test('agy read-only summaries merge recent cache paths, retain unknown groups, and namespace duplicate IDs',async()=>{
 const root=await temp();try{
 for(const dir of ['antigravity-cli','antigravity']){
  const folder=path.join(root,dir);await fs.mkdir(folder,{recursive:true});const db=new DatabaseSync(path.join(folder,'conversation_summaries.db'));
  db.exec('CREATE TABLE conversation_summaries(conversation_id TEXT,title TEXT,last_modified_time TEXT,workspace_uris TEXT,status TEXT)');
  db.prepare('INSERT INTO conversation_summaries VALUES(?,?,?,?,?)').run('same-id','Synthetic title','2026-10-01 00:00:00+00:00','', 'IDLE');db.close();
 }
 const file=path.join(root,'antigravity-cli','conversation_summaries.db'),before=await fs.readFile(file);
 await fs.mkdir(path.join(root,'antigravity-cli','cache'));await fs.writeFile(path.join(root,'antigravity-cli','cache','last_conversations.json'),JSON.stringify({'C:\\synthetic\\project':'same-id','C:\\synthetic\\other':'cache-only'}));
 const result=await readAgyCatalog(root);assert.equal(result.sessions.length,3);assert.equal(result.sessions.filter(s=>s.cwd).length,2);assert.match(result.notice,/경로 미확인 1개/);assert.equal(result.warning,undefined);
 assert.deepEqual(await fs.readFile(file),before);assert.equal(new Set(result.sessions.map(s=>s.storeId+':'+s.id)).size,3);
}finally{await fs.rm(root,{recursive:true,force:true});}});
test('agy distinguishes absent storage from unsupported schema; invalid custom roots do not get created',async()=>{
 const root=await temp();try{
  const empty=await readAgyCatalog(root);assert.equal(empty.sessions.length,0);assert.equal(empty.warning,undefined);
  await fs.mkdir(path.join(root,'antigravity'));const db=new DatabaseSync(path.join(root,'antigravity','conversation_summaries.db'));db.exec('CREATE TABLE conversation_summaries(other TEXT)');db.close();
  const broken=await readAgyCatalog(root);assert.match(broken.warning,/미지원/);
  await assert.rejects(readExternalCatalog('claude',{root:path.join(root,'does-not-exist')}),/자동 생성하지/);
  await assert.rejects(fs.stat(path.join(root,'does-not-exist')));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('official Claude SDK worker reads synthetic saved metadata without a CLI turn; cancellation is bounded',async()=>{
 const root=await temp();try{
  const folder=path.join(root,'projects','C--synthetic-project');await fs.mkdir(folder,{recursive:true});
  const id='00000000-0000-4000-8000-000000000007';
  const record={type:'user',uuid:'00000000-0000-4000-8000-000000000008',sessionId:id,cwd:'C:\\synthetic\\project',timestamp:'2026-10-01T00:00:00Z',message:{role:'user',content:'Synthetic local history for catalog test'},entrypoint:'cli'};
  await fs.writeFile(path.join(folder,id+'.jsonl'),JSON.stringify(record)+'\n'+JSON.stringify({type:'custom-title',sessionId:id,customTitle:'Synthetic saved title'})+'\n');
  const result=await catalogWorker('claude',root);assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].id,id);assert.equal(result.sessions[0].cwd,'C:\\synthetic\\project');assert.equal(result.sessions[0].title,'Synthetic saved title');
  const controller=new AbortController();const pending=catalogWorker('claude',root,controller.signal);controller.abort();await assert.rejects(pending,/취소/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Claude saved and live rows merge only within the same store and keep status evidence',()=>{
 const root='C:\\synthetic';const live=normalizeClaudeLive([{sessionId:'id',cwd:'C:\\synthetic\\project',name:'Synthetic live title',kind:'background',status:'idle',startedAt:1790812800000}],root).sessions;
 const saved={...live[0],title:'Synthetic saved title',source:'저장 대화',serverStatus:'unknown',updatedAt:12};
 const merged=mergeClaude([saved],live);assert.equal(merged.length,1);assert.equal(merged[0].title,saved.title);assert.equal(merged[0].serverStatus,'idle');assert.equal(merged[0].updatedAt,12);
 assert.equal(mergeClaude([{...saved,storeId:storeKey('C:\\different-store')}],live).length,2);
 const mixed=normalizeClaudeLive([{sessionId:'first'},null,{sessionId:'id;exit'},{sessionId:'last'}],root);
 assert.deepEqual(mixed.sessions.map(s=>s.id),['first','last']);assert.equal(mixed.skipped,2);
 assert.throws(()=>normalizeClaudeLive({sessions:[]},root),/응답 형식/);
});
