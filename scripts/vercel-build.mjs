import { spawnSync } from 'node:child_process';

const run = (args) => {
  const command = process.env.npm_execpath ? process.execPath : 'npm';
  const commandArgs = process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
  run(['run', 'migrate', '--workspace', '@gatsi/api']);
}

run(['run', 'build:web']);
