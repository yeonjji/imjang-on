import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI는 워커 1개 + 재시도 2회라 라우트 컴파일 지연을 흡수한다. 로컬은 코어 수만큼 병렬로
  // 돌면서 재시도가 없어, dev 서버의 온디맨드 컴파일이 expect 기본 타임아웃(5s)을 넘겨
  // 가짜 실패가 난다. 로컬에서는 `pnpm test:e2e:local`(--workers=1)을 쓸 것.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile',  use: { ...devices['Pixel 5'] } },
  ],
});
