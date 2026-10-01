import { test, expect } from '@playwright/test';

test.describe('학교 상세 보강', () => {
  test('고등학교: 고교 유형 배지, 개교 햇수, 입학 전형·개교기념일 행', async ({ page }) => {
    await page.goto('/school/11710');
    await page.locator('a:has(article):has-text("E2E 해솔고등학교")').first().click();

    await expect(page.getByRole('heading', { name: '학교 정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/개교 \d+년/)).toBeVisible();
    await expect(page.getByText('일반고 · 일반계')).toBeVisible();
    await expect(page.getByText('4월 28일')).toBeVisible();
  });

  test('초등학교: 고교 전용 행이 없다', async ({ page }) => {
    await page.goto('/school/11710');
    await page.locator('a:has(article):has-text("E2E 거마초등학교")').first().click();

    await expect(page.getByRole('heading', { name: '학교 정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('입학 전형')).toHaveCount(0);
  });
});
