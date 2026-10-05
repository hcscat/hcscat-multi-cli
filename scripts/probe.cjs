// Local P0 probe: emits aggregate metadata only, never titles, paths or IDs.
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const exe = process.argv[2];
if (!exe) throw new Error('Pass the absolute native codex.exe path');
const child = spawn(exe, ['app-server', '--listen', 'stdio://'], { shell: false, windowsHide: true, stdio: 'pipe' });
let seq = 0;
const pending = new Map();
child.stderr.resume();
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  try { const m = JSON.parse(line); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {}
});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout: ' + method)); }, 20000);
    pending.set(id, m => { clearTimeout(timer); m.error ? reject(new Error('RPC error ' + m.error.code)) : resolve(m.result); });
    child.stdin.write(JSON.stringify({id, method, params}) + '\n');
  });
}
(async () => {
  try {
    await request('initialize', {clientInfo: {name: 'multi_cli_probe', version: '0.1.0'}});
    child.stdin.write(JSON.stringify({method: 'initialized', params: {}}) + '\n');
    const base = {limit: 5, sortKey: 'updated_at', sortDirection: 'desc', archived: false, modelProviders: [], useStateDbOnly: true};
    const first = await request('thread/list', {...base, sourceKinds: ['cli', 'vscode', 'appServer']});
    const second = first.nextCursor ? await request('thread/list', {...base, sourceKinds: ['cli', 'vscode', 'appServer'], cursor: first.nextCursor}) : {data: []};
    const defaults = await request('thread/list', base);
    const summarize = page => ({count: page.data.length, sources: page.data.reduce((a,t) => {const s = typeof t.source === 'string' ? t.source : 'structured'; a[s]=(a[s]||0)+1; return a;}, {}), cwdStrings: page.data.filter(t=>typeof t.cwd==='string').length, names: page.data.filter(t=>typeof t.name==='string').length, statuses: [...new Set(page.data.map(t=>t.status?.type))], nextCursor: typeof page.nextCursor === 'string'});
    console.log(JSON.stringify({handshake: true, first: summarize(first), second: summarize(second), defaultSources: summarize(defaults), overlap: second.data.filter(t=>first.data.some(f=>f.id===t.id)).length, codeHome: process.env.CODEX_HOME ? 'inherited override' : 'user default'}, null, 2));
  } finally { child.stdin.end(); child.kill(); lines.close(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });
