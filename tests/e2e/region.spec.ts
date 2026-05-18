import { test, expect } from '@playwright/test';

test('region landing shows top properties', async ({ page }) => {
  await page.goto('/region/11650');
  await expect(page.getByRole('heading', { name: /서울특별시 서초구/ })).toBeVisible();
  await expect(page.getByText('래미안서초에스티지')).toBeVisible();
});
