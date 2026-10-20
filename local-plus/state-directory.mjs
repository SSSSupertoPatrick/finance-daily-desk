import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from './store.mjs';

const baseDirectory = dirname(fileURLToPath(import.meta.url));

export async function selectStateDirectory(base, sid, probe = path => readFile(join(path, 'host.json'), 'utf8')) {
  if (!/^S-1-5-(?:\d+-)*\d+$/.test(sid)) throw Error('无法确认当前 Windows 账户。');
  const legacy = join(base, '.local-state');
  try {
    await probe(legacy);
    return { directory: legacy, isolated: false, recovered: false };
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    return {
      directory: join(base, '.user-state', sid),
      isolated: true,
      recovered: error.code !== 'ENOENT'
    };
  }
}

export async function prepareStateDirectory() {
  let sid;
  try {
    sid = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'
    ], { encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { throw Error('无法确认当前 Windows 账户，请从资源管理器重新启动知金台。'); }
  const state = await selectStateDirectory(baseDirectory, sid);
  // Keep the old account untouched. Each Windows identity owns its new directory.
  if (state.isolated) await privateDirectory(state.directory);
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log((await prepareStateDirectory()).directory);
}
