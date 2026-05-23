import { test, expect } from '@playwright/test';

test('apt detail: unified transaction table + page 2', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/apt/1');
  await expect(page.getByRole('heading', { name: /래미안/ })).toBeVisible();

  await expect(page.getByText('최근 실거래 내역')).toBeVisible();

  for (const badge of ['매매', '전세', '월세']) {
    await expect(page.getByText(badge).first()).toBeVisible();
  }

  await page.getByRole('button', { name: '2' }).click();
  await expect(page.getByText(/36건 중 16–30/)).toBeVisible();
});
