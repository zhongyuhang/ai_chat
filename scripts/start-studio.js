const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');

const repositoryRoot = resolve(__dirname, '..');
const studioRoot = resolve(repositoryRoot, 'studio');
const entry = resolve(studioRoot, 'dist', 'server', 'server', 'index.js');
const client = resolve(studioRoot, 'dist', 'client', 'index.html');

if (!existsSync(entry) || !existsSync(client)) {
  console.error('新版小说工作台尚未构建。请先运行：npm run build');
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, ['--env-file-if-exists=../.env', entry], {
    cwd: studioRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      STUDIO_HOST: '127.0.0.1',
      STUDIO_PORT: process.env.PORT || '3000',
      STUDIO_DATA_ROOT: process.env.STUDIO_DATA_ROOT || resolve(repositoryRoot, 'studio-data'),
      STUDIO_SERVE_CLIENT: '1',
    },
    windowsHide: true,
  });
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once('SIGINT', () => forward('SIGINT'));
  process.once('SIGTERM', () => forward('SIGTERM'));
  child.once('exit', (code, signal) => {
    process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
  });
}
