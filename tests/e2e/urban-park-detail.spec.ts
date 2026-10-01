import { test, expect } from '@playwright/test';

const list = (q: string) => `/urban/park?sido=${encodeURIComponent('서울')}&q=${encodeURIComponent(q)}`;

test.describe('공원 상세 보강', () => {
  test('시설이 있는 공원: 히어로 요약, 공원 시설 카드, 새 정보 행', async ({ page }) => {
    await page.goto(list('e2e 시설공원'));
    await page.locator('a:has(article)').first().click();

    await expect(page.getByText('면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '공원 시설' })).toBeVisible();
    await expect(page.getByText('그네', { exact: true })).toBeVisible();
    await expect(page.getByText('서울특별시 서초구청')).toBeVisible();
  });

  test('빈 공원: 시설 카드 없이 주소만', async ({ page }) => {
    await page.goto(list('e2e 빈공원'));
    await page.locator('a:has(article)').first().click();

    await expect(page.getByRole('heading', { name: '공원 기본정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '공원 시설' })).toHaveCount(0);
  });
});
