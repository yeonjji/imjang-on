import { test, expect } from '@playwright/test';

// PR #5의 amenity LIST는 `?sido=`/`?region=` 없이 진입하면 한글 sido로 redirect함.
// 한글 location 헤더가 dev 모드에서 Runtime TypeError를 일으키므로 직접 인코딩 URL로 진입.
const seoul = '?sido=' + encodeURIComponent('서울');

test.describe('amenity LIST sibling 탭', () => {
  test('편의점 LIST에 4개 상권·편의 탭, 편의점이 활성', async ({ page }) => {
    await page.goto(`/amenity/convenience${seoul}`);
    const tabs = page.getByTestId('sibling-tabs');
    await expect(tabs).toBeVisible();
    for (const label of ['편의점', '마트', '카페', '전통시장']) {
      await expect(tabs.getByText(label, { exact: true })).toBeVisible();
    }
    // 활성 탭은 span (aria-current="page"), 비활성은 Link
    await expect(tabs.getByText('편의점', { exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('편의점 LIST에서 마트 탭 클릭 → /amenity/mart 이동', async ({ page }) => {
    await page.goto(`/amenity/convenience${seoul}`);
    await page.getByTestId('sibling-tabs').getByRole('link', { name: '마트', exact: true }).click();
    await expect(page).toHaveURL(/\/amenity\/mart/);
  });

  test('활성 탭(편의점)은 span으로 렌더되어 클릭이 발생하지 않는다', async ({ page }) => {
    await page.goto(`/amenity/convenience${seoul}`);
    await page.waitForURL(/\/amenity\/convenience/);
    // 활성은 span이므로 link role 검색에서 안 잡힘 — 그것을 확인
    const tabs = page.getByTestId('sibling-tabs');
    await expect(tabs.getByRole('link', { name: '편의점', exact: true })).toHaveCount(0);
  });
});
