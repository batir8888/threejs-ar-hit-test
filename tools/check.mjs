import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const file of readdirSync('src').filter((file) => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `src/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
