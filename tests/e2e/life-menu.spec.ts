import { test, expect } from '@playwright/test';

test.describe('데스크톱 생활편의 드롭다운', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '모바일은 드로어 아코디언 사용');

  test('그룹 라벨 클릭 → 대표 리스트 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    const panel = page.getByTestId('life-dropdown');
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: /교육시설/ }).click();
    await expect(page).toHaveURL('/school');
  });

  test('하위 항목(학교) 클릭 → /school LIST', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    await page.getByTestId('life-dropdown').getByRole('link', { name: '학교' }).click();
    await expect(page).toHaveURL('/school');
  });

  test('하위 항목(약국) 클릭 → /medical/pharmacy LIST', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    await page.getByTestId('life-dropdown').getByRole('link', { name: '약국' }).click();
    await expect(page).toHaveURL('/medical/pharmacy');
  });
});

test.describe('모바일 생활편의 아코디언', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 768, '데스크톱은 드롭다운 사용');

  test('아코디언을 펼치고 그룹 라벨로 대표 리스트 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('button', { name: '생활편의' }).click();
    await drawer.getByRole('link', { name: /상권·편의/ }).click();
    await expect(page).toHaveURL(/\/amenity\/convenience/);
  });

  test('아코디언에서 하위 항목(편의점)으로 LIST 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('button', { name: '생활편의' }).click();
    await drawer.getByRole('link', { name: '편의점' }).click();
    await expect(page).toHaveURL(/\/amenity\/convenience/);
  });
});
