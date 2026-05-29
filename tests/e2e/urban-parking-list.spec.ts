import { test, expect } from '@playwright/test';

const seoul = '?sido=' + encodeURIComponent('서울');

test.describe('urban parking LIST happy path', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '데스크톱 사이드바 필터 사용');

  test('진입 시 ?sido=서울 redirect + 카드 노출 + 카드 클릭 시 DETAIL', async ({ page }) => {
    await page.goto('/urban/parking');
    await expect(page).toHaveURL(/sido=/);
    await expect(page.getByRole('heading', { level: 1, name: /주차장/ })).toBeVisible();

    const firstCard = page.locator('a:has(article)').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page.getByRole('heading', { name: /주차장 기본정보/ })).toBeVisible({ timeout: 5000 });
  });

  test('chip 공영 클릭 → URL ?sub=공영', async ({ page }) => {
    await page.goto(`/urban/parking${seoul}`);
    await expect(page.getByRole('heading', { name: '운영 형태' })).toBeVisible();
    await page.getByRole('button', { name: '공영', exact: true }).click();
    await expect(page).toHaveURL(/sub=%EA%B3%B5%EC%98%81|sub=공영/);
  });

  test('24시간 체크 → URL ?open24=on', async ({ page }) => {
    await page.goto(`/urban/parking${seoul}`);
    await page.getByRole('checkbox', { name: /24시간/ }).click();
    await expect(page).toHaveURL(/open24=on/);
  });

  test('q 미스 → 빈 결과 메시지', async ({ page }) => {
    await page.goto(`/urban/parking${seoul}&q=zzzzzz_no_match`);
    await expect(page.getByText(/조건에 맞는 주차장이 없습니다/)).toBeVisible();
  });
});
