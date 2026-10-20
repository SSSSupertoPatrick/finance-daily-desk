import http from 'node:http';
import { setDefaultResultOrder } from 'node:dns';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatGPTAuth } from './auth.mjs';
import { ProtectedStore } from './store.mjs';
import { searchPlus, plusError } from './inference.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
setDefaultResultOrder('ipv4first');
const stateDirectory = join(directory, '.local-state');
const siteDirectory = resolve(directory, '../site');
const port = Number(process.env.FINANCE_DESK_PORT || 18741);
const origin = `http://127.0.0.1:${port}`;
const session = randomBytes(32).toString('hex');
const cookieName = `zj_local_${port}`;
const cookie = `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
await mkdir(stateDirectory, { recursive: true });
let hostId;
try { hostId = JSON.parse(await readFile(join(stateDirectory, 'host.json'), 'utf8')).id; }
catch (error) {
  if (error.code === 'EACCES' || error.code === 'EPERM') throw Error('当前 Windows 账户无权访问本机登录目录，请在完成授权的账户中双击启动知金台.cmd。');
  if (error.code !== 'ENOENT') throw Error('本机配置损坏，请恢复 host.json 后再启动。');
  hostId = `urn:uuid:${randomUUID()}`; await writeFile(join(stateDirectory, 'host.json'), JSON.stringify({ id: hostId }), { flag: 'wx' });
}
if (!/^urn:uuid:[\da-f-]{36}$/.test(hostId)) throw Error('Invalid host identifier.');
const auth = new ChatGPTAuth({ store: new ProtectedStore(stateDirectory), hostId, callback: `${origin}/auth/callback` });
await auth.init();
let busy = false, selectedModel = '', welcomed = auth.account?.welcomeSeen || false;

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin' };
const hasSession = req => String(req.headers.cookie || '').split(';').some(c => c.trim() === `${cookieName}=${session}`);
const json = (res, status, data) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 4096) throw Error('搜索内容过长。'); }
  return JSON.parse(data);
}
function home(res) {
  res.writeHead(303, { ...headers, Location: '/' }); res.end();
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, { error: '请从本机工作台打开。' });
    const url = new URL(req.url, origin);
    if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: '本机服务只接受工作台请求。' });
    if (req.method === 'POST' && (!hasSession(req) || req.headers.origin !== origin)) return json(res, 403, { error: '请刷新本机工作台后再试。' });
    if (req.method === 'POST' && !String(req.headers['content-type']).startsWith('application/json')) return json(res, 415, { error: '请求格式无效。' });
    if (url.pathname === '/auth/start') {
      if (req.method !== 'GET' || !hasSession(req) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '请点击本机页面里的登录按钮。' });
      res.writeHead(303, { ...headers, Location: auth.begin(session) }); return res.end();
    }
    if (url.pathname === '/auth/callback') {
      // state + PKCE + nonce bind this callback to the locally initiated attempt.
      // A user may complete the same flow in their ordinary system browser.
      try { await auth.complete(url.searchParams, session); welcomed = auth.account.welcomeSeen || false; selectedModel = ''; }
      catch (error) {
        auth.lastError = plusError(error);
        const code = typeof error.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code) ? error.code : 'AUTH_FAILED';
        console.warn('local_sign_in_failed', { stage: auth.stage || 'callback', code });
      }
      res.setHeader('Set-Cookie', cookie); return home(res);
    }
    if (url.pathname.startsWith('/api/')) {
      if (!hasSession(req)) return json(res, 401, { error: '请先打开本机工作台。' });
      if (url.pathname === '/api/status' && req.method === 'GET') return json(res, 200, {
        connected: Boolean(auth.account?.access_token), email: auth.account?.access_token ? auth.account.email : '',
        needsWelcome: Boolean(auth.account?.access_token && !welcomed), error: auth.lastError || '', billing: 'chatgpt-plan'
      });
      if (url.pathname === '/api/shutdown' && req.method === 'POST') {
        json(res, 200, { ok: true });
        setTimeout(() => { server.close(); server.closeAllConnections(); process.exit(0); }, 100);
        return;
      }
      if (url.pathname === '/api/models' && req.method === 'GET') {
        const models = await auth.listModels();
        if (!models.some(m => m.slug === selectedModel)) selectedModel = models[0].slug;
        return json(res, 200, { models, selected: selectedModel });
      }
      if (url.pathname === '/api/welcome' && req.method === 'POST') {
        if (!auth.account?.access_token) return json(res, 401, { error: '请先登录。' });
        const next = { ...auth.account, welcomeSeen: true }; await auth.store.save(next); auth.account = next; welcomed = true;
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        if (busy) return json(res, 409, { error: '请先取消当前搜索，再退出账号。' });
        const revoked = await auth.signOut(); auth.lastError = ''; selectedModel = '';
        return json(res, 200, { ok: true, message: revoked ? '已退出 ChatGPT 账号。' : '已在本机退出；未能确认远程撤销，请在 ChatGPT 设置中断开知金台。' });
      }
      if (url.pathname === '/api/search' && req.method === 'POST') {
        const data = await body(req);
        const query = typeof data.query === 'string' ? data.query.trim() : '';
        if (query.length < 2 || query.length > 300) return json(res, 400, { error: '请输入 2–300 个字符。' });
        if (!welcomed) return json(res, 409, { error: '请先确认使用 ChatGPT 套餐。' });
        if (busy) return json(res, 429, { error: '上一条搜索尚未结束，请稍后再试。' });
        busy = true;
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120000);
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
          const models = await auth.listModels();
          const model = data.model || selectedModel;
          if (!models.some(m => m.slug === model)) return json(res, 400, { error: '请从账号可用模型中选择。' });
          selectedModel = model;
          const result = await searchPlus({ query, model, token: await auth.accessToken(), signal: controller.signal });
          return json(res, 200, result);
        } finally { clearTimeout(timer); busy = false; }
      }
      return json(res, 404, { error: '没有这个功能。' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '请求方法无效。' });
    if (url.pathname === '/search-config.json') return json(res, 200, { mode: 'local-plus', endpoint: '/api/search' });
    if (url.pathname === '/local-plus.js') {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(await readFile(join(directory, 'ui.js')));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      let html = await readFile(join(siteDirectory, 'index.html'), 'utf8');
      html = html.replace('</body>', '<script src="/local-plus.js"></script></body>').replace('<title>知金台', '<title>本机 Plus · 知金台');
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie }); return res.end(html);
    }
    let relative;
    try { relative = decodeURIComponent(url.pathname).slice(1); } catch { return json(res, 400, { error: '地址无效。' }); }
    if (relative.includes('\\') || relative.split('/').some(p => p.startsWith('.'))) return json(res, 404, { error: '没有这个页面。' });
    const path = resolve(siteDirectory, relative);
    if (!path.startsWith(siteDirectory + sep)) return json(res, 404, { error: '没有这个页面。' });
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const bytes = await readFile(path); res.writeHead(200, { ...headers, 'Content-Type': (types[extname(path)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(bytes);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return json(res, 404, { error: '没有这个页面。' });
    if (!res.headersSent) json(res, 502, { error: plusError(error) }); else res.end();
  }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '本机工作台端口已在使用，请打开已运行的知金台。' : '本机工作台启动失败。'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`知金台本机 Plus 版已启动：${origin}`));
