import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const script of ['build-knowledge.mjs', 'build-stocks.mjs', 'build-primary.mjs']) {
  const result = spawnSync(process.execPath, ['scripts/' + script], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Standby static build ready: site/');
