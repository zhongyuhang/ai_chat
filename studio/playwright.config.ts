import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const dataRoot = resolve(process.cwd(), 'test-results', 'e2e-data');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:3411/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { STUDIO_DATA_ROOT: dataRoot, STUDIO_HOST: '127.0.0.1', STUDIO_PORT: '3411', STUDIO_E2E_FAKE_PROVIDER: '1' },
    },
    {
      command: 'npm run dev:client',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
