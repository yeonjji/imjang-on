import { test, expect } from '@playwright/test';

test('list filter page renders results', async ({ page }) => {
  await page.goto('/list?type=apt');
  await expect(page.getByText(/건 발견/)).toBeVisible();
  await expect(page.getByText('래미안서초에스티지')).toBeVisible();
});
