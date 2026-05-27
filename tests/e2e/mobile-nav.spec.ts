import { test, expect } from '@playwright/test';

// 모바일 뷰포트(<768px)에서만 실행. 데스크톱은 기존 인라인 메뉴 사용.
test.describe('모바일 햄버거 메뉴', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 768, '데스크톱은 기존 인라인 메뉴 사용');

  test('햄버거로 서랍을 열고 메뉴로 이동한다', async ({ page }) => {
    await page.goto('/');

    const burger = page.getByRole('button', { name: '메뉴 열기' });
    await expect(burger).toBeVisible();

    await burger.click();

    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer).toBeInViewport();

    await drawer.getByRole('link', { name: '실거래가' }).click();
    await expect(page).toHaveURL(/\/list/);
  });

  test('오버레이를 탭하면 서랍이 닫힌다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '메뉴 열기' }).click();

    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer).toBeInViewport();

    await page.getByTestId('mobile-drawer-overlay').click();
    await expect(drawer).not.toBeInViewport();
  });
});
