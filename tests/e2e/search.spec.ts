import { test, expect } from '@playwright/test';

test('search autocomplete -> detail', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('단지/지역명 검색').fill('래미안');
  await page.waitForResponse((res) => res.url().includes('/api/search'));
  await page.getByText('래미안서초에스티지').first().click();
  await expect(page).toHaveURL(/\/apt\/\d+/);
});
