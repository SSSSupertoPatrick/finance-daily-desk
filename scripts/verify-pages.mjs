import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const expectedOrigin = 'https://ssssupertopatrick.github.io';
const base = new URL(process.argv[2] || expectedOrigin + '/finance-daily-desk/');
if (base.origin !== expectedOrigin || base.pathname !== '/finance-daily-desk/') {
  throw Error('Unexpected Pages address: ' + base.href);
}
const revision = process.argv[3] || 'verification';
const homepage = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const latest = homepage.match(/href=["'](briefs\/\d{4}-\d{2}-\d{2}\.html)["']/)?.[1];
if (!latest) throw Error('Homepage has no dated brief link.');
const marketsHTML = await readFile(new URL('../site/stocks.html', import.meta.url), 'utf8');
for (const id of ['a-shares','hk-stocks','us-stocks','global-stocks']) {
  if (!marketsHTML.includes('id="' + id + '"')) throw Error('Missing independent market section: ' + id);
}
const paths = ['', 'index.html', 'primary.html', 'stocks.html', latest,
  'daily-knowledge.js', 'search.js', 'search.css', 'content-status.js',
  'primary.css', 'primary.js', 'stocks-data.json', 'primary-data.json', 'pop.css', 'pop.js'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = new Map(await Promise.all(paths.map(async path => [
  path, hash(await readFile(new URL('../site/' + (path || 'index.html'), import.meta.url)))
])));
let pending = paths;
for (let attempt = 1; attempt <= 4 && pending.length; attempt++) {
  if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 4000 * (attempt - 1)));
  const results = await Promise.all(pending.map(async path => {
    const url = new URL(path, base);
    url.searchParams.set('build', revision);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store'
      });
      if (response.status !== 200) throw Error('HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== expected.get(path)) throw Error('Published content differs from this build');
      console.log('Verified HTTP 200 and build content: ' + new URL(path, base).href);
      return null;
    } catch (error) {
      console.warn('Attempt ' + attempt + ': ' + url.pathname + ' — ' + error.message);
      return path;
    }
  }));
  pending = results.filter(path => path !== null);
}
if (pending.length) throw Error('Public Pages verification failed: ' + pending.map(path => path || '/').join(', '));
console.log('Public homepage, latest brief, market pages and assets verified for ' + revision);
