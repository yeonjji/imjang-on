import { test, expect } from '@playwright/test';

test('list filter page renders results', async ({ page }) => {
  await page.goto('/list?type=apt');
  await expect(page.getByText(/검색 결과/)).toBeVisible();
});

test('정렬: 가격 높은순 칩 클릭 시 URL에 sort=price_desc 반영', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list');
  await page.getByText('가격 높은순').first().click();
  await expect(page).toHaveURL(/sort=price_desc/);
});

test('정렬: 가격 낮은순 칩 클릭 시 URL에 sort=price_asc 반영', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list');
  await page.getByText('가격 낮은순').first().click();
  await expect(page).toHaveURL(/sort=price_asc/);
});

test('지역 필터: 시도 선택 시 URL에 sido 파라미터 반영', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list');
  const sidoSelect = page.locator('aside').locator('select').first();
  await sidoSelect.selectOption({ index: 1 });
  await expect(page).toHaveURL(/sido=/);
});

test('모바일: 필터 버튼 노출 + 클릭 시 바텀시트 열림', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list');
  const filterBtn = page.getByRole('button', { name: /필터/ });
  await expect(filterBtn).toBeVisible();
  await filterBtn.click();
  await expect(page.getByRole('dialog').getByText('주거유형')).toBeVisible();
});

test('모바일: 카드 가로 스크롤 없음 (375px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/list?type=apt');
  await expect(page.getByText(/검색 결과/)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.body.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test('무한 스크롤: 카드 + 인피드 광고 슬롯 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list?type=apt');
  await expect(page.getByText(/검색 결과/)).toBeVisible();
  // 시드가 30건 이상이면 8번째 뒤에 SPONSORED 슬롯이 최소 1개
  await expect(page.getByText('SPONSORED').first()).toBeVisible();
});

test('무한 스크롤: 끝까지 로드 시 종료 문구', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/list?type=apt');
  await expect(page.getByText(/검색 결과/)).toBeVisible();
  // 바닥까지 스크롤하여 자동 로드 유도
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(400);
  }
  await expect(page.getByText('모든 결과를 불러왔습니다')).toBeVisible({ timeout: 15000 });
});
