const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');

// Reviewed in locked Claude SDK 0.3.286: namespace and UUID MAX validation constants.
// Limit exceptions to the bundled SDK; future UUID literals require another review.
const upstreamUuidHashes = new Set([
  'b007214566423b6c8eae78f786cc1568e445a2f565e30cfd12d2d3a71a171216',
  '13984ab878f915021670cd855c9399ebc339676b2581855e4efd60c685f67c8e'
]);

const generated = new Set(['.git', 'node_modules', 'dist', 'out-test', '.local']);
const forbiddenNames = /^(?:\.env(?:\..*)?|auth\.json|credentials(?:\..*)?|settings\.local\.json|id_(?:rsa|ed25519)(?:\.pub)?)$/i;
const privateExtensions = /\.(?:db|sqlite(?:3)?|jsonl|log|pem|key|pfx|p12)$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)["']?\s*[=:]\s*["'][A-Za-z0-9_+/-]{20,}["']/i
];
const normalize = text => text.replace(/\\+/g, '/').toLowerCase();

async function checkPrivacy(root, additionalPrivateValues = [], options = {}) {
  root = path.resolve(root);
  const prefixes = [os.homedir(), ...(process.env.USERPROFILE ? [process.env.USERPROFILE] : []), ...additionalPrivateValues].map(normalize).filter(value => value.length > 4);
  const issues = []; let files = 0; let ignored = 0;
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) { issues.push({file: relative, rule: 'symlink'}); continue; }
      if (entry.isDirectory()) { if (!options.includeGenerated && generated.has(entry.name)) { ignored++; continue; } await walk(absolute); continue; }
      if (!entry.isFile()) { issues.push({file: relative, rule: 'unexpected-file-kind'}); continue; }
      if (/\.vsix$/i.test(entry.name)) { ignored++; continue; }
      files++;
      if (forbiddenNames.test(entry.name) || privateExtensions.test(entry.name)) issues.push({file: relative, rule: 'private-file-type'});
      const info = await fs.stat(absolute);
      if (info.size > 3 * 1024 * 1024) { issues.push({file: relative, rule: 'unexpected-large-source'}); continue; }
      const text = await fs.readFile(absolute, 'utf8');
      if (text.includes('\0')) { issues.push({file: relative, rule: 'unexpected-binary'}); continue; }
      const normalized = normalize(text);
      if (prefixes.some(prefix => normalized.includes(prefix))) issues.push({file: relative, rule: 'private-local-path'});
      if (/[a-z]:\/users\/(?!example(?:\/|\b)|synthetic(?:\/|\b)|<user>)[\w.-]+\//i.test(normalized)) issues.push({file: relative, rule: 'personal-profile-path'});
      if (secretPatterns.some(pattern => pattern.test(text))) issues.push({file: relative, rule: 'credential-pattern'});
      const uuids = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/ig) || [];
      const bundledSdk = relative === 'extension/dist/catalogWorker.mjs' || relative === 'dist/catalogWorker.mjs';
      if (uuids.some(id => !id.startsWith('00000000-') && !(bundledSdk && upstreamUuidHashes.has(createHash('sha256').update(id.toLowerCase()).digest('hex'))))) issues.push({file: relative, rule: 'non-synthetic-session-id'});
    }
  }
  await walk(root);
  return {files, ignoredGeneratedEntries: ignored, issues};
}
exports.checkPrivacy = checkPrivacy;

if (require.main === module) (async () => {
  const requested = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  let root = requested || process.cwd();
  if (!requested) { try { if ((await fs.stat(path.join(root, 'github', 'AGENTS.md'))).isFile()) root = path.join(root, 'github'); } catch {} }
  const result = await checkPrivacy(root, [], {includeGenerated: process.argv.includes('--include-generated')});
  console.log(JSON.stringify(result)); // File names and rule names only; never matching values.
  if (result.issues.length) process.exitCode = 1;
})().catch(() => { console.error('Privacy scan failed; check source folder access.'); process.exitCode = 1; });
