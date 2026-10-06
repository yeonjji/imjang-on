import { test, expect } from '@playwright/test';
import { isAmenityPublic } from '@/lib/amenity/visibility';

test.describe('전통시장 상세 보강', () => {
  test.skip(!isAmenityPublic(), '상권·편의 비공개 중 (lib/amenity/visibility.ts)');
  test('채워진 시장: 히어로 요약, 시장 한눈에, 취급 품목', async ({ page }) => {
    await page.goto(`/amenity/market?q=${encodeURIComponent('e2e 장날시장')}`);
    await page.locator('a:has(article)').first().click();

    await expect(page.getByText('1955년 개설 · 점포 64곳 · 4·9일 장날')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '시장 한눈에' })).toBeVisible();
    await expect(page.getByText('매월 4·9·14·19·24·29일')).toBeVisible();
    await expect(page.getByRole('heading', { name: '취급 품목' })).toBeVisible();
    await expect(page.getByText('축산물', { exact: true })).toBeVisible();
  });

  test('빈 시장: 새 카드 없이 기본 정보만', async ({ page }) => {
    await page.goto(`/amenity/market?q=${encodeURIComponent('e2e 빈시장')}`);
    await page.locator('a:has(article)').first().click();

    await expect(page.getByRole('heading', { name: '전통시장 정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '시장 한눈에' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '취급 품목' })).toHaveCount(0);
  });
});
