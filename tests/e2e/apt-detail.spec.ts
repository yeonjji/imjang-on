import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

let propertyId: string;

test.beforeAll(async () => {
  const apt = await prisma.property.findFirst({
    where: { name: { contains: '래미안서초' } },
    select: { id: true },
  });
  if (!apt) throw new Error('seed apartment "래미안서초…" not found — globalSetup 실행 확인');
  propertyId = String(apt.id);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('apt detail: 주변 생활 인프라 블록이 렌더된다', async ({ page }) => {
  await page.goto(`/apt/${propertyId}`);

  const poi = page.locator('#poi');
  await expect(poi).toBeVisible();
  await expect(poi.getByRole('heading', { name: '주변 생활 인프라' })).toBeVisible();
  // 시드 주차장 2곳이 반경 500m 내 → '주차장' 카테고리가 노출되어야 함
  await expect(poi.getByText('주차장').first()).toBeVisible();
});

test('apt detail: unified transaction table + page 2', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/apt/${propertyId}`);
  await expect(page.getByRole('heading', { name: /래미안/ })).toBeVisible();

  await expect(page.getByText('최근 실거래 내역')).toBeVisible();

  for (const badge of ['매매', '전세', '월세']) {
    await expect(page.getByText(badge).first()).toBeVisible();
  }

  await page.getByRole('button', { name: '2' }).click();
  await expect(page.getByText(/36건 중 16–30/)).toBeVisible();
});
