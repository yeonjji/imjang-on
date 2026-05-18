import { test, expect } from '@playwright/test';

test('soon modal email signup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /청약/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('이메일 주소').fill('test@example.com');
  await dialog.getByRole('button', { name: '신청' }).click();
  await expect(dialog.getByText(/감사해요/)).toBeVisible();
});
