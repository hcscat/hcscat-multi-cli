const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '..');
  const {name, version, repository} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!/^[a-z0-9-]+$/.test(name) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error('Invalid package name or version');
  }
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) {
    throw new Error('Usage: npm run package [-- --out <new-file.vsix>]');
  }
  const output = path.resolve(root, args[1] || path.join('release', version, `${name}-win32-x64-${version}.vsix`));
  const relative = path.relative(root, output);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(output) !== '.vsix') {
    throw new Error('Package output must be a .vsix file inside this project');
  }
  const checksum = `${output}.sha256`;
  for (const file of [output, checksum]) {
    try {
      await fs.lstat(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error('Package or checksum already exists. Keep archived binaries intact; bump the version or use --out with a new path.');
  }
  await fs.mkdir(path.dirname(output), {recursive: true});
  // Local builds have no public repository URL yet. Keep source-document links intact
  // instead of inventing a base URL; normal vsce rewriting resumes when one is configured.
  const repositoryUrl = typeof repository === 'string' ? repository : repository?.url;
  const result = spawnSync(process.execPath, [require.resolve('@vscode/vsce/vsce'), 'package',
    '--no-dependencies', '--allow-missing-repository', '--target', 'win32-x64',
    ...(!repositoryUrl ? ['--no-rewrite-relative-links'] : []), '--out', output],
  {cwd: root, stdio: 'inherit', shell: false, windowsHide: true});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('VSIX packaging failed');
  const digest = createHash('sha256').update(await fs.readFile(output)).digest('hex');
  await fs.writeFile(checksum, `${digest}  ${path.basename(output)}\n`, {flag: 'wx'});
  console.log(`Package: ${relative.replaceAll('\\', '/')}`);
  console.log(`SHA-256: ${digest}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
