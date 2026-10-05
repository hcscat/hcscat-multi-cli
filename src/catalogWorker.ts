import { parentPort, workerData } from 'node:worker_threads';
import { listSessions } from '@anthropic-ai/claude-agent-sdk';
import { readAgyCatalog } from './agyCatalog';
import { cleanTitle, localPath, storeKey, Session } from './model';
async function run() {
  if (workerData.kind === 'agy') return readAgyCatalog(workerData.root);
  const rows = await listSessions({limit: 10001, includeProgrammatic: true});
  const sessions: Session[] = rows.slice(0, 10000).map(r => ({provider: 'claude', storeId: storeKey(workerData.root), id: r.sessionId, title: cleanTitle(r.customTitle || r.summary), cwd: localPath(r.cwd), updatedAt: Number.isFinite(r.lastModified) ? r.lastModified / 1000 : 0, source: '저장 대화', serverStatus: 'unknown', compatibility: 'unknown'}));
  return {sessions, notice: rows.length > 10000 ? '저장 대화 10,000개 제한' : '저장 대화'};
}
run().then(result => parentPort?.postMessage({ok: true, result}), () => parentPort?.postMessage({ok: false}));
