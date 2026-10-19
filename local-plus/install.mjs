import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fetch(url, { signal: AbortSignal.timeout(20000) }); }
    catch { if (attempt === 2) throw Error('下载连接超时，请检查网络后重新启动知金台。'); }
  }
}

const directory = fileURLToPath(new URL('.', import.meta.url));
const packageInfo = JSON.parse(await readFile(new URL('package.json', import.meta.url)));
const version = packageInfo.dependencies.jose;
const response = await download(`https://registry.npmjs.org/jose/${version}`);
if (!response.ok) throw Error('无法下载登录验证组件，请检查网络后再试。');
const metadata = await response.json();
if (metadata.name !== 'jose' || metadata.version !== version || !metadata.dist.tarball.startsWith('https://registry.npmjs.org/jose/-/')) throw Error('Invalid package metadata.');
const archive = await download(metadata.dist.tarball);
if (!archive.ok) throw Error('无法下载登录验证组件。');
const bytes = Buffer.from(await archive.arrayBuffer());
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
if (integrity !== metadata.dist.integrity) throw Error('Package integrity verification failed.');
await mkdir(new URL('node_modules/jose/', import.meta.url), { recursive: true });
const path = fileURLToPath(new URL('node_modules/jose.tgz', import.meta.url));
await writeFile(path, bytes);
const unpack = spawnSync('tar', ['-xzf', path, '-C', fileURLToPath(new URL('node_modules/jose/', import.meta.url)), '--strip-components=1'], { windowsHide: true });
if (unpack.status !== 0) throw Error('组件解压失败。');
await writeFile(new URL('package-lock.json', import.meta.url), JSON.stringify({ name: packageInfo.name, version: packageInfo.version, lockfileVersion: 3, requires: true, packages: {
  '': { name: packageInfo.name, version: packageInfo.version, dependencies: packageInfo.dependencies, engines: packageInfo.engines },
  'node_modules/jose': { version, resolved: metadata.dist.tarball, integrity, license: metadata.license }
}}, null, 2) + '\n');
console.log(`已安装并校验官方 npm 组件 jose ${version}。`);
