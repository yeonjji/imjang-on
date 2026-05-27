import { test, expect } from '@playwright/test';

test('search autocomplete -> detail', async ({ page }) => {
  await page.goto('/');

  // 검색창은 데스크톱에선 헤더, 모바일(<768px)에선 햄버거 서랍 안에 있다.
  const isMobile = (page.viewportSize()?.width ?? 0) < 768;
  if (isMobile) {
    await page.getByRole('button', { name: '메뉴 열기' }).click();
  }
  const scope = isMobile ? page.getByTestId('mobile-drawer') : page.locator('header');

  await scope.getByPlaceholder('단지/지역명 검색').fill('래미안');
  await page.waitForResponse((res) => res.url().includes('/api/search'));

  // 시드/실데이터 모두 '래미안' 아파트가 있으므로 특정 이름 대신 첫 아파트 결과를 연다.
  await scope.locator('a[href^="/apt/"]').first().click();
  await expect(page).toHaveURL(/\/apt\/\d+/);
});
