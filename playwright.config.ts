import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',

  fullyParallel: true,

  use: {
    baseURL: 'http://127.0.0.1:5173/dental-clinic-manager',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/dental-clinic-manager/',
    reuseExistingServer: false,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})