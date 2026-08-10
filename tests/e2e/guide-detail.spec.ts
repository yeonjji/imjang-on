import { test, expect } from '@playwright/test';

test('표식이 있는 가이드: 데이터 블록이 렌더되고 출처가 붙는다', async ({ page }) => {
  await page.goto('/guide/ut-guide-with-block');
  await expect(page.getByRole('heading', { name: '충전 속도별 충전소 분포' })).toBeVisible();
  await expect(page.getByText('출처:').first()).toBeVisible();
  // 표식 원문이 화면에 새어 나오면 안 된다
  await expect(page.getByText('[[data:')).toHaveCount(0);
});

test('표식이 없는 가이드: 기존과 동일하게 렌더된다 (회귀 가드)', async ({ page }) => {
  await page.goto('/guide/ut-guide-plain');
  await expect(page.getByRole('heading', { level: 1, name: '유닛테스트 일반 가이드' })).toBeVisible();
  await expect(page.getByText('설명만 있습니다.')).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
});

test('작성일과 편집자가 노출된다', async ({ page }) => {
  await page.goto('/guide/ut-guide-plain');
  await expect(page.getByText('2026.06.29')).toBeVisible();
  await expect(page.getByText('편집 임장ON 편집자')).toBeVisible();
});
