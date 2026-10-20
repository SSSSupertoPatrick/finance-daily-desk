import { spawn } from 'node:child_process';
import { access, open, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareStateDirectory } from './state-directory.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const origin = 'http://127.0.0.1:18741/';
const openBrowser = process.argv.includes('--open');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ready() {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(1200) });
    return response.ok && (await response.text()).includes('local-plus.js');
  } catch { return false; }
}
function showBrowser() {
  if (!openBrowser) return;
  const browser = spawn('explorer.exe', [origin], { windowsHide: true, detached: true, stdio: 'ignore' });
  browser.on('error', () => console.log(`请在浏览器打开：${origin}`));
  browser.unref();
}
async function start() {
  if (await ready()) { console.log(`知金台已运行：${origin}`); showBrowser(); return; }
  try { await access(join(directory, 'node_modules/jose/package.json')); }
  catch {
    const installer = spawn(process.execPath, [join(directory, 'install.mjs')], { windowsHide: true, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { installer.once('error', reject); installer.once('exit', resolve); });
    if (code !== 0) throw Error('安装登录组件失败，请检查上方提示。');
  }
  const state = await prepareStateDirectory();
  const log = await open(join(state.directory, 'service.log'), 'a');
  const errorPath = join(state.directory, 'service-error.log');
  const errorLog = await open(errorPath, 'a');
  let child, launchError;
  try {
    child = spawn(process.execPath, [join(directory, 'server.mjs')], {
      cwd: directory, detached: true, windowsHide: true,
      stdio: ['ignore', log.fd, errorLog.fd]
    });
    child.once('error', error => { launchError = error; });
  } finally { await log.close(); await errorLog.close(); }
  child.unref();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await ready()) {
      console.log(`知金台已启动并确认可访问：${origin}`);
      showBrowser();
      return;
    }
    if (launchError) throw launchError;
    if (child.exitCode !== null) {
      console.error((await readFile(errorPath, 'utf8').catch(() => '')).slice(-2000));
      throw Error('知金台启动失败，请将此窗口的报错发给我。');
    }
    await delay(250);
  }
  throw Error('服务尚未就绪，请将此窗口的提示发给我。');
}
start().catch(error => { console.error(error.message); process.exitCode = 1; });
