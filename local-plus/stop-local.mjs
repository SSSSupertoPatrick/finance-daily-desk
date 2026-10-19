const origin = 'http://127.0.0.1:18741';
try {
  const home = await fetch(origin, { signal: AbortSignal.timeout(3000) });
  if (!(await home.text()).includes('本机 Plus')) throw Error('unexpected service');
  const cookie = home.headers.get('set-cookie')?.split(';')[0];
  const response = await fetch(`${origin}/api/shutdown`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('shutdown failed');
  console.log('知金台本机服务已停止。');
} catch { console.log('本机服务未运行，或无法停止。'); process.exitCode = 1; }
