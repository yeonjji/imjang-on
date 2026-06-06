import { test, expect } from '@playwright/test';

// '청약'은 라이브 링크(/subscription)다. 데스크톱 인라인 메뉴의 청약 링크를 클릭하면
// 청약 목록 페이지로 이동하는지 검증한다.
// 데스크톱 인라인 메뉴는 md(768px) 미만에서 숨겨지므로 뷰포트를 데스크톱으로 고정한다.
// (모바일 햄버거 서랍의 청약 링크는 mobile-nav.spec.ts에서 커버)
test('청약 nav links to subscription list', async ({ page }) => {
  // dev 모드 on-demand 컴파일(/, /subscription) 여유를 위해 타임아웃을 넉넉히.
  test.slow();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const link = page.locator('header').getByRole('link', { name: '청약', exact: true });
  // dev 모드에선 하이드레이션 직후 클릭이 네비게이션으로 이어지지 않을 수 있고,
  // /subscription 첫 진입은 on-demand 컴파일로 느릴 수 있어 클릭+이동을 재시도한다.
  await expect(async () => {
    await link.click();
    await expect(page).toHaveURL(/\/subscription$/, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  await expect(page.getByRole('heading', { name: '청약 목록' })).toBeVisible({ timeout: 10_000 });
});
