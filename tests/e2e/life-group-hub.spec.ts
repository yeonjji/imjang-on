import { test, expect } from '@playwright/test';

test.describe('생활편의 그룹 허브 /life/[group]', () => {
  test('education: 학교/어린이집만 노출, 다른 그룹 카드 없음', async ({ page }) => {
    await page.goto('/life/education');
    await expect(page.getByRole('heading', { level: 1, name: '교육시설' })).toBeVisible();
    const grid = page.getByTestId('life-group-cards');
    await expect(grid.getByRole('link', { name: /학교/ })).toBeVisible();
    await expect(grid.getByRole('button', { name: /어린이집/ }).or(grid.getByRole('link', { name: /어린이집/ }))).toBeVisible();
    // 다른 그룹 카드는 없어야 함 — 카드 그리드만 스코프
    await expect(grid.getByRole('link', { name: /편의점/ }).or(grid.getByRole('button', { name: /편의점/ }))).toHaveCount(0);
    await expect(grid.getByRole('link', { name: /공원/ }).or(grid.getByRole('button', { name: /공원/ }))).toHaveCount(0);
  });

  test('amenity: 편의점/마트/카페/전통시장 4개만 노출', async ({ page }) => {
    await page.goto('/life/amenity');
    await expect(page.getByRole('heading', { level: 1, name: '상권·편의' })).toBeVisible();
    const grid = page.getByTestId('life-group-cards');
    for (const label of ['편의점', '마트', '카페', '전통시장']) {
      await expect(
        grid.getByRole('link', { name: new RegExp(label) }).or(grid.getByRole('button', { name: new RegExp(label) }))
      ).toBeVisible();
    }
    await expect(grid.getByRole('link', { name: /학교/ }).or(grid.getByRole('button', { name: /학교/ }))).toHaveCount(0);
  });

  test('medical: 병원·의원/약국/보건소만 노출', async ({ page }) => {
    await page.goto('/life/medical');
    await expect(page.getByRole('heading', { level: 1, name: '의료시설' })).toBeVisible();
    const grid = page.getByTestId('life-group-cards');
    for (const label of ['병원·의원', '약국', '보건소']) {
      await expect(
        grid.getByRole('link', { name: new RegExp(label) }).or(grid.getByRole('button', { name: new RegExp(label) }))
      ).toBeVisible();
    }
  });

  test('urban: 공원/충전소/주차장만 노출', async ({ page }) => {
    await page.goto('/life/urban');
    await expect(page.getByRole('heading', { level: 1, name: '도시인프라' })).toBeVisible();
    const grid = page.getByTestId('life-group-cards');
    for (const label of ['공원', '충전소', '주차장']) {
      await expect(
        grid.getByRole('link', { name: new RegExp(label) }).or(grid.getByRole('button', { name: new RegExp(label) }))
      ).toBeVisible();
    }
  });

  test('잘못된 그룹 slug는 404', async ({ page }) => {
    const res = await page.goto('/life/foo');
    expect(res?.status()).toBe(404);
  });

  test('breadcrumb에 홈 / 생활편의 / 그룹 라벨이 있다', async ({ page }) => {
    await page.goto('/life/amenity');
    const breadcrumb = page.getByLabel('이동 경로');
    await expect(breadcrumb.getByRole('link', { name: '홈' })).toBeVisible();
    await expect(breadcrumb.getByRole('link', { name: '생활편의' })).toBeVisible();
  });
});
