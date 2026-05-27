import { test, expect } from '@playwright/test';

test.describe('데스크톱 생활편의 드롭다운', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '모바일은 드로어 아코디언 사용');

  test('드롭다운을 열고 학교 하위로 이동한다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();

    const panel = page.getByTestId('life-dropdown');
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: '초등' }).click();
    await expect(page).toHaveURL(/\/school\?kind=elem/);
  });

  test('미빌드 항목(약국) 클릭 시 Soon 모달이 뜬다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '생활편의' }).click();
    await page.getByTestId('life-dropdown').getByRole('button', { name: '약국' }).click();
    await expect(page.getByText('약국 정보는 곧 만나요')).toBeVisible();
  });
});
