const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {checkPrivacy} = require('../scripts/check-privacy.cjs');

test('public source scan catches quoted JSON credentials, personal prefixes and source data without logging matched values', async () => {
  const local = path.resolve('.local'); await fs.mkdir(local, {recursive: true});
  const directory = await fs.mkdtemp(path.join(local, 'privacy-synthetic-'));
  try {
    const syntheticSecret = 'synthetic'.repeat(4);
    await fs.writeFile(path.join(directory, 'config.json'), JSON.stringify({api_key: syntheticSecret, access_token: syntheticSecret}));
    await fs.writeFile(path.join(directory, 'guide.md'), 'C:/synthetic/private-project/info');
    await fs.writeFile(path.join(directory, 'source.db'), 'synthetic source record');
    const result = await checkPrivacy(directory, ['C:/synthetic/private-project']);
    assert.equal(result.files, 3);
    assert.ok(result.issues.some(issue => issue.file === 'config.json' && issue.rule === 'credential-pattern'));
    assert.ok(result.issues.some(issue => issue.file === 'guide.md' && issue.rule === 'private-local-path'));
    assert.ok(result.issues.some(issue => issue.file === 'source.db' && issue.rule === 'private-file-type'));
    assert.ok(!JSON.stringify(result).includes(syntheticSecret));
    await fs.rm(path.join(directory, 'config.json')); await fs.rm(path.join(directory, 'guide.md')); await fs.rm(path.join(directory, 'source.db'));
    await fs.writeFile(path.join(directory, 'README.md'), 'C:/example/project and 00000000-0000-4000-8000-000000000001');
    assert.deepEqual((await checkPrivacy(directory)).issues, []);
  } finally {
    assert.equal(path.dirname(directory), local); assert.ok(path.basename(directory).startsWith('privacy-synthetic-'));
    await fs.rm(directory, {recursive: true, force: true});
  }
});
