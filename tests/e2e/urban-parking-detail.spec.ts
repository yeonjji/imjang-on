import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

test.describe('urban parking DETAIL', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '데스크톱');

  test('Hero / 운영시간 / 요금 / 부대정보 / 지도 mount', async ({ page }) => {
    const row = await prisma.parking.findFirst({ where: { sourceId: 'E2E-PRK-1' } });
    expect(row).toBeTruthy();
    await page.goto(`/urban/parking/${row!.id}`);

    await expect(page.getByRole('heading', { level: 1, name: /24시간 유료주차장/ })).toBeVisible();
    // 운영시간 표
    await expect(page.getByRole('heading', { name: '운영시간' })).toBeVisible();
    await expect(page.getByText(/24시간 운영/).first()).toBeVisible();
    // 요금 grid
    await expect(page.getByRole('heading', { name: '요금', exact: true })).toBeVisible();
    await expect(page.getByText('30분 500원')).toBeVisible();
    // 부대정보 배지
    await expect(page.getByRole('heading', { name: '부대정보' })).toBeVisible();
    await expect(page.getByText('♿ 장애인전용 구획')).toBeVisible();
    // 위치
    await expect(page.getByRole('heading', { name: '위치' })).toBeVisible();
  });

  test('무료 주차장 — 요금 카드에 "무료" 표시', async ({ page }) => {
    const row = await prisma.parking.findFirst({ where: { sourceId: 'E2E-PRK-2' } });
    expect(row).toBeTruthy();
    await page.goto(`/urban/parking/${row!.id}`);
    await expect(page.getByRole('heading', { name: '요금', exact: true })).toBeVisible();
    await expect(page.getByText('무료').first()).toBeVisible();
  });
});
