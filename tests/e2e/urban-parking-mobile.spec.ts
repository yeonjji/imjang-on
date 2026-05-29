import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

test.use({ viewport: { width: 375, height: 812 } });

test('모바일 LIST 필터 시트 → 24시간 체크 → 조회 → URL', async ({ page }) => {
  await page.goto('/urban/parking?sido=' + encodeURIComponent('서울'));
  await page.getByRole('button', { name: /필터/ }).click();
  await page.getByRole('checkbox', { name: /24시간/ }).click();
  await page.getByRole('button', { name: '조회' }).click();
  await expect(page).toHaveURL(/open24=on/);
});

test('모바일 DETAIL — 운영시간 + 요금 섹션 가시성', async ({ page }) => {
  const row = await prisma.parking.findFirst({ where: { sourceId: 'E2E-PRK-1' } });
  expect(row).toBeTruthy();
  await page.goto(`/urban/parking/${row!.id}`);
  await expect(page.getByRole('heading', { name: '운영시간' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '요금', exact: true })).toBeVisible();
});
