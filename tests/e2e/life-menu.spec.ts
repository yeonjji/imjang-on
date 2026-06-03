import { test, expect } from '@playwright/test';

test.describe('데스크톱 생활편의 드롭다운', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '모바일은 드로어 아코디언 사용');

  test('그룹 라벨 클릭 → /life/${slug} 허브 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    const panel = page.getByTestId('life-dropdown');
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: /교육시설/ }).click();
    await expect(page).toHaveURL('/life/education');
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

  test('아코디언을 펼치고 그룹 라벨로 /life/${slug} 이동', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('button', { name: '생활편의' }).click();
    await drawer.getByRole('link', { name: /상권·편의/ }).click();
    await expect(page).toHaveURL('/life/amenity');
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

test.describe('/life 인덱스 → 그룹 허브', () => {
  test('각 그룹 섹션 헤더의 "더보기" 링크가 /life/[group]으로 이동한다', async ({ page }) => {
    await page.goto('/life');
    const moreLinks = page.getByRole('link', { name: /더보기/ });
    await expect(moreLinks).toHaveCount(4);

    await page.goto('/life');
    await page.locator('section#amenity').getByRole('link', { name: /더보기/ }).click();
    await expect(page).toHaveURL('/life/amenity');
  });
});
