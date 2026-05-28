import { test, expect } from '@playwright/test';

// `/amenity/mart`는 PR #5에서 LIST 본체로 전환됨 (regions/[sigunguCode] 단계 제거).
// 한글 sido는 location 헤더 인코딩 필요 (서버 redirect 회피 + 시드 명시).
const seoul = '?sido=' + encodeURIComponent('서울');

test.describe('amenity mart happy path', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '데스크톱 사이드바 필터 사용');

  test('LIST hero + 카드 → DETAIL', async ({ page }) => {
    await page.goto(`/amenity/mart${seoul}`);
    await expect(page.getByRole('heading', { level: 1, name: /마트/ })).toBeVisible();

    // 첫 카드 클릭 → DETAIL (sub-filter 별도 검증)
    const firstCard = page.locator('a:has(article)').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await expect(page.getByRole('heading', { name: /주변 아파트/ })).toBeVisible({ timeout: 5000 });
  });

  test('sub-filter(대형마트) → URL ?sub=hyper', async ({ page }) => {
    await page.goto(`/amenity/mart${seoul}`);
    // 사이드바 hydration 대기
    await expect(page.getByRole('heading', { name: '마트 종류' })).toBeVisible();
    await page.getByRole('button', { name: '대형마트' }).click();
    await expect(page).toHaveURL(/sub=hyper/);
  });
});

test.describe('amenity mart mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('모바일 LIST에서 바텀시트 필터로 sub 적용', async ({ page }) => {
    await page.goto(`/amenity/mart${seoul}`);

    // 모바일 필터 버튼 노출
    const filterBtn = page.getByRole('button', { name: /필터/ });
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // 바텀시트 안에서 "대형마트" 선택 → 조회
    await page.getByRole('button', { name: '대형마트' }).click();
    await page.getByRole('button', { name: '조회' }).click();

    await expect(page).toHaveURL(/sub=hyper/);
  });
});
