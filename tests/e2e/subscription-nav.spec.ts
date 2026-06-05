import { test, expect } from '@playwright/test';

// '청약'은 라이브 링크(/subscription)다. 데스크톱 인라인 메뉴의 청약 링크를 클릭하면
// 청약 목록 페이지로 이동하는지 검증한다.
// 데스크톱 인라인 메뉴는 md(768px) 미만에서 숨겨지므로 뷰포트를 데스크톱으로 고정한다.
// (모바일 햄버거 서랍의 청약 링크는 mobile-nav.spec.ts에서 커버)
test('청약 nav links to subscription list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.locator('header').getByRole('link', { name: '청약', exact: true }).click();
  await expect(page).toHaveURL(/\/subscription$/);
  await expect(page.getByRole('heading', { name: '청약 목록' })).toBeVisible();
});
