import { test, expect } from '@playwright/test';

test.describe('/childcare', () => {
  test('전국 LIST 진입 + 어린이집 카드 표시', async ({ page }) => {
    await page.goto('/childcare');
    await expect(page.getByRole('heading', { name: '어린이집찾기' })).toBeVisible();
    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
  });

  test('sibling-tabs에 학교·어린이집 모두 노출 (LIST)', async ({ page }) => {
    await page.goto('/childcare');
    await expect(page.getByRole('link', { name: /학교/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /어린이집/ }).first()).toBeVisible();
  });

  test('유형 필터 — 국공립 chip 클릭 시 URL에 ?type=public', async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, '모바일은 시트 경유 (별도)');
    await page.goto('/childcare/11710');
    await page.getByRole('button', { name: '국공립' }).click();
    await expect(page).toHaveURL(/[?&]type=public/);
  });

  test('시군구 LIST + 시드 어린이집 노출', async ({ page }) => {
    await page.goto('/childcare/11710');
    await expect(page.getByRole('heading', { name: /송파구.*어린이집/ })).toBeVisible();
    await expect(page.getByText('E2E 천사어린이집').first()).toBeVisible();
  });

  test('DETAIL — Hero / AgeBreakdown / Staff', async ({ page }) => {
    await page.goto('/childcare/11710?q=E2E');
    await expect(page.locator('article').first()).toBeVisible();
    await page.locator('article').first().click();
    await expect(page.getByRole('heading', { name: /E2E 천사어린이집/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /합계/ })).toBeVisible();
    await expect(page.getByText('원장')).toBeVisible();
  });
});

test.describe('school DETAIL — 근처 어린이집', () => {
  test('학교 detail에서 근처 어린이집 카드 노출 (시드 송파)', async ({ page }) => {
    await page.goto('/school/11710?q=E2E');
    await expect(page.locator('article').first()).toBeVisible();
    await page.locator('article').first().click();
    await expect(page.getByRole('heading', { name: /근처 어린이집/ })).toBeVisible();
    await expect(page.getByText('E2E 천사어린이집')).toBeVisible();
  });
});
