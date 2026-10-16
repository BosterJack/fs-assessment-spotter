import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const python = process.platform === 'win32'
  ? fileURLToPath(new URL('../.venv/Scripts/python.exe', import.meta.url))
  : 'python';
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  reporter: 'list',
  webServer: [
    {
      command: `"${python}" ../backend/manage.py runserver 127.0.0.1:8000 --noreload`,
      url: 'http://127.0.0.1:8000/api/health/',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
