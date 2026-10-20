import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { selectStateDirectory } from '../state-directory.mjs';

test('a readable legacy directory keeps the existing login location', async () => {
  const state = await selectStateDirectory('desk', 'S-1-5-21-1001', async () => '{"id":"existing"}');
  assert.deepEqual(state, { directory: join('desk', '.local-state'), isolated: false, recovered: false });
});
test('a denied legacy directory selects separate state for each Windows identity', async () => {
  for (const code of ['EACCES', 'EPERM']) {
    const denied = async () => { throw Object.assign(Error('denied'), { code }); };
    const first = await selectStateDirectory('desk', 'S-1-5-21-1001', denied);
    const second = await selectStateDirectory('desk', 'S-1-5-21-1003', denied);
    assert.equal(first.directory, join('desk', '.user-state', 'S-1-5-21-1001'));
    assert.notEqual(first.directory, second.directory);
    assert.equal(first.recovered, true);
  }
});
test('first startup uses isolated state; unexpected disk failures are not hidden', async () => {
  const state = await selectStateDirectory('desk', 'S-1-5-21-1001', async () => { throw Object.assign(Error(), { code: 'ENOENT' }); });
  assert.equal(state.isolated, true);
  assert.equal(state.recovered, false);
  await assert.rejects(selectStateDirectory('desk', 'S-1-5-21-1001', async () => { throw Object.assign(Error('disk'), { code: 'EIO' }); }), /disk/);
  await assert.rejects(selectStateDirectory('desk', '../other'), /Windows/);
});
