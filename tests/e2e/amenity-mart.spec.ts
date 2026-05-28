import { test, expect } from '@playwright/test';

test.describe('amenity mart happy path', () => {
  test('허브 → regions → 시군구 LIST → sub-filter → DETAIL', async ({ page }) => {
    await page.goto('/amenity/mart');
    await expect(page.getByRole('heading', { name: /마트 찾기/ })).toBeVisible();

    await page.getByRole('link', { name: /지역별 마트 찾기/ }).first().click();
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

test.describe('amenity mart mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('모바일 시군구 LIST에서 바텀시트 필터로 sub 적용', async ({ page }) => {
    // 강남구 (11680)로 고정 — Store 데이터가 풍부함
    await page.goto('/amenity/mart/11680');
    await expect(page.getByRole('heading', { name: /마트/ })).toBeVisible();

    // 데스크탑 사이드바는 숨김 (md:block)
    // 모바일 필터 버튼 노출
    const filterBtn = page.getByRole('button', { name: /필터/ });
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // 바텀시트 안에서 "대형마트" 선택
    await page.getByRole('button', { name: '대형마트' }).click();
    await page.getByRole('button', { name: '조회' }).click();

    await expect(page).toHaveURL(/sub=hyper/);
  });
});
