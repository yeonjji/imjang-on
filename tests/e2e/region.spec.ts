import { test, expect } from '@playwright/test';

test('region landing shows top properties', async ({ page }) => {
  await page.goto('/region/11650');
  await expect(page.getByRole('heading', { name: /서울특별시 서초구/ })).toBeVisible();
  // 단지명은 지역 요약 서술(<p>)에도 등장하므로, 카드 링크로 명확히 지정한다.
  await expect(page.getByRole('link', { name: /래미안서초에스티지/ }).first()).toBeVisible();
});
