import { test, expect } from '@playwright/test';

test.describe('amenity mart happy path', () => {
  test('허브 → regions → 시군구 LIST → sub-filter → DETAIL', async ({ page }) => {
    await page.goto('/amenity/mart');
    await expect(page.getByRole('heading', { name: /마트 찾기/ })).toBeVisible();

    await page.getByRole('link', { name: /지역별 마트 찾기/ }).click();
    await expect(page).toHaveURL('/amenity/mart/regions');

    // 첫 번째 시군구 카드 클릭
    const firstSigungu = page.locator('a[href^="/amenity/mart/"]').first();
    await firstSigungu.click();
    await expect(page).toHaveURL(/\/amenity\/mart\/\d+/);

    // sub-filter "대형마트" 클릭
    await page.getByRole('button', { name: '대형마트' }).click();
    await expect(page).toHaveURL(/sub=hyper/);

    // 첫 카드(=Link 래퍼) 클릭 → DETAIL
    const firstCard = page.locator('a:has(article)').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await expect(page.getByText('주변 아파트')).toBeVisible({ timeout: 5000 });
  });
});
