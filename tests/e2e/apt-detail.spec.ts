import { test, expect } from '@playwright/test';

test('apt detail: 3 transaction sections + page 2', async ({ page }) => {
  await page.goto('/apt/1');
  await expect(page.getByRole('heading', { name: /래미안/ })).toBeVisible();

  for (const label of ['매매 거래 내역', '전세 거래 내역', '월세 거래 내역']) {
    await expect(page.getByText(label)).toBeVisible();
  }

  const sale = page.locator('section', { hasText: '매매 거래 내역' });
  await sale.getByRole('button', { name: '2' }).click();
  await expect(sale.getByText(/12건 중 11–12/)).toBeVisible();
});
